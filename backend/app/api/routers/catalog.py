from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models import User
from app.schemas.catalog import (
    CatalogEventDetail, CatalogEventItem, CustomField, CustomFieldOption, MyEventItem,
)
from app.services import catalog_service, custom_field_service

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


def _item(db: Session, ev, user_id: int) -> CatalogEventItem:
    cat = catalog_service.category_of(db, ev)
    return CatalogEventItem(
        id=ev.id, title=ev.title, short_description=ev.short_description,
        category_id=ev.category_id, category_name=cat.name if cat else None,
        category_color=cat.color if cat else None, mode=ev.mode,
        start_at=ev.start_at, end_at=ev.end_at,
        available_spots=catalog_service.available_spots(db, ev),
        registration_open=catalog_service.registration_open(db, ev),
        my_status=catalog_service.my_status(db, ev.id, user_id),
    )


@router.get("/events")
def list_events(db: Session = Depends(get_db), user: User = Depends(get_current_user),
                category_id: int | None = None, q: str | None = None,
                date_from: datetime | None = Query(default=None, alias="from"),
                date_to: datetime | None = Query(default=None, alias="to"),
                page: int = 1, page_size: int = 100) -> dict:
    events, total = catalog_service.list_visible_events(
        db, category_id=category_id, q=q, date_from=date_from, date_to=date_to,
        page=page, page_size=page_size,
    )
    return {"items": [_item(db, e, user.id) for e in events], "total": total,
            "page": page, "page_size": page_size}


@router.get("/events/{event_id}", response_model=CatalogEventDetail)
def get_event(event_id: int, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)) -> CatalogEventDetail:
    try:
        ev = catalog_service.get_visible_event(db, event_id)
    except catalog_service.CatalogError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento non disponibile")
    base = _item(db, ev, user.id)
    fields = []
    for f in custom_field_service.get_fields(db, ev.id):
        opts = [CustomFieldOption(label=o.label, value=o.value)
                for o in custom_field_service.get_options(db, f.id)]
        fields.append(CustomField(id=f.id, label=f.label, field_type=f.field_type,
                                  required=f.required, placeholder=f.placeholder, options=opts))
    return CatalogEventDetail(
        **base.model_dump(), description=ev.description, location_name=ev.location_name,
        address=ev.address, online_url=ev.online_url, waitlist_enabled=ev.waitlist_enabled,
        custom_fields=fields,
    )


@router.get("/my-events", response_model=list[MyEventItem])
def my_events(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[MyEventItem]:
    return [
        MyEventItem(registration_id=r.id, event_id=ev.id, event_title=ev.title,
                    event_start_at=ev.start_at, status=r.status)
        for r, ev in catalog_service.my_events(db, user.id)
    ]
