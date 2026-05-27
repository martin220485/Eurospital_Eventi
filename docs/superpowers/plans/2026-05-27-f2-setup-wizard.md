# F2 Setup Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 10-step first-run setup wizard at `/setup` that tests the external MySQL connection, applies Alembic migrations at runtime, creates the first `super_admin`, and configures SMTP / AD / platform settings (last three optional), gated by a bootstrap `SETUP_TOKEN`.

**Architecture:** Backend adds a `/api/setup` router gated by `X-Setup-Token` header and a `setup_completed` flag (three singleton settings tables, secrets Fernet-encrypted). The wizard endpoint runs `alembic upgrade head` programmatically. Frontend adds an isolated `app/setup/` route group: a stepper orchestrator with per-step components, token held in React session memory.

**Tech Stack:** Backend — FastAPI, SQLAlchemy 2.0, Alembic, PyMySQL, cryptography (Fernet), argon2, ldap3 (new), pytest. Frontend — Next.js 15 App Router, React 19, TypeScript, Tailwind + shadcn/ui (new), TanStack Query (new), Zod (new), Vitest + React Testing Library (new).

---

## File Structure

**Backend (create unless noted):**
- `app/core/config.py` — MODIFY: add `setup_token` setting
- `app/models/platform_settings.py` — `PlatformSettings` singleton
- `app/models/smtp_settings.py` — `SmtpSettings` singleton
- `app/models/ldap_settings.py` — `LdapSettings` singleton
- `app/models/__init__.py` — MODIFY: register new models
- `alembic/versions/0003_settings.py` — migration for three tables
- `app/services/settings_service.py` — singleton get/set + encrypt/mask
- `app/services/setup_service.py` — wizard domain logic
- `app/schemas/setup.py` — Pydantic I/O
- `app/api/deps.py` — MODIFY: `require_setup_token`, `require_setup_open`
- `app/api/routers/setup.py` — `/api/setup/*`
- `app/main.py` — MODIFY: include router + startup token log
- `pyproject.toml` — MODIFY: add `ldap3`
- Tests: `tests/test_settings_service.py`, `tests/test_setup_service.py`, `tests/test_setup_api.py`, `tests/test_migration.py` (MODIFY)

**Frontend (create unless noted):**
- `package.json` — MODIFY: add deps + scripts
- tailwind/shadcn/vitest config files (init)
- `lib/setup-api.ts` — typed client
- `lib/setup-schemas.ts` — Zod schemas
- `components/stepper.tsx` — stepper UI
- `app/setup/layout.tsx` — guard
- `app/setup/page.tsx` — orchestrator
- `app/setup/steps/*.tsx` — 10 step components
- Tests: `__tests__/setup-schemas.test.ts`, `__tests__/stepper.test.tsx`

---

## Backend

### Task 1: Add `setup_token` to settings

**Files:**
- Modify: `app/core/config.py`
- Test: `tests/test_config.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_config.py`:

```python
def test_setup_token_has_default():
    from app.core.config import Settings

    s = Settings()
    assert s.setup_token  # non-empty string default
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_config.py::test_setup_token_has_default -v`
Expected: FAIL with `AttributeError: 'Settings' object has no attribute 'setup_token'`

- [ ] **Step 3: Add the field**

In `app/core/config.py`, inside `Settings`, after `app_secret_key`:

```python
    setup_token: str = "dev-setup-token-change-me"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_config.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/config.py backend/tests/test_config.py
git commit -m "feat(f2): add setup_token setting"
```

---

### Task 2: Settings ORM models

**Files:**
- Create: `app/models/platform_settings.py`, `app/models/smtp_settings.py`, `app/models/ldap_settings.py`
- Modify: `app/models/__init__.py`
- Test: `tests/test_models.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_models.py`:

```python
def test_settings_models_importable():
    from app.models import LdapSettings, PlatformSettings, SmtpSettings

    assert PlatformSettings.__tablename__ == "platform_settings"
    assert SmtpSettings.__tablename__ == "smtp_settings"
    assert LdapSettings.__tablename__ == "ldap_settings"
    assert hasattr(PlatformSettings, "setup_completed")
    assert hasattr(SmtpSettings, "password_encrypted")
    assert hasattr(LdapSettings, "bind_pw_encrypted")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_models.py::test_settings_models_importable -v`
Expected: FAIL with `ImportError: cannot import name 'PlatformSettings'`

- [ ] **Step 3: Create the models**

`app/models/platform_settings.py`:

```python
from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PlatformSettings(Base):
    __tablename__ = "platform_settings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="Eurospital Eventi")
    logo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    primary_color: Mapped[str] = mapped_column(String(16), nullable=False, default="#0a66c2")
    language: Mapped[str] = mapped_column(String(8), nullable=False, default="it")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Europe/Rome")
    public_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    retention_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feature_flags: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    setup_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    setup_step: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
```

`app/models/smtp_settings.py`:

```python
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SmtpSettings(Base):
    __tablename__ = "smtp_settings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tls_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="starttls")
    from_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    from_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
```

`app/models/ldap_settings.py`:

```python
from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LdapSettings(Base):
    __tablename__ = "ldap_settings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    server_uri: Mapped[str | None] = mapped_column(String(512), nullable=True)
    base_dn: Mapped[str | None] = mapped_column(String(512), nullable=True)
    bind_dn: Mapped[str | None] = mapped_column(String(512), nullable=True)
    bind_pw_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_filter: Mapped[str | None] = mapped_column(String(512), nullable=True)
    group_filter: Mapped[str | None] = mapped_column(String(512), nullable=True)
    attr_mapping: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    users_group: Mapped[str | None] = mapped_column(String(512), nullable=True)
    admins_group: Mapped[str | None] = mapped_column(String(512), nullable=True)
    sso_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
```

Replace `app/models/__init__.py` with:

