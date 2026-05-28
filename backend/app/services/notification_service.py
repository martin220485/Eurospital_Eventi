import smtplib
from email.message import EmailMessage

from jinja2.sandbox import SandboxedEnvironment

from app.core.crypto import decrypt

_env = SandboxedEnvironment(autoescape=True)


def render(*, subject: str, body_html: str, context: dict) -> dict:
    """Render subject + body via Jinja2 sandbox with autoescape."""
    s = _env.from_string(subject).render(**context)
    b = _env.from_string(body_html).render(**context)
    return {"subject": s, "body_html": b}


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
