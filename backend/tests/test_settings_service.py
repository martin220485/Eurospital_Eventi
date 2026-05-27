from sqlalchemy.exc import ProgrammingError

from app.services import settings_service


def test_setup_state_returns_row_values(db):
    settings_service.save_platform(db, setup_step=3)
    assert settings_service.setup_state(db) == (False, 3)


def test_setup_state_tolerates_missing_table(db, monkeypatch):
    # On a fresh RBAC-only deploy, platform_settings does not exist until the
    # wizard's migrate step. setup_state must treat that as "setup not started".
    def boom(_db):
        raise ProgrammingError("SELECT", {}, Exception("1146 table doesn't exist"))

    monkeypatch.setattr(settings_service, "get_platform", boom)
    assert settings_service.setup_state(db) == (False, 0)


def test_platform_singleton_autocreated(db):
    p = settings_service.get_platform(db)
    assert p.id == 1
    assert p.setup_completed is False
    # second call returns same row, no duplicate
    p2 = settings_service.get_platform(db)
    assert p2.id == 1


def test_smtp_password_encrypted_and_masked(db):
    settings_service.save_smtp(
        db, host="smtp.test", port=587, tls_mode="starttls",
        from_address="a@b.it", from_name="X", username="u", password="secret123",
    )
    row = settings_service.get_smtp(db)
    assert row.password_encrypted is not None
    assert row.password_encrypted != "secret123"
    out = settings_service.smtp_masked(db)
    assert out["password"] == "****"
    assert out["host"] == "smtp.test"


def test_ldap_password_roundtrip(db):
    settings_service.save_ldap(
        db, server_uri="ldap://x", base_dn="dc=x", bind_dn="cn=a",
        bind_pw="bindpw", user_filter="(uid={u})", group_filter=None,
        attr_mapping={"email": "mail"}, users_group=None, admins_group=None,
        sso_enabled=False,
    )
    assert settings_service.ldap_bind_password(db) == "bindpw"
