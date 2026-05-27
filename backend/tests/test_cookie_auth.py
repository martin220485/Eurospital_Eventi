from app.services import user_service


def _seed_admin(db):
    u = user_service.create_user(db, email="a@x.it", username="admin", password="pw12345")
    user_service.assign_role(db, u, "super_admin")
    db.flush()
    return u


def test_me_via_cookie(client, db):
    _seed_admin(db)
    pair = client.post(
        "/api/auth/login", json={"identifier": "admin", "password": "pw12345"}
    ).json()
    # no Authorization header; access token in cookie instead
    client.cookies.set("access_token", pair["access_token"])
    r = client.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["username"] == "admin"


def test_me_no_token_401(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401
