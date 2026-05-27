import pytest
from fastapi import Depends

from app.api.deps import require_permission
from app.main import app
from app.models import User
from app.services import user_service


@pytest.fixture
def protected_route():
    @app.get("/api/_test/needs-users-write")
    def _protected(user: User = Depends(require_permission("users.write"))):
        return {"ok": True, "user": user.username}

    yield
    app.router.routes = [
        r for r in app.router.routes
        if getattr(r, "path", None) != "/api/_test/needs-users-write"
    ]


def _login(client, db, *, with_role: bool):
    user = user_service.create_user(db, email="u@x.it", username="u", password="pw12345")
    if with_role:
        user_service.assign_role(db, user, "super_admin")
    db.flush()
    return client.post("/api/auth/login", json={"identifier": "u", "password": "pw12345"}).json()[
        "access_token"
    ]


def test_permission_granted_200(client, db, protected_route):
    tok = _login(client, db, with_role=True)
    resp = client.get(
        "/api/_test/needs-users-write", headers={"Authorization": f"Bearer {tok}"}
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_permission_denied_403(client, db, protected_route):
    tok = _login(client, db, with_role=False)
    resp = client.get(
        "/api/_test/needs-users-write", headers={"Authorization": f"Bearer {tok}"}
    )
    assert resp.status_code == 403
