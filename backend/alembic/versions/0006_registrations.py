"""registration domain tables + permissions

Revision ID: 0006_registrations
Revises: 0005_events
Create Date: 2026-05-28
"""
import sqlalchemy as sa

from alembic import op

revision = "0006_registrations"
down_revision = "0005_events"
branch_labels = None
depends_on = None

_PERMS = [
    ("registrations.read", "Visualizzare iscrizioni"),
    ("registrations.write", "Gestire iscrizioni"),
    ("checkin.write", "Registrare presenze (check-in)"),
]
_CODES = "('registrations.read','registrations.write','checkin.write')"


def upgrade() -> None:
    op.create_table(
        "registrations",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.BigInteger(), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("waitlist_position", sa.Integer(), nullable=True),
        sa.Column("registered_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("cancel_reason", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_registrations_event_status", "registrations", ["event_id", "status"])
    op.create_index("ix_registrations_event_user", "registrations", ["event_id", "user_id"])
    op.create_table(
        "registration_custom_answers",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("registration_id", sa.BigInteger(),
                  sa.ForeignKey("registrations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("field_id", sa.BigInteger(), sa.ForeignKey("event_custom_fields.id"), nullable=False),
        sa.Column("value", sa.Text(), nullable=True),
    )
    op.create_index("ix_answers_registration", "registration_custom_answers", ["registration_id"])
    op.create_table(
        "checkins",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("registration_id", sa.BigInteger(),
                  sa.ForeignKey("registrations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("checked_in_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("checked_in_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_checkins_registration", "checkins", ["registration_id"])

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
            "INSERT INTO roles (name, description) SELECT 'checkin_operator', 'Operatore check-in' "
            "WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'checkin_operator')"
        )
    )
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
            f"WHERE r.name = 'super_admin' AND p.code IN {_CODES} "
            "AND NOT EXISTS (SELECT 1 FROM role_permissions rp "
            "WHERE rp.role_id = r.id AND rp.permission_id = p.id)"
        )
    )
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
            "WHERE r.name = 'checkin_operator' AND p.code IN ('registrations.read','checkin.write') "
            "AND NOT EXISTS (SELECT 1 FROM role_permissions rp "
            "WHERE rp.role_id = r.id AND rp.permission_id = p.id)"
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE rp FROM role_permissions rp JOIN roles r ON rp.role_id = r.id "
            "WHERE r.name = 'checkin_operator'"
        )
    )
    conn.execute(
        sa.text(
            "DELETE rp FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id "
            f"WHERE p.code IN {_CODES}"
        )
    )
    conn.execute(sa.text("DELETE FROM roles WHERE name = 'checkin_operator'"))
    conn.execute(sa.text(f"DELETE FROM permissions WHERE code IN {_CODES}"))
    op.drop_table("checkins")
    op.drop_table("registration_custom_answers")
    op.drop_table("registrations")
