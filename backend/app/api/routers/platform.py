"""Platform settings & system status (F13)."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_permission
from app.models import PlatformSettings, User
from app.services import audit_service, settings_service, setup_service

router = APIRouter(prefix="/api/admin/platform", tags=["platform"])

_PERM = "users.admin"


class PlatformSettingsIn(BaseModel):
    name: str | None = None
    logo_url: str | None = None
    primary_color: str | None = None
    language: str | None = None
    timezone: str | None = None
    public_url: str | None = None
    retention_days: int | None = None
    feature_flags: dict | None = None


class PlatformSettingsOut(BaseModel):
    name: str
    logo_url: str | None
    primary_color: str
    language: str
    timezone: str
    public_url: str | None
    retention_days: int | None
    feature_flags: dict
    setup_completed: bool


def _to_out(s: PlatformSettings) -> PlatformSettingsOut:
    return PlatformSettingsOut(
        name=s.name, logo_url=s.logo_url, primary_color=s.primary_color,
        language=s.language, timezone=s.timezone, public_url=s.public_url,
        retention_days=s.retention_days, feature_flags=s.feature_flags or {},
        setup_completed=s.setup_completed,
    )


@router.get(
    "/settings",
    response_model=PlatformSettingsOut,
    dependencies=[Depends(require_permission(_PERM))],
)
def get_platform_settings(db: Session = Depends(get_db)) -> PlatformSettingsOut:
    s = settings_service.get_platform(db)
    return _to_out(s)


@router.put(
    "/settings",
    response_model=PlatformSettingsOut,
    dependencies=[Depends(require_permission(_PERM))],
)
def update_platform_settings(
    payload: PlatformSettingsIn, request: Request,
    db: Session = Depends(get_db), actor: User = Depends(get_current_user),
) -> PlatformSettingsOut:
    s = settings_service.get_platform(db)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(s, k, v)
    db.flush()
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else ""
    )
    audit_service.log(db, action="platform.settings.update", actor_id=actor.id,
                      target_type="platform", target_id=1, ip=ip, payload=data)
    db.commit()
    db.refresh(s)
    return _to_out(s)


@router.get(
    "/status",
    dependencies=[Depends(require_permission(_PERM))],
)
def system_status(db: Session = Depends(get_db)) -> dict:
    """Stato dei servizi: DB, Redis, configurazione SMTP/LDAP, ultimi errori notifiche."""
    checks: dict[str, str] = {}
    try:
        db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as exc:
        checks["db"] = f"error: {exc.__class__.__name__}"

    try:
        from app.core.config import get_settings
        import redis
        r = redis.Redis.from_url(get_settings().redis_url, socket_timeout=2)
        r.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc.__class__.__name__}"

    smtp_cfg = settings_service.get_smtp(db)
    checks["smtp"] = "configured" if (smtp_cfg and smtp_cfg.host) else "not-configured"

    ldap_cfg = settings_service.get_ldap(db)
    checks["ldap"] = "configured" if (ldap_cfg and ldap_cfg.server_uri) else "not-configured"

    # last notification errors
    from app.models import NotificationLog
    failures = db.query(NotificationLog).filter_by(status="failed").order_by(
        NotificationLog.created_at.desc()
    ).limit(5).all()
    last_errors = [
        {
            "id": n.id, "template_code": n.template_code,
            "to_address": n.to_address, "error_text": n.error_text,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in failures
    ]

    from app.core.config import get_settings
    return {
        "status": "ok" if all(v in ("ok", "configured", "not-configured") for v in checks.values()) else "degraded",
        "version": "1.0.0-rc1",
        "checks": checks,
        "recent_failed_notifications": last_errors,
        "audit_retention_days": get_settings().audit_log_retention_days,
    }


# ----- SMTP admin -----

class SmtpSettingsIn(BaseModel):
    host: str | None = None
    port: int | None = None
    tls_mode: str = "starttls"
    from_address: str | None = None
    from_name: str | None = None
    username: str | None = None
    password: str | None = None


class SmtpSettingsOut(BaseModel):
    host: str | None
    port: int | None
    tls_mode: str
    from_address: str | None
    from_name: str | None
    username: str | None
    has_password: bool


@router.get(
    "/smtp",
    response_model=SmtpSettingsOut,
    dependencies=[Depends(require_permission(_PERM))],
)
def get_smtp(db: Session = Depends(get_db)) -> SmtpSettingsOut:
    cfg = settings_service.get_smtp(db)
    return SmtpSettingsOut(
        host=cfg.host, port=cfg.port, tls_mode=cfg.tls_mode or "starttls",
        from_address=cfg.from_address, from_name=cfg.from_name,
        username=cfg.username, has_password=bool(cfg.password_encrypted),
    )


@router.put(
    "/smtp",
    response_model=SmtpSettingsOut,
    dependencies=[Depends(require_permission(_PERM))],
)
def save_smtp(payload: SmtpSettingsIn, request: Request, db: Session = Depends(get_db),
              actor: User = Depends(get_current_user)) -> SmtpSettingsOut:
    settings_service.save_smtp(
        db, host=payload.host, port=payload.port, tls_mode=payload.tls_mode,
        from_address=payload.from_address, from_name=payload.from_name,
        username=payload.username, password=payload.password,
    )
    audit_service.log(db, action="smtp.settings.update", actor_id=actor.id,
                      target_type="smtp", target_id=1,
                      payload={k: v for k, v in payload.model_dump().items() if k != "password"})
    db.commit()
    return get_smtp(db=db)


class SmtpTestIn(BaseModel):
    host: str
    port: int
    tls_mode: str = "starttls"
    username: str | None = None
    password: str | None = None
    from_address: str


# ----- Database management -----

@router.get(
    "/db",
    dependencies=[Depends(require_permission(_PERM))],
)
def db_status(db: Session = Depends(get_db)) -> dict:
    """Stato schema: revisione Alembic, head, tabelle, viste."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from sqlalchemy import create_engine, inspect

    from app.core.config import get_settings

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", get_settings().sqlalchemy_url.replace("%", "%%"))
    script = ScriptDirectory.from_config(cfg)
    head = script.get_current_head()
    current = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
    eng = create_engine(get_settings().sqlalchemy_url)
    try:
        insp = inspect(eng)
        tables = sorted(insp.get_table_names())
        views = sorted(insp.get_view_names())
    finally:
        eng.dispose()
    return {
        "current_revision": current,
        "head_revision": head,
        "up_to_date": current == head,
        "tables": tables,
        "views": views,
    }


