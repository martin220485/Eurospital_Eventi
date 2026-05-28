from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
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
        page=page, page_size=page_size, user=user,
    )
    return {"items": [_item(db, e, user.id) for e in events], "total": total,
            "page": page, "page_size": page_size}


@router.get("/events/{event_id}", response_model=CatalogEventDetail)
def get_event(event_id: int, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)) -> CatalogEventDetail:
    try:
        ev = catalog_service.get_visible_event(db, event_id, user=user)
    except catalog_service.CatalogError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento non disponibile")
    base = _item(db, ev, user.id)
    fields = []
    for f in custom_field_service.get_fields(db, ev.id):
        opts = [CustomFieldOption(label=o.label, value=o.value)
                for o in custom_field_service.get_options(db, f.id)]
        fields.append(CustomField(id=f.id, label=f.label, field_type=f.field_type,
                                  required=f.required, placeholder=f.placeholder, options=opts))
    # Conteggi
    from sqlalchemy import func, select
    from app.models import Attachment, Registration
    confirmed = db.scalar(
        select(func.count(Registration.id)).where(
            Registration.event_id == ev.id,
            Registration.status.in_(("confirmed", "attended")),
        )
    ) or 0
    waitlist = db.scalar(
        select(func.count(Registration.id)).where(
            Registration.event_id == ev.id,
            Registration.status == "waitlisted",
        )
    ) or 0
    # Attachments
    from app.schemas.catalog import AttachmentItem
    atts: list[AttachmentItem] = []
    for a in db.scalars(select(Attachment).where(Attachment.event_id == ev.id)).all():
        atts.append(AttachmentItem(
            id=a.id, filename=a.filename,
            content_type=getattr(a, "content_type", None),
            size_bytes=getattr(a, "size_bytes", None),
            download_url=f"/api/events/{ev.id}/attachments/{a.id}",
        ))

    return CatalogEventDetail(
        **base.model_dump(),
        description=ev.description, location_name=ev.location_name,
        address=ev.address, online_url=ev.online_url,
        capacity=ev.capacity,
        confirmed_count=int(confirmed),
        waitlist_enabled=ev.waitlist_enabled,
        waitlist_count=int(waitlist),
        registration_open_at=ev.registration_open_at,
        registration_close_at=ev.registration_close_at,
        cancellation_allowed=ev.cancellation_allowed,
        cancellation_deadline_at=ev.cancellation_deadline_at,
        custom_fields=fields,
        attachments=atts,
    )


@router.get("/my-events", response_model=list[MyEventItem])
def my_events(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[MyEventItem]:
    return [
        MyEventItem(registration_id=r.id, event_id=ev.id, event_title=ev.title,
                    event_start_at=ev.start_at, status=r.status)
        for r, ev in catalog_service.my_events(db, user.id)
    ]


@router.get("/events/{event_id}/ics")
def event_ics(event_id: int, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)) -> Response:
    """Download .ics per importare l'evento nel calendario personale."""
    from app.services import ics_service
    try:
        ev = catalog_service.get_visible_event(db, event_id, user=user)
    except catalog_service.CatalogError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento non disponibile")
    content = ics_service.event_to_ics(db, ev)
    return Response(
        content=content,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="event-{ev.id}.ics"'},
    )


@router.get("/registrations/{registration_id}/certificate.pdf")
def attendance_certificate(registration_id: int,
                           db: Session = Depends(get_db),
                           user: User = Depends(get_current_user)) -> Response:
    """Attestato PDF di partecipazione (solo se status='attended')."""
    from app.services import pdf_service, registration_service
    try:
        reg = registration_service.get(db, registration_id)
    except registration_service.RegistrationError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Iscrizione non trovata")
    if reg.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permesso negato")
    if reg.status != "attended":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Attestato disponibile solo per partecipazioni confermate")
    from app.models import Event
    ev = db.get(Event, reg.event_id)
    pdf = pdf_service.attendance_certificate(
        user_full_name=user.full_name or user.username,
        event_title=ev.title if ev else "Evento",
        event_date=ev.start_at if ev else None,
        signature_name="Eurospital",
    )
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="attestato-{reg.id}.pdf"'},
    )
