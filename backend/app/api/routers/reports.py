from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_permission
from app.schemas.reports import EventReportOut, KpiOut
from app.services import report_service

router = APIRouter(prefix="/api/admin/reports", tags=["reports"])

_PERM = "reports.read"


@router.get(
    "/kpis",
    response_model=KpiOut,
    dependencies=[Depends(require_permission(_PERM))],
)
def kpis(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
) -> KpiOut:
    out = report_service.kpis(db, date_from=date_from, date_to=date_to)
    return KpiOut(**out)


@router.get(
    "/events/{event_id}",
    response_model=EventReportOut,
    dependencies=[Depends(require_permission(_PERM))],
)
def event_report(event_id: int, db: Session = Depends(get_db)) -> EventReportOut:
    out = report_service.event_report(db, event_id)
    if out is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="evento non trovato")
    return EventReportOut(**out)


@router.get(
    "/events/{event_id}/registrations.csv",
    dependencies=[Depends(require_permission(_PERM))],
)
def event_registrations_csv(event_id: int, db: Session = Depends(get_db)) -> StreamingResponse:
    rows = report_service.registrations_csv_rows(db, event_id=event_id)
    return StreamingResponse(
        report_service.csv_stream(rows),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="event-{event_id}-registrations.csv"',
        },
    )


@router.get(
    "/events/{event_id}/report.pdf",
    dependencies=[Depends(require_permission(_PERM))],
)
def event_report_pdf(event_id: int, db: Session = Depends(get_db)) -> Response:
    from app.services import pdf_service
    out = report_service.event_report(db, event_id)
    if out is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="evento non trovato")
    pdf = pdf_service.event_report_pdf(
        event_title=out["event"]["title"],
        event_start=out["event"]["start_at"],
        event_end=out["event"]["end_at"],
        capacity=out["event"]["capacity"],
        status=out["event"]["status"],
        counts=out["counts"],
        attendance_rate=out["attendance_rate"],
        custom_fields_summary=out["custom_fields_summary"],
    )
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="event-{event_id}-report.pdf"'},
    )


@router.get(
    "/registrations.csv",
    dependencies=[Depends(require_permission(_PERM))],
)
def registrations_csv(
    event_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    rows = report_service.registrations_csv_rows(
        db, event_id=event_id, date_from=date_from, date_to=date_to
    )
    return StreamingResponse(
        report_service.csv_stream(rows),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="registrations.csv"',
        },
    )
