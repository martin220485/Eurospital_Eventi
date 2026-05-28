from datetime import datetime, timedelta

from app.models import EventVisibility, User
from app.services import catalog_service, event_service, user_service


def _ev(db, **over):
    start = datetime.utcnow() + timedelta(days=3)
    data = dict(title="E", start_at=start, end_at=start + timedelta(hours=1), mode="physical")
    data.update(over)
    ev = event_service.create(db, created_by=None, **data)
    ev.status = "published"
    db.flush()
    return ev


def _set_restricted(db, event_id, groups):
    for g in groups:
        db.add(EventVisibility(event_id=event_id, mode="restricted", dept_or_group=g))
    db.flush()


def _ldap_user(db, *, username, groups=None, department=None):
    u = user_service.create_user(db, email=f"{username}@x", username=username, password="pw123456")
    u.auth_source = "ldap"
    u.ldap_groups = groups or []
    u.department = department
    db.flush()
    return u


def test_ldap_user_sees_restricted_when_group_matches(db):
    ev = _ev(db, capacity=10)
    _set_restricted(db, ev.id, ["IT"])
    u = _ldap_user(db, username="jdoe", groups=["IT"])
    events, total = catalog_service.list_visible_events(
        db, category_id=None, q=None, date_from=None, date_to=None,
        page=1, page_size=10, user=u,
    )
    assert total == 1
    assert events[0].id == ev.id


def test_ldap_user_does_not_see_restricted_when_no_match(db):
    ev = _ev(db, capacity=10)
    _set_restricted(db, ev.id, ["IT"])
    u = _ldap_user(db, username="hr1", groups=["HR"])
    events, total = catalog_service.list_visible_events(
        db, category_id=None, q=None, date_from=None, date_to=None,
        page=1, page_size=10, user=u,
    )
    assert total == 0


def test_ldap_user_match_via_department(db):
    ev = _ev(db, capacity=10)
    _set_restricted(db, ev.id, ["Marketing"])
    u = _ldap_user(db, username="m1", groups=[], department="Marketing")
    events, _ = catalog_service.list_visible_events(
        db, category_id=None, q=None, date_from=None, date_to=None,
        page=1, page_size=10, user=u,
    )
    assert len(events) == 1


def test_local_user_never_sees_restricted(db):
    ev = _ev(db, capacity=10)
    _set_restricted(db, ev.id, ["IT"])
    u = user_service.create_user(db, email="local@x", username="local", password="pw123456")
    # local user (default auth_source='local')
    events, total = catalog_service.list_visible_events(
        db, category_id=None, q=None, date_from=None, date_to=None,
        page=1, page_size=10, user=u,
    )
    assert total == 0


def test_unrestricted_event_visible_to_all(db):
    ev = _ev(db, capacity=10)
    u = _ldap_user(db, username="x", groups=["RandomGroup"])
    events, total = catalog_service.list_visible_events(
        db, category_id=None, q=None, date_from=None, date_to=None,
        page=1, page_size=10, user=u,
    )
    assert total == 1
