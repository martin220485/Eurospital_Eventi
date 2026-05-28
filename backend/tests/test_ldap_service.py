"""LDAP service tests.

The bind/search to LDAP are mocked at the ldap_service boundary
(`find_user`, `bind_user`) so we don't need a real LDAP server.
"""
from unittest.mock import patch

from app.services import ldap_service, settings_service, user_service


def _enable_sso(db, *, admins_group="AdminsGroup", users_group="UsersGroup"):
    settings_service.save_ldap(
        db,
        bind_pw="x",
        server_uri="ldap://mock.local",
        base_dn="DC=corp,DC=local",
        bind_dn="CN=Service,DC=corp,DC=local",
        user_filter="(sAMAccountName={username})",
        users_group=users_group,
        admins_group=admins_group,
        attr_mapping={},
        sso_enabled=True,
    )


def test_extract_cns_from_dn_list():
    out = ldap_service._extract_cns([
        "CN=IT,OU=Groups,DC=corp,DC=local",
        "CN=HR,OU=Groups,DC=corp,DC=local",
    ])
    assert out == ["IT", "HR"]


def test_extract_cns_handles_empty_and_none():
    assert ldap_service._extract_cns(None) == []
    assert ldap_service._extract_cns([]) == []


def test_mapped_roles_defaults_to_employee(db):
    _enable_sso(db)
    cfg = settings_service.get_ldap(db)
    roles = ldap_service._mapped_roles(cfg, ["UsersGroup"])
    assert roles == ["employee"]


def test_mapped_roles_admins_group_assigns_super_admin(db):
    _enable_sso(db)
    cfg = settings_service.get_ldap(db)
    roles = ldap_service._mapped_roles(cfg, ["AdminsGroup", "UsersGroup"])
    assert "super_admin" in roles
    assert "employee" in roles


def test_mapped_roles_no_groups_defaults_employee(db):
    _enable_sso(db)
    cfg = settings_service.get_ldap(db)
    assert ldap_service._mapped_roles(cfg, []) == ["employee"]


def test_sync_user_creates_local_user(db):
    _enable_sso(db)
    fake_info = {
        "dn": "CN=John,DC=corp,DC=local",
        "attrs": {"username": "jdoe", "email": "jdoe@corp.local",
                  "full_name": "John Doe", "department": "IT"},
        "groups": ["UsersGroup"],
    }
    with patch("app.services.ldap_service.find_user", return_value=fake_info):
        u = ldap_service.sync_user(db, "jdoe")
    assert u.auth_source == "ldap"
    assert u.email == "jdoe@corp.local"
    assert u.department == "IT"
    assert u.ldap_groups == ["UsersGroup"]
    assert u.ldap_dn == "CN=John,DC=corp,DC=local"
    assert "employee" in {r.name for r in u.roles}


def test_sync_user_admin_role_assigned(db):
    _enable_sso(db)
    fake_info = {
        "dn": "CN=Admin,DC=corp,DC=local",
        "attrs": {"username": "admin1", "email": "a@x", "full_name": "A", "department": "IT"},
        "groups": ["AdminsGroup", "UsersGroup"],
    }
    with patch("app.services.ldap_service.find_user", return_value=fake_info):
        u = ldap_service.sync_user(db, "admin1")
    roles = {r.name for r in u.roles}
    assert "super_admin" in roles


def test_sync_user_updates_existing(db):
    _enable_sso(db)
    existing = user_service.create_user(
        db, email="jdoe@corp.local", username="jdoe", password="pw123456",
    )
    fake_info = {
        "dn": "CN=John,DC=corp,DC=local",
        "attrs": {"username": "jdoe", "email": "jdoe@corp.local",
                  "full_name": "John Updated", "department": "HR"},
        "groups": ["UsersGroup"],
    }
    with patch("app.services.ldap_service.find_user", return_value=fake_info):
        u = ldap_service.sync_user(db, "jdoe")
    assert u.id == existing.id
    assert u.auth_source == "ldap"
    assert u.full_name == "John Updated"
    assert u.department == "HR"


def test_sync_user_raises_when_not_found(db):
    _enable_sso(db)
    with patch("app.services.ldap_service.find_user", return_value=None):
        import pytest
        with pytest.raises(ldap_service.LdapError):
            ldap_service.sync_user(db, "ghost")


def test_bind_user_requires_sso_enabled(db):
    settings_service.save_ldap(
        db, bind_pw="x", server_uri="ldap://x", base_dn="DC=x",
        bind_dn="CN=s,DC=x", user_filter="", users_group="",
        admins_group="", attr_mapping={}, sso_enabled=False,
    )
    assert ldap_service.bind_user(db, "jdoe", "pw") is False
