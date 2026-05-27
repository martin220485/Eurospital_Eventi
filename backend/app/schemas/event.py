from datetime import datetime

from pydantic import BaseModel, Field


class EventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    short_description: str | None = None
    description: str | None = None
    category_id: int | None = None
    mode: str = "physical"
    location_name: str | None = None
    address: str | None = None
    online_url: str | None = None
    start_at: datetime
    end_at: datetime
    registration_open_at: datetime | None = None
    registration_close_at: datetime | None = None
    capacity: int | None = None
    waitlist_enabled: bool = False
    max_per_user: int = 1
    cancellation_allowed: bool = True
    cancellation_deadline_at: datetime | None = None
    reminder_config: dict = {}
    internal_notes: str | None = None


class EventUpdate(BaseModel):
    title: str | None = None
    short_description: str | None = None
    description: str | None = None
    category_id: int | None = None
    banner_attachment_id: int | None = None
    mode: str | None = None
    location_name: str | None = None
    address: str | None = None
    online_url: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    registration_open_at: datetime | None = None
    registration_close_at: datetime | None = None
    capacity: int | None = None
    waitlist_enabled: bool | None = None
    max_per_user: int | None = None
    cancellation_allowed: bool | None = None
    cancellation_deadline_at: datetime | None = None
    reminder_config: dict | None = None
    internal_notes: str | None = None


class EventOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    title: str
    status: str
    short_description: str | None = None
    description: str | None = None
    category_id: int | None = None
    banner_attachment_id: int | None = None
    mode: str
    location_name: str | None = None
    address: str | None = None
    online_url: str | None = None
    start_at: datetime
    end_at: datetime
    registration_open_at: datetime | None = None
    registration_close_at: datetime | None = None
    capacity: int | None = None
    waitlist_enabled: bool
    max_per_user: int
    cancellation_allowed: bool
    cancellation_deadline_at: datetime | None = None
    reminder_config: dict
    internal_notes: str | None = None
    attachments: list = []


class EventListItem(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    title: str
    status: str
    category_id: int | None = None
    start_at: datetime
    end_at: datetime


class EventListResult(BaseModel):
    items: list[EventListItem]
    total: int
    page: int
    page_size: int


class EventTransition(BaseModel):
    target: str
