import io
import math
import re
from datetime import timedelta
import requests
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime, parse_date
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from .models import Evidence, TwinProfile, AssessmentAttempt, ActivityCompletion
from .engine import CATALOG, BASE_WEIGHTS, THRESHOLDS, matches, parse_requirements, role_requirements, assess
from .assessments import BANK, public_questions
from .service import recalculate


def bad(message): return Response({'error':message},status=400)


@api_view(['GET'])
@permission_classes([AllowAny])
def catalog(request):
    return Response(dict(**CATALOG,weights=BASE_WEIGHTS,thresholds=THRESHOLDS,assessment_skills=list(BANK)))


@api_view(['GET'])
@permission_classes([AllowAny])
def sample(request):
    now=timezone.now()
    targets={'Python':.65,'SQL':.65,'Git':.60,'Docker':.60}
    rows=[dict(skill='Python',kind='declaration',value=.95,observed_at=now.isoformat()),
          dict(skill='Python',kind='assessment',value=.25,observed_at=now.isoformat()),
          dict(skill='SQL',kind='assessment',value=.9,observed_at=(now-timedelta(days=180)).isoformat()),
          dict(skill='Git',kind='declaration',value=.9,observed_at=now.isoformat()),
          dict(skill='Docker',kind='assessment',value=.95,observed_at=now.isoformat())]
    result=assess(rows,targets,{'Python':.7},now=now)
    result.update(sample=True,target_name='Sample backend internship',targets=targets,evidence=rows,audit=[],objective='actions',budget=None)
    return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def twin(request): return Response(recalculate(request.user))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def target(request):
    data=request.data
    if data.get('role') in CATALOG['roles']:
        targets=role_requirements(data['role']);name=CATALOG['roles'][data['role']]['name']
    elif 'targets' in data:
        targets=data['targets'];name=str(data.get('name','Custom target'))[:250]
    else:
        text=str(data.get('description',''))[:20000]
        targets=parse_requirements(text);name=str(data.get('name','Job description'))[:250]
    if not isinstance(targets,dict) or not 1<=len(targets)<=12:
        return bad('Select 1 to 12 recognized competencies. Edit the parsed requirements if needed.')
    try:
        if any(s not in CATALOG['skills'] or isinstance(v,bool) or not math.isfinite(float(v)) or not .1<=float(v)<=.8 for s,v in targets.items()):
            return bad('Each target must be between 0.10 and 0.80 for a supported competency.')
        budget=data.get('budget')
        budget=None if budget in (None,'') else float(budget)
        if budget is not None and (not math.isfinite(budget) or not .25<=budget<=10000): return bad('Budget must be between 0.25 and 10000 hours.')
    except (ValueError,TypeError): return bad('Enter numeric target levels and budget.')
    objective=data.get('objective','actions')
    if objective not in ('actions','hours'): return bad('Choose actions or hours.')
    p,_=TwinProfile.objects.get_or_create(user=request.user)
    p.targets={s:float(v) for s,v in targets.items()};p.target_name=name;p.objective=objective;p.budget=budget;p.save()
    return Response(recalculate(request.user))


