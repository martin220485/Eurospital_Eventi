import csv
import io
from collections.abc import Iterator
from datetime import date, datetime, timedelta

from sqlalchemy import and_, desc, func, select
from sqlalchemy.orm import Session

from app.models import (
    Event,
    EventCustomField,
    Registration,
    RegistrationCustomAnswer,
    User,
)


def _apply_date_range(stmt, column, date_from: date | None, date_to: date | None):
    if date_from is not None:
        stmt = stmt.where(column >= datetime.combine(date_from, datetime.min.time()))
    if date_to is not None:
        stmt = stmt.where(column < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
    return stmt


def kpis(db: Session, *, date_from: date | None = None, date_to: date | None = None) -> dict:
    now = datetime.utcnow()

    # Events totals (filter by start_at if range given).
    ev_stmt = select(Event)
    ev_stmt = _apply_date_range(ev_stmt, Event.start_at, date_from, date_to)
    ev_filters = ev_stmt.whereclause

    events_total = db.scalar(
        select(func.count(Event.id)).where(ev_filters) if ev_filters is not None else select(func.count(Event.id))
    ) or 0
    events_published = db.scalar(
        select(func.count(Event.id)).where(Event.status == "published", *( [ev_filters] if ev_filters is not None else []))
    ) or 0
    events_upcoming = db.scalar(
        select(func.count(Event.id)).where(Event.status == "published", Event.start_at > now, *( [ev_filters] if ev_filters is not None else []))
    ) or 0
    events_past = db.scalar(
        select(func.count(Event.id)).where(Event.start_at <= now, *( [ev_filters] if ev_filters is not None else []))
    ) or 0

    # Registrations by status (filter by created_at).
    reg_filter_parts = []
    if date_from is not None:
        reg_filter_parts.append(Registration.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to is not None:
        reg_filter_parts.append(Registration.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))

    by_status_rows = db.execute(
        select(Registration.status, func.count(Registration.id))
        .where(*reg_filter_parts)
        .group_by(Registration.status)
    ).all()
    by_status = {row[0]: int(row[1]) for row in by_status_rows}

    confirmed = by_status.get("confirmed", 0)
    cancelled = by_status.get("cancelled", 0)
    waitlisted = by_status.get("waitlisted", 0)
    attended = by_status.get("attended", 0)
    no_show = by_status.get("no_show", 0)
    pending = by_status.get("pending", 0)
    total = confirmed + cancelled + waitlisted + attended + no_show + pending

    denom = confirmed + attended + no_show
    attendance_rate = round(attended / denom, 3) if denom > 0 else 0.0

    # By month last 12 months.
    cutoff = (now.replace(day=1) - timedelta(days=365)).replace(day=1)
    month_rows = db.execute(
        select(
            func.date_format(Registration.created_at, "%Y-%m").label("month"),
            func.count(Registration.id),
        )
        .where(Registration.created_at >= cutoff, *reg_filter_parts)
        .group_by("month")
        .order_by("month")
    ).all()
    registrations_by_month = [{"month": m, "count": int(c)} for m, c in month_rows]

    # Top events (last 90 days) by confirmed+attended count.
    top_cutoff = now - timedelta(days=90)
    top_rows = db.execute(
        select(
            Event.id, Event.title,
            func.count(Registration.id).label("cnt"),
        )
        .select_from(Event)
        .join(Registration, Registration.event_id == Event.id)
        .where(
            Registration.status.in_(("confirmed", "attended")),
            Registration.created_at >= top_cutoff,
        )
        .group_by(Event.id, Event.title)
        .order_by(desc("cnt"))
        .limit(5)
    ).all()
    top_events = [
        {"event_id": r[0], "title": r[1], "confirmed": int(r[2])} for r in top_rows
    ]

    return {
        "events_total": int(events_total),
        "events_published": int(events_published),
        "events_upcoming": int(events_upcoming),
        "events_past": int(events_past),
        "registrations_total": total,
        "registrations_confirmed": confirmed,
        "registrations_cancelled": cancelled,
        "registrations_waitlisted": waitlisted,
        "registrations_attended": attended,
        "registrations_no_show": no_show,
        "attendance_rate": attendance_rate,
        "registrations_by_month": registrations_by_month,
        "top_events": top_events,
    }


def event_report(db: Session, event_id: int) -> dict | None:
    ev = db.get(Event, event_id)
    if ev is None:
        return None

    rows = db.execute(
        select(Registration.status, func.count(Registration.id))
        .where(Registration.event_id == event_id)
        .group_by(Registration.status)
    ).all()
    by_status = {r[0]: int(r[1]) for r in rows}

    counts = {
        "confirmed": by_status.get("confirmed", 0),
        "waitlisted": by_status.get("waitlisted", 0),
        "cancelled": by_status.get("cancelled", 0),
        "attended": by_status.get("attended", 0),
        "no_show": by_status.get("no_show", 0),
        "pending": by_status.get("pending", 0),
    }
    denom = counts["confirmed"] + counts["attended"] + counts["no_show"]
    attendance_rate = round(counts["attended"] / denom, 3) if denom > 0 else 0.0

    fields = db.scalars(
        select(EventCustomField).where(EventCustomField.event_id == event_id)
    ).all()
    summary = []
    for f in fields:
        if f.type in ("select", "multiselect", "radio"):
            opt_rows = db.execute(
                select(
                    RegistrationCustomAnswer.value,
                    func.count(RegistrationCustomAnswer.id),
                )
                .join(Registration, Registration.id == RegistrationCustomAnswer.registration_id)
                .where(
                    RegistrationCustomAnswer.field_id == f.id,
                    Registration.event_id == event_id,
                )
                .group_by(RegistrationCustomAnswer.value)
            ).all()
            options = [{"value": (v or ""), "count": int(c)} for v, c in opt_rows]
        else:
            options = []
        summary.append({
            "field_id": f.id, "label": f.label, "type": f.type, "options": options,
        })

    return {
        "event": {
            "id": ev.id, "title": ev.title, "start_at": ev.start_at,
            "end_at": ev.end_at, "capacity": ev.capacity, "status": ev.status,
        },
        "counts": counts,
        "attendance_rate": attendance_rate,
        "custom_fields_summary": summary,
    }


CSV_HEADERS = [
    "id", "event_id", "event_title", "user_email", "username", "full_name",
    "status", "waitlist_position", "created_at", "cancelled_at", "cancel_reason",
]


def registrations_csv_rows(
    db: Session, *, event_id: int | None = None,
    date_from: date | None = None, date_to: date | None = None,
) -> Iterator[list[str]]:
    """Yield CSV rows (header first) as lists of strings, streaming-friendly."""
    yield CSV_HEADERS

    stmt = (
        select(Registration, Event.title, User.email, User.username, User.full_name)
        .join(Event, Event.id == Registration.event_id)
        .join(User, User.id == Registration.user_id)
        .order_by(Registration.id)
    )
    filters = []
    if event_id is not None:
        filters.append(Registration.event_id == event_id)
    if date_from is not None:
        filters.append(Registration.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to is not None:
        filters.append(Registration.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
    if filters:
        stmt = stmt.where(and_(*filters))

    for reg, title, email, username, full_name in db.execute(stmt).all():
        yield [
            str(reg.id), str(reg.event_id), title or "",
            email or "", username or "", full_name or "",
            reg.status or "",
            str(reg.waitlist_position) if reg.waitlist_position is not None else "",
            reg.created_at.isoformat() if reg.created_at else "",
            reg.cancelled_at.isoformat() if reg.cancelled_at else "",
            reg.cancel_reason or "",
        ]


def csv_stream(rows: Iterator[list[str]]) -> Iterator[bytes]:
    """Encode rows iterator as UTF-8 BOM CSV bytes (Excel friendly)."""
    yield "﻿".encode("utf-8")
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)
    for row in rows:
        writer.writerow(row)
        data = buf.getvalue().encode("utf-8")
        buf.seek(0); buf.truncate(0)
        yield data
