from app.models import Permission, RefreshToken, Role, User


def test_model_tablenames():
    assert User.__tablename__ == "users"
    assert Role.__tablename__ == "roles"
    assert Permission.__tablename__ == "permissions"
    assert RefreshToken.__tablename__ == "refresh_tokens"


def test_user_role_permission_relationships_declared():
    assert "roles" in User.__mapper__.relationships
    assert "permissions" in Role.__mapper__.relationships
    assert "roles" in Permission.__mapper__.relationships


def test_settings_models_importable():
    from app.models import LdapSettings, PlatformSettings, SmtpSettings

    assert PlatformSettings.__tablename__ == "platform_settings"
    assert SmtpSettings.__tablename__ == "smtp_settings"
    assert LdapSettings.__tablename__ == "ldap_settings"
    assert hasattr(PlatformSettings, "setup_completed")
    assert hasattr(SmtpSettings, "password_encrypted")
    assert hasattr(LdapSettings, "bind_pw_encrypted")
