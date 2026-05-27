from sqlalchemy import BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.associations import role_permissions


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    roles: Mapped[list["Role"]] = relationship(  # noqa: F821
        secondary=role_permissions, back_populates="permissions"
    )
