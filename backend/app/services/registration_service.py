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


def get(db: Session, registration_id: int) -> Registration:
    reg = db.get(Registration, registration_id)
    if reg is None:
        raise RegistrationError("not found")
    return reg


def _recompact(db: Session, event_id: int) -> None:
    rows = db.scalars(
        select(Registration)
        .where(Registration.event_id == event_id, Registration.status == "waitlisted")
        .order_by(Registration.waitlist_position)
    ).all()
    for i, r in enumerate(rows, start=1):
        r.waitlist_position = i
    db.flush()


def _promote_next(db: Session, event_id: int) -> None:
    ev = _event_locked(db, event_id)
    if ev.capacity is not None and _occupied(db, event_id) >= ev.capacity:
        return
    nxt = db.scalar(
        select(Registration)
        .where(Registration.event_id == event_id, Registration.status == "waitlisted")
        .order_by(Registration.waitlist_position).limit(1)
    )
    if nxt is None:
        return
    nxt.status = "confirmed"
    nxt.waitlist_position = None
    db.flush()
    _recompact(db, event_id)


def cancel(db: Session, registration_id: int, *, actor_id: int | None) -> Registration:
    reg = get(db, registration_id)
    if reg.status not in ("confirmed", "waitlisted", "pending"):
        raise RegistrationError("registration cannot be cancelled in its current state")
    ev = _event_locked(db, reg.event_id)
    if reg.status == "confirmed":
        if not ev.cancellation_allowed:
            raise RegistrationError("cancellation not allowed for this event")
        if ev.cancellation_deadline_at and datetime.utcnow() > ev.cancellation_deadline_at:
            raise RegistrationError("cancellation deadline passed")
    was_confirmed = reg.status == "confirmed"
    reg.status = "cancelled"
    reg.cancelled_at = datetime.utcnow()
    reg.waitlist_position = None
    db.flush()
    _recompact(db, reg.event_id)
    if was_confirmed:
        _promote_next(db, reg.event_id)
    return reg


def promote(db: Session, registration_id: int) -> Registration:
    reg = get(db, registration_id)
    if reg.status != "waitlisted":
        raise RegistrationError("only waitlisted registrations can be promoted")
    ev = _event_locked(db, reg.event_id)
    if ev.capacity is not None and _occupied(db, reg.event_id) >= ev.capacity:
        raise RegistrationError("no available capacity")
    reg.status = "confirmed"
    reg.waitlist_position = None
    db.flush()
    _recompact(db, reg.event_id)
    return reg


def mark_no_show(db: Session, registration_id: int) -> Registration:
    reg = get(db, registration_id)
    if reg.status != "confirmed":
        raise RegistrationError("only confirmed registrations can be marked no_show")
    reg.status = "no_show"
    db.flush()
    # no_show frees an occupied seat → offer it to the waitlist (consistent with cancel)
    _promote_next(db, reg.event_id)
    return reg


def list_for_event(
    db: Session, event_id: int, *, status: str | None, q: str | None, page: int, page_size: int,
) -> tuple[list[Registration], int]:
    from app.models import User
    stmt = select(Registration).where(Registration.event_id == event_id)
    count_stmt = select(func.count()).select_from(Registration).where(Registration.event_id == event_id)
    if status:
        stmt = stmt.where(Registration.status == status)
        count_stmt = count_stmt.where(Registration.status == status)
    if q:
        stmt = stmt.join(User, User.id == Registration.user_id).where(
            (User.username.like(f"%{q}%")) | (User.email.like(f"%{q}%"))
        )
        count_stmt = count_stmt.join(User, User.id == Registration.user_id).where(
            (User.username.like(f"%{q}%")) | (User.email.like(f"%{q}%"))
        )
    total = db.scalar(count_stmt) or 0
    stmt = stmt.order_by(Registration.created_at).offset((page - 1) * page_size).limit(page_size)
    return list(db.scalars(stmt)), total


def list_for_user(db: Session, user_id: int) -> list[Registration]:
    return list(
        db.scalars(select(Registration).where(Registration.user_id == user_id)
                   .order_by(Registration.created_at.desc()))
    )
