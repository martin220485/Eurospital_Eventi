import nh3
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_permission
from app.models import NotificationLog, NotificationTemplate
from app.schemas.notifications import (
    LogListResult, LogOut, PreviewIn, PreviewOut, TemplateOut, TemplateUpdate,
)
from app.services import notification_service

router = APIRouter(prefix="/api/admin", tags=["notifications"])

_PERM = "notifications.manage"

_SAMPLE_CONTEXT = {
    "user": {"full_name": "Mario Rossi", "email": "mario.rossi@example.it"},
    "event": {
        "title": "Workshop demo",
        "start_at": "01/06/2026 09:00",
        "location": "Sala A",
    },
    "registration": {"id": 1234, "status": "confirmed"},
}


@router.get(
    "/notification-templates",
    response_model=list[TemplateOut],
    dependencies=[Depends(require_permission(_PERM))],
)
def list_templates(db: Session = Depends(get_db)) -> list[TemplateOut]:
    rows = db.scalars(select(NotificationTemplate).order_by(NotificationTemplate.code)).all()
    return [TemplateOut.model_validate(r) for r in rows]


@router.get(
    "/notification-templates/{code}",
    response_model=TemplateOut,
    dependencies=[Depends(require_permission(_PERM))],
)
def get_template(code: str, db: Session = Depends(get_db)) -> TemplateOut:
    row = db.scalar(select(NotificationTemplate).where(NotificationTemplate.code == code))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template non trovato")
    return TemplateOut.model_validate(row)


@router.put(
    "/notification-templates/{code}",
    response_model=TemplateOut,
    dependencies=[Depends(require_permission(_PERM))],
)
def update_template(code: str, payload: TemplateUpdate, db: Session = Depends(get_db)) -> TemplateOut:
    row = db.scalar(select(NotificationTemplate).where(NotificationTemplate.code == code))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template non trovato")
    row.subject = payload.subject.strip()
    row.body_html = nh3.clean(payload.body_html or "")
    db.commit()
    db.refresh(row)
    return TemplateOut.model_validate(row)


@router.post(
    "/notification-templates/{code}/preview",
    response_model=PreviewOut,
    dependencies=[Depends(require_permission(_PERM))],
)
def preview_template(code: str, payload: PreviewIn, db: Session = Depends(get_db)) -> PreviewOut:
    row = db.scalar(select(NotificationTemplate).where(NotificationTemplate.code == code))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template non trovato")
    ctx = payload.sample_context if payload.sample_context is not None else _SAMPLE_CONTEXT
    try:
        rendered = notification_service.render(
            subject=row.subject, body_html=row.body_html, context=ctx
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return PreviewOut(
        subject_rendered=rendered["subject"], body_rendered=rendered["body_html"]
    )


@router.get(
    "/notification-logs",
    response_model=LogListResult,
    dependencies=[Depends(require_permission(_PERM))],
)
def list_logs(
    user_id: int | None = None,
    status_filter: str | None = None,
    template: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
) -> LogListResult:
    from sqlalchemy import func

    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    filters = []
    if user_id is not None:
        filters.append(NotificationLog.user_id == user_id)
    if status_filter:
        filters.append(NotificationLog.status == status_filter)
    if template:
        filters.append(NotificationLog.template_code == template)
    total = db.scalar(select(func.count(NotificationLog.id)).where(*filters)) or 0
    rows = db.scalars(
        select(NotificationLog)
        .where(*filters)
        .order_by(desc(NotificationLog.created_at))
        .limit(limit).offset(offset)
    ).all()
    return LogListResult(items=[LogOut.model_validate(r) for r in rows], total=total)


@router.post(
    "/notification-logs/{log_id}/resend",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_permission(_PERM))],
)
def resend_log(log_id: int, db: Session = Depends(get_db)) -> Response:
    row = db.get(NotificationLog, log_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="log non trovato")
    if row.registration_id is not None:
        notification_service.enqueue_registration_notification(
            db, row.template_code, row.registration_id
        )
    else:
        # Standalone log without registration: rebuild minimal context.
        from app.workers.tasks import send_notification
        try:
            send_notification.delay(
                template_code=row.template_code,
                user_id=row.user_id,
                registration_id=None,
                context={},
            )
        except Exception:
            pass
    return Response(status_code=status.HTTP_202_ACCEPTED)
