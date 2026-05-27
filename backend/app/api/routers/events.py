from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_permission
from app.models import User
from app.schemas.event import (
    EventCreate, EventListItem, EventListResult, EventOut, EventTransition, EventUpdate,
)
from app.services import event_service, rbac

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=EventListResult, dependencies=[Depends(require_permission("events.read"))])
def list_events(
    db: Session = Depends(get_db),
    status: str | None = None,
    category_id: int | None = None,
    q: str | None = None,
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    page: int = 1,
    page_size: int = 20,
) -> EventListResult:
    items, total = event_service.list_events(
        db, status=status, category_id=category_id, q=q,
        date_from=date_from, date_to=date_to, page=page, page_size=page_size,
    )
    return EventListResult(
        items=[EventListItem.model_validate(e) for e in items],
        total=total, page=page, page_size=page_size,
    )


@router.get("/{event_id}", response_model=EventOut, dependencies=[Depends(require_permission("events.read"))])
def get_event(event_id: int, db: Session = Depends(get_db)) -> EventOut:
    try:
        return EventOut.model_validate(event_service.get(db, event_id))
    except event_service.EventError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento non trovato")


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_permission("events.write"))])
def create_event(payload: EventCreate, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)) -> EventOut:
    ev = event_service.create(db, created_by=user.id, **payload.model_dump())
    db.commit()
    return EventOut.model_validate(ev)


@router.patch("/{event_id}", response_model=EventOut,
              dependencies=[Depends(require_permission("events.write"))])
def update_event(event_id: int, payload: EventUpdate, db: Session = Depends(get_db)) -> EventOut:
    try:
        ev = event_service.update(db, event_id, payload.model_dump(exclude_unset=True))
    except event_service.EventError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento non trovato")
    db.commit()
    return EventOut.model_validate(ev)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_permission("events.delete"))])
def delete_event(event_id: int, db: Session = Depends(get_db)) -> None:
    try:
        event_service.delete(db, event_id)
    except event_service.EventError as exc:
        code = status.HTTP_404_NOT_FOUND if str(exc) == "not found" else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail=str(exc))
    db.commit()


@router.post("/{event_id}/transition", response_model=EventOut,
             dependencies=[Depends(require_permission("events.write"))])
def transition_event(event_id: int, payload: EventTransition, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)) -> EventOut:
    can_publish = rbac.user_has_permission(db, user, "events.publish")
    try:
        ev = event_service.transition(db, event_id, payload.target, can_publish=can_publish)
    except event_service.EventError as exc:
        code = status.HTTP_404_NOT_FOUND if str(exc) == "not found" else status.HTTP_422_UNPROCESSABLE_ENTITY
        raise HTTPException(status_code=code, detail=str(exc))
    db.commit()
    return EventOut.model_validate(ev)


@router.post("/{event_id}/duplicate", response_model=EventOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_permission("events.write"))])
def duplicate_event(event_id: int, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)) -> EventOut:
    try:
        ev = event_service.duplicate(db, event_id, created_by=user.id)
    except event_service.EventError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento non trovato")
    db.commit()
    return EventOut.model_validate(ev)
