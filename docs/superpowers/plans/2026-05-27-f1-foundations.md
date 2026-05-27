# F1 Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Identity & RBAC database (Alembic migrations), local authentication (Argon2id + JWT access tokens with revocable DB-stored refresh tokens), an at-rest crypto utility, and a `create-admin` CLI — so that an admin can log in via `/api/auth/login`.

**Architecture:** Layered FastAPI backend — `routers → services → models`. SQLAlchemy 2.0 ORM + Alembic. `pydantic-settings` config from env. Permissions are resolved server-side from the DB on every request (tokens carry only the user id). Dev and CI run a real MySQL 8 container; production uses the external DBA-provided DB.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, PyMySQL, argon2-cffi, PyJWT, cryptography (Fernet), pydantic-settings, pytest. MySQL 8 (dev/CI container).

**Reference spec:** `docs/superpowers/specs/2026-05-27-f1-foundations-design.md`

---

## Canonical interfaces (used across tasks — keep names exact)

`app/core/config.py` — `Settings` (pydantic-settings):
- fields: `mysql_host: str = "127.0.0.1"`, `mysql_port: int = 3306`, `mysql_db: str = "eventi_dev"`, `mysql_user: str = "eventi"`, `mysql_password: str = "eventi"`, `database_url: str | None = None`, `test_database_url: str | None = None`, `jwt_secret: str = "dev-insecure-change-me"`, `access_token_expire_minutes: int = 15`, `refresh_token_expire_days: int = 7`, `app_secret_key: str = "dev-insecure-change-me"`
- property `sqlalchemy_url -> str`: returns `database_url` if set, else `f"mysql+pymysql://{mysql_user}:{mysql_password}@{mysql_host}:{mysql_port}/{mysql_db}"`
- singleton accessor `get_settings() -> Settings` (lru_cache)

`app/core/security.py`:
- `hash_password(password: str) -> str`
- `verify_password(password: str, hashed: str) -> bool`
- `create_access_token(subject: str) -> str` (HS256, exp from settings)
- `decode_token(token: str) -> dict` (raises `TokenError` on invalid/expired)
- `generate_refresh_token() -> str` (opaque, urlsafe)
- `hash_refresh_token(token: str) -> str` (sha256 hex)
- constant `ALGORITHM = "HS256"`; exception `TokenError(Exception)`

`app/core/crypto.py`:
- `encrypt(plaintext: str) -> str`
- `decrypt(token: str) -> str`

`app/db/base.py`: `Base` (DeclarativeBase) with constraint naming convention; `metadata`.
`app/db/session.py`: `engine`, `SessionLocal`, `get_db()` generator.

Models (`app/models/`): `User`, `Role`, `Permission`, `RefreshToken`; association tables `user_roles`, `role_permissions`.

Services (`app/services/`):
- `user_service.create_user(db, *, email, username, password, full_name=None) -> User`
- `user_service.get_by_identifier(db, identifier) -> User | None`
- `user_service.assign_role(db, user, role_name) -> None`
- `user_service.get_user_permissions(db, user) -> set[str]`
- `rbac.user_has_permission(db, user, code) -> bool`
- `auth_service.authenticate(db, identifier, password) -> User | None`
- `auth_service.issue_token_pair(db, user) -> tuple[str, str]`  (access, refresh)
- `auth_service.rotate_refresh(db, refresh_token) -> tuple[str, str]`  (raises `AuthError`)
- `auth_service.revoke_refresh(db, refresh_token) -> None`
- exception `auth_service.AuthError(Exception)`

Schemas (`app/schemas/`): `LoginRequest{identifier,password}`, `RefreshRequest{refresh_token}`, `TokenPair{access_token,refresh_token,token_type}`, `UserOut{id,email,username,full_name,roles,permissions}`.

API (`app/api/`): `deps.get_db`, `deps.get_current_user`, `deps.require_permission(code)`; `routers/auth.py` router at prefix `/api/auth`.

