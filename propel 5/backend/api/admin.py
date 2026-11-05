"""
Propel Career — Admin Registration
"""
from django.contrib import admin
from .models import (
    UserProfile, Job, ReadinessLevel, ReadinessTask,
    UserProgress, Notification, ContactMessage,
)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'career_goal', 'current_level', 'created_at']
    list_filter = ['career_goal', 'current_level']
    search_fields = ['user__username', 'user__email']


@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    list_display = ['title', 'company', 'location', 'source', 'job_type', 'scraped_at']
    list_filter = ['source', 'job_type', 'is_active']
    search_fields = ['title', 'company', 'location']
    date_hierarchy = 'scraped_at'


@admin.register(ReadinessLevel)
class ReadinessLevelAdmin(admin.ModelAdmin):
    list_display = ['order', 'icon', 'name', 'description']
    ordering = ['order']


@admin.register(ReadinessTask)
class ReadinessTaskAdmin(admin.ModelAdmin):
    list_display = ['title', 'level', 'category', 'order']
    list_filter = ['level', 'category']
    ordering = ['level__order', 'order']


@admin.register(UserProgress)
class UserProgressAdmin(admin.ModelAdmin):
    list_display = ['user', 'task', 'completed_at']
    list_filter = ['task__level']
    search_fields = ['user__username']


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['user', 'notification_type', 'message', 'is_read', 'created_at']
    list_filter = ['notification_type', 'is_read']


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ['name', 'email', 'subject', 'created_at', 'is_read']
    list_filter = ['subject', 'is_read']

from .models import Evidence, ReliabilityAdjustment, TwinProfile, AssessmentAttempt, ActivityCompletion
from .engine import CATALOG, BASE_WEIGHTS
from .service import recalculate
from django import forms


class EvidenceForm(forms.ModelForm):
    skill = forms.ChoiceField(choices=[(s,s) for s in CATALOG['skills']])
    kind = forms.ChoiceField(choices=[(s,s) for s in BASE_WEIGHTS])
    value = forms.FloatField(min_value=0,max_value=1)
    class Meta:
        model=Evidence
        fields='__all__'

    def clean_observed_at(self):
        from django.utils import timezone
        v=self.cleaned_data['observed_at']
        if v>timezone.now(): raise forms.ValidationError('Evidence cannot be dated in the future.')
        return v


@admin.register(Evidence)
class EvidenceAdmin(admin.ModelAdmin):
    form=EvidenceForm
    list_display=('user','skill','kind','value','observed_at')
    list_filter=('kind','skill')
    def save_model(self,request,obj,form,change):
        if obj.kind=='reviewed': obj.channel='reviewed'
        super().save_model(request,obj,form,change)
        recalculate(obj.user)
    def delete_model(self,request,obj):
        user=obj.user
        super().delete_model(request,obj)
        recalculate(user)


admin.site.register(ReliabilityAdjustment)
admin.site.register(TwinProfile)
admin.site.register(AssessmentAttempt)
admin.site.register(ActivityCompletion)
