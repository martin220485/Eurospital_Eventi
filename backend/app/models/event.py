from datetime import datetime

from sqlalchemy import (
    JSON, BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str | None] = mapped_column(String(255), nullable=True)
    short_description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    banner_attachment_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("attachments.id", ondelete="SET NULL", use_alter=True,
                               name="fk_events_banner"), nullable=True,
    )
    category_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("event_categories.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft", index=True)
    mode: Mapped[str] = mapped_column(String(16), nullable=False, default="physical")
    location_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    online_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    registration_open_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    registration_close_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    waitlist_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    max_per_user: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    cancellation_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    cancellation_deadline_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reminder_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    internal_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
