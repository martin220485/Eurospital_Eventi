from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models import Event, User
from app.schemas.checkin import CheckinIn, CheckinResult
from app.services import checkin_service
from app.services.rbac import user_has_permission

router = APIRouter(tags=["checkin"])


@router.post("/api/checkin", response_model=CheckinResult)
def checkin(payload: CheckinIn, db: Session = Depends(get_db),
            user: User = Depends(get_current_user)) -> CheckinResult:
    if not user_has_permission(db, user, "checkin.write"):
        raise HTTPException(status_code=403, detail="Permesso negato")
    try:
        reg = checkin_service.check_in(db, token=payload.token, operator_id=user.id)
    except checkin_service.CheckinError as exc:
        raise HTTPException(status_code=exc.code, detail=str(exc))
    db.commit()
    target = db.get(User, reg.user_id)
    ev = db.get(Event, reg.event_id)
    return CheckinResult(
        registration_id=reg.id, user_id=reg.user_id,
        username=target.username if target else "",
        event_title=ev.title if ev else "", status=reg.status,
    )
