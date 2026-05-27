from app.cli import create_admin
from app.services import user_service


def test_create_admin_creates_user_and_role(db):
    create_admin(db, email="boss@x.it", username="boss", password="pw12345", update=False)
    user = user_service.get_by_identifier(db, "boss")
    assert user is not None
    assert "super_admin" in {r.name for r in user.roles}


def test_create_admin_idempotent_without_update(db):
    create_admin(db, email="boss@x.it", username="boss", password="pw12345", update=False)
    create_admin(db, email="boss@x.it", username="boss", password="pw12345", update=False)
    matches = [u for u in [user_service.get_by_identifier(db, "boss")] if u]
    assert len(matches) == 1


def test_create_admin_update_changes_password(db):
    create_admin(db, email="boss@x.it", username="boss", password="old12345", update=False)
    create_admin(db, email="boss@x.it", username="boss", password="new12345", update=True)
    from app.services import auth_service
    assert auth_service.authenticate(db, "boss", "new12345") is not None
    assert auth_service.authenticate(db, "boss", "old12345") is None
