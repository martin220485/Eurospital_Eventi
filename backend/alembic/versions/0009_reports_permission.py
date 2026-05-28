"""reports: seed permission reports.read

Revision ID: 0009_reports_permission
Revises: 0008_notifications
Create Date: 2026-05-28
"""
import sqlalchemy as sa

from alembic import op

revision = "0009_reports_permission"
down_revision = "0008_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO permissions (code, description) "
            "SELECT 'reports.read', 'Visualizzare report e KPI' "
            "WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'reports.read')"
        )
    )
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
            "WHERE r.name = 'super_admin' AND p.code = 'reports.read' "
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
            "WHERE p.code = 'reports.read'"
        )
    )
    conn.execute(sa.text("DELETE FROM permissions WHERE code = 'reports.read'"))