```python
from app.models.associations import role_permissions, user_roles
from app.models.ldap_settings import LdapSettings
from app.models.permission import Permission
from app.models.platform_settings import PlatformSettings
from app.models.refresh_token import RefreshToken
from app.models.role import Role
from app.models.smtp_settings import SmtpSettings
from app.models.user import User

__all__ = [
    "User",
    "Role",
    "Permission",
    "RefreshToken",
    "PlatformSettings",
    "SmtpSettings",
    "LdapSettings",
    "user_roles",
    "role_permissions",
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_models.py::test_settings_models_importable -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/
git commit -m "feat(f2): settings ORM models (platform, smtp, ldap)"
```

---

### Task 3: Migration `0003_settings`

**Files:**
- Create: `alembic/versions/0003_settings.py`
- Modify: `tests/test_migration.py`

- [ ] **Step 1: Update the migration test to expect new tables**

Replace the `expected` set in `tests/test_migration.py`:

```python
from sqlalchemy import inspect


def test_all_tables_created(engine):
    tables = set(inspect(engine).get_table_names())
    expected = {
        "users", "roles", "permissions", "role_permissions",
        "user_roles", "refresh_tokens", "alembic_version",
        "platform_settings", "smtp_settings", "ldap_settings",
    }
    assert expected.issubset(tables)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && TEST_DATABASE_URL=$TEST_DATABASE_URL python -m pytest tests/test_migration.py -v`
Expected: FAIL — new tables not in schema (`assert ... issubset` False)

- [ ] **Step 3: Write the migration**

`alembic/versions/0003_settings.py`:

```python
"""settings tables

Revision ID: 0003_settings
Revises: 0002_seed_rbac
Create Date: 2026-05-27
"""
import sqlalchemy as sa

from alembic import op

revision = "0003_settings"
down_revision = "0002_seed_rbac"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_settings",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("logo_url", sa.String(512), nullable=True),
        sa.Column("primary_color", sa.String(16), nullable=False),
        sa.Column("language", sa.String(8), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("public_url", sa.String(512), nullable=True),
        sa.Column("retention_days", sa.Integer(), nullable=True),
        sa.Column("feature_flags", sa.JSON(), nullable=False),
        sa.Column("setup_completed", sa.Boolean(), nullable=False),
        sa.Column("setup_step", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "smtp_settings",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=False),
        sa.Column("host", sa.String(255), nullable=True),
        sa.Column("port", sa.Integer(), nullable=True),
        sa.Column("tls_mode", sa.String(16), nullable=False),
        sa.Column("from_address", sa.String(255), nullable=True),
        sa.Column("from_name", sa.String(255), nullable=True),
        sa.Column("username", sa.String(255), nullable=True),
        sa.Column("password_encrypted", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "ldap_settings",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=False),
        sa.Column("server_uri", sa.String(512), nullable=True),
        sa.Column("base_dn", sa.String(512), nullable=True),
        sa.Column("bind_dn", sa.String(512), nullable=True),
        sa.Column("bind_pw_encrypted", sa.Text(), nullable=True),
        sa.Column("user_filter", sa.String(512), nullable=True),
        sa.Column("group_filter", sa.String(512), nullable=True),
        sa.Column("attr_mapping", sa.JSON(), nullable=False),
        sa.Column("users_group", sa.String(512), nullable=True),
        sa.Column("admins_group", sa.String(512), nullable=True),
        sa.Column("sso_enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("ldap_settings")
    op.drop_table("smtp_settings")
    op.drop_table("platform_settings")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_migration.py -v`
Expected: PASS (conftest runs `downgrade base` + `upgrade head`, so 0003 is applied)

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/0003_settings.py backend/tests/test_migration.py
git commit -m "feat(f2): migration 0003 settings tables"
```

---

### Task 4: `settings_service` — singleton get/set + encrypt/mask

**Files:**
- Create: `app/services/settings_service.py`
- Test: `tests/test_settings_service.py`

- [ ] **Step 1: Write the failing test**

`tests/test_settings_service.py`:

```python
from app.services import settings_service


def test_platform_singleton_autocreated(db):
    p = settings_service.get_platform(db)
    assert p.id == 1
    assert p.setup_completed is False
    # second call returns same row, no duplicate
    p2 = settings_service.get_platform(db)
    assert p2.id == 1


def test_smtp_password_encrypted_and_masked(db):
    settings_service.save_smtp(
        db, host="smtp.test", port=587, tls_mode="starttls",
        from_address="a@b.it", from_name="X", username="u", password="secret123",
    )
    row = settings_service.get_smtp(db)
    assert row.password_encrypted is not None
    assert row.password_encrypted != "secret123"
    out = settings_service.smtp_masked(db)
    assert out["password"] == "****"
    assert out["host"] == "smtp.test"


def test_ldap_password_roundtrip(db):
    settings_service.save_ldap(
        db, server_uri="ldap://x", base_dn="dc=x", bind_dn="cn=a",
        bind_pw="bindpw", user_filter="(uid={u})", group_filter=None,
        attr_mapping={"email": "mail"}, users_group=None, admins_group=None,
        sso_enabled=False,
    )
    assert settings_service.ldap_bind_password(db) == "bindpw"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_settings_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.settings_service'`

- [ ] **Step 3: Implement the service**

`app/services/settings_service.py`:

