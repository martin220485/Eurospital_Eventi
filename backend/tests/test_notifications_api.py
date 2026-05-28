from unittest.mock import patch

from app.services import user_service


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


def test_list_templates_requires_permission(client, db):
    _login(client, db, username="emp")  # no perm
    r = client.get("/api/admin/notification-templates")
    assert r.status_code == 403


def test_list_templates_with_permission(client, db):
    _login(client, db, username="admin", super_admin=True)
    r = client.get("/api/admin/notification-templates")
    assert r.status_code == 200
    codes = [t["code"] for t in r.json()]
    assert "registration_confirmed" in codes


def test_get_template_404(client, db):
    _login(client, db, username="admin", super_admin=True)
    assert client.get("/api/admin/notification-templates/missing").status_code == 404


def test_update_template_sanitizes_html(client, db):
    _login(client, db, username="admin", super_admin=True)
    r = client.put(
        "/api/admin/notification-templates/registration_confirmed",
        json={"subject": "Nuovo soggetto {{ event.title }}",
              "body_html": "<p>Ok <script>alert(1)</script></p>"},
    )
    assert r.status_code == 200
    assert "<script>" not in r.json()["body_html"]
    # rilettura
    r2 = client.get("/api/admin/notification-templates/registration_confirmed")
    assert r2.json()["subject"] == "Nuovo soggetto {{ event.title }}"


def test_preview_template_renders_sample(client, db):
    _login(client, db, username="admin", super_admin=True)
    r = client.post(
        "/api/admin/notification-templates/registration_confirmed/preview",
        json={},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["subject_rendered"]
    assert "Mario Rossi" in data["body_rendered"] or "Workshop demo" in data["body_rendered"]


def test_list_logs_empty(client, db):
    _login(client, db, username="admin", super_admin=True)
    r = client.get("/api/admin/notification-logs")
    assert r.status_code == 200
    assert r.json() == {"items": [], "total": 0}


def test_list_logs_filters(client, db):
    from app.models import NotificationLog
    admin = _ensure(db, "admin", super_admin=True)
    db.add_all([
        NotificationLog(template_code="registration_confirmed", user_id=admin.id,
                        to_address="a@x", subject="s1", status="sent", attempts=1),
        NotificationLog(template_code="registration_cancelled", user_id=admin.id,
                        to_address="a@x", subject="s2", status="failed", attempts=2),
    ])
    db.flush()
    _login(client, db, username="admin", super_admin=True)
    r = client.get("/api/admin/notification-logs?status_filter=failed")
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["status"] == "failed"


@patch("app.services.notification_service.enqueue_registration_notification")
def test_resend_log(mock_enqueue, client, db):
    from app.models import NotificationLog
    admin = _ensure(db, "admin", super_admin=True)
    log = NotificationLog(
        template_code="registration_confirmed", user_id=admin.id,
        to_address="a@x", subject="s", status="failed",
        registration_id=None, attempts=1,
    )
    db.add(log); db.flush()
    _login(client, db, username="admin", super_admin=True)
    r = client.post(f"/api/admin/notification-logs/{log.id}/resend")
    assert r.status_code == 202
