from pydantic import BaseModel


class AttachmentOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    event_id: int | None = None
    filename: str
    content_type: str
    size_bytes: int
    kind: str
