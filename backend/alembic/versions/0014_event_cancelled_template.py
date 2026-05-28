"""seed template event_cancelled

Revision ID: 0014_event_cancelled
Revises: 0013_db_override
Create Date: 2026-05-28
"""
import sqlalchemy as sa

from alembic import op

revision = "0014_event_cancelled"
down_revision = "0013_db_override"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO notification_templates (code, name, subject, body_html) "
            "SELECT 'event_cancelled', 'Annullamento evento', "
            "'Evento annullato: {{ event.title }}', "
            "'<p>Ciao {{ user.full_name }},</p>"
            "<p>ti informiamo che l\\'evento <strong>{{ event.title }}</strong> "
            "del {{ event.start_at }} è stato <strong>annullato</strong>.</p>"
            "<p>La tua iscrizione (codice #{{ registration.id }}) è di conseguenza decaduta.</p>"
            "<p>Ci scusiamo per l\\'inconveniente.<br>Eurospital Eventi</p>' "
            "WHERE NOT EXISTS (SELECT 1 FROM notification_templates WHERE code = 'event_cancelled')"
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM notification_templates WHERE code = 'event_cancelled'"))
