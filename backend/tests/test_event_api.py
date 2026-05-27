from datetime import datetime, timedelta

from app.services import user_service


def _admin_cookie(client, db):
    u = user_service.create_user(db, email="a@x.it", username="admin", password="pw12345")
    user_service.assign_role(db, u, "super_admin")
    db.flush()
    pair = client.post("/api/auth/login", json={"identifier": "admin", "password": "pw12345"}).json()
    client.cookies.set("access_token", pair["access_token"])


def _event_payload():
    start = datetime(2030, 1, 1, 9, 0)
    return {
        "title": "Corso",
        "start_at": start.isoformat(),
        "end_at": (start + timedelta(hours=2)).isoformat(),
        "mode": "physical",
    }


def test_create_event_is_draft(client, db):
    _admin_cookie(client, db)
    r = client.post("/api/events", json=_event_payload())
    assert r.status_code == 201
    assert r.json()["status"] == "draft"


def test_list_and_filter(client, db):
    _admin_cookie(client, db)
    client.post("/api/events", json=_event_payload())
    r = client.get("/api/events?status=draft")
    assert r.status_code == 200
    assert r.json()["total"] >= 1
    assert len(r.json()["items"]) >= 1


def test_patch_event_sanitizes_html(client, db):
    _admin_cookie(client, db)
    eid = client.post("/api/events", json=_event_payload()).json()["id"]
    r = client.patch(f"/api/events/{eid}", json={"description": "<p>ok</p><script>x</script>"})
    assert r.status_code == 200
    assert "<script>" not in r.json()["description"]


def test_delete_only_draft(client, db):
    _admin_cookie(client, db)
    eid = client.post("/api/events", json=_event_payload()).json()["id"]
    r = client.delete(f"/api/events/{eid}")
    assert r.status_code == 204
