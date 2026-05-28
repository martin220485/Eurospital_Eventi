"""ICS calendar export per evento."""
from datetime import timezone

from sqlalchemy.orm import Session

from app.models import Event


def event_to_ics(db: Session, event: Event, prod_id: str = "-//Eurospital//Eventi//IT") -> str:
    """Render minimal RFC 5545 VCALENDAR/VEVENT (UTC times)."""

    def _fmt(dt):
        if dt is None:
            return ""
        # naive datetimes assumed local; we emit Z (UTC) form via tz hint
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    def _esc(s: str | None) -> str:
        if not s:
            return ""
        return (s.replace("\\", "\\\\").replace(",", "\\,")
                  .replace(";", "\\;").replace("\n", "\\n"))

    location = event.location_name or event.address or event.online_url or ""
    summary = event.title or "Evento Eurospital"
    desc = event.short_description or ""

    uid = f"event-{event.id}@eurospital.it"
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{prod_id}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{_fmt(event.start_at)}",
        f"DTSTART:{_fmt(event.start_at)}",
    ]
    if event.end_at:
        lines.append(f"DTEND:{_fmt(event.end_at)}")
    lines.extend([
        f"SUMMARY:{_esc(summary)}",
        f"LOCATION:{_esc(location)}",
        f"DESCRIPTION:{_esc(desc)}",
        "END:VEVENT",
        "END:VCALENDAR",
    ])
    return "\r\n".join(lines) + "\r\n"