@router.post(
    "/db/migrate",
    dependencies=[Depends(require_permission(_PERM))],
)
def db_migrate(request: Request, db: Session = Depends(get_db),
               actor: User = Depends(get_current_user)) -> dict:
    """Applica le migrazioni Alembic fino a head."""
    res = setup_service.run_migrations()
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else ""
    )
    audit_service.log(db, action="db.migrate", actor_id=actor.id,
                      target_type="db", target_id=1, ip=ip, payload=res)
    db.commit()
    return res


@router.post(
    "/db/rebuild-objects",
    dependencies=[Depends(require_permission(_PERM))],
)
def db_rebuild_objects(request: Request, db: Session = Depends(get_db),
                       actor: User = Depends(get_current_user)) -> dict:
    """Ricrea oggetti DB derivati (viste, indici idempotenti) eseguendo migrazioni a head."""
    res = setup_service.run_migrations()
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else ""
    )
    audit_service.log(db, action="db.rebuild", actor_id=actor.id,
                      target_type="db", target_id=1, ip=ip, payload=res)
    db.commit()
    return res


# ----- DB target switch (cambia puntamento) -----

class DbTargetIn(BaseModel):
    host: str
    port: int = 3306
    db: str
    user: str
    password: str | None = None  # vuoto = mantieni quella in override esistente


def _build_url(host: str, port: int, db: str, user: str, password: str) -> str:
    from urllib.parse import quote_plus
    return f"mysql+pymysql://{quote_plus(user)}:{quote_plus(password)}@{host}:{port}/{db}"


def _current_password_from_override(db: Session, fallback_password: str | None) -> str:
    """Se password non passata, prova a decifrare quella salvata; altrimenti usa quella di env."""
    from app.core.crypto import decrypt
    if fallback_password:
        return fallback_password
    cfg = settings_service.get_platform(db)
    if cfg.db_override_encrypted:
        try:
            url = decrypt(cfg.db_override_encrypted)
            # estrai password dall'URL
            from urllib.parse import urlparse, unquote
            p = urlparse(url)
            if p.password:
                return unquote(p.password)
        except Exception:
            pass
    from app.core.config import get_settings as _gs
    return _gs().mysql_password


@router.post(
    "/db/test-target",
    dependencies=[Depends(require_permission(_PERM))],
)
def db_test_target(payload: DbTargetIn, db: Session = Depends(get_db)) -> dict:
    """Prova la connessione al target senza salvare nulla."""
    from sqlalchemy import create_engine, text as _text
    pw = _current_password_from_override(db, payload.password)
    url = _build_url(payload.host, payload.port, payload.db, payload.user, pw)
    try:
        eng = create_engine(url, pool_pre_ping=True)
        with eng.connect() as c:
            c.execute(_text("SELECT 1"))
        eng.dispose()
        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@router.post(
    "/db/prepare-target",
    dependencies=[Depends(require_permission(_PERM))],
)
def db_prepare_target(payload: DbTargetIn, db: Session = Depends(get_db),
                      actor: User = Depends(get_current_user)) -> dict:
    """Applica le migrazioni Alembic al target indicato (senza switchare)."""
    from alembic.config import Config
    from alembic import command

    pw = _current_password_from_override(db, payload.password)
    url = _build_url(payload.host, payload.port, payload.db, payload.user, pw)
    try:
        cfg = Config("alembic.ini")
        # Escape '%' per ConfigParser interpolation (URL-encoding password con %).
        cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
        command.upgrade(cfg, "head")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    audit_service.log(db, action="db.prepare_target", actor_id=actor.id,
                      target_type="db", target_id=1,
                      payload={"host": payload.host, "port": payload.port, "db": payload.db})
    db.commit()
    return {"ok": True, "message": "Migrazioni applicate sul target"}


