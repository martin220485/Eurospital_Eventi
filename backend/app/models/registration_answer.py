from sqlalchemy import BigInteger, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RegistrationCustomAnswer(Base):
    __tablename__ = "registration_custom_answers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    registration_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("registrations.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    field_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("event_custom_fields.id"), nullable=False,
    )
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
