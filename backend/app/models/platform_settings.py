from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PlatformSettings(Base):
    __tablename__ = "platform_settings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="Eurospital Eventi")
    logo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    primary_color: Mapped[str] = mapped_column(String(16), nullable=False, default="#0a66c2")
    language: Mapped[str] = mapped_column(String(8), nullable=False, default="it")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Europe/Rome")
    public_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    retention_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feature_flags: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    db_override_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    setup_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    setup_step: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
