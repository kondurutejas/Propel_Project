"""
Propel Career — API Views
All endpoints for auth, jobs, tracker, notifications, and contact.
"""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate
from django.contrib.auth.models import User

from .models import (
    UserProfile, Job, ReadinessLevel, ReadinessTask,
    UserProgress, Notification, ContactMessage,
)
from .serializers import (
    UserSerializer, JobSerializer, ReadinessLevelSerializer,
    NotificationSerializer, ContactMessageSerializer,
    RegisterSerializer, LoginSerializer,
)
from .scraper import scrape_jobs_from_portals


# ===== AUTH VIEWS =====

@api_view(['POST'])
@permission_classes([AllowAny])
def register_view(request):
    """Register a new user and return auth token."""
    serializer = RegisterSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {'error': str(list(serializer.errors.values())[0][0])},
            status=status.HTTP_400_BAD_REQUEST
        )

    data = serializer.validated_data
    user = User.objects.create_user(
        username=data['username'],
        email=data['email'],
        password=data['password'],
    )

    # Create profile
    UserProfile.objects.create(
        user=user,
        career_goal=data.get('career_goal', 'software'),
    )

    # Create auth token
    token, _ = Token.objects.get_or_create(user=user)

    return Response({
        'token': token.key,
        'user': UserSerializer(user).data,
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """Login with username/password and return auth token."""
    serializer = LoginSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {'error': 'Invalid data provided.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    user = authenticate(
        username=serializer.validated_data['username'],
        password=serializer.validated_data['password'],
    )

    if not user:
        return Response(
            {'error': 'Invalid username or password.'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    token, _ = Token.objects.get_or_create(user=user)

    # Ensure profile exists
    UserProfile.objects.get_or_create(user=user)

    return Response({
        'token': token.key,
        'user': UserSerializer(user).data,
    })


# ===== JOBS VIEWS =====

@api_view(['GET'])
@permission_classes([AllowAny])
def jobs_list(request):
    """List all jobs with optional filtering."""
    queryset = Job.objects.filter(is_active=True)

    # Filters
    source = request.query_params.get('source')
    location = request.query_params.get('location')
    job_type = request.query_params.get('job_type')
    search = request.query_params.get('search')

    if source and source != 'all':
        queryset = queryset.filter(source=source)
    if location:
        queryset = queryset.filter(location__icontains=location)
    if job_type:
        queryset = queryset.filter(job_type=job_type)
    if search:
        queryset = queryset.filter(title__icontains=search) | \
                   queryset.filter(company__icontains=search) | \
                   queryset.filter(description__icontains=search)

    serializer = JobSerializer(queryset[:50], many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def jobs_scrape(request):
    """Trigger a job scrape and return results."""
    search_term = request.data.get('search_term', 'software intern')
    location = request.data.get('location', 'India')

    from django.core.cache import cache
    key=f'job-fetch:{request.user.pk}'
    if not cache.add(key, True, 60):
        return Response({'error':'Please wait one minute before fetching jobs again.'},status=429)
    # Run scraper
    scraped = scrape_jobs_from_portals(search_term, location)

    # Save to database
    saved_jobs = []
    for job_data in scraped:
        job, created = Job.objects.update_or_create(
            title=job_data['title'],
            company=job_data['company'],
            source=job_data.get('source', 'other'),
            defaults={
                'location': job_data.get('location', ''),
                'url': job_data.get('url', ''),
                'salary': job_data.get('salary', ''),
                'job_type': job_data.get('job_type', 'full-time'),
                'description': job_data.get('description', ''),
                'is_demo': job_data.get('is_demo', False),
                'posted_date': job_data.get('posted_date'),
                'is_active': True,
            }
        )
        saved_jobs.append(job)

    # Create notifications for authenticated users
    if request.user.is_authenticated and any(not j.is_demo for j in saved_jobs):
        for job in [j for j in saved_jobs if not j.is_demo][:3]:  # Notify about top 3
            Notification.objects.create(
                user=request.user,
                job=job,
                notification_type='job',
                message=f"New {job.job_type}: {job.title} at {job.company}",
                icon='💼',
            )

    serializer = JobSerializer(saved_jobs, many=True)
    return Response(serializer.data)


# ===== TRACKER VIEWS =====

@api_view(['GET'])
@permission_classes([AllowAny])
def tracker_view(request):
    """Get readiness levels, tasks, and user progress."""
    levels = ReadinessLevel.objects.prefetch_related('tasks').all()
    levels_data = ReadinessLevelSerializer(levels, many=True).data

    completed_tasks = []
    current_level = 1

    if request.user.is_authenticated:
        completed_tasks = list(
            UserProgress.objects.filter(user=request.user)
            .values_list('task_id', flat=True)
        )
        profile = getattr(request.user, 'profile', None)
        if profile:
            current_level = profile.current_level

    return Response({
        'levels': levels_data,
        'completed_tasks': completed_tasks,
        'current_level': current_level,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def tracker_complete(request):
    """Mark a task as complete (or toggle it)."""
    task_id = request.data.get('task_id')

    if not task_id:
        return Response({'error': 'task_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        task = ReadinessTask.objects.get(id=task_id)
    except ReadinessTask.DoesNotExist:
        return Response({'error': 'Task not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.user.is_authenticated:
        progress, created = UserProgress.objects.get_or_create(
            user=request.user,
            task=task,
        )

        if not created:
            # Toggle: remove if already completed
            progress.delete()
            return Response({'status': 'uncompleted', 'task_id': task_id})

        # Check if level is complete
        level = task.level
        level_tasks = level.tasks.all()
        completed_count = UserProgress.objects.filter(
            user=request.user,
            task__in=level_tasks,
        ).count()

        if completed_count >= level_tasks.count():
            # Level complete! Advance user
            profile, _ = UserProfile.objects.get_or_create(user=request.user)
            next_level = level.order + 1
            if next_level <= ReadinessLevel.objects.count():
                profile.current_level = next_level
                profile.save()

                # Create notification
                next_level_obj = ReadinessLevel.objects.filter(order=next_level).first()
                if next_level_obj:
                    Notification.objects.create(
                        user=request.user,
                        notification_type='level',
                        message=f"Level Up! You've reached {next_level_obj.icon} {next_level_obj.name}!",
                        icon='🏆',
                    )

                return Response({
                    'status': 'completed',
                    'task_id': task_id,
                    'level_up': True,
                    'new_level': next_level,
                })

    return Response({'status': 'completed', 'task_id': task_id})


# ===== NOTIFICATIONS VIEWS =====

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notifications_list(request):
    """Get user's notifications."""
    notifs = Notification.objects.filter(user=request.user)[:50]
    serializer = NotificationSerializer(notifs, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def notification_read(request, pk):
    """Mark a notification as read."""
    try:
        notif = Notification.objects.get(id=pk, user=request.user)
        notif.is_read = True
        notif.save()
        return Response({'status': 'ok'})
    except Notification.DoesNotExist:
        return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def notifications_clear(request):
    """Clear all notifications for the user."""
    Notification.objects.filter(user=request.user).delete()
    return Response({'status': 'cleared'})


# ===== CONTACT VIEW =====

@api_view(['POST'])
@permission_classes([AllowAny])
def contact_view(request):
    """Submit a contact form message."""
    serializer = ContactMessageSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response({'status': 'sent'}, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
