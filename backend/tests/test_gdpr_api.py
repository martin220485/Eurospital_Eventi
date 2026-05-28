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


def _ev(db):
    start = datetime.utcnow() + timedelta(days=2)
    ev = event_service.create(
        db, created_by=None, title="GDPR Ev", start_at=start,
        end_at=start + timedelta(hours=1), mode="physical",
    )
    ev.status = "published"
    db.flush()
    return ev


def test_data_export_returns_user_data(client, db):
    u = _ensure(db, "exp1")
    ev = _ev(db)
    registration_service.register(db, event_id=ev.id, user_id=u.id,
                                  registered_by=None, answers=[])
    _login(client, db, username="exp1")
    r = client.get("/api/me/data-export")
    assert r.status_code == 200
    data = r.json()
    assert data["user"]["username"] == "exp1"
    assert len(data["registrations"]) == 1
    assert data["registrations"][0]["event_title"] == "GDPR Ev"


def test_anonymize_requires_perm(client, db):
    target = _ensure(db, "victim")
    _login(client, db, username="emp")
    r = client.post(f"/api/admin/users/{target.id}/anonymize")
    assert r.status_code == 403


def test_anonymize_replaces_pii(client, db):
    target = _ensure(db, "tgt")
    _login(client, db, username="admin", super_admin=True)
    r = client.post(f"/api/admin/users/{target.id}/anonymize")
    assert r.status_code == 200
    from app.models import User
    db.expire_all()
    refreshed = db.get(User, target.id)
    assert refreshed.email.startswith("deleted-")
    assert refreshed.full_name is None
    assert refreshed.is_active is False
    assert refreshed.auth_source == "anonymized"


def test_anonymize_writes_audit_entry(client, db):
    target = _ensure(db, "tgt2")
    _login(client, db, username="admin", super_admin=True)
    client.post(f"/api/admin/users/{target.id}/anonymize")
    from app.models import AuditLog
    row = db.query(AuditLog).filter_by(action="user.anonymize", target_id=target.id).one()
    assert row.target_type == "user"


def test_audit_logs_list_requires_perm(client, db):
    _login(client, db, username="empx")
    assert client.get("/api/admin/audit-logs").status_code == 403


def test_audit_logs_list_returns_items(client, db):
    _login(client, db, username="admin", super_admin=True)
    # do a login to write an audit row
    r = client.get("/api/admin/audit-logs")
    assert r.status_code == 200
    items = r.json()["items"]
    assert any(it["action"] == "auth.login.success" for it in items)
