from celery import Celery

from app.core.config import get_settings

_settings = get_settings()

celery_app = Celery(
    "eurospital_eventi",
    broker=_settings.broker_url,
    backend=_settings.broker_url,
    include=["app.workers.tasks"],
)

celery_app.conf.task_acks_late = True
celery_app.conf.broker_connection_retry_on_startup = True
celery_app.conf.task_always_eager = _settings.celery_task_always_eager
celery_app.conf.task_eager_propagates = True
