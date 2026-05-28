from datetime import datetime, timedelta

import pytest

from app.services import event_service, registration_service, user_service


def _user(db, n):
    return user_service.create_user(db, email=f"u{n}@x.it", username=f"u{n}", password="pw12345")


def _event(db, **over):
    start = datetime(2030, 1, 1, 9, 0)
    data = dict(title="E", start_at=start, end_at=start + timedelta(hours=1), mode="physical")
    data.update(over)
    ev = event_service.create(db, created_by=None, **data)
    ev.status = "published"
    db.flush()
    return ev


def test_register_confirmed_when_space(db):
    ev = _event(db, capacity=2)
    u = _user(db, 1)
    reg = registration_service.register(db, event_id=ev.id, user_id=u.id, registered_by=None, answers=[])
    assert reg.status == "confirmed"


def test_register_waitlisted_when_full(db):
    ev = _event(db, capacity=1, waitlist_enabled=True)
    registration_service.register(db, event_id=ev.id, user_id=_user(db, 1).id, registered_by=None, answers=[])
    reg2 = registration_service.register(db, event_id=ev.id, user_id=_user(db, 2).id, registered_by=None, answers=[])
    assert reg2.status == "waitlisted"
    assert reg2.waitlist_position == 1


def test_register_full_no_waitlist_raises(db):
    ev = _event(db, capacity=1, waitlist_enabled=False)
    registration_service.register(db, event_id=ev.id, user_id=_user(db, 1).id, registered_by=None, answers=[])
    with pytest.raises(registration_service.RegistrationError):
        registration_service.register(db, event_id=ev.id, user_id=_user(db, 2).id, registered_by=None, answers=[])


def test_duplicate_active_blocked_by_max_per_user(db):
    ev = _event(db, capacity=10, max_per_user=1)
    u = _user(db, 1)
    registration_service.register(db, event_id=ev.id, user_id=u.id, registered_by=None, answers=[])
    with pytest.raises(registration_service.RegistrationError):
        registration_service.register(db, event_id=ev.id, user_id=u.id, registered_by=None, answers=[])


def test_register_rejected_when_not_published(db):
    ev = _event(db, capacity=5)
    ev.status = "draft"
    db.flush()
    with pytest.raises(registration_service.RegistrationError):
        registration_service.register(db, event_id=ev.id, user_id=_user(db, 1).id, registered_by=None, answers=[])


def test_register_outside_window_raises(db):
    ev = _event(db, capacity=5, registration_close_at=datetime(2020, 1, 1, 0, 0))
    with pytest.raises(registration_service.RegistrationError):
        registration_service.register(db, event_id=ev.id, user_id=_user(db, 1).id, registered_by=None, answers=[])


def test_required_answer_missing_raises(db):
    from app.schemas.custom_field import CustomFieldIn
    from app.services import custom_field_service
    ev = _event(db, capacity=5)
    custom_field_service.replace_set(db, ev.id, [
        CustomFieldIn(label="Nome", field_type="text", required=True, position=0, options=[]),
    ])
    with pytest.raises(registration_service.RegistrationError):
        registration_service.register(db, event_id=ev.id, user_id=_user(db, 1).id, registered_by=None, answers=[])
