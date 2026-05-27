from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Event, EventCategory


class CategoryError(Exception):
    pass


def list_categories(db: Session) -> list[EventCategory]:
    return list(db.scalars(select(EventCategory).order_by(EventCategory.name)))


def create(db: Session, *, name: str, color: str, description: str | None) -> EventCategory:
    if db.scalar(select(EventCategory).where(EventCategory.name == name)):
        raise CategoryError("duplicate name")
    cat = EventCategory(name=name, color=color, description=description)
    db.add(cat)
    db.flush()
    return cat


def update(db: Session, cat_id: int, **fields) -> EventCategory:
    cat = db.get(EventCategory, cat_id)
    if cat is None:
        raise CategoryError("not found")
    if "name" in fields and fields["name"] != cat.name:
        if db.scalar(select(EventCategory).where(EventCategory.name == fields["name"])):
            raise CategoryError("duplicate name")
    for k, v in fields.items():
        setattr(cat, k, v)
    db.flush()
    return cat


def delete(db: Session, cat_id: int) -> None:
    cat = db.get(EventCategory, cat_id)
    if cat is None:
        raise CategoryError("not found")
    if db.scalar(select(Event.id).where(Event.category_id == cat_id).limit(1)):
        raise CategoryError("category in use")
    db.delete(cat)
    db.flush()
