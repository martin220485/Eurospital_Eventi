from app.services import user_service


def _admin_cookie(client, db):
    u = user_service.create_user(db, email="a@x.it", username="admin", password="pw12345")
    user_service.assign_role(db, u, "super_admin")
    db.flush()
    pair = client.post("/api/auth/login", json={"identifier": "admin", "password": "pw12345"}).json()
    client.cookies.set("access_token", pair["access_token"])


def _user_cookie(client, db):
    u = user_service.create_user(db, email="u@x.it", username="user", password="pw12345")
    db.flush()
    pair = client.post("/api/auth/login", json={"identifier": "user", "password": "pw12345"}).json()
    client.cookies.set("access_token", pair["access_token"])


def test_create_list_category(client, db):
    _admin_cookie(client, db)
    r = client.post("/api/categories", json={"name": "Formazione", "color": "#123456"})
    assert r.status_code == 201
    r2 = client.get("/api/categories")
    assert r2.status_code == 200
    assert any(c["name"] == "Formazione" for c in r2.json())


def test_create_requires_permission(client, db):
    _user_cookie(client, db)
    r = client.post("/api/categories", json={"name": "X"})
    assert r.status_code == 403


def test_duplicate_name_409(client, db):
    _admin_cookie(client, db)
    client.post("/api/categories", json={"name": "Dup"})
    r = client.post("/api/categories", json={"name": "Dup"})
    assert r.status_code == 409


def test_delete_category_in_use_409(client, db):
    from datetime import datetime, timedelta

    _admin_cookie(client, db)
    cid = client.post("/api/categories", json={"name": "Used"}).json()["id"]
    start = datetime(2030, 1, 1, 9, 0)
    client.post("/api/events", json={
        "title": "E", "start_at": start.isoformat(),
        "end_at": (start + timedelta(hours=1)).isoformat(), "mode": "physical",
        "category_id": cid,
    })
    r = client.delete(f"/api/categories/{cid}")
    assert r.status_code == 409
