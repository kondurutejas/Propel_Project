from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from .models import Evidence, ReliabilityAdjustment, TwinProfile
from .engine import assess, feedback, role_requirements


def evidence_dict(e):
    return dict(id=e.id,skill=e.skill,kind=e.kind,channel=e.channel,value=e.value,
                observed_at=e.observed_at.isoformat(),note=e.note,source_url=e.source_url)


@transaction.atomic
def recalculate(user):
    # Serialize ingestion and assessment for an account, including registry updates.
    profile,_=TwinProfile.objects.get_or_create(user=user,defaults={'targets':role_requirements('software')})
    profile=TwinProfile.objects.select_for_update().get(pk=profile.pk)
    records=list(Evidence.objects.filter(user=user).order_by('observed_at','id'))
    now=timezone.now()
    for skill in {e.skill for e in records}:
        recent=[e for e in records if e.skill==skill and e.observed_at>=now-timedelta(days=30)]
        claims=[e for e in recent if e.kind in ('declaration','resume')]
        demos=[e for e in recent if e.kind in ('assessment','reviewed')]
        if not claims or not demos: continue
        claim,demo=claims[-1],demos[-1]
        registry,_=ReliabilityAdjustment.objects.get_or_create(user=user,skill=skill)
        pair=f'{claim.id}:{demo.id}'
        if registry.last_pair==pair or any(e['pair']==pair for e in registry.events): continue
        old=registry.factor
        new,reason=feedback(evidence_dict(claim),evidence_dict(demo),old)
        registry.factor=new
        registry.last_pair=pair
        registry.events=(registry.events+[dict(pair=pair,reason=reason,old=old,new=new,at=now.isoformat())])
        registry.save()
    factors={r.skill:r.factor for r in ReliabilityAdjustment.objects.filter(user=user)}
    result=assess([evidence_dict(e) for e in records],profile.targets,factors,profile.objective,profile.budget,now)
    profile.last_snapshot=result
    profile.save()
    result.update(target_name=profile.target_name,targets=profile.targets,objective=profile.objective,
                  budget=profile.budget,evidence=[evidence_dict(e) for e in reversed(records)],
                  audit=[dict(skill=r.skill,factor=r.factor,events=r.events) for r in ReliabilityAdjustment.objects.filter(user=user)],
                  sample=False)
    return result
