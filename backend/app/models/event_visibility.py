from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EventVisibility(Base):
    __tablename__ = "event_visibility"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    mode: Mapped[str] = mapped_column(String(16), nullable=False, default="all")
    dept_or_group: Mapped[str | None] = mapped_column(String(255), nullable=True)
