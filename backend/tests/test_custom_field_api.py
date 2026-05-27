from datetime import datetime, timedelta

from app.services import user_service


def _admin_cookie(client, db):
    u = user_service.create_user(db, email="a@x.it", username="admin", password="pw12345")
    user_service.assign_role(db, u, "super_admin")
    db.flush()
    pair = client.post("/api/auth/login", json={"identifier": "admin", "password": "pw12345"}).json()
    client.cookies.set("access_token", pair["access_token"])


def _event(client):
    start = datetime(2030, 1, 1, 9, 0)
    return client.post("/api/events", json={
        "title": "E", "start_at": start.isoformat(),
        "end_at": (start + timedelta(hours=1)).isoformat(), "mode": "physical",
    }).json()["id"]


def test_put_and_get_fields(client, db):
    _admin_cookie(client, db)
    eid = _event(client)
    body = {"fields": [
        {"label": "Nome", "field_type": "text", "required": True, "position": 0, "options": []},
        {"label": "Taglia", "field_type": "select", "required": False, "position": 1,
         "options": [{"label": "S", "value": "s", "position": 0},
                     {"label": "M", "value": "m", "position": 1}]},
    ]}
    r = client.put(f"/api/events/{eid}/fields", json=body)
    assert r.status_code == 200
    g = client.get(f"/api/events/{eid}/fields")
    assert len(g.json()) == 2
    assert g.json()[1]["options"][0]["value"] == "s"


def test_select_without_options_422(client, db):
    _admin_cookie(client, db)
    eid = _event(client)
    body = {"fields": [{"label": "X", "field_type": "select", "required": False, "position": 0, "options": []}]}
    r = client.put(f"/api/events/{eid}/fields", json=body)
    assert r.status_code == 422


def test_put_replaces_previous_set(client, db):
    _admin_cookie(client, db)
    eid = _event(client)
    client.put(f"/api/events/{eid}/fields", json={"fields": [
        {"label": "A", "field_type": "text", "required": False, "position": 0, "options": []}]})
    client.put(f"/api/events/{eid}/fields", json={"fields": [
        {"label": "B", "field_type": "text", "required": False, "position": 0, "options": []}]})
    g = client.get(f"/api/events/{eid}/fields")
    labels = [f["label"] for f in g.json()]
    assert labels == ["B"]
