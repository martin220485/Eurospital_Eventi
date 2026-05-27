from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Event
from app.services.html_sanitize import sanitize_html


class EventError(Exception):
    pass


_HTML_FIELDS = ("short_description", "description")


def _apply_html(data: dict) -> None:
    for f in _HTML_FIELDS:
        if f in data and data[f] is not None:
            data[f] = sanitize_html(data[f])


def create(db: Session, *, created_by: int | None, **data) -> Event:
    _apply_html(data)
    ev = Event(status="draft", created_by=created_by, **data)
    db.add(ev)
    db.flush()
    return ev


def get(db: Session, event_id: int) -> Event:
    ev = db.get(Event, event_id)
    if ev is None:
        raise EventError("not found")
    return ev


def update(db: Session, event_id: int, data: dict) -> Event:
    ev = get(db, event_id)
    _apply_html(data)
    for k, v in data.items():
        setattr(ev, k, v)
    db.flush()
    return ev


def delete(db: Session, event_id: int) -> None:
    ev = get(db, event_id)
    if ev.status != "draft":
        raise EventError("only draft events can be deleted")
    db.delete(ev)
    db.flush()


def list_events(
    db: Session, *, status: str | None, category_id: int | None, q: str | None,
    date_from: datetime | None, date_to: datetime | None, page: int, page_size: int,
) -> tuple[list[Event], int]:
    stmt = select(Event)
    count_stmt = select(func.count()).select_from(Event)
    conds = []
    if status:
        conds.append(Event.status == status)
    if category_id:
        conds.append(Event.category_id == category_id)
    if q:
        conds.append(Event.title.like(f"%{q}%"))
    if date_from:
        conds.append(Event.start_at >= date_from)
    if date_to:
        conds.append(Event.start_at <= date_to)
    for c in conds:
        stmt = stmt.where(c)
        count_stmt = count_stmt.where(c)
    total = db.scalar(count_stmt) or 0
    stmt = stmt.order_by(Event.start_at.desc()).offset((page - 1) * page_size).limit(page_size)
    return list(db.scalars(stmt)), total
