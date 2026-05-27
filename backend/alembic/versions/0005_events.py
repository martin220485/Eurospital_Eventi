"""event domain tables + permissions

Revision ID: 0005_events
Revises: 0003_settings
Create Date: 2026-05-28
"""
import sqlalchemy as sa

from alembic import op

revision = "0005_events"
down_revision = "0003_settings"
branch_labels = None
depends_on = None

_PERMS = [
    ("events.read", "Visualizzare eventi"),
    ("events.write", "Creare/modificare eventi"),
    ("events.delete", "Eliminare eventi"),
    ("events.publish", "Pubblicare eventi"),
    ("categories.write", "Gestire categorie eventi"),
]


def upgrade() -> None:
    op.create_table(
        "event_categories",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(150), nullable=False, unique=True),
        sa.Column("color", sa.String(16), nullable=False),
        sa.Column("description", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "attachments",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.BigInteger(), nullable=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("stored_path", sa.String(512), nullable=False),
        sa.Column("content_type", sa.String(128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("uploaded_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=True),
        sa.Column("short_description", sa.String(512), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("banner_attachment_id", sa.BigInteger(), nullable=True),
        sa.Column("category_id", sa.BigInteger(),
                  sa.ForeignKey("event_categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("mode", sa.String(16), nullable=False),
        sa.Column("location_name", sa.String(255), nullable=True),
        sa.Column("address", sa.String(512), nullable=True),
        sa.Column("online_url", sa.String(512), nullable=True),
        sa.Column("start_at", sa.DateTime(), nullable=False),
        sa.Column("end_at", sa.DateTime(), nullable=False),
        sa.Column("registration_open_at", sa.DateTime(), nullable=True),
        sa.Column("registration_close_at", sa.DateTime(), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("waitlist_enabled", sa.Boolean(), nullable=False),
        sa.Column("max_per_user", sa.Integer(), nullable=False),
        sa.Column("cancellation_allowed", sa.Boolean(), nullable=False),
        sa.Column("cancellation_deadline_at", sa.DateTime(), nullable=True),
        sa.Column("reminder_config", sa.JSON(), nullable=False),
        sa.Column("internal_notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_events_status_start", "events", ["status", "start_at"])
    op.create_index("ix_events_category_id", "events", ["category_id"])
    op.create_foreign_key(
        "fk_events_banner", "events", "attachments",
        ["banner_attachment_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_attachments_event", "attachments", "events",
        ["event_id"], ["id"], ondelete="CASCADE",
    )
    op.create_index("ix_attachments_event_id", "attachments", ["event_id"])
    op.create_table(
        "event_custom_fields",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.BigInteger(),
                  sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("field_type", sa.String(32), nullable=False),
        sa.Column("required", sa.Boolean(), nullable=False),
        sa.Column("placeholder", sa.String(255), nullable=True),
        sa.Column("default_value", sa.String(512), nullable=True),
        sa.Column("validation", sa.JSON(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
    )
    op.create_index("ix_custom_fields_event", "event_custom_fields", ["event_id"])
    op.create_table(
        "event_custom_field_options",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("field_id", sa.BigInteger(),
                  sa.ForeignKey("event_custom_fields.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("value", sa.String(255), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
    )
    op.create_index("ix_field_options_field", "event_custom_field_options", ["field_id"])
    op.create_table(
        "event_visibility",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.BigInteger(),
                  sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mode", sa.String(16), nullable=False),
        sa.Column("dept_or_group", sa.String(255), nullable=True),
    )
    op.create_index("ix_visibility_event", "event_visibility", ["event_id"])

    conn = op.get_bind()
    for code, desc in _PERMS:
        conn.execute(
            sa.text(
                "INSERT INTO permissions (code, description) SELECT :code, :desc "
                "WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = :code)"
            ),
            {"code": code, "desc": desc},
        )
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
            "WHERE r.name = 'super_admin' AND p.code IN "
            "('events.read','events.write','events.delete','events.publish','categories.write') "
            "AND NOT EXISTS (SELECT 1 FROM role_permissions rp "
            "WHERE rp.role_id = r.id AND rp.permission_id = p.id)"
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE rp FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id "
            "WHERE p.code IN ('events.read','events.write','events.delete','events.publish','categories.write')"
        )
    )
    conn.execute(
        sa.text(
            "DELETE FROM permissions WHERE code IN "
            "('events.read','events.write','events.delete','events.publish','categories.write')"
        )
    )
    op.drop_table("event_visibility")
    op.drop_table("event_custom_field_options")
    op.drop_table("event_custom_fields")
    op.drop_constraint("fk_events_banner", "events", type_="foreignkey")
    op.drop_constraint("fk_attachments_event", "attachments", type_="foreignkey")
    op.drop_table("events")
    op.drop_table("attachments")
    op.drop_table("event_categories")