@router.post(
    "/db/switch",
    dependencies=[Depends(require_permission(_PERM))],
)
def db_switch(payload: DbTargetIn, request: Request, db: Session = Depends(get_db),
              actor: User = Depends(get_current_user)) -> dict:
    """Salva i nuovi parametri come override cifrato e ricarica l'engine globale.

    Le richieste in volo terminano col vecchio engine; quelle nuove usano il
    nuovo target. Worker/beat NON rileggono runtime — serve restart container.
    """
    from app.core.crypto import encrypt
    from app.db import session as db_session

    pw = _current_password_from_override(db, payload.password)
    url = _build_url(payload.host, payload.port, payload.db, payload.user, pw)
    # ping sul target prima di committarsi
    from sqlalchemy import create_engine, text as _text
    try:
        eng = create_engine(url, pool_pre_ping=True)
        with eng.connect() as c:
            c.execute(_text("SELECT 1"))
        eng.dispose()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Target non raggiungibile: {exc}")

    # Persist override + audit (SU DB CORRENTE, prima del swap)
    cfg = settings_service.get_platform(db)
    cfg.db_override_encrypted = encrypt(url)
    db.flush()
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else ""
    )
    audit_service.log(db, action="db.switch", actor_id=actor.id,
                      target_type="db", target_id=1, ip=ip,
                      payload={"host": payload.host, "port": payload.port, "db": payload.db})
    db.commit()

    # Swap engine globale (sessioni in volo finiscono col vecchio)
    try:
        db_session.swap_engine(url)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail=f"Swap engine fallito (target salvato): {exc}")
    return {
        "ok": True,
        "warning": "Worker/beat usano ancora la vecchia connessione fino al restart container.",
    }


@router.post(
    "/db/reset-override",
    dependencies=[Depends(require_permission(_PERM))],
)
def db_reset_override(request: Request, db: Session = Depends(get_db),
                      actor: User = Depends(get_current_user)) -> dict:
    """Rimuove l'override e torna ai parametri di .env (richiede restart)."""
    cfg = settings_service.get_platform(db)
    cfg.db_override_encrypted = None
    db.flush()
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else ""
    )
    audit_service.log(db, action="db.reset_override", actor_id=actor.id,
                      target_type="db", target_id=1, ip=ip)
    db.commit()
    # rifa swap su URL di env
    from app.core.config import get_settings as _gs
    from app.db import session as db_session
    try:
        db_session.swap_engine(_gs().sqlalchemy_url)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail=f"Reset engine fallito: {exc}")
    return {"ok": True}


@router.get(
    "/db/target",
    dependencies=[Depends(require_permission(_PERM))],
)
def db_get_target(db: Session = Depends(get_db)) -> dict:
    """Mostra parametri attivi (host/port/db/user, password mascherata)."""
    from urllib.parse import urlparse, unquote
    from app.core.crypto import decrypt
    cfg = settings_service.get_platform(db)
    url = None
    source = "env"
    if cfg.db_override_encrypted:
        try:
            url = decrypt(cfg.db_override_encrypted)
            source = "override"
        except Exception:
            url = None
    if url is None:
        from app.core.config import get_settings as _gs
        url = _gs().sqlalchemy_url
    p = urlparse(url)
    return {
        "source": source,
        "host": p.hostname,
        "port": p.port or 3306,
        "db": (p.path or "").lstrip("/"),
        "user": unquote(p.username) if p.username else None,
        "has_password": bool(p.password),
    }


@router.post(
    "/smtp/test",
    dependencies=[Depends(require_permission(_PERM))],
)
def test_smtp(payload: SmtpTestIn, db: Session = Depends(get_db)) -> dict:
    # se password vuota e c'è già impostata, usa quella decriptata
    pw = payload.password
    if not pw:
        cfg = settings_service.get_smtp(db)
        if cfg.password_encrypted:
            from app.services import notification_service
            pw = notification_service.decrypt_smtp_password(cfg)
    res = setup_service.test_smtp(
        host=payload.host, port=payload.port, tls_mode=payload.tls_mode,
        username=payload.username, password=pw or "",
        from_address=payload.from_address,
    )
    return res
