from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Checkin(Base):
    __tablename__ = "checkins"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    registration_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("registrations.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    checked_in_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
    checked_in_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
