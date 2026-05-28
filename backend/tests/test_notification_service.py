from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.services import notification_service


def test_render_template_with_context():
    out = notification_service.render(
        subject="Conferma {{ event.title }}",
        body_html="<p>Ciao {{ user.full_name }}, evento {{ event.title }}.</p>",
        context={
            "user": {"full_name": "Mario Rossi"},
            "event": {"title": "Workshop X"},
        },
    )
    assert out["subject"] == "Conferma Workshop X"
    assert "Mario Rossi" in out["body_html"]
    assert "Workshop X" in out["body_html"]


def test_render_escapes_html_in_context():
    out = notification_service.render(
        subject="x",
        body_html="<p>{{ user.full_name }}</p>",
        context={"user": {"full_name": "<script>x</script>"}},
    )
    assert "<script>" not in out["body_html"]
    assert "&lt;script&gt;" in out["body_html"]


def test_render_missing_var_is_empty():
    out = notification_service.render(
        subject="x {{ missing }}",
        body_html="<p>{{ also_missing }}</p>",
        context={},
    )
    assert out["subject"] == "x "
    assert "<p></p>" in out["body_html"]


def test_render_blocks_dangerous_attribute_access():
    with pytest.raises(Exception):
        notification_service.render(
            subject="{{ ''.__class__.__mro__ }}",
            body_html="x",
            context={},
        )


@patch("app.services.notification_service.smtplib.SMTP")
def test_send_smtp_starttls_success(mock_smtp):
    cfg = SimpleNamespace(
        host="smtp.x", port=587, tls_mode="starttls",
        username="u", password_decrypted="p",
        from_address="from@x", from_name="X",
    )
    instance = MagicMock()
    mock_smtp.return_value.__enter__.return_value = instance
    notification_service.send_smtp(
        cfg, to="a@x", subject="s", body_html="<p>b</p>"
    )
    mock_smtp.assert_called_once_with("smtp.x", 587, timeout=30)
    instance.starttls.assert_called_once()
    instance.login.assert_called_once_with("u", "p")
    instance.send_message.assert_called_once()


@patch("app.services.notification_service.smtplib.SMTP_SSL")
def test_send_smtp_ssl_success(mock_smtp_ssl):
    cfg = SimpleNamespace(
        host="smtp.x", port=465, tls_mode="ssl",
        username="u", password_decrypted="p",
        from_address="from@x", from_name="X",
    )
    instance = MagicMock()
    mock_smtp_ssl.return_value.__enter__.return_value = instance
    notification_service.send_smtp(
        cfg, to="a@x", subject="s", body_html="<p>b</p>"
    )
    mock_smtp_ssl.assert_called_once_with("smtp.x", 465, timeout=30)
    instance.starttls.assert_not_called()
    instance.login.assert_called_once_with("u", "p")


@patch("app.services.notification_service.smtplib.SMTP")
def test_send_smtp_none_no_login(mock_smtp):
    cfg = SimpleNamespace(
        host="smtp.x", port=25, tls_mode="none",
        username=None, password_decrypted=None,
        from_address="from@x", from_name=None,
    )
    instance = MagicMock()
    mock_smtp.return_value.__enter__.return_value = instance
    notification_service.send_smtp(
        cfg, to="a@x", subject="s", body_html="<p>b</p>"
    )
    instance.starttls.assert_not_called()
    instance.login.assert_not_called()
    instance.send_message.assert_called_once()


def test_decrypt_smtp_password():
    from app.core.crypto import encrypt
    from app.models import SmtpSettings

    cfg = SmtpSettings(
        id=1, host="h", port=587, tls_mode="starttls",
        from_address="f@x", from_name="X",
        username="u", password_encrypted=encrypt("secret123"),
    )
    assert notification_service.decrypt_smtp_password(cfg) == "secret123"


def test_decrypt_smtp_password_none():
    from app.models import SmtpSettings

    cfg = SmtpSettings(id=1, tls_mode="starttls", password_encrypted=None)
    assert notification_service.decrypt_smtp_password(cfg) is None
