from datetime import datetime, timedelta

from app.models import AuditLog
from app.services import audit_service, user_service


def _user(db, n=1):
    return user_service.create_user(db, email=f"a{n}@x", username=f"a{n}", password="pw123456")


def test_log_writes_row(db):
    u = _user(db)
    e = audit_service.log(db, actor_id=u.id, action="login.success", ip="127.0.0.1",
                          payload={"identifier": "a1"})
    assert e.id is not None
    assert e.actor_id == u.id
    assert e.action == "login.success"
    assert e.payload == {"identifier": "a1"}


def test_log_handles_no_actor(db):
    e = audit_service.log(db, action="login.fail", ip="10.0.0.1",
                          payload={"identifier": "ghost"})
    assert e.actor_id is None


def test_list_filters_by_action(db):
    u = _user(db, 2)
    audit_service.log(db, actor_id=u.id, action="login.success")
    audit_service.log(db, actor_id=u.id, action="logout")
    rows, total = audit_service.list_logs(db, action="logout")
    assert total == 1
    assert rows[0].action == "logout"


def test_list_filters_by_actor(db):
    u1 = _user(db, 11); u2 = _user(db, 12)
    audit_service.log(db, actor_id=u1.id, action="x")
    audit_service.log(db, actor_id=u2.id, action="x")
    rows, total = audit_service.list_logs(db, actor_id=u1.id)
    assert total == 1
    assert rows[0].actor_id == u1.id


def test_cleanup_older_than(db):
    u = _user(db, 21)
    old = AuditLog(actor_id=u.id, action="x",
                   created_at=datetime.utcnow() - timedelta(days=400))
    db.add(old); db.flush()
    audit_service.log(db, actor_id=u.id, action="recent")
    n = audit_service.cleanup_older_than(db, days=365)
    assert n >= 1
    _, total = audit_service.list_logs(db, action="x")
    assert total == 0  # only "recent" should remain
