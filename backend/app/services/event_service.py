from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Event, EventCustomField, EventCustomFieldOption, EventVisibility
from app.services import geocode_service
from app.services.html_sanitize import sanitize_html


class EventError(Exception):
    pass


_HTML_FIELDS = ("short_description", "description")
_GEO_FIELDS = ("mode", "location_name", "address")


def _apply_html(data: dict) -> None:
    for f in _HTML_FIELDS:
        if f in data and data[f] is not None:
            data[f] = sanitize_html(data[f])


def _apply_geocode(ev: Event) -> None:
    """Aggiorna lat/lon dell'evento dall'indirizzo (Photon). Eventi online o senza
    indirizzo: coordinate azzerate. Su fallimento geocoding le coordinate restano."""
    if ev.mode == "online" or not ev.address:
        ev.latitude = None
        ev.longitude = None
        return
    query = ", ".join(p for p in (ev.location_name, ev.address) if p)
    coords = geocode_service.geocode(query)
    if coords:
        ev.latitude, ev.longitude = coords


def create(db: Session, *, created_by: int | None, **data) -> Event:
    _apply_html(data)
    ev = Event(status="draft", created_by=created_by, **data)
    _apply_geocode(ev)
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
    if any(f in data for f in _GEO_FIELDS):
        _apply_geocode(ev)
    db.flush()
    return ev


def delete(db: Session, event_id: int) -> None:
    """Cancella un evento solo se nessuno è iscritto.
    Con iscrizioni attive bisogna usare la transizione → cancelled (che notifica)."""
    from sqlalchemy import select
    from app.models import Registration
    ev = get(db, event_id)
    has = db.scalar(
        select(Registration.id).where(
            Registration.event_id == event_id,
            Registration.status.in_(("pending", "confirmed", "waitlisted", "attended")),
        ).limit(1)
    )
    if has:
        raise EventError(
            "ci sono iscritti: usa 'Annulla evento' invece di eliminare"
        )
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


_TRANSITIONS = {
    "draft": {"published", "archived"},
    "published": {"suspended", "cancelled", "archived"},
    "suspended": {"published", "cancelled", "archived"},
    "cancelled": {"archived"},
    "archived": set(),
}


def _validate_publishable(ev: Event) -> None:
    if not ev.title or not ev.title.strip():
        raise EventError("title required to publish")
    if ev.end_at <= ev.start_at:
        raise EventError("end_at must be after start_at")
    if ev.registration_open_at and ev.registration_close_at:
        if ev.registration_close_at < ev.registration_open_at:
            raise EventError("registration window invalid")
        if ev.registration_close_at > ev.start_at:
            raise EventError("registration must close before start")


def transition(db: Session, event_id: int, target: str, *, can_publish: bool) -> Event:
    ev = get(db, event_id)
    allowed = _TRANSITIONS.get(ev.status, set())
    if target not in allowed:
        raise EventError(f"illegal transition {ev.status} -> {target}")
    if target == "published":
        if not can_publish:
            raise EventError("missing events.publish permission")
        _validate_publishable(ev)
    ev.status = target
    db.flush()
    return ev


def duplicate(db: Session, event_id: int, *, created_by: int | None) -> Event:
    src = get(db, event_id)
    cols = {
        c: getattr(src, c) for c in (
            "short_description", "description", "category_id", "mode", "location_name",
            "address", "online_url", "start_at", "end_at", "registration_open_at",
            "registration_close_at", "capacity", "waitlist_enabled", "max_per_user",
            "cancellation_allowed", "cancellation_deadline_at", "reminder_config", "internal_notes",
        )
    }
    dup = Event(title=f"{src.title} (copia)", status="draft", created_by=created_by, **cols)
    db.add(dup)
    db.flush()
    src_fields = db.scalars(
        select(EventCustomField).where(EventCustomField.event_id == src.id)
    ).all()
    for f in src_fields:
        nf = EventCustomField(
            event_id=dup.id, label=f.label, field_type=f.field_type, required=f.required,
            placeholder=f.placeholder, default_value=f.default_value, validation=f.validation,
            position=f.position,
        )
        db.add(nf)
        db.flush()
        opts = db.scalars(
            select(EventCustomFieldOption).where(EventCustomFieldOption.field_id == f.id)
        ).all()
        for o in opts:
            db.add(EventCustomFieldOption(field_id=nf.id, label=o.label, value=o.value, position=o.position))
    vis = db.scalars(select(EventVisibility).where(EventVisibility.event_id == src.id)).all()
    for v in vis:
        db.add(EventVisibility(event_id=dup.id, mode=v.mode, dept_or_group=v.dept_or_group))
    db.flush()
    return dup
