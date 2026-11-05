"""
Propel Career — API URL Configuration
"""
from django.urls import path
from . import views, twin_views

urlpatterns = [
    path('twin/catalog/', twin_views.catalog),
    path('twin/sample/', twin_views.sample),
    path('twin/', twin_views.twin),
    path('twin/target/', twin_views.target),
    path('twin/parse-target/', twin_views.parse_target),
    path('twin/evidence/', twin_views.evidence),
    path('twin/resume/', twin_views.resume),
    path('twin/github/', twin_views.github),
    path('twin/codeforces/', twin_views.codeforces),
    path('twin/assessment/start/', twin_views.assessment_start),
    path('twin/assessment/<int:pk>/submit/', twin_views.assessment_submit),
    path('twin/activity/complete/', twin_views.complete_activity),

    # Auth
    path('auth/register/', views.register_view, name='register'),
    path('auth/login/', views.login_view, name='login'),

    # Jobs
    path('jobs/', views.jobs_list, name='jobs-list'),
    path('jobs/scrape/', views.jobs_scrape, name='jobs-scrape'),

    # Tracker
    path('tracker/', views.tracker_view, name='tracker'),
    path('tracker/complete/', views.tracker_complete, name='tracker-complete'),

    # Notifications
    path('notifications/', views.notifications_list, name='notifications-list'),
    path('notifications/<int:pk>/read/', views.notification_read, name='notification-read'),
    path('notifications/clear/', views.notifications_clear, name='notifications-clear'),

    # Contact
    path('contact/', views.contact_view, name='contact'),
]