@api_view(['POST'])
@permission_classes([AllowAny])
def parse_target(request):
    return Response({'targets':parse_requirements(str(request.data.get('description',''))[:20000]),
                     'note':'Dictionary-based extraction. Review the competencies and target levels before saving.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def evidence(request):
    d=request.data;skill=d.get('skill');kind=d.get('kind','declaration')
    if skill not in CATALOG['skills']: return bad('Choose a supported competency.')
    if kind not in ('declaration','project','certificate','coursework'): return bad('Assessment scores must come from the assessment endpoint or a staff review.')
    try:
        value=float(d.get('value'))
        if not math.isfinite(value) or not 0<=value<=1: raise ValueError()
    except (TypeError,ValueError): return bad('Score must be between 0 and 1.')
    raw=str(d.get('observed_at',''))
    try:
        observed=parse_datetime(raw)
        if observed is None:
            day=parse_date(raw)
            observed=timezone.make_aware(timezone.datetime.combine(day,timezone.datetime.min.time())) if day else None
        if observed and timezone.is_naive(observed): observed=timezone.make_aware(observed)
    except (ValueError,TypeError): observed=None
    if not observed or observed>timezone.now()+timedelta(minutes=5): return bad('Enter a valid date that is not in the future.')
    note=str(d.get('note',''))[:500]
    Evidence.objects.get_or_create(user=request.user,skill=skill,kind=kind,channel=kind,value=value,observed_at=observed,
                                  defaults={'note':note})
    return Response(recalculate(request.user))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def resume(request):
    file=request.FILES.get('file')
    if not file or file.size>5*1024*1024: return bad('Upload a PDF, DOCX or TXT file smaller than 5 MB.')
    ext=file.name.rsplit('.',1)[-1].lower()
    try:
        if ext=='txt': text=file.read().decode('utf-8-sig')
        elif ext=='pdf':
            from pypdf import PdfReader
            reader=PdfReader(file)
            if len(reader.pages)>30: return bad('Use a resume of 30 pages or fewer.')
            text='\n'.join(p.extract_text() or '' for p in reader.pages)
        elif ext=='docx':
            import zipfile
            data=file.read()
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                if sum(i.file_size for i in archive.infolist())>25*1024*1024: return bad('The expanded Word document is too large.')
            from docx import Document
            doc=Document(io.BytesIO(data))
            text='\n'.join(p.text for p in doc.paragraphs)+'\n'+'\n'.join(c.text for t in doc.tables for row in t.rows for c in row.cells)
        else: return bad('Use PDF, DOCX or TXT. Convert older DOC files to DOCX first.')
    except Exception: return bad('The file could not be read. Try a text-based PDF, DOCX or TXT file.')
    if not text.strip(): return bad('No readable text found. Scanned PDFs need OCR before upload.')
    found=[s for s in CATALOG['skills'] if matches(text[:100000],s)]
    if not found: return bad('No supported skills were found. Add your evidence manually.')
    # Replace the resume source snapshot; absence in a replacement does not erase other channels.
    with transaction.atomic():
        Evidence.objects.filter(user=request.user,kind='resume').delete()
        for skill in found:
            Evidence.objects.create(user=request.user,skill=skill,kind='resume',channel='resume',value=.60,
                                    observed_at=timezone.now(),note='Resume mention only; proficiency and practice date are unverified.')
    result=recalculate(request.user);result['imported_skills']=found
    return Response(result)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def github(request):
    repo=str(request.data.get('repository','')).strip().removeprefix('https://github.com/').rstrip('/')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',repo): return bad('Use a public repository in owner/repository format.')
    try:
        response=requests.get('https://api.github.com/repos/'+repo,headers={'Accept':'application/vnd.github+json'},timeout=12)
        response.raise_for_status();data=response.json()
    except (requests.RequestException,ValueError): return bad('GitHub could not return this repository. It may be private, unavailable or rate limited.')
    language=data.get('language')
    if language not in CATALOG['skills']: return bad('This repository has no supported primary language. Add a project record manually.')
    observed=parse_datetime(data.get('pushed_at') or data['updated_at'])
    # Ownership and code quality are NOT established by a public repository URL.
    Evidence.objects.update_or_create(user=request.user,skill=language,kind='github',channel='github',
         defaults=dict(value=.50,observed_at=observed,source_url='https://github.com/'+repo,
                       note='Public repository language signal; ownership and proficiency are unverified.'))
    return Response(recalculate(request.user))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def assessment_start(request):
    skill=request.data.get('skill')
    if skill not in BANK: return bad('No built-in check for this competency. Ask an assessor for a reviewed result.')
    attempt=AssessmentAttempt.objects.create(user=request.user,skill=skill)
    return Response({'id':attempt.id,'skill':skill,'questions':public_questions(skill),
                     'note':'Unsupervised knowledge check; not a proctored certification. Expires after 30 minutes.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def assessment_submit(request,pk):
    attempt=AssessmentAttempt.objects.select_for_update().filter(pk=pk,user=request.user).first()
    if not attempt: return Response({'error':'Assessment not found.'},status=404)
    if attempt.submitted: return bad('This attempt has already been submitted.')
    if attempt.created_at<timezone.now()-timedelta(minutes=30): return bad('This assessment has expired. Start a new one.')
    questions=BANK[attempt.skill];answers=request.data.get('answers')
    if not isinstance(answers,list) or len(answers)!=len(questions) or any(type(a) is not int or not 0<=a<4 for a in answers):
        return bad('Answer every question before submitting.')
    score=sum(a==q[2] for a,q in zip(answers,questions))/len(questions)
    attempt.score=score;attempt.submitted=True;attempt.save()
    Evidence.objects.create(user=request.user,skill=attempt.skill,kind='assessment',channel='assessment',value=score,
                            observed_at=timezone.now(),note='Server-scored unsupervised knowledge check.')
    result=recalculate(request.user);result['assessment_score']=score
    return Response(result)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def complete_activity(request):
    current=recalculate(request.user)
    action=next((a for a in current['plan']['actions'] if a['id']==request.data.get('activity_id')),None)
    if not action: return bad('This activity is no longer in your current plan. Refresh the plan.')
    ActivityCompletion.objects.create(user=request.user,activity_id=action['id'],title=action['title'])
    result=recalculate(request.user)
    result['completion_message']='Completion saved. Submit an assessment or reviewed evidence to update your score.'
    return Response(result)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def codeforces(request):
    handle=str(request.data.get('handle','')).strip()
    if not re.fullmatch(r'[A-Za-z0-9_.-]{3,24}',handle): return bad('Enter a valid Codeforces handle.')
    try:
        response=requests.get('https://codeforces.com/api/user.rating',params={'handle':handle},timeout=12)
        response.raise_for_status();payload=response.json()
        if payload.get('status')!='OK' or not payload.get('result'): return bad('No rated contests were returned for this handle.')
        latest=max(payload['result'],key=lambda x:x['ratingUpdateTimeSeconds'])
        rating=max(0,int(latest['newRating']))
        from datetime import datetime, timezone as dt_timezone
        observed=datetime.fromtimestamp(latest['ratingUpdateTimeSeconds'],tz=dt_timezone.utc)
        value=min(1.,rating/2400)
    except (requests.RequestException,ValueError,KeyError,TypeError): return bad('Codeforces is unavailable or returned an unreadable result. Try again later.')
    Evidence.objects.update_or_create(user=request.user,skill='Algorithms',kind='codeforces',channel='codeforces',
        defaults=dict(value=value,observed_at=observed,source_url='https://codeforces.com/profile/'+handle,
                      note=f'Public contest rating {rating}/2400 (capped at 1). Account ownership unverified.'))
    return Response(recalculate(request.user))