```python
from sqlalchemy.orm import Session

from app.core.crypto import decrypt, encrypt
from app.models import LdapSettings, PlatformSettings, SmtpSettings

_MASK = "****"


def get_platform(db: Session) -> PlatformSettings:
    obj = db.get(PlatformSettings, 1)
    if obj is None:
        obj = PlatformSettings(id=1, name="Eurospital Eventi", feature_flags={})
        db.add(obj)
        db.flush()
    return obj


def get_smtp(db: Session) -> SmtpSettings:
    obj = db.get(SmtpSettings, 1)
    if obj is None:
        obj = SmtpSettings(id=1)
        db.add(obj)
        db.flush()
    return obj


def get_ldap(db: Session) -> LdapSettings:
    obj = db.get(LdapSettings, 1)
    if obj is None:
        obj = LdapSettings(id=1, attr_mapping={})
        db.add(obj)
        db.flush()
    return obj


def save_platform(db: Session, **fields) -> PlatformSettings:
    obj = get_platform(db)
    for k, v in fields.items():
        setattr(obj, k, v)
    db.flush()
    return obj


def save_smtp(db: Session, *, password: str | None = None, **fields) -> SmtpSettings:
    obj = get_smtp(db)
    for k, v in fields.items():
        setattr(obj, k, v)
    if password:
        obj.password_encrypted = encrypt(password)
    db.flush()
    return obj


def save_ldap(db: Session, *, bind_pw: str | None = None, **fields) -> LdapSettings:
    obj = get_ldap(db)
    for k, v in fields.items():
        setattr(obj, k, v)
    if bind_pw:
        obj.bind_pw_encrypted = encrypt(bind_pw)
    db.flush()
    return obj


def smtp_masked(db: Session) -> dict:
    obj = get_smtp(db)
    return {
        "host": obj.host,
        "port": obj.port,
        "tls_mode": obj.tls_mode,
        "from_address": obj.from_address,
        "from_name": obj.from_name,
        "username": obj.username,
        "password": _MASK if obj.password_encrypted else None,
    }


def ldap_bind_password(db: Session) -> str | None:
    obj = get_ldap(db)
    return decrypt(obj.bind_pw_encrypted) if obj.bind_pw_encrypted else None


def smtp_password(db: Session) -> str | None:
    obj = get_smtp(db)
    return decrypt(obj.password_encrypted) if obj.password_encrypted else None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_settings_service.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/settings_service.py backend/tests/test_settings_service.py
git commit -m "feat(f2): settings_service with Fernet encrypt and masking"
```

---

### Task 5: Add `ldap3` dependency

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: Add dependency**

In `pyproject.toml`, add to the `dependencies` list:

```toml
    "ldap3>=2.9",
```

- [ ] **Step 2: Install**

Run: `cd backend && pip install -e . 2>/dev/null || pip install ldap3`
Expected: ldap3 installed

- [ ] **Step 3: Verify import**

Run: `cd backend && python -c "import ldap3; print(ldap3.__version__)"`
Expected: prints a version string

- [ ] **Step 4: Commit**

```bash
git add backend/pyproject.toml
git commit -m "chore(f2): add ldap3 dependency"
```

---

### Task 6: `setup_service` — db test, migrations, admin, connection tests, complete

**Files:**
- Create: `app/services/setup_service.py`
- Test: `tests/test_setup_service.py`

- [ ] **Step 1: Write the failing test**

`tests/test_setup_service.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_setup_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.setup_service'`

- [ ] **Step 3: Implement the service**

`app/services/setup_service.py`:

```python
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
    p = settings_service.get_platform(db)
    return {"setup_completed": p.setup_completed, "current_step": p.setup_step}


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


def complete(db: Session) -> None:
    if not super_admin_exists(db):
        raise SetupError("Cannot complete setup: no super_admin")
    p = settings_service.get_platform(db)
    p.setup_completed = True
    p.setup_step = 10
    db.flush()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_setup_service.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/setup_service.py backend/tests/test_setup_service.py
git commit -m "feat(f2): setup_service (db test, migrations, admin, smtp/ldap test, complete)"
```

---

### Task 7: Setup schemas

**Files:**
- Create: `app/schemas/setup.py`

- [ ] **Step 1: Write the schemas (no test — exercised by API tests in Task 9)**

`app/schemas/setup.py`:

```python
from pydantic import BaseModel, EmailStr, Field


class SetupStatus(BaseModel):
    setup_completed: bool
    current_step: int


class OpResult(BaseModel):
    ok: bool
    error: str | None = None


class MigrateResult(BaseModel):
    revision: str
    tables: list[str]
    views: list[str]


class AdminCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8, max_length=128)


class SmtpIn(BaseModel):
    host: str
    port: int
    tls_mode: str = "starttls"
    from_address: EmailStr
    from_name: str | None = None
    username: str | None = None
    password: str | None = None


class SmtpTestIn(SmtpIn):
    pass


class LdapIn(BaseModel):
    server_uri: str
    base_dn: str
    bind_dn: str
    bind_pw: str | None = None
    user_filter: str | None = None
    group_filter: str | None = None
    attr_mapping: dict = {}
    users_group: str | None = None
    admins_group: str | None = None
    sso_enabled: bool = False


class LdapTestIn(BaseModel):
    server_uri: str
    bind_dn: str
    bind_pw: str


class PlatformIn(BaseModel):
    name: str
    logo_url: str | None = None
    primary_color: str = "#0a66c2"
    language: str = "it"
    timezone: str = "Europe/Rome"
    public_url: str | None = None
    retention_days: int | None = None
```

- [ ] **Step 2: Verify import**

Run: `cd backend && python -c "from app.schemas.setup import SetupStatus, AdminCreate, SmtpIn, LdapIn, PlatformIn; print('ok')"`
Expected: prints `ok` (if `EmailStr` errors, run `pip install 'pydantic[email]'` and retry)

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/setup.py
git commit -m "feat(f2): setup Pydantic schemas"
```

---

### Task 8: Gating dependencies

**Files:**
- Modify: `app/api/deps.py`

- [ ] **Step 1: Add the dependencies (tested via Task 9 API tests)**

Append to `app/api/deps.py`:

```python
from fastapi import Header

from app.core.config import get_settings
from app.services import settings_service


def require_setup_open(db: Session = Depends(get_db)) -> None:
    if settings_service.get_platform(db).setup_completed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Setup already completed"
        )


