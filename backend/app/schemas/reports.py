from datetime import datetime

from pydantic import BaseModel


class MonthBucket(BaseModel):
    month: str
    count: int


class TopEventItem(BaseModel):
    event_id: int
    title: str
    confirmed: int


class KpiOut(BaseModel):
    events_total: int
    events_published: int
    events_upcoming: int
    events_past: int
    registrations_total: int
    registrations_confirmed: int
    registrations_cancelled: int
    registrations_waitlisted: int
    registrations_attended: int
    registrations_no_show: int
    attendance_rate: float
    registrations_by_month: list[MonthBucket]
    top_events: list[TopEventItem]


class CountsOut(BaseModel):
    confirmed: int
    waitlisted: int
    cancelled: int
    attended: int
    no_show: int
    pending: int


class CustomFieldOptionCount(BaseModel):
    value: str
    count: int


class CustomFieldSummary(BaseModel):
    field_id: int
    label: str
    type: str
    options: list[CustomFieldOptionCount]


class EventReportEvent(BaseModel):
    id: int
    title: str
    start_at: datetime
    end_at: datetime | None
    capacity: int | None
    status: str


class EventReportOut(BaseModel):
    event: EventReportEvent
    counts: CountsOut
    attendance_rate: float
    custom_fields_summary: list[CustomFieldSummary]
