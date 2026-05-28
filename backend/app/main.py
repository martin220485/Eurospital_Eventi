import logging

from fastapi import FastAPI

from app.api.routers import attachments, auth, categories, events, registrations, setup
from app.core.config import get_settings

logger = logging.getLogger("app.setup")

app = FastAPI(title="Eurospital Eventi API")
app.include_router(auth.router)
app.include_router(setup.router)
app.include_router(categories.router)
app.include_router(events.router)
app.include_router(attachments.router)
app.include_router(registrations.router)


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
