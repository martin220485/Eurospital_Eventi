"""Celery beat schedule: promemoria pre-evento + pulizia audit log."""
from celery.schedules import crontab

from app.workers.celery_app import celery_app

celery_app.conf.beat_schedule = {
    "send-reminders-24h": {
        "task": "app.workers.tasks.send_pre_event_reminders",
        "schedule": crontab(minute=0),  # ogni ora
        "args": (24,),  # finestra 24h ± 30min
    },
    "send-reminders-1h": {
        "task": "app.workers.tasks.send_pre_event_reminders",
        "schedule": crontab(minute=15),  # ogni ora 15
        "args": (1,),
    },
    "cleanup-audit-daily": {
        "task": "app.workers.tasks.cleanup_audit_logs_task",
        "schedule": crontab(hour=3, minute=30),  # ogni notte 3:30 UTC
    },
}