def require_setup_token(x_setup_token: str | None = Header(default=None)) -> None:
    if x_setup_token != get_settings().setup_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Invalid setup token"
        )
```

- [ ] **Step 2: Verify import**

Run: `cd backend && python -c "from app.api.deps import require_setup_open, require_setup_token; print('ok')"`
Expected: prints `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/deps.py
git commit -m "feat(f2): setup gating deps (token + open)"
```

---

### Task 9: Setup router + wire into app

**Files:**
- Create: `app/api/routers/setup.py`
- Modify: `app/main.py`
- Test: `tests/test_setup_api.py`

- [ ] **Step 1: Write the failing test**

`tests/test_setup_api.py`:

```python
TOKEN = {"X-Setup-Token": "dev-setup-token-change-me"}


def test_status_public(client):
    r = client.get("/api/setup/status")
    assert r.status_code == 200
    assert r.json()["setup_completed"] is False


def test_endpoints_require_token(client):
    r = client.post("/api/setup/db/test")
    assert r.status_code == 403


def test_db_test_with_token(client):
    r = client.post("/api/setup/db/test", headers=TOKEN)
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_create_admin_and_complete(client):
    r = client.post(
        "/api/setup/admin",
        headers=TOKEN,
        json={"email": "admin@x.it", "username": "admin", "password": "StrongPass1!"},
    )
    assert r.status_code == 201
    r2 = client.post("/api/setup/complete", headers=TOKEN)
    assert r2.status_code == 200
    # after completion, gated endpoints 409
    r3 = client.post("/api/setup/db/test", headers=TOKEN)
    assert r3.status_code == 409


