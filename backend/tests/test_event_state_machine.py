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


def test_duplicate_copies_fields_and_visibility(db):
    from app.schemas.custom_field import CustomFieldIn, OptionIn
    from app.services import custom_field_service, visibility_service

    ev = _draft(db, title="Src")
    custom_field_service.replace_set(db, ev.id, [
        CustomFieldIn(label="Taglia", field_type="select", position=0,
                      options=[OptionIn(label="S", value="s", position=0)]),
    ])
    visibility_service.set_visibility(db, ev.id, "restricted", ["Reparto A"])
    dup = event_service.duplicate(db, ev.id, created_by=None)
    fields = custom_field_service.get_fields(db, dup.id)
    assert len(fields) == 1
    assert custom_field_service.get_options(db, fields[0].id)[0].value == "s"
    mode, groups = visibility_service.get_visibility(db, dup.id)
    assert mode == "restricted" and groups == ["Reparto A"]


def test_transition_publish_without_permission_422_via_api(client, db):
    from datetime import datetime, timedelta

    from sqlalchemy import select

    from app.models import Permission, Role
    from app.services import user_service

    role = Role(name="event_editor")
    db.add(role)
    db.flush()
    perms = db.scalars(
        select(Permission).where(Permission.code.in_(["events.read", "events.write"]))
    ).all()
    role.permissions.extend(perms)
    u = user_service.create_user(db, email="ed@x.it", username="editor", password="pw12345")
    u.roles.append(role)
    db.flush()
    pair = client.post(
        "/api/auth/login", json={"identifier": "editor", "password": "pw12345"}
    ).json()
    client.cookies.set("access_token", pair["access_token"])
    start = datetime(2030, 1, 1, 9, 0)
    eid = client.post("/api/events", json={
        "title": "E", "start_at": start.isoformat(),
        "end_at": (start + timedelta(hours=1)).isoformat(), "mode": "physical",
    }).json()["id"]
    r = client.post(f"/api/events/{eid}/transition", json={"target": "published"})
    assert r.status_code == 422
