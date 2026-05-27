import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_permission
from app.models import User
from app.schemas.attachment import AttachmentOut
from app.services import attachment_service

router = APIRouter(tags=["attachments"])


@router.post("/api/events/{event_id}/attachments", response_model=AttachmentOut,
             status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_permission("events.write"))])
async def upload(event_id: int, file: UploadFile = File(...), kind: str = Form("attachment"),
                 db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> AttachmentOut:
    data = await file.read()
    try:
        att = attachment_service.save(
            db, event_id=event_id, filename=file.filename or "file",
            content_type=file.content_type or "application/octet-stream",
            data=data, kind=kind, uploaded_by=user.id,
        )
    except attachment_service.AttachmentError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    db.commit()
    return AttachmentOut.model_validate(att)


@router.get("/api/attachments/{attachment_id}/download",
            dependencies=[Depends(require_permission("events.read"))])
def download(attachment_id: int, db: Session = Depends(get_db)) -> FileResponse:
    try:
        att = attachment_service.get(db, attachment_id)
    except attachment_service.AttachmentError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allegato non trovato")
    if not os.path.exists(att.stored_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File mancante")
    return FileResponse(att.stored_path, media_type=att.content_type, filename=att.filename)


@router.delete("/api/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_permission("events.write"))])
def delete(attachment_id: int, db: Session = Depends(get_db)) -> None:
    try:
        path = attachment_service.delete(db, attachment_id)
    except attachment_service.AttachmentError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allegato non trovato")
    db.commit()
    if os.path.exists(path):
        os.remove(path)
