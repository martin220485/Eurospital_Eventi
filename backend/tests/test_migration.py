from sqlalchemy import inspect, text


def test_all_tables_created(engine):
    tables = set(inspect(engine).get_table_names())
    expected = {
        "users", "roles", "permissions", "role_permissions",
        "user_roles", "refresh_tokens", "alembic_version",
        "platform_settings", "smtp_settings", "ldap_settings",
        "event_categories", "events", "event_custom_fields",
        "event_custom_field_options", "attachments", "event_visibility",
        "registrations", "registration_custom_answers", "checkins",
    }
    assert expected.issubset(tables)


def test_event_permissions_seeded(engine):
    with engine.connect() as c:
        rows = c.execute(text("SELECT code FROM permissions")).scalars().all()
    for code in ("events.read", "events.write", "events.delete", "events.publish", "categories.write"):
        assert code in rows


def test_registration_permissions_and_role_seeded(engine):
    with engine.connect() as c:
        perms = c.execute(text("SELECT code FROM permissions")).scalars().all()
        roles = c.execute(text("SELECT name FROM roles")).scalars().all()
    for code in ("registrations.read", "registrations.write", "checkin.write"):
        assert code in perms
    assert "checkin_operator" in roles


def test_employee_role_seeded(engine):
    from sqlalchemy import text
    with engine.connect() as c:
        roles = c.execute(text("SELECT name FROM roles")).scalars().all()
    assert "employee" in roles


def test_notification_tables_created(engine):
    tables = set(inspect(engine).get_table_names())
    assert {"notification_templates", "notification_logs"}.issubset(tables)


def test_notification_templates_seeded(engine):
    with engine.connect() as c:
        rows = c.execute(text("SELECT code FROM notification_templates ORDER BY code")).scalars().all()
    assert list(rows) == [
        "registration_cancelled",
        "registration_confirmed",
        "registration_promoted",
        "registration_waitlisted",
    ]


def test_notifications_manage_permission_seeded(engine):
    with engine.connect() as c:
        row = c.execute(text(
            "SELECT 1 FROM permissions p "
            "JOIN role_permissions rp ON rp.permission_id = p.id "
            "JOIN roles r ON r.id = rp.role_id "
            "WHERE p.code = 'notifications.manage' AND r.name = 'super_admin'"
        )).first()
    assert row is not None
