"""
Management command to seed the database with readiness levels, tasks, and demo jobs.
Usage: python manage.py seed_levels
"""

from django.core.management.base import BaseCommand
from api.models import ReadinessLevel, ReadinessTask, Job
from api.scraper import get_demo_jobs


LEVELS_DATA = [
    {
        'order': 1,
        'name': 'Explorer',
        'icon': '🌱',
        'description': 'Just starting out — discover your path',
        'tasks': [
            {'title': 'Identify Your Interest', 'description': 'Choose 2-3 career fields that excite you', 'category': 'skill', 'order': 1},
            {'title': 'Complete a Free Course', 'description': 'Finish any online course (Coursera, Udemy, etc.)', 'category': 'skill', 'order': 2},
            {'title': 'Create a LinkedIn Profile', 'description': 'Set up a professional LinkedIn profile with a photo', 'category': 'profile', 'order': 3},
            {'title': 'Join a Community', 'description': 'Join a relevant Discord, Slack, or forum', 'category': 'network', 'order': 4},
        ],
    },
    {
        'order': 2,
        'name': 'Builder',
        'icon': '🔨',
        'description': 'Building skills & projects',
        'tasks': [
            {'title': 'Build a Project', 'description': 'Complete a personal or academic project in your field', 'category': 'project', 'order': 1},
            {'title': 'Learn Git & GitHub', 'description': 'Push at least 3 projects to your GitHub profile', 'category': 'skill', 'order': 2},
            {'title': 'Write a Blog Post', 'description': 'Share your learning journey or a technical topic', 'category': 'profile', 'order': 3},
            {'title': 'Attend a Meetup', 'description': 'Attend an online or offline tech/industry meetup', 'category': 'network', 'order': 4},
        ],
    },
    {
        'order': 3,
        'name': 'Seeker',
        'icon': '🎯',
        'description': 'Actively preparing for internships',
        'tasks': [
            {'title': 'Build Your Resume', 'description': 'Create a polished, one-page resume', 'category': 'profile', 'order': 1},
            {'title': 'Practice Interview Q&A', 'description': 'Complete 20+ practice questions for your field', 'category': 'skill', 'order': 2},
            {'title': 'Get a Peer Review', 'description': 'Have someone review your resume and projects', 'category': 'network', 'order': 3},
            {'title': 'Research Companies', 'description': 'Create a list of 10+ companies you want to apply to', 'category': 'project', 'order': 4},
        ],
    },
    {
        'order': 4,
        'name': 'Launcher',
        'icon': '🚀',
        'description': 'Ready to apply — polished & prepared',
        'tasks': [
            {'title': 'Apply to 5 Internships', 'description': 'Submit applications to at least 5 positions', 'category': 'project', 'order': 1},
            {'title': 'Build a Portfolio', 'description': 'Create a portfolio website showcasing your work', 'category': 'profile', 'order': 2},
            {'title': 'Get a Referral', 'description': 'Connect with someone who can refer you', 'category': 'network', 'order': 3},
            {'title': 'Mock Interview', 'description': 'Complete a mock interview with feedback', 'category': 'skill', 'order': 4},
        ],
    },
    {
        'order': 5,
        'name': 'Pro',
        'icon': '👑',
        'description': 'Internship-ready with a strong portfolio',
        'tasks': [
            {'title': 'Land an Interview', 'description': 'Secure at least one interview from your applications', 'category': 'project', 'order': 1},
            {'title': 'Negotiate & Accept', 'description': 'Negotiate terms and accept an internship offer', 'category': 'skill', 'order': 2},
            {'title': 'Prepare for Day 1', 'description': 'Research the company culture and set goals', 'category': 'profile', 'order': 3},
            {'title': 'Mentor a Peer', 'description': 'Help someone at a lower level with their journey', 'category': 'network', 'order': 4},
        ],
    },
]


class Command(BaseCommand):
    help = 'Seed the database with readiness levels, tasks, and demo jobs'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE('🌱 Seeding readiness levels and tasks...'))

        for level_data in LEVELS_DATA:
            level_data = dict(level_data)
            tasks = level_data.pop('tasks')
            level, created = ReadinessLevel.objects.update_or_create(
                order=level_data['order'],
                defaults=level_data,
            )
            action = 'Created' if created else 'Updated'
            self.stdout.write(f"  {action}: {level.icon} {level.name}")

            for task_data in tasks:
                task, t_created = ReadinessTask.objects.update_or_create(
                    level=level,
                    title=task_data['title'],
                    defaults=task_data,
                )
                if t_created:
                    self.stdout.write(f"    + {task.title}")

        self.stdout.write(self.style.NOTICE('\n💼 Seeding demo jobs...'))
        demo_jobs = get_demo_jobs()
        for job_data in demo_jobs:
            job, created = Job.objects.update_or_create(
                title=job_data['title'],
                company=job_data['company'],
                defaults={
                    'location': job_data.get('location', ''),
                    'source': job_data.get('source', 'other'),
                    'url': job_data.get('url', ''),
                    'salary': job_data.get('salary', ''),
                    'job_type': job_data.get('job_type', 'full-time'),
                    'description': job_data.get('description', ''),
                    'is_demo': True,
                    'posted_date': job_data.get('posted_date'),
                },
            )
            if created:
                self.stdout.write(f"  + {job.title} at {job.company}")

        self.stdout.write(self.style.SUCCESS(
            f'\n✅ Done! {ReadinessLevel.objects.count()} levels, '
            f'{ReadinessTask.objects.count()} tasks, '
            f'{Job.objects.count()} jobs seeded.'
        ))
