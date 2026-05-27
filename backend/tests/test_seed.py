from sqlalchemy import text


def test_permissions_seeded(engine):
    with engine.connect() as conn:
        codes = {r[0] for r in conn.execute(text("SELECT code FROM permissions"))}
    assert {"users.read", "users.write", "roles.read", "roles.write", "permissions.read"} <= codes


def test_super_admin_role_has_all_permissions(engine):
    with engine.connect() as conn:
        perm_count = conn.execute(text("SELECT COUNT(*) FROM permissions")).scalar()
        sa_perm_count = conn.execute(
            text(
                "SELECT COUNT(*) FROM role_permissions rp "
                "JOIN roles r ON r.id = rp.role_id WHERE r.name = 'super_admin'"
            )
        ).scalar()
    assert sa_perm_count == perm_count
    assert perm_count >= 5
