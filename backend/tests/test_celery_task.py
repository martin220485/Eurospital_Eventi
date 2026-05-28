from unittest.mock import patch

from app.services import user_service
from app.workers.tasks import send_notification


def _user(db, n=1):
    return user_service.create_user(db, email=f"u{n}@x.it", username=f"u{n}", password="pw12345")


@patch("app.workers.tasks.SessionLocal")
@patch("app.workers.tasks.notification_service.send_smtp")
def test_send_notification_writes_log_sent(mock_send, mock_session_local, db):
    mock_session_local.return_value = db
    user = _user(db)
    # ensure smtp_settings row 1 exists with required fields
    from app.models import SmtpSettings
    db.merge(SmtpSettings(
        id=1, host="smtp.x", port=587, tls_mode="starttls",
        from_address="noreply@x", from_name="X",
    ))
    db.flush()

    log_id = send_notification.run(
        template_code="registration_confirmed",
        user_id=user.id,
        registration_id=None,
        context={
            "user": {"full_name": user.email},
            "event": {"title": "E1", "start_at": "2030-01-01", "location": "x"},
            "registration": {"id": 0},
        },
    )

    from app.models import NotificationLog
    log = db.query(NotificationLog).filter_by(id=log_id).one()
    assert log.status == "sent"
    assert log.to_address == user.email
    assert log.subject.startswith("Conferma")
    assert log.attempts == 1
    mock_send.assert_called_once()


@patch("app.workers.tasks.SessionLocal")
@patch("app.workers.tasks.notification_service.send_smtp",
       side_effect=OSError("smtp down"))
def test_send_notification_logs_failure(mock_send, mock_session_local, db):
    mock_session_local.return_value = db
    user = _user(db, n=2)
    from app.models import SmtpSettings
    db.merge(SmtpSettings(
        id=1, host="smtp.x", port=587, tls_mode="starttls",
        from_address="noreply@x", from_name="X",
    ))
    db.flush()

    import pytest
    with pytest.raises(OSError):
        send_notification.run(
            template_code="registration_cancelled",
            user_id=user.id,
            registration_id=None,
            context={
                "user": {"full_name": user.email},
                "event": {"title": "E2", "start_at": "2030-01-01"},
            },
        )

    from app.models import NotificationLog
    log = db.query(NotificationLog).filter_by(user_id=user.id).one()
    assert log.status == "failed"
    assert "OSError" in (log.error_text or "")


@patch("app.workers.tasks.SessionLocal")
def test_send_notification_missing_template_raises(mock_session_local, db):
    mock_session_local.return_value = db
    user = _user(db, n=3)
    import pytest
    with pytest.raises(RuntimeError):
        send_notification.run(
            template_code="does_not_exist",
            user_id=user.id,
            registration_id=None,
            context={},
        )
