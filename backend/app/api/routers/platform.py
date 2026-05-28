"""Platform settings & system status (F13)."""
from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_permission
from app.models import PlatformSettings, User
from app.services import audit_service, settings_service

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
