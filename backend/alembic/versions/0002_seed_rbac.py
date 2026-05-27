"""seed base permissions and super_admin role

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-27

"""
import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

PERMISSIONS = [
    ("users.read", "Visualizzare utenti"),
    ("users.write", "Creare/modificare utenti"),
    ("roles.read", "Visualizzare ruoli"),
    ("roles.write", "Creare/modificare ruoli"),
    ("permissions.read", "Visualizzare permessi"),
]
SUPER_ADMIN = "super_admin"


def upgrade() -> None:
    conn = op.get_bind()
    for code, desc in PERMISSIONS:
        conn.execute(
            sa.text(
                "INSERT INTO permissions (code, description) "
                "SELECT :code, :desc FROM DUAL "
                "WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = :code)"
            ),
            {"code": code, "desc": desc},
        )
    conn.execute(
        sa.text(
            "INSERT INTO roles (name, description) "
            "SELECT :name, :desc FROM DUAL "
            "WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = :name)"
        ),
        {"name": SUPER_ADMIN, "desc": "Amministratore con tutti i permessi"},
    )
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
            "WHERE r.name = :name AND NOT EXISTS ("
            "  SELECT 1 FROM role_permissions rp "
            "  WHERE rp.role_id = r.id AND rp.permission_id = p.id)"
        ),
        {"name": SUPER_ADMIN},
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE rp FROM role_permissions rp "
            "JOIN roles r ON r.id = rp.role_id WHERE r.name = :name"
        ),
        {"name": SUPER_ADMIN},
    )
    conn.execute(sa.text("DELETE FROM roles WHERE name = :name"), {"name": SUPER_ADMIN})
    codes = tuple(c for c, _ in PERMISSIONS)
    conn.execute(
        sa.text("DELETE FROM permissions WHERE code IN :codes").bindparams(
            sa.bindparam("codes", expanding=True)
        ),
        {"codes": list(codes)},
    )
