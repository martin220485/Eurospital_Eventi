"""notifications: templates + logs + permission + seed

Revision ID: 0008_notifications
Revises: 0007_employee_role
Create Date: 2026-05-28
"""
import sqlalchemy as sa

from alembic import op

revision = "0008_notifications"
down_revision = "0007_employee_role"
branch_labels = None
depends_on = None


_TEMPLATES = [
    (
        "registration_cancelled",
        "Annullamento iscrizione",
        "Annullamento iscrizione a {{ event.title }}",
        (
            "<p>Ciao {{ user.full_name }},</p>"
            "<p>la tua iscrizione all'evento <strong>{{ event.title }}</strong> "
            "del {{ event.start_at }} è stata annullata.</p>"
            "<p>Cordiali saluti,<br>Eurospital Eventi</p>"
        ),
    ),
    (
        "registration_confirmed",
        "Conferma iscrizione",
        "Conferma iscrizione a {{ event.title }}",
        (
            "<p>Ciao {{ user.full_name }},</p>"
            "<p>la tua iscrizione all'evento <strong>{{ event.title }}</strong> "
            "del {{ event.start_at }} è confermata.</p>"
            "<p>Luogo: {{ event.location }}</p>"
            "<p>Codice iscrizione: #{{ registration.id }}</p>"
            "<p>Cordiali saluti,<br>Eurospital Eventi</p>"
        ),
    ),
    (
        "registration_promoted",
        "Promozione da lista d'attesa",
        "Sei stato/a iscritto/a a {{ event.title }}",
        (
            "<p>Ciao {{ user.full_name }},</p>"
            "<p>si è liberato un posto per <strong>{{ event.title }}</strong> "
            "del {{ event.start_at }}: sei ora iscritto/a.</p>"
            "<p>Codice iscrizione: #{{ registration.id }}</p>"
            "<p>Cordiali saluti,<br>Eurospital Eventi</p>"
        ),
    ),
    (
        "registration_waitlisted",
        "Inserimento in lista d'attesa",
        "Lista d'attesa per {{ event.title }}",
        (
            "<p>Ciao {{ user.full_name }},</p>"
            "<p>l'evento <strong>{{ event.title }}</strong> "
            "del {{ event.start_at }} è al completo: sei stato/a inserito/a in lista d'attesa.</p>"
            "<p>Ti avviseremo via email non appena si libererà un posto.</p>"
            "<p>Cordiali saluti,<br>Eurospital Eventi</p>"
        ),
    ),
]


def upgrade() -> None:
    op.create_table(
        "notification_templates",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("body_html", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "notification_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("template_code", sa.String(64), nullable=False),
        sa.Column(
            "registration_id",
            sa.BigInteger(),
            sa.ForeignKey("registrations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("to_address", sa.String(255), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("error_text", sa.Text(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_notification_logs_template_code", "notification_logs", ["template_code"])
    op.create_index(
        "ix_notification_logs_user_created", "notification_logs", ["user_id", "created_at"]
    )
    op.create_index(
        "ix_notification_logs_status_created", "notification_logs", ["status", "created_at"]
    )

    conn = op.get_bind()
    for code, name, subject, body in _TEMPLATES:
        conn.execute(
            sa.text(
                "INSERT INTO notification_templates (code, name, subject, body_html) "
                "SELECT :code, :name, :subject, :body "
                "WHERE NOT EXISTS (SELECT 1 FROM notification_templates WHERE code = :code)"
            ),
            {"code": code, "name": name, "subject": subject, "body": body},
        )

    conn.execute(
        sa.text(
            "INSERT INTO permissions (code, description) "
            "SELECT 'notifications.manage', 'Gestire template e log notifiche' "
            "WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'notifications.manage')"
        )
    )
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
            "WHERE r.name = 'super_admin' AND p.code = 'notifications.manage' "
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
            "WHERE p.code = 'notifications.manage'"
        )
    )
    conn.execute(sa.text("DELETE FROM permissions WHERE code = 'notifications.manage'"))
    op.drop_table("notification_logs")
    op.drop_table("notification_templates")
