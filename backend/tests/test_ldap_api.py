from unittest.mock import patch

from app.services import settings_service, user_service


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


def _seed_settings(db):
    settings_service.save_ldap(
        db, bind_pw="secret", server_uri="ldap://x", base_dn="DC=x",
        bind_dn="CN=s,DC=x", user_filter="(sAMAccountName={username})",
        users_group="UG", admins_group="AG", attr_mapping={"email": "userPrincipalName"},
        sso_enabled=True,
    )


def test_get_settings_requires_perm(client, db):
    _login(client, db, username="emp")
    assert client.get("/api/admin/ldap/settings").status_code == 403


def test_get_settings_with_perm(client, db):
    _seed_settings(db)
    _login(client, db, username="admin", super_admin=True)
    r = client.get("/api/admin/ldap/settings")
    assert r.status_code == 200
    data = r.json()
    assert data["sso_enabled"] is True
    assert data["has_bind_password"] is True
    assert "bind_password" not in data
    assert data["users_group"] == "UG"


def test_put_settings_saves(client, db):
    _seed_settings(db)
    _login(client, db, username="admin", super_admin=True)
    r = client.put("/api/admin/ldap/settings", json={
        "sso_enabled": True,
        "server_uri": "ldaps://corp.local",
        "base_dn": "DC=corp,DC=local",
        "bind_dn": "CN=svc,DC=corp,DC=local",
        "bind_password": "newpw",
        "user_filter": "(sAMAccountName={username})",
        "group_filter": None,
        "attr_mapping": {},
        "users_group": "AllUsers",
        "admins_group": "Admins",
    })
    assert r.status_code == 200
    assert r.json()["server_uri"] == "ldaps://corp.local"
    assert r.json()["users_group"] == "AllUsers"


@patch("app.services.ldap_service.find_user")
def test_preview(mock_find, client, db):
    _seed_settings(db)
    mock_find.return_value = {
        "dn": "CN=Jane,DC=x",
        "attrs": {"username": "jane", "email": "jane@x", "full_name": "Jane", "department": "HR"},
        "groups": ["UG"],
    }
    _login(client, db, username="admin", super_admin=True)
    r = client.get("/api/admin/ldap/preview?username=jane")
    assert r.status_code == 200
    data = r.json()
    assert data["attrs"]["full_name"] == "Jane"
    assert "employee" in data["mapped_roles"]


@patch("app.services.ldap_service.find_user", return_value=None)
def test_preview_404(mock_find, client, db):
    _seed_settings(db)
    _login(client, db, username="admin", super_admin=True)
    assert client.get("/api/admin/ldap/preview?username=ghost").status_code == 404


@patch("app.services.ldap_service.find_user")
def test_sync_user_creates(mock_find, client, db):
    _seed_settings(db)
    mock_find.return_value = {
        "dn": "CN=Jane,DC=x",
        "attrs": {"username": "jane2", "email": "jane2@x", "full_name": "Jane", "department": "HR"},
        "groups": ["UG"],
    }
    _login(client, db, username="admin", super_admin=True)
    r = client.post("/api/admin/ldap/sync-user/jane2")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["action"] == "created"


@patch("app.services.ldap_service.sync_users_in_group")
def test_sync_all(mock_sync, client, db):
    _seed_settings(db)
    mock_sync.return_value = {"ok": True, "created": 2, "updated": 3, "errors": 0}
    _login(client, db, username="admin", super_admin=True)
    r = client.post("/api/admin/ldap/sync-all")
    assert r.status_code == 200
    assert r.json()["created"] == 2
    assert r.json()["updated"] == 3
