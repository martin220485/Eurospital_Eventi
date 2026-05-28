"""users ldap fields + permesso users.ldap_sync

Revision ID: 0010_ldap_users
Revises: 0009_reports_permission
Create Date: 2026-05-28
"""
import sqlalchemy as sa

from alembic import op

revision = "0010_ldap_users"
down_revision = "0009_reports_permission"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("auth_source", sa.String(16), nullable=False, server_default="local"),
    )
    op.add_column("users", sa.Column("ldap_dn", sa.String(512), nullable=True))
    op.add_column("users", sa.Column("department", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("ldap_groups", sa.JSON(), nullable=True))

    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO permissions (code, description) "
            "SELECT 'users.ldap_sync', 'Sincronizzare utenti da AD/LDAP' "
            "WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'users.ldap_sync')"
        )
    )
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
            "WHERE r.name = 'super_admin' AND p.code = 'users.ldap_sync' "
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
            "WHERE p.code = 'users.ldap_sync'"
        )
    )
    conn.execute(sa.text("DELETE FROM permissions WHERE code = 'users.ldap_sync'"))
    op.drop_column("users", "ldap_groups")
    op.drop_column("users", "department")
    op.drop_column("users", "ldap_dn")
    op.drop_column("users", "auth_source")
