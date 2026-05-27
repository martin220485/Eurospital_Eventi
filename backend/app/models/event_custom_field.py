from sqlalchemy import JSON, BigInteger, Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EventCustomField(Base):
    __tablename__ = "event_custom_fields"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    field_type: Mapped[str] = mapped_column(String(32), nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    placeholder: Mapped[str | None] = mapped_column(String(255), nullable=True)
    default_value: Mapped[str | None] = mapped_column(String(512), nullable=True)
    validation: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
