"""events.latitude/longitude (geocoding via Photon)

Revision ID: 0015_event_geocode
Revises: 0014_event_cancelled
Create Date: 2026-05-29
"""
import sqlalchemy as sa

from alembic import op

revision = "0015_event_geocode"
down_revision = "0014_event_cancelled"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("events", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("events", sa.Column("longitude", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "longitude")
    op.drop_column("events", "latitude")
