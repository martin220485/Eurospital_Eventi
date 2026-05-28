from datetime import datetime, timedelta

from app.services import event_service, user_service


def _employee_cookie(client, db):
    u = user_service.create_user(db, email="emp@x.it", username="emp", password="pw12345")
    db.flush()
    pair = client.post("/api/auth/login", json={"identifier": "emp", "password": "pw12345"}).json()
    client.cookies.set("access_token", pair["access_token"])
    return u


def _published(db, **over):
    start = datetime(2030, 1, 1, 9, 0)
    data = dict(title="Pub", start_at=start, end_at=start + timedelta(hours=1), mode="physical")
    data.update(over)
    ev = event_service.create(db, created_by=None, **data)
    ev.status = "published"
    db.flush()
    return ev


def test_catalog_list_no_admin_permission_needed(client, db):
    _published(db)
    _employee_cookie(client, db)
    r = client.get("/api/catalog/events")
    assert r.status_code == 200
    assert r.json()["total"] >= 1


def test_catalog_detail_includes_fields_and_status(client, db):
    ev = _published(db, capacity=5)
    _employee_cookie(client, db)
    r = client.get(f"/api/catalog/events/{ev.id}")
    assert r.status_code == 200
    body = r.json()
    assert body["available_spots"] == 5
    assert body["my_status"] is None
    assert "custom_fields" in body


def test_catalog_detail_404_on_draft(client, db):
    start = datetime(2030, 1, 1, 9, 0)
    ev = event_service.create(db, created_by=None, title="D", start_at=start,
                              end_at=start + timedelta(hours=1), mode="physical")
    db.flush()
    _employee_cookie(client, db)
    assert client.get(f"/api/catalog/events/{ev.id}").status_code == 404


def test_my_events(client, db):
    ev = _published(db, capacity=5)
    _employee_cookie(client, db)
    client.post(f"/api/events/{ev.id}/registrations", json={"answers": []})
    r = client.get("/api/catalog/my-events")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["event_title"] == "Pub"