def test_save_smtp_masks_password(client):
    r = client.put(
        "/api/setup/smtp",
        headers=TOKEN,
        json={"host": "smtp.x", "port": 587, "from_address": "a@x.it", "password": "p"},
    )
    assert r.status_code == 200
    assert r.json()["password"] == "****"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_setup_api.py -v`
Expected: FAIL — 404 on `/api/setup/*` (router not mounted)

- [ ] **Step 3: Implement the router**

`app/api/routers/setup.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_setup_open, require_setup_token
from app.schemas.setup import (
    AdminCreate,
    LdapIn,
    LdapTestIn,
    MigrateResult,
    OpResult,
    PlatformIn,
    SetupStatus,
    SmtpIn,
    SmtpTestIn,
)
from app.services import setup_service, settings_service

router = APIRouter(prefix="/api/setup", tags=["setup"])

_gated = [Depends(require_setup_open), Depends(require_setup_token)]


@router.get("/status", response_model=SetupStatus)
def get_status(db: Session = Depends(get_db)) -> SetupStatus:
    return SetupStatus(**setup_service.status(db))


@router.post("/db/test", response_model=OpResult, dependencies=_gated)
def db_test() -> OpResult:
    return OpResult(**setup_service.test_db_connection())


@router.post("/db/migrate", response_model=MigrateResult, dependencies=_gated)
def db_migrate(db: Session = Depends(get_db)) -> MigrateResult:
    result = setup_service.run_migrations()
    setup_service.set_step(db, 4)
    db.commit()
    return MigrateResult(**result)


@router.post("/admin", status_code=status.HTTP_201_CREATED, dependencies=_gated)
def create_admin(payload: AdminCreate, db: Session = Depends(get_db)) -> dict:
    try:
        user = setup_service.create_first_admin(
            db, email=payload.email, username=payload.username, password=payload.password
        )
    except setup_service.SetupError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    setup_service.set_step(db, 5)
    db.commit()
    return {"id": user.id, "username": user.username}


@router.put("/smtp", dependencies=_gated)
def save_smtp(payload: SmtpIn, db: Session = Depends(get_db)) -> dict:
    settings_service.save_smtp(
        db,
        host=payload.host,
        port=payload.port,
        tls_mode=payload.tls_mode,
        from_address=payload.from_address,
        from_name=payload.from_name,
        username=payload.username,
        password=payload.password,
    )
    setup_service.set_step(db, 6)
    db.commit()
    return settings_service.smtp_masked(db)


@router.post("/smtp/test", response_model=OpResult, dependencies=_gated)
def smtp_test(payload: SmtpTestIn) -> OpResult:
    return OpResult(
        **setup_service.test_smtp(
            host=payload.host,
            port=payload.port,
            tls_mode=payload.tls_mode,
            username=payload.username,
            password=payload.password,
            from_address=payload.from_address,
        )
    )


@router.put("/ad", dependencies=_gated)
def save_ad(payload: LdapIn, db: Session = Depends(get_db)) -> dict:
    settings_service.save_ldap(
        db,
        server_uri=payload.server_uri,
        base_dn=payload.base_dn,
        bind_dn=payload.bind_dn,
        bind_pw=payload.bind_pw,
        user_filter=payload.user_filter,
        group_filter=payload.group_filter,
        attr_mapping=payload.attr_mapping,
        users_group=payload.users_group,
        admins_group=payload.admins_group,
        sso_enabled=payload.sso_enabled,
    )
    setup_service.set_step(db, 7)
    db.commit()
    return {"ok": True}


@router.post("/ad/test", response_model=OpResult, dependencies=_gated)
def ad_test(payload: LdapTestIn) -> OpResult:
    return OpResult(
        **setup_service.test_ldap(
            server_uri=payload.server_uri, bind_dn=payload.bind_dn, bind_pw=payload.bind_pw
        )
    )


@router.put("/platform", dependencies=_gated)
def save_platform(payload: PlatformIn, db: Session = Depends(get_db)) -> dict:
    settings_service.save_platform(db, **payload.model_dump())
    setup_service.set_step(db, 8)
    db.commit()
    return payload.model_dump()


@router.post("/complete", dependencies=_gated)
def complete(db: Session = Depends(get_db)) -> dict:
    try:
        setup_service.complete(db)
    except setup_service.SetupError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    db.commit()
    return {"setup_completed": True}
```

Modify `app/main.py`:

```python
import logging

from fastapi import FastAPI

from app.api.routers import auth, setup
from app.core.config import get_settings

logger = logging.getLogger("app.setup")

app = FastAPI(title="Eurospital Eventi API")
app.include_router(auth.router)
app.include_router(setup.router)


@app.on_event("startup")
def _log_setup_token() -> None:
    # Surface the bootstrap token once on boot so the operator can open /setup.
    # Skipped when setup is already complete to avoid leaking it in steady state.
    from app.db.session import SessionLocal
    from app.services import settings_service

    db = SessionLocal()
    try:
        if not settings_service.get_platform(db).setup_completed:
            logger.warning("SETUP TOKEN: %s", get_settings().setup_token)
    finally:
        db.close()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_setup_api.py -v`
Expected: PASS

> Note: `db/migrate` is covered by `test_run_migrations_reports_tables` (Task 6) rather than the API test, because the endpoint runs Alembic on its own engine outside the test transaction.

- [ ] **Step 5: Run full backend suite**

Run: `cd backend && python -m pytest -v`
Expected: all green

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routers/setup.py backend/app/main.py backend/tests/test_setup_api.py
git commit -m "feat(f2): /api/setup router + startup token log"
```

---

## Frontend

### Task 10: Frontend tooling — Tailwind, shadcn, Query, Zod, Vitest

**Files:**
- Modify: `package.json`
- Create: `tailwind.config.ts`, `postcss.config.mjs`, `app/globals.css` (import), `vitest.config.ts`, `lib/utils.ts`, `components/providers.tsx`

- [ ] **Step 1: Install dependencies**

Run:

```bash
cd frontend
pnpm add @tanstack/react-query zod clsx tailwind-merge class-variance-authority lucide-react
pnpm add -D tailwindcss postcss autoprefixer vitest @testing-library/react @testing-library/jest-dom @vitejs/plugin-react jsdom
```

Expected: dependencies added to `package.json`

- [ ] **Step 2: Init Tailwind**

Run: `cd frontend && npx tailwindcss init -p --ts`
Then set `tailwind.config.ts` `content`:

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

Create/replace `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Ensure `app/layout.tsx` imports it: add `import "./globals.css";` at the top.

- [ ] **Step 3: Add cn util + providers + test script**

`lib/utils.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

`components/providers.tsx`:

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

Wrap `app/layout.tsx` body children with `<Providers>`.

`vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true },
});
```

Add to `package.json` `scripts`: `"test": "vitest run"`.

- [ ] **Step 4: Verify build + empty test run**

Run: `cd frontend && pnpm test --passWithNoTests && pnpm build`
Expected: build succeeds, vitest runs with no tests

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "chore(f2): frontend tooling (tailwind, query, zod, vitest)"
```

---

### Task 11: Setup API client + Zod schemas

**Files:**
- Create: `lib/setup-api.ts`, `lib/setup-schemas.ts`
- Test: `__tests__/setup-schemas.test.ts`

- [ ] **Step 1: Write the failing test**

`__tests__/setup-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { adminSchema } from "@/lib/setup-schemas";

describe("adminSchema", () => {
  it("rejects short password", () => {
    const r = adminSchema.safeParse({ email: "a@b.it", username: "abc", password: "short" });
    expect(r.success).toBe(false);
  });
  it("accepts valid admin", () => {
    const r = adminSchema.safeParse({
      email: "a@b.it", username: "admin", password: "StrongPass1!",
    });
    expect(r.success).toBe(true);
  });
});
```

Ensure `tsconfig.json` has `"paths": { "@/*": ["./*"] }` (Next default). If `@` alias not resolved by Vitest, add to `vitest.config.ts`:

```ts
  resolve: { alias: { "@": new URL("./", import.meta.url).pathname } },
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test setup-schemas`
Expected: FAIL — cannot find `@/lib/setup-schemas`

- [ ] **Step 3: Implement schemas + client**

`lib/setup-schemas.ts`:

```ts
import { z } from "zod";

export const adminSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(100),
  password: z.string().min(8).max(128),
});
export type AdminInput = z.infer<typeof adminSchema>;

export const smtpSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().positive(),
  tls_mode: z.enum(["none", "starttls", "ssl"]).default("starttls"),
  from_address: z.string().email(),
  from_name: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});
export type SmtpInput = z.infer<typeof smtpSchema>;

export const platformSchema = z.object({
  name: z.string().min(1),
  primary_color: z.string().default("#0a66c2"),
  language: z.string().default("it"),
  timezone: z.string().default("Europe/Rome"),
  public_url: z.string().optional(),
});
export type PlatformInput = z.infer<typeof platformSchema>;
```

`lib/setup-api.ts`:

```ts
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

async function call<T>(path: string, method: string, token?: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["X-Setup-Token"] = token;
  const res = await fetch(`${BASE}/api/setup${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type SetupStatus = { setup_completed: boolean; current_step: number };
export type OpResult = { ok: boolean; error?: string | null };
export type MigrateResult = { revision: string; tables: string[]; views: string[] };

export const setupApi = {
  status: () => call<SetupStatus>("/status", "GET"),
  dbTest: (t: string) => call<OpResult>("/db/test", "POST", t),
  migrate: (t: string) => call<MigrateResult>("/db/migrate", "POST", t),
  createAdmin: (t: string, body: unknown) => call<{ id: number }>("/admin", "POST", t, body),
  saveSmtp: (t: string, body: unknown) => call<Record<string, unknown>>("/smtp", "PUT", t, body),
  testSmtp: (t: string, body: unknown) => call<OpResult>("/smtp/test", "POST", t, body),
  saveAd: (t: string, body: unknown) => call<OpResult>("/ad", "PUT", t, body),
  testAd: (t: string, body: unknown) => call<OpResult>("/ad/test", "POST", t, body),
  savePlatform: (t: string, body: unknown) => call<Record<string, unknown>>("/platform", "PUT", t, body),
  complete: (t: string) => call<{ setup_completed: boolean }>("/complete", "POST", t),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm test setup-schemas`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/ frontend/__tests__/setup-schemas.test.ts frontend/vitest.config.ts
git commit -m "feat(f2): setup api client + zod schemas"
```

---

### Task 12: Stepper component

**Files:**
- Create: `components/stepper.tsx`
- Test: `__tests__/stepper.test.tsx`

- [ ] **Step 1: Write the failing test**

`__tests__/stepper.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stepper } from "@/components/stepper";

describe("Stepper", () => {
  it("marks current step active and prior steps done", () => {
    render(<Stepper steps={["A", "B", "C"]} current={1} />);
    expect(screen.getByText("A").closest("li")).toHaveAttribute("data-state", "done");
    expect(screen.getByText("B").closest("li")).toHaveAttribute("data-state", "active");
    expect(screen.getByText("C").closest("li")).toHaveAttribute("data-state", "todo");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test stepper`
Expected: FAIL — cannot find `@/components/stepper`

- [ ] **Step 3: Implement the stepper**

`components/stepper.tsx`:

```tsx
import { cn } from "@/lib/utils";

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap gap-2">
      {steps.map((label, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li
            key={label}
            data-state={state}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1 text-sm",
              state === "active" && "bg-blue-600 text-white",
              state === "done" && "bg-blue-100 text-blue-700",
              state === "todo" && "bg-gray-100 text-gray-500",
            )}
          >
            <span className="font-medium">{i + 1}</span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm test stepper`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/components/stepper.tsx frontend/__tests__/stepper.test.tsx
git commit -m "feat(f2): stepper component"
```

---

### Task 13: Setup layout guard + page orchestrator

**Files:**
- Create: `app/setup/layout.tsx`, `app/setup/page.tsx`

- [ ] **Step 1: Implement the guard layout**

`app/setup/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { setupApi } from "@/lib/setup-api";

export const dynamic = "force-dynamic";

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  try {
    const status = await setupApi.status();
    if (status.setup_completed) redirect("/login");
  } catch {
    // backend unreachable: still render the wizard (step 1 explains DB config)
  }
  return <div className="mx-auto max-w-2xl p-6">{children}</div>;
}
```

- [ ] **Step 2: Implement the orchestrator page**

`app/setup/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Stepper } from "@/components/stepper";
import { setupApi } from "@/lib/setup-api";
import { Welcome } from "./steps/01-welcome";
import { DbConfig } from "./steps/02-db-config";
import { DbTest } from "./steps/03-db-test";
import { Schema } from "./steps/04-schema";
import { AdminStep } from "./steps/05-admin";
import { SmtpStep } from "./steps/06-smtp";
import { AdStep } from "./steps/07-ad";
import { PlatformStep } from "./steps/08-platform";
import { Summary } from "./steps/09-summary";
import { Done } from "./steps/10-done";

const LABELS = [
  "Benvenuto", "MySQL", "Test DB", "Schema", "Admin",
  "SMTP", "AD/SSO", "Piattaforma", "Riepilogo", "Fine",
];

export default function SetupPage() {
  const [step, setStep] = useState(0);
  const [token, setToken] = useState("");

  useEffect(() => {
    setupApi.status().then((s) => setStep(s.current_step)).catch(() => {});
  }, []);

  const next = () => setStep((s) => Math.min(s + 1, 9));
  const props = { token, next };

  const screens = [
    <Welcome key="w" token={token} setToken={setToken} next={next} />,
    <DbConfig key="db" {...props} />,
    <DbTest key="t" {...props} />,
    <Schema key="s" {...props} />,
    <AdminStep key="a" {...props} />,
    <SmtpStep key="smtp" {...props} />,
    <AdStep key="ad" {...props} />,
    <PlatformStep key="p" {...props} />,
    <Summary key="sum" {...props} />,
    <Done key="d" {...props} />,
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Configurazione iniziale</h1>
      <Stepper steps={LABELS} current={step} />
      <div className="rounded-lg border bg-white p-6 shadow-sm">{screens[step]}</div>
    </div>
  );
}
```

- [ ] **Step 3: Commit (steps stubbed next — build after Task 14)**

```bash
git add frontend/app/setup/layout.tsx frontend/app/setup/page.tsx
git commit -m "feat(f2): setup layout guard + orchestrator"
```

---

### Task 14: Step components (10 screens)

**Files:**
- Create: `app/setup/steps/01-welcome.tsx` … `10-done.tsx`

Shared prop shape: every step (except Welcome) receives `{ token: string; next: () => void }`. Welcome also receives `setToken`.

- [ ] **Step 1: Create the four core (required) steps**

`app/setup/steps/01-welcome.tsx`:

```tsx
"use client";

export function Welcome({
  token, setToken, next,
}: { token: string; setToken: (v: string) => void; next: () => void }) {
  return (
    <div className="space-y-4">
      <p>Benvenuto nella configurazione di Eurospital Eventi. Inserisci il token di setup mostrato nei log del backend all'avvio.</p>
      <input
        className="w-full rounded border p-2"
        placeholder="SETUP_TOKEN"
        value={token}
        onChange={(e) => setToken(e.target.value)}
      />
      <button
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        disabled={!token}
        onClick={next}
      >
        Continua
      </button>
    </div>
  );
}
```

`app/setup/steps/02-db-config.tsx`:

```tsx
"use client";

export function DbConfig({ next }: { token: string; next: () => void }) {
  return (
    <div className="space-y-4">
      <p>La connessione al MySQL esterno usa le credenziali da <code>.env</code> (host, porta, database, utente). Nel prossimo passo testiamo la connessione.</p>
      <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={next}>
        Vai al test
      </button>
    </div>
  );
}
```

`app/setup/steps/03-db-test.tsx`:

```tsx
"use client";

import { useState } from "react";
import { setupApi } from "@/lib/setup-api";

export function DbTest({ token, next }: { token: string; next: () => void }) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function run() {
    setState("loading");
    try {
      const r = await setupApi.dbTest(token);
      if (r.ok) setState("ok");
      else { setState("error"); setMsg(r.error ?? "Errore sconosciuto"); }
    } catch (e) {
      setState("error");
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={run} disabled={state === "loading"}>
        {state === "loading" ? "Test in corso…" : "Testa connessione"}
      </button>
      {state === "ok" && <p className="text-green-700">Connessione riuscita.</p>}
      {state === "error" && <p className="text-red-700">Errore: {msg}</p>}
      {state === "ok" && (
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={next}>Continua</button>
      )}
    </div>
  );
}
```

`app/setup/steps/04-schema.tsx`:

```tsx
"use client";

import { useState } from "react";
import { setupApi } from "@/lib/setup-api";

export function Schema({ token, next }: { token: string; next: () => void }) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [tables, setTables] = useState<string[]>([]);
  const [msg, setMsg] = useState("");

  async function run() {
    setState("loading");
    try {
      const r = await setupApi.migrate(token);
      setTables(r.tables);
      setState("ok");
    } catch (e) {
      setState("error");
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <p>Applica le migrazioni e crea lo schema sul database esterno.</p>
      <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={run} disabled={state === "loading"}>
        {state === "loading" ? "Creazione…" : "Crea schema"}
      </button>
      {state === "error" && <p className="text-red-700">Errore: {msg}</p>}
      {state === "ok" && (
        <>
          <p className="text-green-700">Schema creato: {tables.length} tabelle.</p>
          <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={next}>Continua</button>
        </>
      )}
    </div>
  );
}
```

`app/setup/steps/05-admin.tsx`:

```tsx
"use client";

import { useState } from "react";
import { setupApi } from "@/lib/setup-api";
import { adminSchema } from "@/lib/setup-schemas";

export function AdminStep({ token, next }: { token: string; next: () => void }) {
  const [form, setForm] = useState({ email: "", username: "", password: "" });
  const [error, setError] = useState("");

  async function submit() {
    const parsed = adminSchema.safeParse(form);
    if (!parsed.success) {
      setError("Controlla email, username (min 3) e password (min 8).");
      return;
    }
    try {
      await setupApi.createAdmin(token, parsed.data);
      next();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-3">
      <p>Crea il primo amministratore (super_admin).</p>
      {(["email", "username", "password"] as const).map((f) => (
        <input
          key={f}
          className="w-full rounded border p-2"
          type={f === "password" ? "password" : "text"}
          placeholder={f}
          value={form[f]}
          onChange={(e) => setForm({ ...form, [f]: e.target.value })}
        />
      ))}
      {error && <p className="text-red-700">{error}</p>}
      <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={submit}>Crea admin</button>
    </div>
  );
}
```

- [ ] **Step 2: Create the three optional steps (SMTP, AD, Platform)**

`app/setup/steps/06-smtp.tsx`:

```tsx
"use client";

import { useState } from "react";
import { setupApi } from "@/lib/setup-api";

export function SmtpStep({ token, next }: { token: string; next: () => void }) {
  const [form, setForm] = useState({ host: "", port: "587", from_address: "", password: "" });
  const [msg, setMsg] = useState("");

  async function save() {
    try {
      await setupApi.saveSmtp(token, { ...form, port: Number(form.port) });
      next();
    } catch (e) { setMsg((e as Error).message); }
  }
  async function test() {
    try {
      const r = await setupApi.testSmtp(token, { ...form, port: Number(form.port) });
      setMsg(r.ok ? "Email di test inviata." : `Errore: ${r.error}`);
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div className="space-y-3">
      <p>Configura SMTP (opzionale).</p>
      {(["host", "port", "from_address", "password"] as const).map((f) => (
        <input
          key={f}
          className="w-full rounded border p-2"
          type={f === "password" ? "password" : "text"}
          placeholder={f}
          value={form[f]}
          onChange={(e) => setForm({ ...form, [f]: e.target.value })}
        />
      ))}
      {msg && <p className="text-sm text-gray-700">{msg}</p>}
      <div className="flex gap-2">
        <button className="rounded border px-4 py-2" onClick={test}>Invia test</button>
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={save}>Salva</button>
        <button className="rounded border px-4 py-2" onClick={next}>Configura dopo</button>
      </div>
    </div>
  );
}
```

`app/setup/steps/07-ad.tsx`:

```tsx
"use client";

import { useState } from "react";
import { setupApi } from "@/lib/setup-api";

export function AdStep({ token, next }: { token: string; next: () => void }) {
  const [form, setForm] = useState({ server_uri: "", base_dn: "", bind_dn: "", bind_pw: "" });
  const [msg, setMsg] = useState("");

  async function save() {
    try { await setupApi.saveAd(token, { ...form, attr_mapping: {} }); next(); }
    catch (e) { setMsg((e as Error).message); }
  }
  async function test() {
    try {
      const r = await setupApi.testAd(token, {
        server_uri: form.server_uri, bind_dn: form.bind_dn, bind_pw: form.bind_pw,
      });
      setMsg(r.ok ? "Bind LDAP riuscito." : `Errore: ${r.error}`);
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div className="space-y-3">
      <p>Configura Active Directory / LDAP (opzionale).</p>
      {(["server_uri", "base_dn", "bind_dn", "bind_pw"] as const).map((f) => (
        <input
          key={f}
          className="w-full rounded border p-2"
          type={f === "bind_pw" ? "password" : "text"}
          placeholder={f}
          value={form[f]}
          onChange={(e) => setForm({ ...form, [f]: e.target.value })}
        />
      ))}
      {msg && <p className="text-sm text-gray-700">{msg}</p>}
      <div className="flex gap-2">
        <button className="rounded border px-4 py-2" onClick={test}>Testa bind</button>
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={save}>Salva</button>
        <button className="rounded border px-4 py-2" onClick={next}>Configura dopo</button>
      </div>
    </div>
  );
}
```

`app/setup/steps/08-platform.tsx`:

```tsx
"use client";

import { useState } from "react";
import { setupApi } from "@/lib/setup-api";

export function PlatformStep({ token, next }: { token: string; next: () => void }) {
  const [form, setForm] = useState({
    name: "Eurospital Eventi", primary_color: "#0a66c2", language: "it", timezone: "Europe/Rome",
  });
  const [msg, setMsg] = useState("");

  async function save() {
    try { await setupApi.savePlatform(token, form); next(); }
    catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div className="space-y-3">
      <p>Configurazione base della piattaforma (opzionale).</p>
      {(["name", "primary_color", "language", "timezone"] as const).map((f) => (
        <input
          key={f}
          className="w-full rounded border p-2"
          placeholder={f}
          value={form[f]}
          onChange={(e) => setForm({ ...form, [f]: e.target.value })}
        />
      ))}
      {msg && <p className="text-red-700">{msg}</p>}
      <div className="flex gap-2">
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={save}>Salva</button>
        <button className="rounded border px-4 py-2" onClick={next}>Usa default</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create summary + done steps**

`app/setup/steps/09-summary.tsx`:

```tsx
"use client";

export function Summary({ next }: { token: string; next: () => void }) {
  return (
    <div className="space-y-4">
      <p>Hai completato i passaggi di configurazione. Premi per finalizzare il setup.</p>
      <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={next}>Vai al completamento</button>
    </div>
  );
}
```

`app/setup/steps/10-done.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { setupApi } from "@/lib/setup-api";

export function Done({ token }: { token: string; next: () => void }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setupApi.complete(token)
      .then(() => setState("ok"))
      .catch((e) => { setState("error"); setMsg((e as Error).message); });
  }, [token]);

  if (state === "loading") return <p>Finalizzazione…</p>;
  if (state === "error") return <p className="text-red-700">Errore: {msg}</p>;
  return (
    <div className="space-y-4">
      <p className="text-green-700">Setup completato! La piattaforma è pronta.</p>
      <a className="rounded bg-blue-600 px-4 py-2 text-white" href="/login">Vai al login</a>
    </div>
  );
}
```

- [ ] **Step 4: Build to verify everything compiles**

Run: `cd frontend && pnpm build`
Expected: build succeeds (all step imports in `page.tsx` resolve)

- [ ] **Step 5: Run frontend tests**

Run: `cd frontend && pnpm test`
Expected: PASS (schemas + stepper)

- [ ] **Step 6: Commit**

```bash
git add frontend/app/setup/steps/
git commit -m "feat(f2): 10 wizard step components"
```

---

### Task 15: End-to-end manual verification + docs

**Files:**
- Modify: `INSTALL.md` (add wizard section)

- [ ] **Step 1: Run the full stack and walk the wizard**

Run backend + frontend (dev), open `http://localhost:3000/setup`. Read `SETUP TOKEN` from backend logs, paste at step 1, walk: test DB → create schema → admin → skip SMTP/AD/platform → complete. Confirm redirect to `/login` and that revisiting `/setup` redirects away (409 → guard).

Capture evidence with gstack browse:

```bash
$B goto http://localhost:3000/setup
$B snapshot -i
$B screenshot /tmp/f2-wizard.png
```

- [ ] **Step 2: Document the wizard in INSTALL.md**

Add a section to `INSTALL.md`:

```markdown
## Prima configurazione (setup wizard)

1. Avvia lo stack: `docker compose up -d`.
2. Leggi il `SETUP TOKEN` dai log del backend: `docker compose logs backend | grep "SETUP TOKEN"`.
3. Apri `https://eventi.eurospital.it/setup`.
4. Inserisci il token, testa la connessione al MySQL esterno, crea lo schema, crea l'amministratore.
5. SMTP, AD/SSO e configurazione base sono opzionali ("Configura dopo").
6. Al termine il wizard si blocca e la piattaforma reindirizza al login.
```

- [ ] **Step 3: Commit**

```bash
git add INSTALL.md
git commit -m "docs(f2): setup wizard instructions"
```

---

## Self-Review Notes

- **Spec coverage:** §2 models → Task 2/3; §3 migration runtime → Task 6 `run_migrations` + Task 9 `/db/migrate`; §4 every endpoint → Task 9; §5 frontend 10 steps + token-in-memory + guard → Tasks 10–14; §6 security (409 after complete, token gating, Fernet, upgrade-only, startup log) → Tasks 4/8/9; §7 tests → Tasks 4/6/9/11/12; §8 out-of-scope respected (LDAP test bind only, no real login; SMTP test one-shot, no worker).
- **Gating order:** `require_setup_open` listed before `require_setup_token` so a completed setup returns 409 even with a valid token. The API test `test_endpoints_require_token` runs before completion, so 403 is returned (open passes, token fails) — consistent.
- **Type consistency:** service fn names (`test_db_connection`, `run_migrations`, `create_first_admin`, `super_admin_exists`, `complete`, `test_smtp`, `test_ldap`) match between Task 6 definitions and Task 9 router calls. Frontend `setupApi` method names match `page.tsx`/step usages.
- **Known integration-test note:** `/db/migrate` is verified via the service test (Task 6), not the API test, because it runs Alembic on a separate engine outside the per-test rollback transaction (documented inline in Task 9 Step 4).
