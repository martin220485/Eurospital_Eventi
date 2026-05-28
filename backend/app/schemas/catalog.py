from datetime import datetime

from pydantic import BaseModel


class CatalogEventItem(BaseModel):
    id: int
    title: str
    short_description: str | None = None
    category_id: int | None = None
    category_name: str | None = None
    category_color: str | None = None
    mode: str
    start_at: datetime
    end_at: datetime
    available_spots: int | None = None
    registration_open: bool
    my_status: str | None = None


class CustomFieldOption(BaseModel):
    label: str
    value: str


class CustomField(BaseModel):
    id: int
    label: str
    field_type: str
    required: bool
    placeholder: str | None = None
    options: list[CustomFieldOption] = []


class AttachmentItem(BaseModel):
    id: int
    filename: str
    content_type: str | None = None
    size_bytes: int | None = None
    download_url: str


class CatalogEventDetail(CatalogEventItem):
    description: str | None = None
    location_name: str | None = None
    address: str | None = None
    online_url: str | None = None
    capacity: int | None = None
    confirmed_count: int = 0
    waitlist_enabled: bool
    waitlist_count: int = 0
    registration_open_at: datetime | None = None
    registration_close_at: datetime | None = None
    cancellation_allowed: bool = False
    cancellation_deadline_at: datetime | None = None
    custom_fields: list[CustomField] = []
    attachments: list[AttachmentItem] = []


class MyEventItem(BaseModel):
    registration_id: int
    event_id: int
    event_title: str
    event_start_at: datetime
    status: str
