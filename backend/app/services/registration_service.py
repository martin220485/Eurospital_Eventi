from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Event, EventCustomField, Registration, RegistrationCustomAnswer,
)

_ACTIVE = ("pending", "confirmed", "waitlisted", "attended")
_OCCUPYING = ("confirmed", "attended")


class RegistrationError(Exception):
    pass


def _event_locked(db: Session, event_id: int) -> Event:
    ev = db.scalar(select(Event).where(Event.id == event_id).with_for_update())
    if ev is None:
        raise RegistrationError("event not found")
    return ev


def _occupied(db: Session, event_id: int) -> int:
    return db.scalar(
        select(func.count()).select_from(Registration)
        .where(Registration.event_id == event_id, Registration.status.in_(_OCCUPYING))
    ) or 0


def _active_for_user(db: Session, event_id: int, user_id: int) -> int:
    return db.scalar(
        select(func.count()).select_from(Registration)
        .where(Registration.event_id == event_id, Registration.user_id == user_id,
               Registration.status.in_(_ACTIVE))
    ) or 0


def _max_waitlist_pos(db: Session, event_id: int) -> int:
    return db.scalar(
        select(func.coalesce(func.max(Registration.waitlist_position), 0))
        .where(Registration.event_id == event_id, Registration.status == "waitlisted")
    ) or 0


def _validate_answers(db: Session, event_id: int, answers: list) -> None:
    fields = db.scalars(
        select(EventCustomField).where(EventCustomField.event_id == event_id)
    ).all()
    provided = {a.field_id: (a.value or "").strip() for a in answers}
    for f in fields:
        if f.required and not provided.get(f.id):
            raise RegistrationError(f"missing required answer: {f.label}")


def register(db: Session, *, event_id: int, user_id: int, registered_by: int | None, answers: list) -> Registration:
    ev = _event_locked(db, event_id)
    if ev.status != "published":
        raise RegistrationError("event not open for registration")
    now = datetime.utcnow()
    if ev.registration_open_at and now < ev.registration_open_at:
        raise RegistrationError("registration not yet open")
    if ev.registration_close_at and now > ev.registration_close_at:
        raise RegistrationError("registration closed")
    if _active_for_user(db, event_id, user_id) >= (ev.max_per_user or 1):
        raise RegistrationError("registration limit reached for user")
    _validate_answers(db, event_id, answers)

    has_space = ev.capacity is None or _occupied(db, event_id) < ev.capacity
    if has_space:
        status, pos = "confirmed", None
    elif ev.waitlist_enabled:
        status, pos = "waitlisted", _max_waitlist_pos(db, event_id) + 1
    else:
        raise RegistrationError("event full")

    reg = Registration(
        event_id=event_id, user_id=user_id, status=status, waitlist_position=pos,
        registered_by=registered_by,
    )
    db.add(reg)
    db.flush()
    for a in answers:
        db.add(RegistrationCustomAnswer(registration_id=reg.id, field_id=a.field_id, value=a.value))
    db.flush()
    return reg
