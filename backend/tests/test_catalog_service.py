from datetime import datetime, timedelta

import pytest

from app.services import catalog_service, event_service, registration_service, user_service, visibility_service


def _event(db, **over):
    start = datetime(2030, 1, 1, 9, 0)
    data = dict(title="E", start_at=start, end_at=start + timedelta(hours=1), mode="physical")
    data.update(over)
    ev = event_service.create(db, created_by=None, **data)
    db.flush()
    return ev


def test_list_hides_draft_and_restricted(db):
    pub = _event(db, title="Pub")
    pub.status = "published"
    _event(db, title="Draft")  # stays draft
    restricted = _event(db, title="Restr")
    restricted.status = "published"
    db.flush()
    visibility_service.set_visibility(db, restricted.id, "restricted", ["Reparto X"])
    events, total = catalog_service.list_visible_events(
        db, category_id=None, q=None, date_from=None, date_to=None, page=1, page_size=50
    )
    titles = {e.title for e in events}
    assert "Pub" in titles
    assert "Draft" not in titles
    assert "Restr" not in titles


def test_available_spots(db):
    ev = _event(db, capacity=2)
    ev.status = "published"
    db.flush()
    assert catalog_service.available_spots(db, ev) == 2
    registration_service.register(db, event_id=ev.id, user_id=user_service.create_user(
        db, email="a@x.it", username="a", password="pw12345").id, registered_by=None, answers=[])
    assert catalog_service.available_spots(db, ev) == 1


def test_available_spots_unlimited(db):
    ev = _event(db, capacity=None)
    ev.status = "published"
    db.flush()
    assert catalog_service.available_spots(db, ev) is None


def test_my_status_reflects_registration(db):
    ev = _event(db, capacity=5)
    ev.status = "published"
    db.flush()
    u = user_service.create_user(db, email="b@x.it", username="b", password="pw12345")
    assert catalog_service.my_status(db, ev.id, u.id) is None
    registration_service.register(db, event_id=ev.id, user_id=u.id, registered_by=None, answers=[])
    assert catalog_service.my_status(db, ev.id, u.id) == "confirmed"


def test_get_visible_event_404_on_draft(db):
    ev = _event(db, title="D")  # draft
    with pytest.raises(catalog_service.CatalogError):
        catalog_service.get_visible_event(db, ev.id)
