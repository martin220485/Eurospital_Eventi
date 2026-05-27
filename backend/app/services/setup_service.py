from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import Session

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from app.core.config import get_settings
from app.models import Role, User
from app.services import settings_service, user_service


class SetupError(Exception):
    pass


def status(db: Session) -> dict:
    completed, step = settings_service.setup_state(db)
    return {"setup_completed": completed, "current_step": step}


def set_step(db: Session, step: int) -> None:
    p = settings_service.get_platform(db)
    if step > p.setup_step:
        p.setup_step = step
        db.flush()


def test_db_connection() -> dict:
    try:
        eng = create_engine(get_settings().sqlalchemy_url, pool_pre_ping=True)
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        eng.dispose()
        return {"ok": True}
    except Exception as exc:  # surface a clear message to the wizard
        return {"ok": False, "error": str(exc)}


def run_migrations() -> dict:
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", get_settings().sqlalchemy_url)
    command.upgrade(cfg, "head")
    head = ScriptDirectory.from_config(cfg).get_current_head()
    eng = create_engine(get_settings().sqlalchemy_url)
    insp = inspect(eng)
    tables = sorted(insp.get_table_names())
    views = sorted(insp.get_view_names())
    eng.dispose()
    return {"revision": head, "tables": tables, "views": views}


def super_admin_exists(db: Session) -> bool:
    stmt = (
        select(User.id)
        .join(User.roles)
        .where(Role.name == "super_admin")
        .limit(1)
    )
    return db.scalar(stmt) is not None


def create_first_admin(db: Session, *, email: str, username: str, password: str) -> User:
    if super_admin_exists(db):
        raise SetupError("A super_admin already exists")
    user = user_service.create_user(
        db, email=email, username=username, password=password
    )
    user_service.assign_role(db, user, "super_admin")
    return user


def test_smtp(*, host: str, port: int, tls_mode: str, username: str | None,
              password: str | None, from_address: str) -> dict:
    import smtplib

    try:
        if tls_mode == "ssl":
            server = smtplib.SMTP_SSL(host, port, timeout=10)
        else:
            server = smtplib.SMTP(host, port, timeout=10)
            if tls_mode == "starttls":
                server.starttls()
        if username and password:
            server.login(username, password)
        server.sendmail(from_address, [from_address], "Subject: Eurospital test\n\nOK")
        server.quit()
        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def test_ldap(*, server_uri: str, bind_dn: str, bind_pw: str) -> dict:
    from ldap3 import Connection, Server

    try:
        conn = Connection(Server(server_uri, connect_timeout=10), user=bind_dn,
                          password=bind_pw, auto_bind=True)
        conn.unbind()
        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def db_at_head(db: Session) -> bool:
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", get_settings().sqlalchemy_url)
    head = ScriptDirectory.from_config(cfg).get_current_head()
    current = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
    return current == head


def complete(db: Session) -> None:
    if not super_admin_exists(db):
        raise SetupError("Cannot complete setup: no super_admin")
    if not db_at_head(db):
        raise SetupError("Cannot complete setup: database not at head revision")
    p = settings_service.get_platform(db)
    p.setup_completed = True
    p.setup_step = 10
    db.flush()
