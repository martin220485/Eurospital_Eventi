from app.services import user_service


def _seed_admin(db):
    user = user_service.create_user(
        db, email="admin@x.it", username="admin", password="pw12345", full_name="Admin"
    )
    user_service.assign_role(db, user, "super_admin")
    db.flush()
    return user


def test_login_returns_token_pair(client, db):
    _seed_admin(db)
    resp = client.post("/api/auth/login", json={"identifier": "admin", "password": "pw12345"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"] and body["refresh_token"]


def test_login_wrong_password_401(client, db):
    _seed_admin(db)
    resp = client.post("/api/auth/login", json={"identifier": "admin", "password": "nope"})
    assert resp.status_code == 401


def test_me_returns_user_with_permissions(client, db):
    _seed_admin(db)
    tok = client.post(
        "/api/auth/login", json={"identifier": "admin", "password": "pw12345"}
    ).json()["access_token"]
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["username"] == "admin"
    assert "super_admin" in body["roles"]
    assert "users.read" in body["permissions"]


def test_me_requires_auth(client):
    assert client.get("/api/auth/me").status_code in (401, 403)


def test_refresh_rotates_and_revokes(client, db):
    _seed_admin(db)
    pair = client.post(
        "/api/auth/login", json={"identifier": "admin", "password": "pw12345"}
    ).json()
    r1 = client.post("/api/auth/refresh", json={"refresh_token": pair["refresh_token"]})
    assert r1.status_code == 200
    r2 = client.post("/api/auth/refresh", json={"refresh_token": pair["refresh_token"]})
    assert r2.status_code == 401


def test_logout_revokes_refresh(client, db):
    _seed_admin(db)
    pair = client.post(
        "/api/auth/login", json={"identifier": "admin", "password": "pw12345"}
    ).json()
    r_logout = client.post("/api/auth/logout", json={"refresh_token": pair["refresh_token"]})
    assert r_logout.status_code == 204
    r_after = client.post("/api/auth/refresh", json={"refresh_token": pair["refresh_token"]})
    assert r_after.status_code == 401
