from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Event, EventCategory, EventVisibility, Registration

_OCCUPYING = ("confirmed", "attended")
_ACTIVE = ("pending", "confirmed", "waitlisted", "attended")


class CatalogError(Exception):
    pass


def _restricted_event_ids(db: Session):
    return select(EventVisibility.event_id).where(EventVisibility.mode == "restricted")


def _hidden_event_ids_for(db: Session, user):
    """Subquery: event IDs the user cannot see.

    Local users → all restricted hidden (legacy F5).
    LDAP users  → restricted visible if user.ldap_groups/department matches
                  any event_visibility row for that event.
    """
    if user is not None and getattr(user, "auth_source", "local") == "ldap":
        tokens = list(user.ldap_groups or [])
        if user.department:
            tokens.append(user.department)
        if tokens:
            visible = select(EventVisibility.event_id).where(
                EventVisibility.mode == "restricted",
                EventVisibility.dept_or_group.in_(tokens),
            )
            return select(EventVisibility.event_id).where(
                EventVisibility.mode == "restricted"
            ).except_(visible)
    return _restricted_event_ids(db)


def available_spots(db: Session, event: Event) -> int | None:
    if event.capacity is None:
        return None
    occupied = db.scalar(
        select(func.count()).select_from(Registration)
        .where(Registration.event_id == event.id, Registration.status.in_(_OCCUPYING))
    ) or 0
    return max(event.capacity - occupied, 0)


def my_status(db: Session, event_id: int, user_id: int) -> str | None:
    return db.scalar(
        select(Registration.status)
        .where(Registration.event_id == event_id, Registration.user_id == user_id,
               Registration.status.in_(_ACTIVE)).limit(1)
    )


def registration_open(db: Session, event: Event) -> bool:
    if event.status != "published":
        return False
    now = datetime.utcnow()
    if event.registration_open_at and now < event.registration_open_at:
        return False
    if event.registration_close_at and now > event.registration_close_at:
        return False
    spots = available_spots(db, event)
    return spots is None or spots > 0 or bool(event.waitlist_enabled)


def list_visible_events(
    db: Session, *, category_id, q, date_from, date_to, page, page_size, user=None,
) -> tuple[list[Event], int]:
    hidden = _hidden_event_ids_for(db, user)
    base = select(Event).where(
        Event.status == "published", Event.id.notin_(hidden)
    )
    count = select(func.count()).select_from(Event).where(
        Event.status == "published", Event.id.notin_(hidden)
    )
    conds = []
    if category_id:
        conds.append(Event.category_id == category_id)
    if q:
        conds.append(Event.title.like(f"%{q}%"))
    if date_from:
        conds.append(Event.start_at >= date_from)
    if date_to:
        conds.append(Event.start_at <= date_to)
    for c in conds:
        base = base.where(c)
        count = count.where(c)
    total = db.scalar(count) or 0
    base = base.order_by(Event.start_at).offset((page - 1) * page_size).limit(page_size)
    return list(db.scalars(base)), total


def get_visible_event(db: Session, event_id: int, user=None) -> Event:
    ev = db.scalar(
        select(Event).where(
            Event.id == event_id, Event.status == "published",
            Event.id.notin_(_hidden_event_ids_for(db, user)),
        )
    )
    if ev is None:
        raise CatalogError("event not visible")
    return ev


def category_of(db: Session, event: Event) -> EventCategory | None:
    return db.get(EventCategory, event.category_id) if event.category_id else None


def my_events(db: Session, user_id: int) -> list[tuple[Registration, Event]]:
    rows = db.scalars(
        select(Registration).where(Registration.user_id == user_id)
        .order_by(Registration.created_at.desc())
    ).all()
    out = []
    for r in rows:
        ev = db.get(Event, r.event_id)
        if ev is not None:
            out.append((r, ev))
    return out
