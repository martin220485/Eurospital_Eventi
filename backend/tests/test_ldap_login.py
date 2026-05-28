from unittest.mock import patch

from app.services import auth_service, settings_service, user_service


def _set_sso(db, *, enabled=True):
    settings_service.save_ldap(
        db, bind_pw="x", server_uri="ldap://m", base_dn="DC=x",
        bind_dn="CN=s,DC=x", user_filter="", users_group="UsersGroup",
        admins_group="AdminsGroup", attr_mapping={}, sso_enabled=enabled,
    )


def test_ldap_login_creates_user(db):
    _set_sso(db)
    fake = {
        "dn": "CN=John,DC=x",
        "attrs": {"username": "jdoe", "email": "jdoe@x.it",
                  "full_name": "John", "department": "IT"},
        "groups": ["UsersGroup"],
    }
    with patch("app.services.ldap_service.bind_user", return_value=True), \
         patch("app.services.ldap_service.find_user", return_value=fake):
        u = auth_service.authenticate(db, "jdoe", "anypw")
    assert u is not None
    assert u.auth_source == "ldap"


def test_ldap_login_fail_no_local_returns_none(db):
    _set_sso(db)
    with patch("app.services.ldap_service.bind_user", return_value=False):
        assert auth_service.authenticate(db, "ghost", "wrong") is None


def test_local_admin_can_login_when_sso_on(db):
    _set_sso(db)
    user_service.create_user(
        db, email="admin@x.it", username="admin", password="StrongPass1!"
    )
    # local user keeps auth_source='local' by default
    with patch("app.services.ldap_service.bind_user", return_value=False):
        u = auth_service.authenticate(db, "admin", "StrongPass1!")
    assert u is not None
    assert u.auth_source == "local"


def test_sso_off_uses_local_only(db):
    _set_sso(db, enabled=False)
    user_service.create_user(
        db, email="u@x.it", username="u", password="StrongPass1!"
    )
    # Patch should never be called when SSO is off; verify by failing if called
    with patch("app.services.ldap_service.bind_user", side_effect=AssertionError("must not be called")):
        u = auth_service.authenticate(db, "u", "StrongPass1!")
    assert u is not None
