from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LdapSettings(Base):
    __tablename__ = "ldap_settings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    server_uri: Mapped[str | None] = mapped_column(String(512), nullable=True)
    base_dn: Mapped[str | None] = mapped_column(String(512), nullable=True)
    bind_dn: Mapped[str | None] = mapped_column(String(512), nullable=True)
    bind_pw_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_filter: Mapped[str | None] = mapped_column(String(512), nullable=True)
    group_filter: Mapped[str | None] = mapped_column(String(512), nullable=True)
    attr_mapping: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    users_group: Mapped[str | None] = mapped_column(String(512), nullable=True)
    admins_group: Mapped[str | None] = mapped_column(String(512), nullable=True)
    sso_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
