import logging

from fastapi import FastAPI, Request

from app.api.routers import (
    attachments, auth, catalog, categories, checkin, events, ldap, me, notifications,
    registrations, reports, setup, users,
)
from app.core.config import get_settings
from app.core.security_headers import RateLimitMiddleware, SecurityHeadersMiddleware

logger = logging.getLogger("app.setup")


def _build_redis():
    try:
        import redis
        return redis.Redis.from_url(get_settings().redis_url, socket_timeout=2)
    except Exception:
        return None


def _login_identifier(req: Request) -> str:
    return "auth"  # request body parsed by router; key by IP only (avoids reading body twice)


app = FastAPI(title="Eurospital Eventi API")
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    RateLimitMiddleware,
    redis_client=_build_redis(),
    max_count=get_settings().rate_limit_auth_max,
    window_seconds=get_settings().rate_limit_auth_window,
    paths=[
        ("/api/auth/login", _login_identifier),
        ("/api/auth/refresh", _login_identifier),
    ],
)
app.include_router(auth.router)
app.include_router(setup.router)
app.include_router(categories.router)
app.include_router(events.router)
app.include_router(attachments.router)
app.include_router(registrations.router)
app.include_router(checkin.router)
app.include_router(catalog.router)
app.include_router(notifications.router)
app.include_router(reports.router)
app.include_router(ldap.router)
app.include_router(me.router)
app.include_router(users.router)


@app.on_event("startup")
def _log_setup_token() -> None:
    # Surface the bootstrap token once on boot so the operator can open /setup.
    # Skipped when setup is already complete to avoid leaking it in steady state.
    from app.db.session import SessionLocal
    from app.services import settings_service

    db = SessionLocal()
    try:
        completed, _ = settings_service.setup_state(db)
        if not completed:
            logger.warning("SETUP TOKEN: %s", get_settings().setup_token)
    finally:
        db.close()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/health/detailed")
def health_detailed() -> dict:
    """Verbose health: DB connect + Redis ping. Used by ops/monitoring."""
    out: dict = {"status": "ok", "checks": {}}
    try:
        from sqlalchemy import text
        from app.db.session import SessionLocal
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            out["checks"]["db"] = "ok"
        finally:
            db.close()
    except Exception as exc:
        out["status"] = "degraded"
        out["checks"]["db"] = f"error: {exc.__class__.__name__}"
    try:
        r = _build_redis()
        if r is not None:
            r.ping()
            out["checks"]["redis"] = "ok"
        else:
            out["checks"]["redis"] = "not-configured"
    except Exception as exc:
        out["status"] = "degraded"
        out["checks"]["redis"] = f"error: {exc.__class__.__name__}"
    return out
