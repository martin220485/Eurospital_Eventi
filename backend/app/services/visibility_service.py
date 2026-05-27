from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import EventVisibility


def get_visibility(db: Session, event_id: int) -> tuple[str, list[str]]:
    rows = list(db.scalars(select(EventVisibility).where(EventVisibility.event_id == event_id)))
    if not rows:
        return "all", []
    mode = rows[0].mode
    groups = [r.dept_or_group for r in rows if r.dept_or_group]
    return mode, groups


def set_visibility(db: Session, event_id: int, mode: str, groups: list[str]) -> None:
    for row in db.scalars(select(EventVisibility).where(EventVisibility.event_id == event_id)):
        db.delete(row)
    db.flush()
    if mode == "all":
        db.add(EventVisibility(event_id=event_id, mode="all", dept_or_group=None))
    else:
        if not groups:
            db.add(EventVisibility(event_id=event_id, mode="restricted", dept_or_group=None))
        for g in groups:
            db.add(EventVisibility(event_id=event_id, mode="restricted", dept_or_group=g))
    db.flush()
