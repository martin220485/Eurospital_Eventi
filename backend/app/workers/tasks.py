from datetime import UTC, datetime

from app.db.session import SessionLocal
from app.models import NotificationLog, NotificationTemplate, SmtpSettings, User
from app.services import notification_service
from app.workers.celery_app import celery_app


@celery_app.task(
    bind=True,
    name="app.workers.tasks.send_notification",
    autoretry_for=(OSError,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def send_notification(self, template_code: str, user_id: int, registration_id: int | None, context: dict) -> int:
    """Render template, send via SMTP, write notification_log row. Returns log id."""
    db = SessionLocal()
    log_id: int | None = None
    try:
        tmpl = db.query(NotificationTemplate).filter_by(code=template_code).one_or_none()
        if tmpl is None:
            raise RuntimeError(f"template '{template_code}' not found")
        user = db.get(User, user_id)
        if user is None:
            raise RuntimeError(f"user {user_id} not found")
        smtp = db.get(SmtpSettings, 1)
        rendered = notification_service.render(
            subject=tmpl.subject, body_html=tmpl.body_html, context=context
        )
        log = NotificationLog(
            template_code=template_code,
            registration_id=registration_id,
            user_id=user_id,
            to_address=user.email,
            subject=rendered["subject"],
            status="pending",
            attempts=(self.request.retries or 0) + 1,
        )
        db.add(log)
        db.flush()
        log_id = log.id
        try:
            if smtp is not None:
                smtp_view = _SmtpView(
                    host=smtp.host,
                    port=smtp.port,
                    tls_mode=smtp.tls_mode,
                    username=smtp.username,
                    password_decrypted=notification_service.decrypt_smtp_password(smtp),
                    from_address=smtp.from_address or "noreply@localhost",
                    from_name=smtp.from_name,
                )
                notification_service.send_smtp(
                    smtp_view, to=user.email,
                    subject=rendered["subject"], body_html=rendered["body_html"],
                )
            else:
                raise RuntimeError("SMTP non configurato")
            log.status = "sent"
            log.sent_at = datetime.now(UTC).replace(tzinfo=None)
            db.commit()
        except Exception as exc:
            log.status = "failed"
            log.error_text = f"{type(exc).__name__}: {exc}"[:5000]
            db.commit()
            raise
        return log_id
    finally:
        db.close()


class _SmtpView:
    __slots__ = ("host", "port", "tls_mode", "username", "password_decrypted",
                 "from_address", "from_name")

    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)
