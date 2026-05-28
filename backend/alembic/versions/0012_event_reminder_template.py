"""seed template event_reminder

Revision ID: 0012_event_reminder
Revises: 0011_audit_logs
Create Date: 2026-05-28
"""
import sqlalchemy as sa

from alembic import op

revision = "0012_event_reminder"
down_revision = "0011_audit_logs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO notification_templates (code, name, subject, body_html) "
            "SELECT 'event_reminder', 'Promemoria evento', "
            "'Promemoria: {{ event.title }}', "
            "'<p>Ciao {{ user.full_name }},</p>"
            "<p>ti ricordiamo che l\\'evento <strong>{{ event.title }}</strong> "
            "del {{ event.start_at }} è imminente.</p>"
            "<p>Luogo: {{ event.location }}</p>"
            "<p>Codice iscrizione: #{{ registration.id }}</p>"
            "<p>A presto!<br>Eurospital Eventi</p>' "
            "WHERE NOT EXISTS (SELECT 1 FROM notification_templates WHERE code = 'event_reminder')"
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM notification_templates WHERE code = 'event_reminder'"))
