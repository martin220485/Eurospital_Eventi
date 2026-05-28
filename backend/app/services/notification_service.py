import smtplib
from email.message import EmailMessage

from jinja2.sandbox import SandboxedEnvironment
from sqlalchemy.orm import Session

from app.core.crypto import decrypt
from app.models import Event, Registration, User

_env = SandboxedEnvironment(autoescape=True)


def render(*, subject: str, body_html: str, context: dict) -> dict:
    """Render subject + body via Jinja2 sandbox with autoescape."""
    s = _env.from_string(subject).render(**context)
    b = _env.from_string(body_html).render(**context)
    return {"subject": s, "body_html": b}


def build_registration_context(db: Session, registration_id: int) -> dict:
    """Build the Jinja context for registration-related templates."""
    reg = db.get(Registration, registration_id)
    if reg is None:
        return {}
    event = db.get(Event, reg.event_id)
    user = db.get(User, reg.user_id)
    location = ""
    if event is not None:
        location = event.location_name or event.address or event.online_url or ""
    return {
        "user": {
            "full_name": (user.full_name if user is not None else "") or (user.username if user else ""),
            "email": user.email if user else "",
        },
        "event": {
            "title": event.title if event else "",
            "start_at": event.start_at.strftime("%d/%m/%Y %H:%M") if event and event.start_at else "",
            "location": location,
        },
        "registration": {
            "id": reg.id,
            "status": reg.status,
        },
    }


def enqueue_registration_notification(
    db: Session, template_code: str, registration_id: int
) -> None:
    """Enqueue send_notification.delay for a registration. Must be called AFTER db.commit().

    Broker connection failures are logged and swallowed: the calling request must not
    fail if Redis is unreachable.
    """
    import logging

    from app.workers.tasks import send_notification

    reg = db.get(Registration, registration_id)
    if reg is None:
        return
    context = build_registration_context(db, registration_id)
    try:
        send_notification.delay(
            template_code=template_code,
            user_id=reg.user_id,
            registration_id=reg.id,
            context=context,
        )
    except Exception as exc:  # broker down, serialization error, etc.
        logging.getLogger(__name__).warning(
            "enqueue notification failed: template=%s reg=%s err=%s",
            template_code, registration_id, exc,
        )


def decrypt_smtp_password(cfg) -> str | None:
    if not cfg or not getattr(cfg, "password_encrypted", None):
        return None
    return decrypt(cfg.password_encrypted)


def send_smtp(cfg, *, to: str, subject: str, body_html: str) -> None:
    """Send via SMTP. cfg must expose host/port/tls_mode/username/password_decrypted/from_address/from_name.

    tls_mode: 'starttls' (default), 'ssl', or 'none'.
    Raises smtplib.SMTPException / OSError on failure.
    """
    if not getattr(cfg, "host", None) or not getattr(cfg, "port", None):
        raise RuntimeError("SMTP non configurato")

    msg = EmailMessage()
    msg["Subject"] = subject
    from_addr = cfg.from_address
    if getattr(cfg, "from_name", None):
        msg["From"] = f"{cfg.from_name} <{from_addr}>"
    else:
        msg["From"] = from_addr
    msg["To"] = to
    msg.set_content("Email in formato HTML.")
    msg.add_alternative(body_html, subtype="html")

    tls_mode = (cfg.tls_mode or "starttls").lower()
    pwd = getattr(cfg, "password_decrypted", None)
    user = getattr(cfg, "username", None)

    if tls_mode == "ssl":
        smtp_ctx = smtplib.SMTP_SSL(cfg.host, cfg.port, timeout=30)
    else:
        smtp_ctx = smtplib.SMTP(cfg.host, cfg.port, timeout=30)

    with smtp_ctx as s:
        if tls_mode == "starttls":
            s.starttls()
        if user and pwd:
            s.login(user, pwd)
        s.send_message(msg)
