from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import EventCustomField, EventCustomFieldOption
from app.schemas.custom_field import _FIELD_TYPES, _OPTION_TYPES, CustomFieldIn


class CustomFieldError(Exception):
    pass


def get_fields(db: Session, event_id: int) -> list[EventCustomField]:
    return list(
        db.scalars(
            select(EventCustomField)
            .where(EventCustomField.event_id == event_id)
            .order_by(EventCustomField.position)
        )
    )


def get_options(db: Session, field_id: int) -> list[EventCustomFieldOption]:
    return list(
        db.scalars(
            select(EventCustomFieldOption)
            .where(EventCustomFieldOption.field_id == field_id)
            .order_by(EventCustomFieldOption.position)
        )
    )


def replace_set(db: Session, event_id: int, fields: list[CustomFieldIn]) -> None:
    for f in fields:
        if f.field_type not in _FIELD_TYPES:
            raise CustomFieldError(f"invalid field_type: {f.field_type}")
        if f.field_type in _OPTION_TYPES and not f.options:
            raise CustomFieldError(f"field '{f.label}' requires options")
    existing = get_fields(db, event_id)
    for ef in existing:
        db.delete(ef)  # options cascade via FK
    db.flush()
    for f in fields:
        nf = EventCustomField(
            event_id=event_id, label=f.label, field_type=f.field_type, required=f.required,
            placeholder=f.placeholder, default_value=f.default_value, validation=f.validation,
            position=f.position,
        )
        db.add(nf)
        db.flush()
        for o in f.options:
            db.add(EventCustomFieldOption(field_id=nf.id, label=o.label, value=o.value, position=o.position))
    db.flush()
