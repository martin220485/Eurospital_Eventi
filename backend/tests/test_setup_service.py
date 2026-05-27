from app.services import setup_service, settings_service, user_service


def test_db_test_ok(db):
    result = setup_service.test_db_connection()
    assert result["ok"] is True


def test_run_migrations_reports_tables(db):
    result = setup_service.run_migrations()
    assert result["revision"]  # head revision string
    assert "platform_settings" in result["tables"]
    assert "users" in result["tables"]


def test_create_first_admin_then_idempotent(db):
    user = setup_service.create_first_admin(
        db, email="admin@x.it", username="admin", password="StrongPass1!"
    )
    assert "super_admin" in {r.name for r in user.roles}
    assert setup_service.super_admin_exists(db) is True
    # second attempt rejected
    import pytest
    with pytest.raises(setup_service.SetupError):
        setup_service.create_first_admin(
            db, email="b@x.it", username="b", password="StrongPass1!"
        )


def test_complete_requires_admin(db):
    import pytest
    with pytest.raises(setup_service.SetupError):
        setup_service.complete(db)  # no admin yet
    setup_service.create_first_admin(
        db, email="admin@x.it", username="admin", password="StrongPass1!"
    )
    setup_service.complete(db)
    assert settings_service.get_platform(db).setup_completed is True
