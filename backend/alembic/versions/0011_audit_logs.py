"""audit_logs + permesso users.admin

Revision ID: 0011_audit_logs
Revises: 0010_ldap_users
Create Date: 2026-05-28
"""
import sqlalchemy as sa

from alembic import op

revision = "0011_audit_logs"
down_revision = "0010_ldap_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "actor_id", sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("target_type", sa.String(32), nullable=True),
        sa.Column("target_id", sa.BigInteger(), nullable=True),
        sa.Column("ip", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO permissions (code, description) "
            "SELECT 'users.admin', 'Gestione amministrativa utenti (anonymize, audit)' "
            "WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'users.admin')"
        )
    )
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
            "WHERE r.name = 'super_admin' AND p.code = 'users.admin' "
            "AND NOT EXISTS (SELECT 1 FROM role_permissions rp "
            "WHERE rp.role_id = r.id AND rp.permission_id = p.id)"
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE rp FROM role_permissions rp "
            "JOIN permissions p ON p.id = rp.permission_id "
            "WHERE p.code = 'users.admin'"
        )
    )
    conn.execute(sa.text("DELETE FROM permissions WHERE code = 'users.admin'"))
    op.drop_table("audit_logs")
