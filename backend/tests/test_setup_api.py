TOKEN = {"X-Setup-Token": "dev-setup-token-change-me"}


def test_status_public(client):
    r = client.get("/api/setup/status")
    assert r.status_code == 200
    assert r.json()["setup_completed"] is False


def test_endpoints_require_token(client):
    r = client.post("/api/setup/db/test")
    assert r.status_code == 403


def test_db_test_with_token(client):
    r = client.post("/api/setup/db/test", headers=TOKEN)
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_create_admin_and_complete(client):
    r = client.post(
        "/api/setup/admin",
        headers=TOKEN,
        json={"email": "admin@x.it", "username": "admin", "password": "StrongPass1!"},
    )
    assert r.status_code == 201
    r2 = client.post("/api/setup/complete", headers=TOKEN)
    assert r2.status_code == 200
    # after completion, gated endpoints 409
    r3 = client.post("/api/setup/db/test", headers=TOKEN)
    assert r3.status_code == 409


def test_save_smtp_masks_password(client):
    r = client.put(
        "/api/setup/smtp",
        headers=TOKEN,
        json={"host": "smtp.x", "port": 587, "from_address": "a@x.it", "password": "p"},
    )
    assert r.status_code == 200
    assert r.json()["password"] == "****"


def test_smtp_test_unreachable_returns_error(client):
    r = client.post(
        "/api/setup/smtp/test",
        headers=TOKEN,
        json={"host": "127.0.0.1", "port": 59999, "from_address": "a@x.it"},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is False


def test_ad_test_unreachable_returns_error(client):
    r = client.post(
        "/api/setup/ad/test",
        headers=TOKEN,
        json={"server_uri": "ldap://127.0.0.1:59999", "bind_dn": "cn=x", "bind_pw": "y"},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is False
