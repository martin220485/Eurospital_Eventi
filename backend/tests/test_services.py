import pytest

from app.services import auth_service, rbac, user_service


def _make_user(db):
    user = user_service.create_user(
        db, email="admin@x.it", username="admin", password="pw12345", full_name="Admin"
    )
    user_service.assign_role(db, user, "super_admin")
    db.flush()
    return user


def test_create_user_hashes_password(db):
    user = user_service.create_user(db, email="a@b.it", username="ab", password="secret")
    assert user.id is not None
    assert user.hashed_password and user.hashed_password != "secret"


def test_get_by_identifier_matches_email_or_username(db):
    user_service.create_user(db, email="c@d.it", username="cd", password="x")
    db.flush()
    assert user_service.get_by_identifier(db, "c@d.it").username == "cd"
    assert user_service.get_by_identifier(db, "cd").email == "c@d.it"
    assert user_service.get_by_identifier(db, "missing") is None


def test_super_admin_has_seeded_permissions(db):
    user = _make_user(db)
    perms = user_service.get_user_permissions(db, user)
    assert "users.read" in perms
    assert rbac.user_has_permission(db, user, "users.write") is True
    assert rbac.user_has_permission(db, user, "nope.nope") is False


def test_authenticate_ok_and_ko(db):
    _make_user(db)
    assert auth_service.authenticate(db, "admin", "pw12345") is not None
    assert auth_service.authenticate(db, "admin", "wrong") is None
    assert auth_service.authenticate(db, "ghost", "pw12345") is None


def test_issue_and_rotate_refresh(db):
    user = _make_user(db)
    access, refresh = auth_service.issue_token_pair(db, user)
    assert access and refresh
    new_access, new_refresh = auth_service.rotate_refresh(db, refresh)
    assert new_refresh != refresh
    with pytest.raises(auth_service.AuthError):
        auth_service.rotate_refresh(db, refresh)


def test_revoke_refresh(db):
    user = _make_user(db)
    _, refresh = auth_service.issue_token_pair(db, user)
    auth_service.revoke_refresh(db, refresh)
    with pytest.raises(auth_service.AuthError):
        auth_service.rotate_refresh(db, refresh)
