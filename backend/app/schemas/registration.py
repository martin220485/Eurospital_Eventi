from datetime import datetime

from pydantic import BaseModel


class AnswerIn(BaseModel):
    field_id: int
    value: str | None = None


class RegisterIn(BaseModel):
    user_id: int | None = None
    answers: list[AnswerIn] = []


class AnswerOut(BaseModel):
    field_id: int
    value: str | None = None


class RegistrationOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    event_id: int
    user_id: int
    status: str
    waitlist_position: int | None = None
    created_at: datetime


class RegistrationListItem(BaseModel):
    id: int
    user_id: int
    username: str
    email: str
    status: str
    waitlist_position: int | None = None
    checked_in: bool


class RegistrationListResult(BaseModel):
    items: list[RegistrationListItem]
    total: int
    page: int
    page_size: int


class RegistrationDetail(RegistrationOut):
    answers: list[AnswerOut] = []
