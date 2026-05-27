import io
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


def test_upload_download_delete(client, db, tmp_path, monkeypatch):
    from app.core import config
    monkeypatch.setattr(config.get_settings(), "upload_dir", str(tmp_path), raising=False)
    _admin_cookie(client, db)
    eid = _event(client)
    files = {"file": ("logo.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 50), "image/png")}
    r = client.post(f"/api/events/{eid}/attachments", files=files, data={"kind": "banner"})
    assert r.status_code == 201
    aid = r.json()["id"]
    d = client.get(f"/api/attachments/{aid}/download")
    assert d.status_code == 200
    x = client.delete(f"/api/attachments/{aid}")
    assert x.status_code == 204


def test_reject_bad_mime(client, db, tmp_path, monkeypatch):
    from app.core import config
    monkeypatch.setattr(config.get_settings(), "upload_dir", str(tmp_path), raising=False)
    _admin_cookie(client, db)
    eid = _event(client)
    files = {"file": ("evil.exe", io.BytesIO(b"MZ"), "application/x-msdownload")}
    r = client.post(f"/api/events/{eid}/attachments", files=files, data={"kind": "attachment"})
    assert r.status_code == 422
