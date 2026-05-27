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


def test_set_and_get_visibility(client, db):
    _admin_cookie(client, db)
    eid = _event(client)
    r = client.put(f"/api/events/{eid}/visibility",
                   json={"mode": "restricted", "groups": ["Reparto A", "Reparto B"]})
    assert r.status_code == 200
    g = client.get(f"/api/events/{eid}/visibility").json()
    assert g["mode"] == "restricted"
    assert set(g["groups"]) == {"Reparto A", "Reparto B"}


def test_all_mode_clears_groups(client, db):
    _admin_cookie(client, db)
    eid = _event(client)
    client.put(f"/api/events/{eid}/visibility", json={"mode": "restricted", "groups": ["X"]})
    client.put(f"/api/events/{eid}/visibility", json={"mode": "all", "groups": []})
    g = client.get(f"/api/events/{eid}/visibility").json()
    assert g["mode"] == "all"
    assert g["groups"] == []
