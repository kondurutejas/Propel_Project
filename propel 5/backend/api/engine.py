"""Deterministic evidence fusion and exact weighted set cover. No ML claims.
All scores are experimental policy scores, not employment probabilities.
"""
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

CATALOG = json.loads(Path(__file__).with_name('catalog.json').read_text())
BASE_WEIGHTS = {'declaration': .35, 'resume': .35, 'project': .45,
                'certificate': .50, 'coursework': .50, 'github': .45,
                'codeforces': .45, 'assessment': .90, 'reviewed': .95}
THRESHOLDS = {'quality': .65, 'freshness': .60, 'consistency': .65}
ALIASES = {'JavaScript':['javascript','ecmascript'], 'Node.js':['node.js','nodejs'],
 'React':['react','reactjs'], 'Git':['git','github','gitlab'], 'SQL':['sql','mysql','postgresql','sqlite'],
 'OOP':['oop','object oriented','object-oriented'], 'REST API':['rest api','restful'],
 'CI/CD':['ci/cd','continuous integration'], 'Machine Learning':['machine learning'],
 'Data Structures':['data structures'], 'Scikit-learn':['scikit-learn','sklearn'],
 'AWS':['aws','amazon web services'], 'NLP':['nlp','natural language processing']}


def matches(text, skill):
    return any(re.search(r'(?<![\w])' + re.escape(v) + r'(?![\w])', text, re.I)
               for v in ALIASES.get(skill, [skill]))


def parse_requirements(text):
    # Explicit levels override the default. A nearby 'advanced' label raises it.
    result = {}
    for skill in CATALOG['skills']:
        if matches(text, skill):
            pattern = r'(?<!\w)' + re.escape(skill) + r'\s*[:=]\s*(0(?:\.\d+)?|1(?:\.0+)?)(?![\d.])'
            explicit = re.search(pattern, text, re.I)
            result[skill] = min(.8, max(.1, float(explicit.group(1)))) if explicit else .65
    return result


def role_requirements(role):
    return {s['name']: .70 if s['priority']=='high' else .60
            for s in CATALOG['roles'][role]['skills']}


def instant(value):
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(value.replace('Z','+00:00'))


def fuse(skill, evidence, factor=1., now=None):
    now = now or datetime.now(timezone.utc)
    half_life = CATALOG['skills'][skill]['half_life_days']
    rows = []
    for e in evidence:
        age = max(0., (now - instant(e['observed_at'])).total_seconds()/86400)
        w = BASE_WEIGHTS[e['kind']] * (factor if e['kind'] in ('declaration','resume') else 1.)
        rows.append((e, w, 2 ** (-age/half_life)))
    total = sum(w for _,w,_ in rows)
    if not total:
        return dict(skill=skill, score=0., quality=0., freshness=0., consistency=0.,
                    evidence_count=0, half_life_days=half_life, reliability_factor=factor)
    # Crucial: the denominator does NOT decay. Frozen evidence really loses score with time.
    score = sum(w*d*e['value'] for e,w,d in rows)/total
    quality = sum(w*w for _,w,_ in rows)/total
    freshness = sum(w*d for _,w,d in rows)/total
    fresh_weight = sum(w*d for _,w,d in rows)
    mean = sum(w*d*e['value'] for e,w,d in rows)/fresh_weight if fresh_weight else 0
    variance = sum(w*d*(e['value']-mean)**2 for e,w,d in rows)/fresh_weight if fresh_weight else 0
    consistency = max(0., 1-2*math.sqrt(variance))
    return dict(skill=skill, score=score, quality=quality, freshness=freshness,
                consistency=consistency, evidence_count=len(rows), half_life_days=half_life,
                reliability_factor=factor)


def feedback(claim, demonstrated, factor):
    """Evaluate only a NEW evidence pair; persistence/idempotency lives in service.py."""
    delta = claim['value']-demonstrated['value']
    if delta > .20:
        return max(.10, factor*.70), 'contradiction'
    if abs(delta) <= .20 and factor < 1:
        return min(1., factor+.10), 'recovery'
    return factor, 'unchanged'


