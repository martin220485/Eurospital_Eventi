from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str
    subject: str
    body_html: str
    updated_at: datetime


class TemplateUpdate(BaseModel):
    subject: str
    body_html: str


class PreviewIn(BaseModel):
    sample_context: dict | None = None


class PreviewOut(BaseModel):
    subject_rendered: str
    body_rendered: str


class LogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    template_code: str
    registration_id: int | None
    user_id: int
    to_address: str
    subject: str
    status: str
    error_text: str | None
    attempts: int
    sent_at: datetime | None
    created_at: datetime


class LogListResult(BaseModel):
    items: list[LogOut]
    total: int
