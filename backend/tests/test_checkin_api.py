from datetime import datetime, timedelta

from app.services import event_service, user_service


def _admin(client, db):
    u = user_service.create_user(db, email="a@x.it", username="admin", password="pw12345")
    user_service.assign_role(db, u, "super_admin")
    db.flush()
    pair = client.post("/api/auth/login", json={"identifier": "admin", "password": "pw12345"}).json()
    client.cookies.set("access_token", pair["access_token"])


def _event(db):
    start = datetime(2030, 1, 1, 9, 0)
    ev = event_service.create(db, created_by=None, title="E", start_at=start,
                              end_at=start + timedelta(hours=1), mode="physical", capacity=5)
    ev.status = "published"
    db.flush()
    return ev


def test_checkin_flow(client, db):
    _admin(client, db)
    ev = _event(db)
    rid = client.post(f"/api/events/{ev.id}/registrations", json={"answers": []}).json()["id"]
    tok = client.get(f"/api/registrations/{rid}/token").json()["token"]
    r = client.post("/api/checkin", json={"token": tok})
    assert r.status_code == 200
    assert r.json()["status"] == "attended"
    r2 = client.post("/api/checkin", json={"token": tok})
    assert r2.status_code == 409


def test_checkin_bad_token_400(client, db):
    _admin(client, db)
    r = client.post("/api/checkin", json={"token": "garbage"})
    assert r.status_code == 400


def test_qr_returns_png(client, db):
    _admin(client, db)
    ev = _event(db)
    rid = client.post(f"/api/events/{ev.id}/registrations", json={"answers": []}).json()["id"]
    r = client.get(f"/api/registrations/{rid}/qr")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
