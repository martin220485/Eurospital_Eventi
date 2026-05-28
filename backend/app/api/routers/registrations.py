from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models import RegistrationCustomAnswer, User
from app.schemas.registration import (
    AnswerOut, RegisterIn, RegistrationDetail, RegistrationListItem,
    RegistrationListResult, RegistrationOut,
)
from app.services import registration_service
from app.services.rbac import user_has_permission

router = APIRouter(tags=["registrations"])


def _require(db: Session, user: User, code: str) -> None:
    if not user_has_permission(db, user, code):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permesso negato")


def _owns_or_perm(db: Session, user: User, reg, code: str) -> None:
    if reg.user_id != user.id:
        _require(db, user, code)


@router.post("/api/events/{event_id}/registrations", response_model=RegistrationOut,
             status_code=status.HTTP_201_CREATED)
def register(event_id: int, payload: RegisterIn, db: Session = Depends(get_db),
             user: User = Depends(get_current_user)) -> RegistrationOut:
    target_user_id = payload.user_id or user.id
    registered_by = None
    if target_user_id != user.id:
        _require(db, user, "registrations.write")
        registered_by = user.id
    try:
        reg = registration_service.register(
            db, event_id=event_id, user_id=target_user_id,
            registered_by=registered_by, answers=payload.answers,
        )
    except registration_service.RegistrationError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    db.commit()
    return RegistrationOut.model_validate(reg)


@router.get("/api/events/{event_id}/registrations", response_model=RegistrationListResult)
def list_event_registrations(event_id: int, status: str | None = None, q: str | None = None,
                             page: int = 1, page_size: int = 50,
                             db: Session = Depends(get_db),
                             user: User = Depends(get_current_user)) -> RegistrationListResult:
    _require(db, user, "registrations.read")
    regs, total = registration_service.list_for_event(
        db, event_id, status=status, q=q, page=page, page_size=page_size
    )
    user_ids = {r.user_id for r in regs}
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids))} if user_ids else {}
    items = [
        RegistrationListItem(
            id=r.id, user_id=r.user_id,
            username=users[r.user_id].username if r.user_id in users else "",
            email=users[r.user_id].email if r.user_id in users else "",
            status=r.status, waitlist_position=r.waitlist_position,
            checked_in=(r.status == "attended"),
        )
        for r in regs
    ]
    return RegistrationListResult(items=items, total=total, page=page, page_size=page_size)


@router.get("/api/registrations/{registration_id}", response_model=RegistrationDetail)
def get_registration(registration_id: int, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)) -> RegistrationDetail:
    try:
        reg = registration_service.get(db, registration_id)
    except registration_service.RegistrationError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Iscrizione non trovata")
    _owns_or_perm(db, user, reg, "registrations.read")
    answers = db.query(RegistrationCustomAnswer).filter(
        RegistrationCustomAnswer.registration_id == reg.id
    ).all()
    out = RegistrationDetail.model_validate(reg)
    out.answers = [AnswerOut(field_id=a.field_id, value=a.value) for a in answers]
    return out


@router.post("/api/registrations/{registration_id}/cancel", response_model=RegistrationOut)
def cancel_registration(registration_id: int, db: Session = Depends(get_db),
                        user: User = Depends(get_current_user)) -> RegistrationOut:
    try:
        reg = registration_service.get(db, registration_id)
    except registration_service.RegistrationError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Iscrizione non trovata")
    _owns_or_perm(db, user, reg, "registrations.write")
    try:
        reg = registration_service.cancel(db, registration_id, actor_id=user.id)
    except registration_service.RegistrationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    db.commit()
    return RegistrationOut.model_validate(reg)


@router.post("/api/registrations/{registration_id}/promote", response_model=RegistrationOut)
def promote_registration(registration_id: int, db: Session = Depends(get_db),
                         user: User = Depends(get_current_user)) -> RegistrationOut:
    _require(db, user, "registrations.write")
    try:
        reg = registration_service.promote(db, registration_id)
    except registration_service.RegistrationError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    db.commit()
    return RegistrationOut.model_validate(reg)


@router.post("/api/registrations/{registration_id}/no-show", response_model=RegistrationOut)
def no_show_registration(registration_id: int, db: Session = Depends(get_db),
                         user: User = Depends(get_current_user)) -> RegistrationOut:
    _require(db, user, "registrations.write")
    try:
        reg = registration_service.mark_no_show(db, registration_id)
    except registration_service.RegistrationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    db.commit()
    return RegistrationOut.model_validate(reg)


@router.get("/api/me/registrations", response_model=list[RegistrationOut])
def my_registrations(db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)) -> list[RegistrationOut]:
    return [RegistrationOut.model_validate(r) for r in registration_service.list_for_user(db, user.id)]
