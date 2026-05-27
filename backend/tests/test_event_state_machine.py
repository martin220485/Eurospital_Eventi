from datetime import datetime, timedelta

import pytest

from app.models import Event
from app.services import event_service


def _draft(db, **over):
    start = datetime(2030, 1, 1, 9, 0)
    data = dict(title="E", start_at=start, end_at=start + timedelta(hours=1), mode="physical")
    data.update(over)
    return event_service.create(db, created_by=None, **data)


def test_legal_transitions(db):
    ev = _draft(db)
    event_service.transition(db, ev.id, "published", can_publish=True)
    assert db.get(Event, ev.id).status == "published"
    event_service.transition(db, ev.id, "suspended", can_publish=True)
    assert db.get(Event, ev.id).status == "suspended"
    event_service.transition(db, ev.id, "archived", can_publish=True)
    assert db.get(Event, ev.id).status == "archived"


def test_illegal_transition_raises(db):
    ev = _draft(db)
    with pytest.raises(event_service.EventError):
        event_service.transition(db, ev.id, "suspended", can_publish=True)  # draft->suspended illegal


def test_publish_requires_permission(db):
    ev = _draft(db)
    with pytest.raises(event_service.EventError):
        event_service.transition(db, ev.id, "published", can_publish=False)


def test_publish_validates_dates(db):
    start = datetime(2030, 1, 1, 9, 0)
    ev = _draft(db, end_at=start - timedelta(hours=1))  # end before start
    with pytest.raises(event_service.EventError):
        event_service.transition(db, ev.id, "published", can_publish=True)


def test_duplicate_creates_draft(db):
    ev = _draft(db, title="Original")
    event_service.transition(db, ev.id, "published", can_publish=True)
    dup = event_service.duplicate(db, ev.id, created_by=None)
    assert dup.id != ev.id
    assert dup.status == "draft"
    assert dup.title.startswith("Original")
