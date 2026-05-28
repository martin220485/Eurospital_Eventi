"""platform_settings.db_override_encrypted

Revision ID: 0013_db_override
Revises: 0012_event_reminder
Create Date: 2026-05-28
"""
import sqlalchemy as sa

from alembic import op

revision = "0013_db_override"
down_revision = "0012_event_reminder"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "platform_settings",
        sa.Column("db_override_encrypted", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("platform_settings", "db_override_encrypted")
