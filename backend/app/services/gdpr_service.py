from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AuditLog, Event, NotificationLog, Registration, RegistrationCustomAnswer, User,
)


def export_for(db: Session, user: User) -> dict:
    """Return a JSON-serialisable dict of all data tied to the user."""
    regs = db.scalars(
        select(Registration).where(Registration.user_id == user.id)
    ).all()
    reg_entries = []
    for r in regs:
        event = db.get(Event, r.event_id)
        answers = db.scalars(
            select(RegistrationCustomAnswer).where(
                RegistrationCustomAnswer.registration_id == r.id
            )
        ).all()
        reg_entries.append({
            "id": r.id,
            "event_id": r.event_id,
            "event_title": event.title if event else None,
            "event_start_at": event.start_at.isoformat() if event and event.start_at else None,
            "status": r.status,
            "waitlist_position": r.waitlist_position,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "cancelled_at": r.cancelled_at.isoformat() if r.cancelled_at else None,
            "cancel_reason": r.cancel_reason,
            "answers": [{"field_id": a.field_id, "value": a.value} for a in answers],
        })

    notifs = db.scalars(
        select(NotificationLog).where(NotificationLog.user_id == user.id)
        .order_by(NotificationLog.created_at.desc()).limit(100)
    ).all()
    notif_entries = [
        {
            "id": n.id, "template_code": n.template_code,
            "registration_id": n.registration_id, "to_address": n.to_address,
            "subject": n.subject, "status": n.status,
            "sent_at": n.sent_at.isoformat() if n.sent_at else None,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notifs
    ]

    audits = db.scalars(
        select(AuditLog).where(AuditLog.actor_id == user.id)
        .order_by(AuditLog.created_at.desc()).limit(200)
    ).all()
    audit_entries = [
        {
            "id": a.id, "action": a.action,
            "target_type": a.target_type, "target_id": a.target_id,
            "ip": a.ip, "user_agent": a.user_agent, "payload": a.payload,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in audits
    ]

    return {
        "exported_at": datetime.utcnow().isoformat(),
        "user": {
            "id": user.id, "email": user.email, "username": user.username,
            "full_name": user.full_name, "department": user.department,
            "auth_source": user.auth_source,
            "ldap_groups": user.ldap_groups,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "registrations": reg_entries,
        "notifications": notif_entries,
        "audit_logs": audit_entries,
    }


def anonymize_user(db: Session, user_id: int) -> User:
    """Replace PII with placeholders while keeping FK referential integrity."""
    user = db.get(User, user_id)
    if user is None:
        raise ValueError("user not found")
    user.email = f"deleted-{user.id}@example.invalid"
    user.username = f"deleted-{user.id}"
    user.full_name = None
    user.department = None
    user.hashed_password = None
    user.ldap_dn = None
    user.ldap_groups = None
    user.auth_source = "anonymized"
    user.is_active = False
    db.flush()
    return user
