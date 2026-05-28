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


class CatalogEventDetail(CatalogEventItem):
    description: str | None = None
    location_name: str | None = None
    address: str | None = None
    online_url: str | None = None
    waitlist_enabled: bool
    custom_fields: list[CustomField] = []


class MyEventItem(BaseModel):
    registration_id: int
    event_id: int
    event_title: str
    event_start_at: datetime
    status: str
