from sqlalchemy import BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.associations import role_permissions, user_roles


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    permissions: Mapped[list["Permission"]] = relationship(  # noqa: F821
        secondary=role_permissions, back_populates="roles"
    )
    users: Mapped[list["User"]] = relationship(  # noqa: F821
        secondary=user_roles, back_populates="roles"
    )
