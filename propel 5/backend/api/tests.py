from datetime import datetime, timedelta, timezone
from io import BytesIO
from itertools import combinations
from unittest.mock import patch
from django.test import TestCase, SimpleTestCase
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from .engine import fuse, assess, feedback, optimize, matches, parse_requirements
from .models import Evidence, ReliabilityAdjustment, TwinProfile, AssessmentAttempt
from .service import recalculate
from .assessments import BANK

NOW=datetime(2026,11,5,tzinfo=timezone.utc)
def item(skill='Python',value=.8,kind='assessment',days=0):
    return dict(skill=skill,value=value,kind=kind,observed_at=(NOW-timedelta(days=days)).isoformat())

class EngineTests(SimpleTestCase):
    def test_half_life_really_reduces_single_item_score(self):
        self.assertAlmostEqual(fuse('Python',[item()],now=NOW)['score'],.8)
        self.assertAlmostEqual(fuse('Python',[item(days=180)],now=NOW)['score'],.4)
    def test_skill_specific_half_lives(self):
        self.assertAlmostEqual(fuse('Docker',[item('Docker',days=90)],now=NOW)['score'],.4)
        self.assertGreater(fuse('Python',[item(days=90)],now=NOW)['score'],.4)
    def test_low_quality_closed_gap_requires_validation(self):
        r=assess([item(kind='declaration',value=.9)],{'Python':.7},now=NOW)
        self.assertEqual(r['states'][0]['status'],'validate')
        self.assertEqual(r['readiness'],0)
        self.assertEqual(r['plan']['actions'][0]['kind'],'validation')
    def test_valid_assessment_resolves(self):
        self.assertEqual(assess([item()],{'Python':.7},now=NOW)['readiness'],100)
    def test_stale_evidence_fails(self):
        s=assess([item(value=1,days=180)],{'Python':.4},now=NOW)['states'][0]
        self.assertEqual(s['status'],'validate')
        self.assertLess(s['freshness'],.6)
    def test_contradiction_reduces_claim_influence(self):
        evidence=[item(kind='declaration',value=.95),item(value=.2)]
        before=fuse('Python',evidence,now=NOW)['score']
        factor,reason=feedback(evidence[0],evidence[1],1)
        self.assertEqual(reason,'contradiction')
        self.assertLess(fuse('Python',evidence,factor,now=NOW)['score'],before)
    def test_recovery_is_bounded(self):
        self.assertEqual(feedback(item(value=.8),item(value=.8),.95)[0],1)
    def test_duplicate_channel_uses_latest_observation(self):
        r=assess([item(value=.2,days=1),item(value=.8)],{'Python':.7},now=NOW)
        self.assertEqual(r['states'][0]['evidence_count'],1)
        self.assertEqual(r['readiness'],100)
    def test_no_evidence(self):
        r=assess([],{'Python':.7},now=NOW)
        self.assertEqual(r['readiness'],0)
        self.assertEqual(r['states'][0]['score'],0)
    def test_no_java_javascript_collision(self):
        self.assertFalse(matches('JavaScript developer','Java'))
        self.assertTrue(matches('Java developer','Java'))
        self.assertFalse(matches('copy typography','Python'))
    def test_requirement_parser(self):
        self.assertEqual(parse_requirements('Python: 0.7, SQL and Git'),{'Python':.7,'Git':.65,'SQL':.65})
    def test_optimizer_fewest_actions(self):
        r=assess([],{'Python':.7,'SQL':.7,'REST API':.7,'Git':.7},now=NOW)
        self.assertEqual(len(r['plan']['actions']),1)
        self.assertEqual(r['plan']['actions'][0]['title'],'Build a web service')
    def test_optimizer_hours_and_budget(self):
        r=assess([],{'Python':.7,'Git':.7},objective='hours',now=NOW)
        self.assertEqual(r['plan']['learning_hours'],8)
        r=assess([],{'Python':.7,'Git':.7},budget=9,now=NOW)
        self.assertTrue(r['plan']['feasible']);self.assertEqual(len(r['plan']['actions']),2)
        self.assertFalse(assess([],{'Python':.7,'Git':.7},budget=8,now=NOW)['plan']['feasible'])
    def test_optimizer_matches_exhaustive_small_catalog(self):
        skills=['Python','SQL','Git','REST API']
        for n in range(1,5):
            for group in combinations(skills,n):
                for objective in ('hours','actions'):
                    targets={s:.7 for s in group}
                    from .engine import CATALOG
                    options=[(set([s]),CATALOG['skills'][s]['hours']) for s in group]
                    if len(group)>1: options.append((set(group),12))
                    for budget in (None,8,12,25):
                        feasible=[]
                        for mask in range(1,1<<len(options)):
                            chosen=[options[i] for i in range(len(options)) if mask&(1<<i)]
                            cost=sum(x[1] for x in chosen)+.25*n
                            if set.union(*(x[0] for x in chosen))==set(group) and (budget is None or cost<=budget):
                                feasible.append((len(chosen),cost))
                        r=assess([],targets,objective=objective,budget=budget,now=NOW)['plan']
                        self.assertEqual(r['feasible'],bool(feasible))
                        if feasible:
                            best=min(feasible,key=lambda x:x if objective=='actions' else (x[1],x[0]))
                            self.assertEqual((len(r['actions']),r['total_hours']),best)

