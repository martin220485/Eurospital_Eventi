from app.services import user_service


def _cookie(client, db):
    user_service.create_user(db, email="u@x.it", username="u", password="oldpass123")
    db.flush()
    pair = client.post("/api/auth/login", json={"identifier": "u", "password": "oldpass123"}).json()
    client.cookies.set("access_token", pair["access_token"])


def test_change_password_wrong_old_400(client, db):
    _cookie(client, db)
    r = client.post("/api/auth/change-password",
                    json={"old_password": "WRONG", "new_password": "newpass123"})
    assert r.status_code == 400


def test_change_password_success_then_login(client, db):
    _cookie(client, db)
    r = client.post("/api/auth/change-password",
                    json={"old_password": "oldpass123", "new_password": "newpass123"})
    assert r.status_code == 204
    assert client.post("/api/auth/login", json={"identifier": "u", "password": "oldpass123"}).status_code == 401
    assert client.post("/api/auth/login", json={"identifier": "u", "password": "newpass123"}).status_code == 200
