from sqlalchemy import inspect


def test_all_tables_created(engine):
    tables = set(inspect(engine).get_table_names())
    expected = {
        "users", "roles", "permissions", "role_permissions",
        "user_roles", "refresh_tokens", "alembic_version",
        "platform_settings", "smtp_settings", "ldap_settings",
        "event_categories", "events", "event_custom_fields",
        "event_custom_field_options", "attachments", "event_visibility",
    }
    assert expected.issubset(tables)


def test_event_permissions_seeded(engine):
    from sqlalchemy import text
    with engine.connect() as c:
        rows = c.execute(text("SELECT code FROM permissions")).scalars().all()
    for code in ("events.read", "events.write", "events.delete", "events.publish", "categories.write"):
        assert code in rows
