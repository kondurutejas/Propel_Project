"""
Propel Career — Database Models
All models for user profiles, jobs, readiness tracker, and notifications.
"""

from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class UserProfile(models.Model):
    """Extended user profile with career information."""
    CAREER_GOALS = [
        ('software', 'Software Engineering'),
        ('data', 'Data Science'),
        ('design', 'UX/UI Design'),
        ('marketing', 'Marketing'),
        ('finance', 'Finance'),
        ('other', 'Other'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    career_goal = models.CharField(max_length=50, choices=CAREER_GOALS, default='software')
    skills = models.TextField(blank=True, default='')
    bio = models.TextField(blank=True, default='')
    current_level = models.IntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} — Level {self.current_level}"

    class Meta:
        verbose_name = 'User Profile'
        verbose_name_plural = 'User Profiles'


class Job(models.Model):
    """Scraped job listing from various sources."""
    SOURCE_CHOICES = [
        ('linkedin', 'LinkedIn'),
        ('indeed', 'Indeed'),
        ('naukri', 'Naukri'),
        ('glassdoor', 'Glassdoor'),
        ('google', 'Google'),
        ('zip_recruiter', 'ZipRecruiter'),
        ('other', 'Other'),
    ]

    TYPE_CHOICES = [
        ('internship', 'Internship'),
        ('full-time', 'Full Time'),
        ('part-time', 'Part Time'),
        ('contract', 'Contract'),
    ]

    title = models.CharField(max_length=300)
    company = models.CharField(max_length=200)
    location = models.CharField(max_length=200, blank=True, default='')
    source = models.CharField(max_length=50, choices=SOURCE_CHOICES, default='other')
    url = models.URLField(max_length=500, blank=True, default='')
    salary = models.CharField(max_length=100, blank=True, default='')
    job_type = models.CharField(max_length=50, choices=TYPE_CHOICES, default='full-time')
    description = models.TextField(blank=True, default='')
    posted_date = models.DateField(null=True, blank=True)
    scraped_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    is_demo = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.title} at {self.company} ({self.source})"

    class Meta:
        ordering = ['-scraped_at']
        verbose_name = 'Job Listing'
        verbose_name_plural = 'Job Listings'


class ReadinessLevel(models.Model):
    """Readiness tracker levels."""
    order = models.IntegerField(unique=True)
    name = models.CharField(max_length=50)
    icon = models.CharField(max_length=10)
    description = models.TextField(blank=True, default='')

    def __str__(self):
        return f"Level {self.order}: {self.icon} {self.name}"

    class Meta:
        ordering = ['order']


class ReadinessTask(models.Model):
    """Tasks within each readiness level."""
    CATEGORY_CHOICES = [
        ('skill', 'Skill'),
        ('project', 'Project'),
        ('profile', 'Profile'),
        ('network', 'Network'),
    ]

    level = models.ForeignKey(ReadinessLevel, on_delete=models.CASCADE, related_name='tasks')
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default='skill')
    order = models.IntegerField(default=0)

    def __str__(self):
        return f"[{self.level.name}] {self.title}"

    class Meta:
        ordering = ['level__order', 'order']


class UserProgress(models.Model):
    """Tracks which tasks a user has completed."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='progress')
    task = models.ForeignKey(ReadinessTask, on_delete=models.CASCADE, related_name='completions')
    completed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} completed: {self.task.title}"

    class Meta:
        unique_together = ('user', 'task')
        verbose_name = 'User Progress'
        verbose_name_plural = 'User Progress'


class Notification(models.Model):
    """User notifications for job alerts and system events."""
    TYPE_CHOICES = [
        ('job', 'Job Alert'),
        ('level', 'Level Up'),
        ('system', 'System'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    job = models.ForeignKey(Job, on_delete=models.SET_NULL, null=True, blank=True)
    notification_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='system')
    message = models.TextField()
    icon = models.CharField(max_length=10, default='🔔')
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[{self.notification_type}] {self.message[:50]}"

    class Meta:
        ordering = ['-created_at']


class ContactMessage(models.Model):
    """Stores contact form submissions."""
    name = models.CharField(max_length=100)
    email = models.EmailField()
    subject = models.CharField(max_length=100, default='general')
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)

    def __str__(self):
        return f"From {self.name}: {self.subject}"

    class Meta:
        ordering = ['-created_at']


class Evidence(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    skill = models.CharField(max_length=80)
    kind = models.CharField(max_length=30)
    channel = models.CharField(max_length=100)
    value = models.FloatField()
    observed_at = models.DateTimeField()
    note = models.CharField(max_length=500, blank=True)
    source_url = models.URLField(blank=True, max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-observed_at', '-id']


class ReliabilityAdjustment(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    skill = models.CharField(max_length=80)
    factor = models.FloatField(default=1.)
    last_pair = models.CharField(max_length=100, blank=True)
    events = models.JSONField(default=list)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user','skill'],name='unique_reliability')]


class TwinProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    target_name = models.CharField(max_length=250, default='Software Engineering')
    targets = models.JSONField(default=dict)
    objective = models.CharField(max_length=20,default='actions')
    budget = models.FloatField(null=True,blank=True)
    last_snapshot = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)


class AssessmentAttempt(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    skill = models.CharField(max_length=80)
    submitted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    score = models.FloatField(null=True)


class ActivityCompletion(models.Model):
    user = models.ForeignKey(User,on_delete=models.CASCADE)
    activity_id = models.CharField(max_length=100)
    title = models.CharField(max_length=200)
    completed_at = models.DateTimeField(auto_now_add=True)