Permission catalog (seed): `users.read`, `users.write`, `roles.read`, `roles.write`, `permissions.read`. Base role: `super_admin` (all permissions).

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/pyproject.toml` | add F1 deps |
| `backend/app/core/config.py` | settings |
| `backend/app/core/crypto.py` | Fernet at-rest |
| `backend/app/core/security.py` | argon2 + JWT + refresh token helpers |
| `backend/app/db/base.py` | DeclarativeBase + naming convention |
| `backend/app/db/session.py` | engine, SessionLocal, get_db |
| `backend/app/models/*.py` | ORM models + associations |
| `backend/alembic.ini`, `backend/alembic/env.py` | Alembic config |
| `backend/alembic/versions/0001_initial_rbac.py` | schema migration |
| `backend/alembic/versions/0002_seed_rbac.py` | data migration (permissions + super_admin) |
| `backend/app/services/*.py` | user_service, rbac, auth_service |
| `backend/app/schemas/*.py` | auth + user schemas |
| `backend/app/api/deps.py` | DI: db, current user, require_permission |
| `backend/app/api/routers/auth.py` | auth endpoints |
| `backend/app/cli.py` | create-admin command |
| `backend/app/main.py` (modify) | include auth router |
| `backend/tests/conftest.py` | test DB engine + migration + rollback fixtures |
| `backend/tests/*` | unit + integration tests |
| `docker-compose.yml` (modify) | mysql service under `dev` profile |
| `docker/mysql-init/01-create-test-db.sql` | create `eventi_test` schema |
| `.env.example` (modify) | F1 env keys |
| `.github/workflows/ci.yml` (modify) | mysql service for backend job |

---

## Task 1: Dev/CI MySQL + dependencies + settings

**Files:**
- Modify: `backend/pyproject.toml`
- Create: `backend/app/core/__init__.py`, `backend/app/core/config.py`
- Create: `docker/mysql-init/01-create-test-db.sql`
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Test: `backend/tests/test_config.py`

- [ ] **Step 1: Add dependencies to `backend/pyproject.toml`**

Replace the `dependencies` array so it reads exactly:

```toml
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "sqlalchemy>=2.0",
    "alembic>=1.13",
    "pymysql>=1.1",
    "cryptography>=43",
    "argon2-cffi>=23.1",
    "pyjwt>=2.9",
    "pydantic-settings>=2.5",
]
```

Leave the `[dependency-groups] dev` array as-is (ruff, pytest, httpx).

- [ ] **Step 2: Sync deps**

Run:
```bash
cd /home/eurospital/Eurospital_Eventi/backend && uv sync
```
Expected: resolves and installs the new packages, updates `uv.lock`.

- [ ] **Step 3: Create `docker/mysql-init/01-create-test-db.sql`**

```sql
CREATE DATABASE IF NOT EXISTS eventi_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON eventi_test.* TO 'eventi'@'%';
FLUSH PRIVILEGES;
```

- [ ] **Step 4: Add the `mysql` dev service to `docker-compose.yml`**

Add this service under `services:` (keep existing backend/frontend/nginx unchanged). It is gated behind the `dev` profile so it does NOT start by default (production uses the external DB):

```yaml
  mysql:
    image: mysql:8
    profiles: ["dev"]
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: eventi_dev
      MYSQL_USER: eventi
      MYSQL_PASSWORD: eventi
    command: ["--default-authentication-plugin=mysql_native_password"]
    ports:
      - "127.0.0.1:3307:3306"
    volumes:
      - ./docker/mysql-init:/docker-entrypoint-initdb.d:ro
      - mysql_dev_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-proot"]
      interval: 5s
      timeout: 3s
      retries: 20
    networks:
      - eventi
```

And add a top-level `volumes:` block (after the `networks:` block):

```yaml
volumes:
  mysql_dev_data:
```

- [ ] **Step 5: Add F1 keys to `.env.example`**

Append these lines to `.env.example`:

```dotenv

# --- F1: auth & DB ---
# Connessione applicativa (prod: MySQL esterno DBA). In dev usa il container (porta 3307).
# Override esplicito opzionale (ha precedenza su MYSQL_*):
# DATABASE_URL=mysql+pymysql://user:pass@host:3306/dbname
# DB di test (dev: container; CI: service). Esempio dev:
TEST_DATABASE_URL=mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test
# JWT
JWT_SECRET=change-me-with-a-long-random-secret
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
```

(`APP_SECRET_KEY`, `MYSQL_*` already present from F0. Dev MySQL_* should point at 127.0.0.1:3307 / eventi_dev / eventi / eventi when running locally.)

- [ ] **Step 6: Write the failing test `backend/tests/test_config.py`**

```python
from app.core.config import Settings


def test_sqlalchemy_url_built_from_components():
    s = Settings(
        mysql_host="db",
        mysql_port=3306,
        mysql_db="eventi",
        mysql_user="u",
        mysql_password="p",
        database_url=None,
    )
    assert s.sqlalchemy_url == "mysql+pymysql://u:p@db:3306/eventi"


def test_explicit_database_url_overrides_components():
    s = Settings(database_url="mysql+pymysql://x:y@h:3306/d")
    assert s.sqlalchemy_url == "mysql+pymysql://x:y@h:3306/d"
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd /home/eurospital/Eurospital_Eventi/backend && uv run pytest tests/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core'`.

- [ ] **Step 8: Create `backend/app/core/__init__.py` (empty) and `backend/app/core/config.py`**

```python
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mysql_host: str = "127.0.0.1"
    mysql_port: int = 3306
    mysql_db: str = "eventi_dev"
    mysql_user: str = "eventi"
    mysql_password: str = "eventi"

    database_url: str | None = None
    test_database_url: str | None = None

    jwt_secret: str = "dev-insecure-change-me"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    app_secret_key: str = "dev-insecure-change-me"

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"mysql+pymysql://{self.mysql_user}:{self.mysql_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd /home/eurospital/Eurospital_Eventi/backend && uv run pytest tests/test_config.py -v`
Expected: 2 passed.

- [ ] **Step 10: Bring up dev MySQL (needed by later tasks) and verify it is reachable**

Run:
```bash
cd /home/eurospital/Eurospital_Eventi
docker compose --profile dev up -d mysql
# wait for healthy
until [ "$(docker inspect -f '{{.State.Health.Status}}' $(docker compose ps -q mysql))" = "healthy" ]; do sleep 2; done
docker compose exec -T mysql mysql -ueventi -peventi -e "SHOW DATABASES;" | grep eventi_test
```
Expected: `eventi_test` listed (init script created it). Leave MySQL running for subsequent tasks.

- [ ] **Step 11: Commit**

```bash
cd /home/eurospital/Eurospital_Eventi
git add backend/pyproject.toml backend/uv.lock backend/app/core docker/mysql-init docker-compose.yml .env.example backend/tests/test_config.py
git commit -m "feat(f1): deps, settings, dev/CI MySQL container"
```

---

## Task 2: Crypto utility (Fernet at-rest) — TDD

**Files:**
- Create: `backend/app/core/crypto.py`
- Test: `backend/tests/test_crypto.py`

- [ ] **Step 1: Write the failing test `backend/tests/test_crypto.py`**

```python
from app.core import crypto


def test_encrypt_decrypt_roundtrip():
    secret = "smtp-password-123"
    token = crypto.encrypt(secret)
    assert token != secret
    assert crypto.decrypt(token) == secret


def test_encrypt_is_non_deterministic():
    a = crypto.encrypt("same")
    b = crypto.encrypt("same")
    assert a != b
    assert crypto.decrypt(a) == crypto.decrypt(b) == "same"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/eurospital/Eurospital_Eventi/backend && uv run pytest tests/test_crypto.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.crypto'`.

- [ ] **Step 3: Implement `backend/app/core/crypto.py`**

```python
import base64
import hashlib

from cryptography.fernet import Fernet

from app.core.config import get_settings


def _fernet() -> Fernet:
    # Derive a stable 32-byte urlsafe key from APP_SECRET_KEY.
    digest = hashlib.sha256(get_settings().app_secret_key.encode()).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/eurospital/Eurospital_Eventi/backend && uv run pytest tests/test_crypto.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
cd /home/eurospital/Eurospital_Eventi
git add backend/app/core/crypto.py backend/tests/test_crypto.py
git commit -m "feat(f1): Fernet at-rest crypto utility"
```

---

## Task 3: Security (Argon2id + JWT + refresh helpers) — TDD

**Files:**
- Create: `backend/app/core/security.py`
- Test: `backend/tests/test_security.py`

- [ ] **Step 1: Write the failing test `backend/tests/test_security.py`**

```python
import time

import pytest

from app.core import security


def test_hash_and_verify_password():
    hashed = security.hash_password("s3cret")
    assert hashed != "s3cret"
    assert security.verify_password("s3cret", hashed) is True
    assert security.verify_password("wrong", hashed) is False


def test_access_token_roundtrip():
    token = security.create_access_token("42")
    payload = security.decode_token(token)
    assert payload["sub"] == "42"
    assert payload["type"] == "access"


def test_decode_rejects_tampered_token():
    token = security.create_access_token("1")
    with pytest.raises(security.TokenError):
        security.decode_token(token + "x")


def test_refresh_token_helpers():
    raw = security.generate_refresh_token()
    assert len(raw) >= 32
    h = security.hash_refresh_token(raw)
    assert h == security.hash_refresh_token(raw)
    assert h != raw
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/eurospital/Eurospital_Eventi/backend && uv run pytest tests/test_security.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.security'`.

- [ ] **Step 3: Implement `backend/app/core/security.py`**

```python
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError

from app.core.config import get_settings

ALGORITHM = "HS256"

_hasher = PasswordHasher()


class TokenError(Exception):
    pass


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _hasher.verify(hashed, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def create_access_token(subject: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/eurospital/Eurospital_Eventi/backend && uv run pytest tests/test_security.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd /home/eurospital/Eurospital_Eventi
git add backend/app/core/security.py backend/tests/test_security.py
git commit -m "feat(f1): argon2 password hashing and JWT/refresh helpers"
```

---

## Task 4: DB base + session

**Files:**
- Create: `backend/app/db/__init__.py`, `backend/app/db/base.py`, `backend/app/db/session.py`
- Test: `backend/tests/test_db_base.py`

- [ ] **Step 1: Write the failing test `backend/tests/test_db_base.py`**

```python
from app.db.base import Base


def test_metadata_has_naming_convention():
    nc = Base.metadata.naming_convention
    assert nc["pk"] == "pk_%(table_name)s"
    assert "fk" in nc and "uq" in nc and "ix" in nc
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/eurospital/Eurospital_Eventi/backend && uv run pytest tests/test_db_base.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.db'`.

- [ ] **Step 3: Create `backend/app/db/__init__.py` (empty) and `backend/app/db/base.py`**

```python
from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
```

- [ ] **Step 4: Create `backend/app/db/session.py`**

```python
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

engine = create_engine(get_settings().sqlalchemy_url, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, class_=Session)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /home/eurospital/Eurospital_Eventi/backend && uv run pytest tests/test_db_base.py -v`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
cd /home/eurospital/Eurospital_Eventi
git add backend/app/db backend/tests/test_db_base.py
git commit -m "feat(f1): SQLAlchemy declarative base and session"
```

---

## Task 5: ORM models (User, Role, Permission, RefreshToken, associations)

**Files:**
- Create: `backend/app/models/__init__.py`, `backend/app/models/associations.py`, `backend/app/models/permission.py`, `backend/app/models/role.py`, `backend/app/models/user.py`, `backend/app/models/refresh_token.py`
- Test: `backend/tests/test_models.py`

- [ ] **Step 1: Write the failing test `backend/tests/test_models.py`**

```python
from app.models import Permission, RefreshToken, Role, User


def test_model_tablenames():
    assert User.__tablename__ == "users"
    assert Role.__tablename__ == "roles"
    assert Permission.__tablename__ == "permissions"
    assert RefreshToken.__tablename__ == "refresh_tokens"


def test_user_role_permission_relationships_declared():
    # relationships exist on the mapper
    assert "roles" in User.__mapper__.relationships
    assert "permissions" in Role.__mapper__.relationships
    assert "roles" in Permission.__mapper__.relationships
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/eurospital/Eurospital_Eventi/backend && uv run pytest tests/test_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.models'`.

- [ ] **Step 3: Create `backend/app/models/associations.py`**

```python
from sqlalchemy import Column, ForeignKey, Table

from app.db.base import Base

user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)
```

- [ ] **Step 4: Create `backend/app/models/permission.py`**

```python
from sqlalchemy import BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.associations import role_permissions


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    roles: Mapped[list["Role"]] = relationship(  # noqa: F821
        secondary=role_permissions, back_populates="permissions"
    )
```

- [ ] **Step 5: Create `backend/app/models/role.py`**

```python
from sqlalchemy import BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.associations import role_permissions, user_roles


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    permissions: Mapped[list["Permission"]] = relationship(  # noqa: F821
        secondary=role_permissions, back_populates="roles"
    )
    users: Mapped[list["User"]] = relationship(  # noqa: F821
        secondary=user_roles, back_populates="roles"
    )
```

- [ ] **Step 6: Create `backend/app/models/user.py`**

```python
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.associations import user_roles


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    roles: Mapped[list["Role"]] = relationship(  # noqa: F821
        secondary=user_roles, back_populates="users"
    )
```

- [ ] **Step 7: Create `backend/app/models/refresh_token.py`**

```python
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
```

- [ ] **Step 8: Create `backend/app/models/__init__.py`**

```python
from app.models.associations import role_permissions, user_roles
from app.models.permission import Permission
from app.models.refresh_token import RefreshToken
from app.models.role import Role
from app.models.user import User

__all__ = [
    "User",
    "Role",
    "Permission",
    "RefreshToken",
    "user_roles",
    "role_permissions",
]
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd /home/eurospital/Eurospital_Eventi/backend && uv run pytest tests/test_models.py -v`
Expected: 2 passed.

- [ ] **Step 10: Commit**

```bash
cd /home/eurospital/Eurospital_Eventi
git add backend/app/models backend/tests/test_models.py
git commit -m "feat(f1): Identity & RBAC ORM models"
```

---

## Task 6: Alembic setup + initial schema migration

**Files:**
- Create: `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/script.py.mako`, `backend/alembic/versions/0001_initial_rbac.py`
- Test: `backend/tests/conftest.py`, `backend/tests/test_migration.py`

- [ ] **Step 1: Create `backend/alembic.ini`**

```ini
[alembic]
script_location = alembic
prepend_sys_path = .
sqlalchemy.url =

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARNING
handlers = console
qualname =

[logger_sqlalchemy]
level = WARNING
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

- [ ] **Step 2: Create `backend/alembic/script.py.mako`**

```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

- [ ] **Step 3: Create `backend/alembic/env.py`**

```python
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import get_settings
from app.db.base import Base
import app.models  # noqa: F401  (register all models on Base.metadata)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Prefer an explicit URL passed by tests; otherwise use settings.
if not config.get_main_option("sqlalchemy.url"):
    config.set_main_option("sqlalchemy.url", get_settings().sqlalchemy_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 4: Create the initial schema migration `backend/alembic/versions/0001_initial_rbac.py`**

```python
"""initial identity & rbac schema

Revision ID: 0001
Revises:
Create Date: 2026-05-27

"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=True),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
        sa.UniqueConstraint("username", name=op.f("uq_users_username")),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"])
    op.create_index(op.f("ix_users_username"), "users", ["username"])

    op.create_table(
        "roles",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_roles")),
        sa.UniqueConstraint("name", name=op.f("uq_roles_name")),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )

    op.create_table(
        "permissions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_permissions")),
        sa.UniqueConstraint("code", name=op.f("uq_permissions_code")),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )

    op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.BigInteger(), nullable=False),
        sa.Column("permission_id", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ["role_id"], ["roles.id"],
            name=op.f("fk_role_permissions_role_id_roles"), ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["permission_id"], ["permissions.id"],
            name=op.f("fk_role_permissions_permission_id_permissions"), ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("role_id", "permission_id", name=op.f("pk_role_permissions")),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )

    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("role_id", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name=op.f("fk_user_roles_user_id_users"), ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["role_id"], ["roles.id"],
            name=op.f("fk_user_roles_role_id_roles"), ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", "role_id", name=op.f("pk_user_roles")),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name=op.f("fk_refresh_tokens_user_id_users"), ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refresh_tokens")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_refresh_tokens_token_hash")),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index(op.f("ix_refresh_tokens_user_id"), "refresh_tokens", ["user_id"])
    op.create_index(op.f("ix_refresh_tokens_token_hash"), "refresh_tokens", ["token_hash"])


def downgrade() -> None:
    op.drop_table("refresh_tokens")
    op.drop_table("user_roles")
    op.drop_table("role_permissions")
    op.drop_table("permissions")
    op.drop_table("roles")
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
```

- [ ] **Step 5: Create `backend/tests/conftest.py`**

This wires the test DB: runs migrations once, gives each test a rolled-back session and a `TestClient` with `get_db` overridden.

```python
import os

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings


def _test_url() -> str:
    settings = get_settings()
    url = settings.test_database_url or os.environ.get("TEST_DATABASE_URL")
    if not url:
        raise RuntimeError("TEST_DATABASE_URL must be set to run tests")
    return url


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(_test_url(), pool_pre_ping=True, future=True)
    # Clean slate, then migrate to head.
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", _test_url())
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine):
    connection = engine.connect()
    trans = connection.begin()
    TestingSession = sessionmaker(bind=connection, autoflush=False, expire_on_commit=False)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        trans.rollback()
        connection.close()


@pytest.fixture
def client(db):
    from app.api.deps import get_db
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

- [ ] **Step 6: Write the migration test `backend/tests/test_migration.py`**

```python
from sqlalchemy import inspect


def test_all_tables_created(engine):
    tables = set(inspect(engine).get_table_names())
    expected = {
        "users", "roles", "permissions", "role_permissions",
        "user_roles", "refresh_tokens", "alembic_version",
    }
    assert expected.issubset(tables)
```

- [ ] **Step 7: Run the migration test (requires dev MySQL up from Task 1)**

Run:
```bash
cd /home/eurospital/Eurospital_Eventi/backend
TEST_DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" uv run pytest tests/test_migration.py -v
```
Expected: PASS — migration runs against MySQL and all tables exist.

- [ ] **Step 8: Verify `alembic upgrade head` works standalone too**

Run:
```bash
cd /home/eurospital/Eurospital_Eventi/backend
DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" uv run alembic upgrade head
DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" uv run alembic downgrade base
DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" uv run alembic upgrade head
```
Expected: all three commands succeed (idempotent up/down/up).

- [ ] **Step 9: Commit**

```bash
cd /home/eurospital/Eurospital_Eventi
git add backend/alembic.ini backend/alembic backend/tests/conftest.py backend/tests/test_migration.py
git commit -m "feat(f1): alembic setup and initial RBAC schema migration"
```

---

## Task 7: Seed RBAC data migration (permissions + super_admin)

**Files:**
- Create: `backend/alembic/versions/0002_seed_rbac.py`
- Test: `backend/tests/test_seed.py`

- [ ] **Step 1: Write the failing test `backend/tests/test_seed.py`**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd /home/eurospital/Eurospital_Eventi/backend
TEST_DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" uv run pytest tests/test_seed.py -v
```
Expected: FAIL — permissions table empty (no seed migration yet).

- [ ] **Step 3: Create `backend/alembic/versions/0002_seed_rbac.py`**

```python
"""seed base permissions and super_admin role

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-27

"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

PERMISSIONS = [
    ("users.read", "Visualizzare utenti"),
    ("users.write", "Creare/modificare utenti"),
    ("roles.read", "Visualizzare ruoli"),
    ("roles.write", "Creare/modificare ruoli"),
    ("permissions.read", "Visualizzare permessi"),
]
SUPER_ADMIN = "super_admin"


def upgrade() -> None:
    conn = op.get_bind()
    for code, desc in PERMISSIONS:
        conn.execute(
            sa.text(
                "INSERT INTO permissions (code, description) "
                "SELECT :code, :desc FROM DUAL "
                "WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = :code)"
            ),
            {"code": code, "desc": desc},
        )
    conn.execute(
        sa.text(
            "INSERT INTO roles (name, description) "
            "SELECT :name, :desc FROM DUAL "
            "WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = :name)"
        ),
        {"name": SUPER_ADMIN, "desc": "Amministratore con tutti i permessi"},
    )
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
            "WHERE r.name = :name AND NOT EXISTS ("
            "  SELECT 1 FROM role_permissions rp "
            "  WHERE rp.role_id = r.id AND rp.permission_id = p.id)"
        ),
        {"name": SUPER_ADMIN},
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE rp FROM role_permissions rp "
            "JOIN roles r ON r.id = rp.role_id WHERE r.name = :name"
        ),
        {"name": SUPER_ADMIN},
    )
    conn.execute(sa.text("DELETE FROM roles WHERE name = :name"), {"name": SUPER_ADMIN})
    codes = tuple(c for c, _ in PERMISSIONS)
    conn.execute(
        sa.text("DELETE FROM permissions WHERE code IN :codes").bindparams(
            sa.bindparam("codes", expanding=True)
        ),
        {"codes": list(codes)},
    )
```

- [ ] **Step 4: Run seed test to verify it passes**

Run:
```bash
cd /home/eurospital/Eurospital_Eventi/backend
TEST_DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" uv run pytest tests/test_seed.py tests/test_migration.py -v
```
Expected: all pass (conftest re-runs downgrade base → upgrade head, applying 0002).

- [ ] **Step 5: Verify idempotency — run the seed twice**

Run:
```bash
cd /home/eurospital/Eurospital_Eventi/backend
DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" uv run alembic upgrade head
DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" uv run alembic downgrade 0001
DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" uv run alembic upgrade head
```
Expected: succeeds with no duplicate-key errors.

- [ ] **Step 6: Commit**

```bash
cd /home/eurospital/Eurospital_Eventi
git add backend/alembic/versions/0002_seed_rbac.py backend/tests/test_seed.py
git commit -m "feat(f1): seed base permissions and super_admin role"
```

---

## Task 8: Services (user_service, rbac, auth_service) — TDD

**Files:**
- Create: `backend/app/services/__init__.py`, `backend/app/services/user_service.py`, `backend/app/services/rbac.py`, `backend/app/services/auth_service.py`
- Test: `backend/tests/test_services.py`

- [ ] **Step 1: Write the failing test `backend/tests/test_services.py`**

```python
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
    # old refresh now revoked
    with pytest.raises(auth_service.AuthError):
        auth_service.rotate_refresh(db, refresh)


def test_revoke_refresh(db):
    user = _make_user(db)
    _, refresh = auth_service.issue_token_pair(db, user)
    auth_service.revoke_refresh(db, refresh)
    with pytest.raises(auth_service.AuthError):
        auth_service.rotate_refresh(db, refresh)
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd /home/eurospital/Eurospital_Eventi/backend
TEST_DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" uv run pytest tests/test_services.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services'`.

- [ ] **Step 3: Create `backend/app/services/user_service.py`**

```python
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import Permission, Role, User


def create_user(
    db: Session, *, email: str, username: str, password: str, full_name: str | None = None
) -> User:
    user = User(
        email=email,
        username=username,
        hashed_password=hash_password(password),
        full_name=full_name,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def get_by_identifier(db: Session, identifier: str) -> User | None:
    stmt = select(User).where(or_(User.email == identifier, User.username == identifier))
    return db.scalar(stmt)


def assign_role(db: Session, user: User, role_name: str) -> None:
    role = db.scalar(select(Role).where(Role.name == role_name))
    if role is None:
        raise ValueError(f"role not found: {role_name}")
    if role not in user.roles:
        user.roles.append(role)
        db.flush()


def get_user_permissions(db: Session, user: User) -> set[str]:
    stmt = (
        select(Permission.code)
        .join(Role.permissions)
        .join(Role.users)
        .where(User.id == user.id)
    )
    return {code for code in db.scalars(stmt)}
```

- [ ] **Step 4: Create `backend/app/services/rbac.py`**

```python
from sqlalchemy.orm import Session

from app.models import User
from app.services.user_service import get_user_permissions


def user_has_permission(db: Session, user: User, code: str) -> bool:
    return code in get_user_permissions(db, user)
```

- [ ] **Step 5: Create `backend/app/services/auth_service.py`**

```python
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.models import RefreshToken, User
from app.services.user_service import get_by_identifier

# Precomputed dummy hash to keep login timing constant for unknown users.
_DUMMY_HASH = hash_password("dummy-password-for-timing")


class AuthError(Exception):
    pass


def authenticate(db: Session, identifier: str, password: str) -> User | None:
    user = get_by_identifier(db, identifier)
    if user is None or not user.hashed_password:
        verify_password(password, _DUMMY_HASH)  # constant-time-ish
        return None
    if not user.is_active or not verify_password(password, user.hashed_password):
        return None
    return user


def issue_token_pair(db: Session, user: User) -> tuple[str, str]:
    settings = get_settings()
    raw_refresh = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_refresh),
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    db.flush()
    return create_access_token(str(user.id)), raw_refresh


def _active_refresh(db: Session, raw_refresh: str) -> RefreshToken:
    row = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_refresh))
    )
    if row is None or row.revoked_at is not None:
        raise AuthError("invalid refresh token")
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise AuthError("expired refresh token")
    return row


def rotate_refresh(db: Session, raw_refresh: str) -> tuple[str, str]:
    row = _active_refresh(db, raw_refresh)
    row.revoked_at = datetime.now(timezone.utc)
    db.flush()
    user = db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise AuthError("inactive user")
    return issue_token_pair(db, user)


def revoke_refresh(db: Session, raw_refresh: str) -> None:
    row = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_refresh))
    )
    if row is not None and row.revoked_at is None:
        row.revoked_at = datetime.now(timezone.utc)
        db.flush()
```

- [ ] **Step 6: Create `backend/app/services/__init__.py` (empty)**

```python
```

- [ ] **Step 7: Run test to verify it passes**

Run:
```bash
cd /home/eurospital/Eurospital_Eventi/backend
TEST_DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" uv run pytest tests/test_services.py -v
```
Expected: 7 passed.

- [ ] **Step 8: Commit**

```bash
cd /home/eurospital/Eurospital_Eventi
git add backend/app/services backend/tests/test_services.py
git commit -m "feat(f1): user/rbac/auth services"
```

---

## Task 9: Schemas + API deps + auth router — TDD (integration)

**Files:**
- Create: `backend/app/schemas/__init__.py`, `backend/app/schemas/auth.py`, `backend/app/schemas/user.py`
- Create: `backend/app/api/__init__.py`, `backend/app/api/deps.py`, `backend/app/api/routers/__init__.py`, `backend/app/api/routers/auth.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_auth_api.py`

- [ ] **Step 1: Write the failing integration test `backend/tests/test_auth_api.py`**

```python
from app.services import user_service


def _seed_admin(db):
    user = user_service.create_user(
        db, email="admin@x.it", username="admin", password="pw12345", full_name="Admin"
    )
    user_service.assign_role(db, user, "super_admin")
    db.flush()
    return user


def test_login_returns_token_pair(client, db):
    _seed_admin(db)
    resp = client.post("/api/auth/login", json={"identifier": "admin", "password": "pw12345"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"] and body["refresh_token"]


def test_login_wrong_password_401(client, db):
    _seed_admin(db)
    resp = client.post("/api/auth/login", json={"identifier": "admin", "password": "nope"})
    assert resp.status_code == 401


def test_me_returns_user_with_permissions(client, db):
    _seed_admin(db)
    tok = client.post(
        "/api/auth/login", json={"identifier": "admin", "password": "pw12345"}
    ).json()["access_token"]
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["username"] == "admin"
    assert "super_admin" in body["roles"]
    assert "users.read" in body["permissions"]


def test_me_requires_auth(client):
    assert client.get("/api/auth/me").status_code in (401, 403)


def test_refresh_rotates_and_revokes(client, db):
    _seed_admin(db)
    pair = client.post(
        "/api/auth/login", json={"identifier": "admin", "password": "pw12345"}
    ).json()
    r1 = client.post("/api/auth/refresh", json={"refresh_token": pair["refresh_token"]})
    assert r1.status_code == 200
    # old refresh now invalid
    r2 = client.post("/api/auth/refresh", json={"refresh_token": pair["refresh_token"]})
    assert r2.status_code == 401


def test_logout_revokes_refresh(client, db):
    _seed_admin(db)
    pair = client.post(
        "/api/auth/login", json={"identifier": "admin", "password": "pw12345"}
    ).json()
    assert client.post("/api/auth/logout", json={"refresh_token": pair["refresh_token"]}).status_code == 204
    assert client.post("/api/auth/refresh", json={"refresh_token": pair["refresh_token"]}).status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd /home/eurospital/Eurospital_Eventi/backend
TEST_DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" uv run pytest tests/test_auth_api.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.schemas'` (or app.api).

- [ ] **Step 3: Create `backend/app/schemas/auth.py`**

```python
from pydantic import BaseModel


class LoginRequest(BaseModel):
    identifier: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
```

- [ ] **Step 4: Create `backend/app/schemas/user.py`**

```python
from pydantic import BaseModel


class UserOut(BaseModel):
    id: int
    email: str
    username: str
    full_name: str | None
    roles: list[str]
    permissions: list[str]
```

- [ ] **Step 5: Create `backend/app/schemas/__init__.py` (empty)**

```python
```

- [ ] **Step 6: Create `backend/app/api/deps.py`**

```python
from collections.abc import Callable, Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import TokenError, decode_token
from app.db.session import SessionLocal
from app.models import User
from app.services import rbac

_bearer = HTTPBearer(auto_error=True)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_token(creds.credentials)
    except TokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token non valido")
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token non valido")
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utente non valido")
    return user


def require_permission(code: str) -> Callable[..., User]:
    def checker(
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> User:
        if not rbac.user_has_permission(db, user, code):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permesso negato")
        return user

    return checker
```

- [ ] **Step 7: Create `backend/app/api/routers/auth.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models import User
from app.schemas.auth import LoginRequest, RefreshRequest, TokenPair
from app.schemas.user import UserOut
from app.services import auth_service, user_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenPair)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenPair:
    user = auth_service.authenticate(db, payload.identifier, payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenziali non valide"
        )
    access, refresh = auth_service.issue_token_pair(db, user)
    db.commit()
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> TokenPair:
    try:
        access, new_refresh = auth_service.rotate_refresh(db, payload.refresh_token)
    except auth_service.AuthError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token non valido"
        )
    db.commit()
    return TokenPair(access_token=access, refresh_token=new_refresh)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: RefreshRequest, db: Session = Depends(get_db)) -> Response:
    auth_service.revoke_refresh(db, payload.refresh_token)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserOut)
def me(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> UserOut:
    perms = sorted(user_service.get_user_permissions(db, user))
    return UserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        roles=sorted(r.name for r in user.roles),
        permissions=perms,
    )
```

- [ ] **Step 8: Create empty `backend/app/api/__init__.py` and `backend/app/api/routers/__init__.py`**

Both empty files.

- [ ] **Step 9: Modify `backend/app/main.py` to include the auth router**

Replace the file content with:

```python
from fastapi import FastAPI

from app.api.routers import auth

app = FastAPI(title="Eurospital Eventi API")
app.include_router(auth.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 10: Run test to verify it passes**

Run:
```bash
cd /home/eurospital/Eurospital_Eventi/backend
TEST_DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" uv run pytest tests/test_auth_api.py -v
```
Expected: 6 passed.

NOTE: the integration tests use the `client` fixture, which overrides `get_db` to the rolled-back test session, so `db.commit()` inside the endpoints commits within the test transaction and is rolled back after each test. This is expected.

- [ ] **Step 11: Commit**

```bash
cd /home/eurospital/Eurospital_Eventi
git add backend/app/schemas backend/app/api backend/app/main.py backend/tests/test_auth_api.py
git commit -m "feat(f1): auth schemas, DI deps, and auth router"
```

---

## Task 10: require_permission RBAC enforcement test

**Files:**
- Test: `backend/tests/test_rbac_api.py`

This verifies the `require_permission` dependency end-to-end using a temporary protected route mounted on the app for the test.

- [ ] **Step 1: Write the test `backend/tests/test_rbac_api.py`**

```python
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
    # remove the test route so it doesn't leak between tests
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
```

- [ ] **Step 2: Run test to verify it passes**

Run:
```bash
cd /home/eurospital/Eurospital_Eventi/backend
TEST_DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" uv run pytest tests/test_rbac_api.py -v
```
Expected: 2 passed (no implementation change needed — `require_permission` already exists; this test exercises it).

- [ ] **Step 3: Commit**

```bash
cd /home/eurospital/Eurospital_Eventi
git add backend/tests/test_rbac_api.py
git commit -m "test(f1): require_permission grants 200 and denies 403"
```

---

## Task 11: create-admin CLI

**Files:**
- Create: `backend/app/cli.py`
- Test: `backend/tests/test_cli.py`

- [ ] **Step 1: Write the failing test `backend/tests/test_cli.py`**

```python
from app.cli import create_admin
from app.services import user_service


def test_create_admin_creates_user_and_role(db):
    create_admin(db, email="boss@x.it", username="boss", password="pw12345", update=False)
    user = user_service.get_by_identifier(db, "boss")
    assert user is not None
    assert "super_admin" in {r.name for r in user.roles}


def test_create_admin_idempotent_without_update(db):
    create_admin(db, email="boss@x.it", username="boss", password="pw12345", update=False)
    # second call must not raise and must not duplicate
    create_admin(db, email="boss@x.it", username="boss", password="pw12345", update=False)
    matches = [u for u in [user_service.get_by_identifier(db, "boss")] if u]
    assert len(matches) == 1


def test_create_admin_update_changes_password(db):
    create_admin(db, email="boss@x.it", username="boss", password="old12345", update=False)
    create_admin(db, email="boss@x.it", username="boss", password="new12345", update=True)
    from app.services import auth_service
    assert auth_service.authenticate(db, "boss", "new12345") is not None
    assert auth_service.authenticate(db, "boss", "old12345") is None
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd /home/eurospital/Eurospital_Eventi/backend
TEST_DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" uv run pytest tests/test_cli.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.cli'`.

- [ ] **Step 3: Implement `backend/app/cli.py`**

```python
import argparse
import getpass
import os
import sys

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.services import user_service


def create_admin(
    db: Session, *, email: str, username: str, password: str, update: bool
) -> None:
    existing = user_service.get_by_identifier(db, email) or user_service.get_by_identifier(
        db, username
    )
    if existing is not None:
        if not update:
            print(f"Utente '{username}' già esistente. Usa --update per aggiornarlo.")
            return
        existing.hashed_password = hash_password(password)
        user_service.assign_role(db, existing, "super_admin")
        db.flush()
        print(f"Admin '{username}' aggiornato.")
        return
    user = user_service.create_user(
        db, email=email, username=username, password=password
    )
    user_service.assign_role(db, user, "super_admin")
    db.flush()
    print(f"Admin '{username}' creato.")


def _cmd_create_admin(args: argparse.Namespace) -> None:
    password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Password admin: ")
    if not password:
        print("Password mancante.", file=sys.stderr)
        sys.exit(1)
    db = SessionLocal()
    try:
        create_admin(
            db, email=args.email, username=args.username, password=password, update=args.update
        )
        db.commit()
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("create-admin", help="Crea/aggiorna l'admin locale")
    p.add_argument("--email", required=True)
    p.add_argument("--username", required=True)
    p.add_argument("--update", action="store_true", help="Aggiorna se esiste")
    p.set_defaults(func=_cmd_create_admin)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd /home/eurospital/Eurospital_Eventi/backend
TEST_DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" uv run pytest tests/test_cli.py -v
```
Expected: 3 passed.

- [ ] **Step 5: Manually verify the CLI against the dev DB**

Run:
```bash
cd /home/eurospital/Eurospital_Eventi/backend
DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" ADMIN_PASSWORD="pw12345" \
  uv run python -m app.cli create-admin --email admin@eurospital.it --username admin
```
Expected: prints `Admin 'admin' creato.` (run once; a second run prints the "already exists" message).

- [ ] **Step 6: Commit**

```bash
cd /home/eurospital/Eurospital_Eventi
git add backend/app/cli.py backend/tests/test_cli.py
git commit -m "feat(f1): create-admin CLI command"
```

---

## Task 12: Full backend test run + ruff

**Files:** none (verification + fixes only)

- [ ] **Step 1: Run the entire backend suite**

Run:
```bash
cd /home/eurospital/Eurospital_Eventi/backend
TEST_DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" uv run pytest -v
```
Expected: all tests pass (config, crypto, security, db_base, models, migration, seed, services, auth_api, rbac_api, cli, plus F0 health).

- [ ] **Step 2: Run ruff and fix any lint issues**

Run:
```bash
cd /home/eurospital/Eurospital_Eventi/backend && uv run ruff check .
```
Expected: "All checks passed!". If ruff reports issues (e.g. import order), run `uv run ruff check . --fix`, re-run pytest to confirm still green, then continue.

- [ ] **Step 3: Commit any lint fixes (if needed)**

```bash
cd /home/eurospital/Eurospital_Eventi
git add -A backend
git commit -m "chore(f1): ruff lint fixes" || echo "nothing to commit"
```

---

## Task 13: CI — MySQL service for backend job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Update the `backend` job in `.github/workflows/ci.yml`**

Replace the entire `backend:` job with this (frontend job unchanged):

```yaml
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    services:
      mysql:
        image: mysql:8
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: eventi_test
          MYSQL_USER: eventi
          MYSQL_PASSWORD: eventi
        ports:
          - 3306:3306
        options: >-
          --health-cmd="mysqladmin ping -h localhost -uroot -proot"
          --health-interval=5s
          --health-timeout=3s
          --health-retries=20
    env:
      TEST_DATABASE_URL: mysql+pymysql://eventi:eventi@127.0.0.1:3306/eventi_test
    steps:
      - uses: actions/checkout@v4
      - name: Install uv
        uses: astral-sh/setup-uv@v4
        with:
          python-version: "3.12"
      - name: Sync deps
        run: uv sync --frozen
      - name: Lint
        run: uv run ruff check .
      - name: Migrate test DB
        run: uv run alembic upgrade head
        env:
          DATABASE_URL: mysql+pymysql://eventi:eventi@127.0.0.1:3306/eventi_test
      - name: Test
        run: uv run pytest -v
```

- [ ] **Step 2: Validate YAML**

Run:
```bash
cd /home/eurospital/Eurospital_Eventi
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"
```
Expected: `yaml ok`.

- [ ] **Step 3: Commit**

```bash
cd /home/eurospital/Eurospital_Eventi
git add .github/workflows/ci.yml
git commit -m "ci(f1): MySQL service + migrate step for backend job"
```

---

## Acceptance Criteria (verify at end of F1)
1. `alembic upgrade head` creates all Identity & RBAC tables + `refresh_tokens` on MySQL.
2. Seed `0002`: base permission catalog + `super_admin` role with all permissions present.
3. `python -m app.cli create-admin` creates the local admin (idempotent; `--update` updates).
4. `/api/auth/login` returns a token pair; `/api/auth/me` returns user + roles + permissions; `/api/auth/refresh` rotates and revokes the old refresh; `/api/auth/logout` revokes.
5. A route protected by `require_permission` returns 403 without the permission, 200 with it.
6. `uv run pytest` is green against MySQL; CI is green (MySQL service).
7. `/docs` shows "Authorize" (HTTPBearer) — verify by opening the running app's OpenAPI, optional manual check.

## Notes for the implementer
- The dev MySQL container (Task 1, `docker compose --profile dev up -d mysql`) must be running for Tasks 6–12. Tests connect to `127.0.0.1:3307/eventi_test`.
- All endpoints `db.commit()` explicitly; the `client` test fixture overrides `get_db` with a rolled-back session, so commits are isolated per test.
- Production deploy (later): the external DBA-created empty DB + `alembic upgrade head` + `create-admin`. F1 does not run against the production DB.