class ApiTests(TestCase):
    def setUp(self):
        self.user=User.objects.create_user('student',password='test-password-123')
        self.other=User.objects.create_user('other',password='test-password-456')
        self.c=APIClient();self.c.force_authenticate(self.user)
    def test_auth_required(self):
        self.assertEqual(APIClient().get('/api/twin/').status_code,401)
    def test_target_persists_and_is_private(self):
        self.assertEqual(self.c.post('/api/twin/target/',{'targets':{'Python':.7},'name':'My role'},format='json').status_code,200)
        other=APIClient();other.force_authenticate(self.other)
        self.assertNotEqual(other.get('/api/twin/').data['target_name'],'My role')
    def test_bad_scores_rejected(self):
        for value in (-1,2,'nonsense'):
            self.assertEqual(self.c.post('/api/twin/evidence/',dict(skill='Python',kind='declaration',value=value,observed_at='2026-01-01'),format='json').status_code,400)
    def test_user_cannot_forge_assessment(self):
        self.assertEqual(self.c.post('/api/twin/evidence/',dict(skill='Python',kind='assessment',value=1,observed_at='2026-01-01'),format='json').status_code,400)
    def test_future_date_rejected(self):
        self.assertEqual(self.c.post('/api/twin/evidence/',dict(skill='Python',value=.8,observed_at='2099-01-01'),format='json').status_code,400)
    def test_assessment_score_server_computed_replay_rejected(self):
        start=self.c.post('/api/twin/assessment/start/',{'skill':'Python'},format='json').data
        self.assertNotIn('answer',start['questions'][0])
        answers=[q[2] for q in BANK['Python']]
        path=f"/api/twin/assessment/{start['id']}/submit/"
        r=self.c.post(path,{'answers':answers,'score':0},format='json')
        self.assertEqual(r.status_code,200);self.assertEqual(r.data['assessment_score'],1)
        self.assertEqual(self.c.post(path,{'answers':answers},format='json').status_code,400)
    def test_other_user_cannot_submit_attempt(self):
        a=AssessmentAttempt.objects.create(user=self.other,skill='Python')
        self.assertEqual(self.c.post(f'/api/twin/assessment/{a.id}/submit/',{'answers':[0]*4},format='json').status_code,404)
    def test_feedback_idempotent_on_refresh(self):
        from django.utils import timezone as tz
        for kind,value in [('declaration',.95),('assessment',.25)]:
            Evidence.objects.create(user=self.user,skill='Python',kind=kind,channel=kind,value=value,observed_at=tz.now())
        recalculate(self.user);recalculate(self.user);recalculate(self.user)
        registry=ReliabilityAdjustment.objects.get(user=self.user,skill='Python')
        self.assertEqual(registry.factor,.7);self.assertEqual(len(registry.events),1)
    def test_docx_is_parsed(self):
        from docx import Document
        b=BytesIO();d=Document();d.add_paragraph('Python SQL Git');d.save(b)
        r=self.c.post('/api/twin/resume/',{'file':SimpleUploadedFile('resume.docx',b.getvalue())},format='multipart')
        self.assertEqual(r.status_code,200);self.assertIn('Python',r.data['imported_skills'])
        self.assertTrue(all(e.kind=='resume' for e in Evidence.objects.filter(user=self.user)))
    def test_pdf_is_parsed(self):
        from pypdf import PdfWriter
        b=BytesIO();p=PdfWriter();p.add_blank_page(width=100,height=100);p.write(b)
        r=self.c.post('/api/twin/resume/',{'file':SimpleUploadedFile('blank.pdf',b.getvalue())},format='multipart')
        self.assertEqual(r.status_code,400);self.assertIn('OCR',r.data['error'])
    def test_resume_java_javascript_separate(self):
        r=self.c.post('/api/twin/resume/',{'file':SimpleUploadedFile('resume.txt',b'JavaScript')},format='multipart')
        self.assertNotIn('Java',r.data['imported_skills'])
    def test_activity_completion_does_not_award_proficiency(self):
        self.c.post('/api/twin/target/',{'targets':{'Python':.7}},format='json')
        r=self.c.post('/api/twin/activity/complete/',{'activity_id':'learn:Python'},format='json')
        self.assertEqual(r.status_code,200);self.assertEqual(r.data['states'][0]['score'],0)
    def test_budget_and_target_validation(self):
        for data in [{'targets':{}},{'targets':{'Python':2}},{'targets':{'Python':.7},'budget':-1}]:
            self.assertEqual(self.c.post('/api/twin/target/',data,format='json').status_code,400)
    def test_github_untrusted_url_rejected(self):
        self.assertEqual(self.c.post('/api/twin/github/',{'repository':'http://127.0.0.1/secret'},format='json').status_code,400)
    @patch('api.twin_views.requests.get')
    def test_github_import_not_verified(self,mock):
        mock.return_value.json.return_value={'language':'Python','pushed_at':'2026-01-01T00:00:00Z'}
        r=self.c.post('/api/twin/github/',{'repository':'example/example'},format='json')
        self.assertEqual(r.status_code,200);self.assertEqual(Evidence.objects.get().kind,'github')
        self.assertLess(r.data['states'][0]['quality'],.65)
    def test_sample_does_not_write_account_data(self):
        r=self.c.get('/api/twin/sample/')
        self.assertTrue(r.data['sample']);self.assertEqual(Evidence.objects.count(),0)
