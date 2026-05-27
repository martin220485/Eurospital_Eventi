from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import Session

from app.core.crypto import decrypt, encrypt
from app.models import LdapSettings, PlatformSettings, SmtpSettings

_MASK = "****"


def setup_state(db: Session) -> tuple[bool, int]:
    """Return (setup_completed, current_step) safely on a not-yet-migrated DB.

    The wizard's migrate step is what creates `platform_settings`; `/status`
    and the setup gating run before that, so a missing table means setup has
    not started yet (open, step 0) rather than an error.
    """
    try:
        p = get_platform(db)
        return p.setup_completed, p.setup_step
    except (OperationalError, ProgrammingError):
        db.rollback()
        return False, 0


def get_platform(db: Session) -> PlatformSettings:
    obj = db.get(PlatformSettings, 1)
    if obj is None:
        obj = PlatformSettings(id=1, name="Eurospital Eventi", feature_flags={})
        db.add(obj)
        db.flush()
    return obj


def get_smtp(db: Session) -> SmtpSettings:
    obj = db.get(SmtpSettings, 1)
    if obj is None:
        obj = SmtpSettings(id=1)
        db.add(obj)
        db.flush()
    return obj


def get_ldap(db: Session) -> LdapSettings:
    obj = db.get(LdapSettings, 1)
    if obj is None:
        obj = LdapSettings(id=1, attr_mapping={})
        db.add(obj)
        db.flush()
    return obj


def save_platform(db: Session, **fields) -> PlatformSettings:
    obj = get_platform(db)
    for k, v in fields.items():
        setattr(obj, k, v)
    db.flush()
    return obj


def save_smtp(db: Session, *, password: str | None = None, **fields) -> SmtpSettings:
    obj = get_smtp(db)
    for k, v in fields.items():
        setattr(obj, k, v)
    if password:
        obj.password_encrypted = encrypt(password)
    db.flush()
    return obj


def save_ldap(db: Session, *, bind_pw: str | None = None, **fields) -> LdapSettings:
    obj = get_ldap(db)
    for k, v in fields.items():
        setattr(obj, k, v)
    if bind_pw:
        obj.bind_pw_encrypted = encrypt(bind_pw)
    db.flush()
    return obj


def smtp_masked(db: Session) -> dict:
    obj = get_smtp(db)
    return {
        "host": obj.host,
        "port": obj.port,
        "tls_mode": obj.tls_mode,
        "from_address": obj.from_address,
        "from_name": obj.from_name,
        "username": obj.username,
        "password": _MASK if obj.password_encrypted else None,
    }


def ldap_bind_password(db: Session) -> str | None:
    obj = get_ldap(db)
    return decrypt(obj.bind_pw_encrypted) if obj.bind_pw_encrypted else None


def smtp_password(db: Session) -> str | None:
    obj = get_smtp(db)
    return decrypt(obj.password_encrypted) if obj.password_encrypted else None
