"""
Propel Career — DRF Serializers
"""

from rest_framework import serializers
from django.contrib.auth.models import User
from .models import (
    UserProfile, Job, ReadinessLevel, ReadinessTask,
    UserProgress, Notification, ContactMessage,
)


class UserSerializer(serializers.ModelSerializer):
    career_goal = serializers.CharField(source='profile.career_goal', read_only=True)
    current_level = serializers.IntegerField(source='profile.current_level', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'career_goal', 'current_level']


class UserProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)

    class Meta:
        model = UserProfile
        fields = ['id', 'username', 'email', 'career_goal', 'skills', 'bio', 'current_level']


class JobSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = [
            'id', 'title', 'company', 'location', 'source', 'url',
            'salary', 'job_type', 'description', 'posted_date', 'scraped_at', 'is_demo',
        ]


class ReadinessTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadinessTask
        fields = ['id', 'title', 'description', 'category', 'order']


class ReadinessLevelSerializer(serializers.ModelSerializer):
    tasks = ReadinessTaskSerializer(many=True, read_only=True)

    class Meta:
        model = ReadinessLevel
        fields = ['id', 'order', 'name', 'icon', 'description', 'tasks']


class UserProgressSerializer(serializers.ModelSerializer):
    task_title = serializers.CharField(source='task.title', read_only=True)

    class Meta:
        model = UserProgress
        fields = ['id', 'task', 'task_title', 'completed_at']


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'notification_type', 'message', 'icon', 'is_read', 'created_at']


class ContactMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactMessage
        fields = ['id', 'name', 'email', 'subject', 'message']


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, write_only=True)
    career_goal = serializers.CharField(max_length=50, required=False, default='software')

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already taken.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already registered.")
        return value


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()
