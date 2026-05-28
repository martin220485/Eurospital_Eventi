"""seed employee role

Revision ID: 0007_employee_role
Revises: 0006_registrations
Create Date: 2026-05-28
"""
import sqlalchemy as sa

from alembic import op

revision = "0007_employee_role"
down_revision = "0006_registrations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO roles (name, description) SELECT 'employee', 'Dipendente' "
            "WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'employee')"
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE rp FROM role_permissions rp JOIN roles r ON rp.role_id = r.id "
            "WHERE r.name = 'employee'"
        )
    )
    conn.execute(sa.text("DELETE FROM roles WHERE name = 'employee'"))