def optimize(states, objective='actions', budget=None):
    """Exact subset DP over the gap mask; claims only optimality within this finite catalog.
    Each activity predicts +0.8 per covered skill (unvalidated planning assumption).
    Actual completion NEVER directly increases a competency score.
    """
    gaps = [s for s in states if s['gap'] > 1e-8]
    candidates = []
    for s in gaps:
        meta = CATALOG['skills'][s['skill']]
        candidates.append(dict(id='learn:'+s['skill'], title='Practice '+s['skill'],
             kind='learning', skills=[s['skill']], hours=meta['hours'], predicted_gain=.8,
             url=meta['url']))
    combos = [('Build a web service',['Python','SQL','REST API','Git'],12),
              ('Build a full stack project',['JavaScript','React','Node.js','Express','MongoDB','Git'],18),
              ('Analyze a dataset',['Python','Pandas','NumPy','Statistics','Data Visualization'],14),
              ('Deploy a service',['Docker','Linux','AWS','CI/CD','Git'],16)]
    wanted = {s['skill'] for s in gaps}
    for idx,(title,skills,hours) in enumerate(combos):
        cover = sorted(wanted.intersection(skills))
        if len(cover)>1:
            candidates.append(dict(id=f'project:{idx}',title=title,kind='learning',skills=cover,
                                   hours=hours,predicted_gain=.8,url=''))
    # Up to 12 target competencies => at most 4096 states, exact and bounded.
    index = {s['skill']:i for i,s in enumerate(gaps)}
    validation_hours = .25*sum(not s['resolved'] for s in states)
    learning_budget = None if budget is None else budget-validation_hours
    # Keep min-hours for EACH (coverage, action-count), preserving Pareto alternatives.
    dp = {(0,0):(0.,[])}
    for a in candidates:
        mask = sum(1<<index[s] for s in a['skills'])
        for (prior,count),(hours,chosen) in list(dp.items()):
            newmask=prior|mask
            if newmask==prior: continue
            cost=hours+a['hours']
            if learning_budget is not None and cost>learning_budget: continue
            key=(newmask,count+1)
            if key not in dp or cost<dp[key][0]: dp[key]=(cost,chosen+[a])
    options=[(count,hours,chosen) for (mask,count),(hours,chosen) in dp.items()
             if mask==(1<<len(gaps))-1 and (learning_budget is None or hours<=learning_budget)]
    best=min(options,key=lambda x:(x[0],x[1]) if objective=='actions' else (x[1],x[0])) if options else None
    validations=[dict(id='validate:'+s['skill'],title='Validate '+s['skill'],kind='validation',
                     skills=[s['skill']],hours=.25,predicted_gain=0,url='')
                 for s in states if s['gap']<=1e-8 and not s['resolved']]
    return dict(feasible=best is not None, objective=objective, actions=(best[2]+validations if best else []),
                learning_hours=best[1] if best else None, validation_hours=validation_hours,
                total_hours=(best[1]+validation_hours) if best else None,
                message='Exact minimum within the catalog; gains and durations are planning assumptions.' if best
                else 'No complete plan fits this budget. Increase the budget or reduce the target skills.',
                requires_validation_after_learning=bool(gaps))


def assess(evidence, targets, factors=None, objective='actions', budget=None, now=None):
    factors = factors or {}
    states=[]
    for skill,target in targets.items():
        # Use the latest observation per source channel to avoid counting retakes/repeated uploads as independent proof.
        latest={}
        for e in evidence:
            if e['skill']!=skill: continue
            channel=e.get('channel') or e['kind']
            if channel not in latest or instant(e['observed_at'])>=instant(latest[channel]['observed_at']):
                latest[channel]=e
        s=fuse(skill,list(latest.values()),factors.get(skill,1.),now)
        s['target']=target
        s['gap']=max(0.,target-s['score'])
        s['confidence_pass']=all(s[k]>=v for k,v in THRESHOLDS.items())
        s['resolved']=s['gap']<=1e-8 and s['confidence_pass']
        s['status']='ready' if s['resolved'] else ('validate' if s['gap']<=1e-8 else 'learn')
        s['reasons']=[f'{k.title()} below {v:.0%}' for k,v in THRESHOLDS.items() if s[k]<v]
        if s['gap']>1e-8: s['reasons'].insert(0,'Evidence score below target')
        states.append(s)
    return dict(states=states, thresholds=THRESHOLDS,
                readiness=round(100*sum(s['resolved'] for s in states)/len(states)) if states else 0,
                coverage=round(100*sum(min(1,s['score']/s['target']) for s in states)/len(states)) if states else 0,
                plan=optimize(states,objective,budget),
                computed_at=(now or datetime.now(timezone.utc)).isoformat())
