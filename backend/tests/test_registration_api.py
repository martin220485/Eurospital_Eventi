from datetime import datetime, timedelta

from app.services import event_service, user_service


def _cookie(client, db, *, username, super_admin):
    u = user_service.create_user(db, email=f"{username}@x.it", username=username, password="pw12345")
    if super_admin:
        user_service.assign_role(db, u, "super_admin")
    db.flush()
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


def test_self_register_and_me(client, db):
    ev = _published_event(db, capacity=5)
    _cookie(client, db, username="emp", super_admin=False)
    r = client.post(f"/api/events/{ev.id}/registrations", json={"answers": []})
    assert r.status_code == 201
    assert r.json()["status"] == "confirmed"
    me = client.get("/api/me/registrations")
    assert me.status_code == 200
    assert len(me.json()) == 1


def test_list_requires_permission(client, db):
    ev = _published_event(db, capacity=5)
    _cookie(client, db, username="emp", super_admin=False)
    r = client.get(f"/api/events/{ev.id}/registrations")
    assert r.status_code == 403


def test_admin_list_and_cancel(client, db):
    ev = _published_event(db, capacity=5)
    _cookie(client, db, username="admin", super_admin=True)
    rid = client.post(f"/api/events/{ev.id}/registrations", json={"answers": []}).json()["id"]
    lst = client.get(f"/api/events/{ev.id}/registrations")
    assert lst.status_code == 200 and lst.json()["total"] == 1
    c = client.post(f"/api/registrations/{rid}/cancel")
    assert c.status_code == 200
    assert c.json()["status"] == "cancelled"


def test_cannot_register_other_user_without_permission(client, db):
    ev = _published_event(db, capacity=5)
    other = user_service.create_user(db, email="o@x.it", username="other", password="pw12345")
    db.flush()
    _cookie(client, db, username="emp", super_admin=False)
    r = client.post(f"/api/events/{ev.id}/registrations", json={"user_id": other.id, "answers": []})
    assert r.status_code == 403
