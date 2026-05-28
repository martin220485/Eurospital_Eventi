from datetime import datetime, timedelta
from unittest.mock import patch

from app.services import event_service, user_service


def _ensure_user(db, username, super_admin=False):
    from app.models import User
    u = db.query(User).filter_by(username=username).one_or_none()
    if u is None:
        u = user_service.create_user(db, email=f"{username}@x.it", username=username, password="pw12345")
        if super_admin:
            user_service.assign_role(db, u, "super_admin")
        db.flush()
    return u


def _login(client, db, *, username, super_admin=False):
    u = _ensure_user(db, username, super_admin)
    pair = client.post("/api/auth/login", json={"identifier": username, "password": "pw12345"}).json()
    client.cookies.set("access_token", pair["access_token"])
    return u


def _published_event(db, **over):
    start = datetime(2030, 1, 1, 9, 0)
    data = dict(title="E", start_at=start, end_at=start + timedelta(hours=1), mode="physical")
    data.update(over)
    ev = event_service.create(db, created_by=None, **data)
    ev.status = "published"
    db.flush()
    return ev


@patch("app.workers.tasks.send_notification")
def test_register_confirmed_enqueues_confirmation(mock_task, client, db):
    ev = _published_event(db, capacity=5)
    _login(client, db, username="emp1")
    r = client.post(f"/api/events/{ev.id}/registrations", json={"answers": []})
    assert r.status_code == 201
    mock_task.delay.assert_called_once()
    kwargs = mock_task.delay.call_args.kwargs
    assert kwargs["template_code"] == "registration_confirmed"
    assert kwargs["registration_id"] == r.json()["id"]


@patch("app.workers.tasks.send_notification")
def test_register_waitlisted_enqueues_waitlisted(mock_task, client, db):
    ev = _published_event(db, capacity=1, waitlist_enabled=True)
    u1 = _login(client, db, username="empA")
    client.post(f"/api/events/{ev.id}/registrations", json={"answers": []})
    mock_task.delay.reset_mock()
    # second user → waitlist
    _login(client, db, username="empB")
    r = client.post(f"/api/events/{ev.id}/registrations", json={"answers": []})
    assert r.status_code == 201
    assert r.json()["status"] == "waitlisted"
    mock_task.delay.assert_called_once()
    assert mock_task.delay.call_args.kwargs["template_code"] == "registration_waitlisted"
    _ = u1  # silence


@patch("app.workers.tasks.send_notification")
def test_cancel_enqueues_cancelled_and_promotion(mock_task, client, db):
    ev = _published_event(db, capacity=1, waitlist_enabled=True, cancellation_allowed=True)
    _login(client, db, username="empA")
    rA = client.post(f"/api/events/{ev.id}/registrations", json={"answers": []})
    a_id = rA.json()["id"]
    _login(client, db, username="empB")
    rB = client.post(f"/api/events/{ev.id}/registrations", json={"answers": []})
    b_id = rB.json()["id"]
    assert rB.json()["status"] == "waitlisted"

    mock_task.delay.reset_mock()
    _login(client, db, username="empA")  # back to A to cancel
    r = client.post(f"/api/registrations/{a_id}/cancel")
    assert r.status_code == 200
    codes = [c.kwargs["template_code"] for c in mock_task.delay.call_args_list]
    assert "registration_cancelled" in codes
    assert "registration_promoted" in codes
    promoted_call = [c for c in mock_task.delay.call_args_list
                     if c.kwargs["template_code"] == "registration_promoted"][0]
    assert promoted_call.kwargs["registration_id"] == b_id


@patch("app.workers.tasks.send_notification")
def test_cancel_without_waitlist_only_one_email(mock_task, client, db):
    ev = _published_event(db, capacity=5, cancellation_allowed=True)
    _login(client, db, username="empSolo")
    r1 = client.post(f"/api/events/{ev.id}/registrations", json={"answers": []})
    rid = r1.json()["id"]
    mock_task.delay.reset_mock()
    r2 = client.post(f"/api/registrations/{rid}/cancel")
    assert r2.status_code == 200
    codes = [c.kwargs["template_code"] for c in mock_task.delay.call_args_list]
    assert codes == ["registration_cancelled"]
