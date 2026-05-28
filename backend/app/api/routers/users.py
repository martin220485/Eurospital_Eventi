from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_permission
from app.models import User
from app.services import audit_service, gdpr_service

router = APIRouter(prefix="/api/admin", tags=["users-admin"])

_PERM = "users.admin"


def _ip(request: Request) -> str:
    return request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else ""
    )


@router.post(
    "/users/{user_id}/anonymize",
    dependencies=[Depends(require_permission(_PERM))],
)
def anonymize_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> dict:
    try:
        anon = gdpr_service.anonymize_user(db, user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="utente non trovato")
    audit_service.log(
        db, action="user.anonymize", actor_id=actor.id,
        target_type="user", target_id=user_id, ip=_ip(request),
        payload={"new_email": anon.email},
    )
    db.commit()
    return {
        "ok": True, "user_id": anon.id,
        "anonymized_at": datetime.utcnow().isoformat(),
    }


@router.get(
    "/audit-logs",
    dependencies=[Depends(require_permission(_PERM))],
)
def list_audit_logs(
    actor_id: int | None = None,
    action: str | None = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
) -> dict:
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    rows, total = audit_service.list_logs(
        db, actor_id=actor_id, action=action, limit=limit, offset=offset
    )
    items = [
        {
            "id": r.id, "actor_id": r.actor_id, "action": r.action,
            "target_type": r.target_type, "target_id": r.target_id,
            "ip": r.ip, "user_agent": r.user_agent, "payload": r.payload,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return {"items": items, "total": total}
