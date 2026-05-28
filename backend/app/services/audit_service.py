from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import and_, desc, func, select
from sqlalchemy.orm import Session

from app.models import AuditLog


def log(
    db: Session,
    *,
    action: str,
    actor_id: int | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
    payload: dict | None = None,
) -> AuditLog:
    """Insert a single audit row. Caller commits."""
    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        ip=ip,
        user_agent=(user_agent or "")[:512] or None,
        payload=payload,
    )
    db.add(entry)
    db.flush()
    return entry


def list_logs(
    db: Session,
    *,
    actor_id: int | None = None,
    action: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[AuditLog], int]:
    filters: list[Any] = []
    if actor_id is not None:
        filters.append(AuditLog.actor_id == actor_id)
    if action:
        filters.append(AuditLog.action == action)
    if date_from:
        filters.append(AuditLog.created_at >= date_from)
    if date_to:
        filters.append(AuditLog.created_at < date_to)

    total = db.scalar(
        select(func.count(AuditLog.id)).where(*filters)
    ) or 0
    rows = db.scalars(
        select(AuditLog).where(*filters)
        .order_by(desc(AuditLog.created_at)).limit(limit).offset(offset)
    ).all()
    return list(rows), int(total)


def cleanup_older_than(db: Session, *, days: int) -> int:
    """Delete audit rows older than `days`. Returns count deleted."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    res = db.execute(
        AuditLog.__table__.delete().where(AuditLog.created_at < cutoff)
    )
    return res.rowcount or 0
