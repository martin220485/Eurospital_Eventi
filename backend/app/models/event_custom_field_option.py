from sqlalchemy import BigInteger, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EventCustomFieldOption(Base):
    __tablename__ = "event_custom_field_options"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    field_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("event_custom_fields.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
