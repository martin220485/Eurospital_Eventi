from datetime import datetime, timedelta

from app.services import event_service, registration_service, user_service


def _ensure(db, username, super_admin=False):
    from app.models import User
    u = db.query(User).filter_by(username=username).one_or_none()
    if u is None:
        u = user_service.create_user(db, email=f"{username}@x.it", username=username, password="pw12345")
        if super_admin:
            user_service.assign_role(db, u, "super_admin")
        db.flush()
    return u


def _login(client, db, *, username, super_admin=False):
    _ensure(db, username, super_admin)
    pair = client.post("/api/auth/login", json={"identifier": username, "password": "pw12345"}).json()
    client.cookies.set("access_token", pair["access_token"])


def _published_event(db, **over):
    start = datetime.utcnow() + timedelta(days=3)
    data = dict(title="E", start_at=start, end_at=start + timedelta(hours=1), mode="physical")
    data.update(over)
    ev = event_service.create(db, created_by=None, **data)
    ev.status = "published"
    db.flush()
    return ev


def test_kpis_requires_permission(client, db):
    _login(client, db, username="emp")
    assert client.get("/api/admin/reports/kpis").status_code == 403


def test_kpis_empty_returns_zero(client, db):
    _login(client, db, username="admin", super_admin=True)
    r = client.get("/api/admin/reports/kpis")
    assert r.status_code == 200
    data = r.json()
    assert data["events_total"] == 0
    assert data["attendance_rate"] == 0.0


def test_event_report_404(client, db):
    _login(client, db, username="admin", super_admin=True)
    assert client.get("/api/admin/reports/events/999999").status_code == 404


def test_event_report_ok(client, db):
    ev = _published_event(db, capacity=5)
    u = _ensure(db, "emp1")
    registration_service.register(db, event_id=ev.id, user_id=u.id, registered_by=None, answers=[])
    db.flush()
    _login(client, db, username="admin", super_admin=True)
    r = client.get(f"/api/admin/reports/events/{ev.id}")
    assert r.status_code == 200
    data = r.json()
    assert data["event"]["id"] == ev.id
    assert data["counts"]["confirmed"] == 1


def test_event_registrations_csv(client, db):
    ev = _published_event(db, capacity=5)
    u = _ensure(db, "emp2")
    registration_service.register(db, event_id=ev.id, user_id=u.id, registered_by=None, answers=[])
    db.flush()
    _login(client, db, username="admin", super_admin=True)
    r = client.get(f"/api/admin/reports/events/{ev.id}/registrations.csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    body = r.content
    assert body.startswith(b"\xef\xbb\xbf")
    text = body.decode("utf-8-sig")
    assert "user_email" in text
    assert "emp2@x.it" in text


def test_csv_requires_permission(client, db):
    _login(client, db, username="emp_no_perm")
    assert client.get("/api/admin/reports/registrations.csv").status_code == 403
