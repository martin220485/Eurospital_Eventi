"""settings tables

Revision ID: 0003_settings
Revises: 0002
Create Date: 2026-05-27
"""
import sqlalchemy as sa

from alembic import op

revision = "0003_settings"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_settings",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("logo_url", sa.String(512), nullable=True),
        sa.Column("primary_color", sa.String(16), nullable=False),
        sa.Column("language", sa.String(8), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("public_url", sa.String(512), nullable=True),
        sa.Column("retention_days", sa.Integer(), nullable=True),
        sa.Column("feature_flags", sa.JSON(), nullable=False),
        sa.Column("setup_completed", sa.Boolean(), nullable=False),
        sa.Column("setup_step", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "smtp_settings",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=False),
        sa.Column("host", sa.String(255), nullable=True),
        sa.Column("port", sa.Integer(), nullable=True),
        sa.Column("tls_mode", sa.String(16), nullable=False),
        sa.Column("from_address", sa.String(255), nullable=True),
        sa.Column("from_name", sa.String(255), nullable=True),
        sa.Column("username", sa.String(255), nullable=True),
        sa.Column("password_encrypted", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "ldap_settings",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=False),
        sa.Column("server_uri", sa.String(512), nullable=True),
        sa.Column("base_dn", sa.String(512), nullable=True),
        sa.Column("bind_dn", sa.String(512), nullable=True),
        sa.Column("bind_pw_encrypted", sa.Text(), nullable=True),
        sa.Column("user_filter", sa.String(512), nullable=True),
        sa.Column("group_filter", sa.String(512), nullable=True),
        sa.Column("attr_mapping", sa.JSON(), nullable=False),
        sa.Column("users_group", sa.String(512), nullable=True),
        sa.Column("admins_group", sa.String(512), nullable=True),
        sa.Column("sso_enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("ldap_settings")
    op.drop_table("smtp_settings")
    op.drop_table("platform_settings")
