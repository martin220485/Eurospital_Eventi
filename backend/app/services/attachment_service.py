import os
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Attachment

ALLOWED = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
}


class AttachmentError(Exception):
    pass


def save(db: Session, *, event_id: int, filename: str, content_type: str,
         data: bytes, kind: str, uploaded_by: int | None) -> Attachment:
    if content_type not in ALLOWED:
        raise AttachmentError(f"unsupported content type: {content_type}")
    if len(data) > get_settings().max_upload_bytes:
        raise AttachmentError("file too large")
    upload_dir = get_settings().upload_dir
    os.makedirs(upload_dir, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{ALLOWED[content_type]}"
    stored_path = os.path.join(upload_dir, stored_name)
    with open(stored_path, "wb") as fh:
        fh.write(data)
    att = Attachment(
        event_id=event_id, filename=filename, stored_path=stored_path,
        content_type=content_type, size_bytes=len(data), kind=kind, uploaded_by=uploaded_by,
    )
    db.add(att)
    db.flush()
    return att


def get(db: Session, attachment_id: int) -> Attachment:
    att = db.get(Attachment, attachment_id)
    if att is None:
        raise AttachmentError("not found")
    return att


def list_for_event(db: Session, event_id: int) -> list[Attachment]:
    return list(db.scalars(select(Attachment).where(Attachment.event_id == event_id)))


def delete(db: Session, attachment_id: int) -> str:
    att = get(db, attachment_id)
    path = att.stored_path
    db.delete(att)
    db.flush()
    return path  # caller removes the file after commit
