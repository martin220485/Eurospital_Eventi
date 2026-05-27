# F4 Iscrizioni Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the registration domain (register with custom answers, capacity + max_per_user enforcement, waitlist with synchronous promotion, cancellation, signed-token QR, operator check-in) plus admin registration management and an operator check-in UI.

**Architecture:** New isolated `registrations` module (`routers → services → models`, migration 0006, 3 tables) on top of F3 events. Capacity is enforced with a row lock on the event inside the registration transaction. The QR encodes an HS256-signed check-in token (reusing `JWT_SECRET`); check-in verifies the signature and marks `attended`. Frontend adds an "Iscritti" tab to the event edit page and an operator check-in page.

**Tech Stack:** Backend — FastAPI, SQLAlchemy 2.0, Alembic, PyJWT (F1), `segno` (QR PNG, new, pure-python), pytest. Frontend — Next.js 15, React 19, Tailwind v3, TanStack Query, Zod, Vitest + RTL.

## Run commands (environment)

- Python venv has no pip; use `backend/.venv/bin/python`. Install: `cd backend && uv pip install <pkg>`.
- Backend tests (both env vars required):
  `cd backend && TEST_DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" .venv/bin/python -m pytest <args>`
- Frontend: `cd frontend && pnpm test <pattern>` / `pnpm build`.
- Branch: create `f4-iscrizioni` from `main` before Task A1 (executor handles this).
- Migration head is currently `0005_events`; new migration uses `down_revision = "0005_events"` (verify with `grep "revision =" backend/alembic/versions/0005_events.py`).

---

## File Structure

**Backend**
- `app/core/security.py` — MODIFY: `create_checkin_token` / `decode_checkin_token`
- `app/models/{registration,registration_answer,checkin}.py` — new; `app/models/__init__.py` — MODIFY
- `alembic/versions/0006_registrations.py` — 3 tables + perm/role seed
- `app/schemas/{registration,checkin}.py`
- `app/services/{registration_service,checkin_service,qr_service}.py`
- `app/api/routers/{registrations,checkin}.py`; `app/main.py` — MODIFY
- `pyproject.toml` — MODIFY: `segno`
- Tests: `test_checkin_token.py`, `test_qr_service.py`, `test_registration_models.py`, `test_migration.py` (MODIFY), `test_registration_service.py`, `test_registration_api.py`, `test_checkin_api.py`

**Frontend**
- `app/admin/events/[id]/page.tsx` — MODIFY (Iscritti tab); `app/admin/checkin/page.tsx`; `app/admin/layout.tsx` — MODIFY (sidebar)
- `components/admin/{registrations-panel,registration-status-badge,manual-register-dialog,checkin-scanner}.tsx`
- `lib/registration-schemas.ts`
- Tests: `__tests__/{registration-schemas,registrations-panel,checkin-scanner}.test.tsx`

---

# PART A — Backend

### Task A1: Check-in token helpers

**Files:**
- Modify: `backend/app/core/security.py`
- Test: `backend/tests/test_checkin_token.py`

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_checkin_token.py`:

```python
import pytest

from app.core.security import TokenError, create_checkin_token, decode_checkin_token


def test_checkin_token_roundtrip():
    tok = create_checkin_token(42)
    assert decode_checkin_token(tok) == 42


def test_decode_rejects_non_checkin_token():
    from app.core.security import create_access_token
    with pytest.raises(TokenError):
        decode_checkin_token(create_access_token("42"))


def test_decode_rejects_garbage():
    with pytest.raises(TokenError):
        decode_checkin_token("not-a-token")
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_checkin_token.py -v` → ImportError.

- [ ] **Step 3: Implement.** Append to `backend/app/core/security.py`:

```python
def create_checkin_token(registration_id: int) -> str:
    settings = get_settings()
    payload = {"sub": str(registration_id), "type": "checkin", "iat": datetime.now(UTC)}
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_checkin_token(token: str) -> int:
    payload = decode_token(token)
    if payload.get("type") != "checkin":
        raise TokenError("not a checkin token")
    return int(payload["sub"])
```

(`decode_token`, `TokenError`, `get_settings`, `jwt`, `datetime`, `UTC`, `ALGORITHM` are already imported/defined in the file.)

- [ ] **Step 4: Run to verify it passes.** `... -m pytest tests/test_checkin_token.py -v` → 3 passed.
- [ ] **Step 5: Commit.**
```bash
git add backend/app/core/security.py backend/tests/test_checkin_token.py
git commit -m "feat(f4): check-in token sign/verify helpers"
```

---

### Task A2: QR service + segno dependency

**Files:**
- Create: `backend/app/services/qr_service.py`
- Modify: `backend/pyproject.toml`
- Test: `backend/tests/test_qr_service.py`

- [ ] **Step 1: Install segno.** `cd backend && uv pip install segno`. Add `"segno>=1.6"` to `pyproject.toml` `dependencies`.

- [ ] **Step 2: Write the failing test.** Create `backend/tests/test_qr_service.py`:

```python
from app.services.qr_service import png_for_token


def test_png_for_token_returns_png_bytes():
    data = png_for_token("some-token-string")
    assert isinstance(data, bytes)
    assert data[:8] == b"\x89PNG\r\n\x1a\n"  # PNG magic header
```

- [ ] **Step 3: Run to verify it fails.** `... -m pytest tests/test_qr_service.py -v` → ImportError.

- [ ] **Step 4: Implement.** `backend/app/services/qr_service.py`:

```python
import io

import segno


def png_for_token(token: str) -> bytes:
    qr = segno.make(token, error="m")
    buf = io.BytesIO()
    qr.save(buf, kind="png", scale=5, border=2)
    return buf.getvalue()
```

- [ ] **Step 5: Run to verify it passes.** `... -m pytest tests/test_qr_service.py -v` → PASS. Also `.venv/bin/python -c "import segno; print('ok')"`.
- [ ] **Step 6: Commit.**
```bash
git add backend/app/services/qr_service.py backend/pyproject.toml backend/tests/test_qr_service.py
git commit -m "feat(f4): QR PNG service (segno)"
```

---

### Task A3: Registration domain models

**Files:**
- Create: `backend/app/models/registration.py`, `registration_answer.py`, `checkin.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/test_registration_models.py`

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_registration_models.py`:

```python
def test_registration_models_importable():
    from app.models import Checkin, Registration, RegistrationCustomAnswer

    assert Registration.__tablename__ == "registrations"
    assert RegistrationCustomAnswer.__tablename__ == "registration_custom_answers"
    assert Checkin.__tablename__ == "checkins"
    assert hasattr(Registration, "status")
    assert hasattr(Registration, "waitlist_position")
    assert hasattr(Checkin, "checked_in_at")
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_registration_models.py -v` → ImportError.

- [ ] **Step 3: Create the models.**

`backend/app/models/registration.py`:

```python
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Registration(Base):
    __tablename__ = "registrations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="confirmed", index=True)
    waitlist_position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    registered_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
```

`backend/app/models/registration_answer.py`:

```python
from sqlalchemy import BigInteger, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RegistrationCustomAnswer(Base):
    __tablename__ = "registration_custom_answers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    registration_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("registrations.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    field_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("event_custom_fields.id"), nullable=False,
    )
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
```

`backend/app/models/checkin.py`:

```python
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Checkin(Base):
    __tablename__ = "checkins"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    registration_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("registrations.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    checked_in_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
    checked_in_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
```

Add to `backend/app/models/__init__.py` imports + `__all__` (keep all existing): import `Checkin` from `app.models.checkin`, `Registration` from `app.models.registration`, `RegistrationCustomAnswer` from `app.models.registration_answer`; append `"Registration", "RegistrationCustomAnswer", "Checkin"` to `__all__`.

- [ ] **Step 4: Run to verify it passes.** `... -m pytest tests/test_registration_models.py -v` → PASS.
- [ ] **Step 5: Commit.**
```bash
git add backend/app/models/
git commit -m "feat(f4): registration domain ORM models"
```

---

### Task A4: Migration 0006 (tables + permission/role seed)

**Files:**
- Create: `backend/alembic/versions/0006_registrations.py`
- Modify: `backend/tests/test_migration.py`

- [ ] **Step 1: Update migration test.** Replace `backend/tests/test_migration.py` with:

```python
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
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_migration.py -v` → fails.

- [ ] **Step 3: Confirm down revision.** `grep "revision =" backend/alembic/versions/0005_events.py` → expect `0005_events`. Use that as `down_revision`.

- [ ] **Step 4: Write the migration.** Create `backend/alembic/versions/0006_registrations.py`:

```python
"""registration domain tables + permissions

Revision ID: 0006_registrations
Revises: 0005_events
Create Date: 2026-05-28
"""
import sqlalchemy as sa

from alembic import op

revision = "0006_registrations"
down_revision = "0005_events"
branch_labels = None
depends_on = None

_PERMS = [
    ("registrations.read", "Visualizzare iscrizioni"),
    ("registrations.write", "Gestire iscrizioni"),
    ("checkin.write", "Registrare presenze (check-in)"),
]
_CODES = "('registrations.read','registrations.write','checkin.write')"


def upgrade() -> None:
    op.create_table(
        "registrations",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.BigInteger(), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("waitlist_position", sa.Integer(), nullable=True),
        sa.Column("registered_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("cancel_reason", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_registrations_event_status", "registrations", ["event_id", "status"])
    op.create_index("ix_registrations_event_user", "registrations", ["event_id", "user_id"])
    op.create_table(
        "registration_custom_answers",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("registration_id", sa.BigInteger(),
                  sa.ForeignKey("registrations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("field_id", sa.BigInteger(), sa.ForeignKey("event_custom_fields.id"), nullable=False),
        sa.Column("value", sa.Text(), nullable=True),
    )
    op.create_index("ix_answers_registration", "registration_custom_answers", ["registration_id"])
    op.create_table(
        "checkins",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("registration_id", sa.BigInteger(),
                  sa.ForeignKey("registrations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("checked_in_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("checked_in_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_checkins_registration", "checkins", ["registration_id"])

    conn = op.get_bind()
    for code, desc in _PERMS:
        conn.execute(
            sa.text(
                "INSERT INTO permissions (code, description) SELECT :code, :desc "
                "WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = :code)"
            ),
            {"code": code, "desc": desc},
        )
    conn.execute(
        sa.text(
            "INSERT INTO roles (name, description) SELECT 'checkin_operator', 'Operatore check-in' "
            "WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'checkin_operator')"
        )
    )
    # grant all three to super_admin
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
            f"WHERE r.name = 'super_admin' AND p.code IN {_CODES} "
            "AND NOT EXISTS (SELECT 1 FROM role_permissions rp "
            "WHERE rp.role_id = r.id AND rp.permission_id = p.id)"
        )
    )
    # grant registrations.read + checkin.write to checkin_operator
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
            "WHERE r.name = 'checkin_operator' AND p.code IN ('registrations.read','checkin.write') "
            "AND NOT EXISTS (SELECT 1 FROM role_permissions rp "
            "WHERE rp.role_id = r.id AND rp.permission_id = p.id)"
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE rp FROM role_permissions rp JOIN roles r ON rp.role_id = r.id "
            "WHERE r.name = 'checkin_operator'"
        )
    )
    conn.execute(
        sa.text(
            "DELETE rp FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id "
            f"WHERE p.code IN {_CODES}"
        )
    )
    conn.execute(sa.text("DELETE FROM roles WHERE name = 'checkin_operator'"))
    conn.execute(sa.text(f"DELETE FROM permissions WHERE code IN {_CODES}"))
    op.drop_table("checkins")
    op.drop_table("registration_custom_answers")
    op.drop_table("registrations")
```

> Verify the `roles` table has a `description` column (F1 model). If it does not, drop `, description` and the `'Operatore check-in'` literal from the role INSERT, inserting only `name`. Check with `grep -n description backend/app/models/role.py` before writing.

- [ ] **Step 5: Run to verify it passes.** `... -m pytest tests/test_migration.py -v` → 3 passed (conftest exercises downgrade base + upgrade head).
- [ ] **Step 6: Commit.**
```bash
git add backend/alembic/versions/0006_registrations.py backend/tests/test_migration.py
git commit -m "feat(f4): migration 0006 registration tables + perms/role seed"
```

---

### Task A5: Schemas

**Files:**
- Create: `backend/app/schemas/registration.py`, `backend/app/schemas/checkin.py`

- [ ] **Step 1: Implement (no dedicated test — exercised by API tests).**

`backend/app/schemas/registration.py`:

```python
from datetime import datetime

from pydantic import BaseModel


class AnswerIn(BaseModel):
    field_id: int
    value: str | None = None


class RegisterIn(BaseModel):
    user_id: int | None = None
    answers: list[AnswerIn] = []


class AnswerOut(BaseModel):
    field_id: int
    value: str | None = None


class RegistrationOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    event_id: int
    user_id: int
    status: str
    waitlist_position: int | None = None
    created_at: datetime


class RegistrationListItem(BaseModel):
    id: int
    user_id: int
    username: str
    email: str
    status: str
    waitlist_position: int | None = None
    checked_in: bool


class RegistrationListResult(BaseModel):
    items: list[RegistrationListItem]
    total: int
    page: int
    page_size: int


class RegistrationDetail(RegistrationOut):
    answers: list[AnswerOut] = []
```

`backend/app/schemas/checkin.py`:

```python
from pydantic import BaseModel


class CheckinIn(BaseModel):
    token: str


class CheckinResult(BaseModel):
    registration_id: int
    user_id: int
    username: str
    event_title: str
    status: str
```

- [ ] **Step 2: Verify import.** `cd backend && .venv/bin/python -c "from app.schemas.registration import RegisterIn, RegistrationListResult, RegistrationDetail; from app.schemas.checkin import CheckinIn, CheckinResult; print('ok')"` → ok.
- [ ] **Step 3: Commit.**
```bash
git add backend/app/schemas/registration.py backend/app/schemas/checkin.py
git commit -m "feat(f4): registration + checkin schemas"
```

---

### Task A6: registration_service.register (capacity, max_per_user, window, answers)

**Files:**
- Create: `backend/app/services/registration_service.py`
- Test: `backend/tests/test_registration_service.py`

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_registration_service.py`:

```python
from datetime import datetime, timedelta

import pytest

from app.services import event_service, registration_service, user_service


def _user(db, n):
    return user_service.create_user(db, email=f"u{n}@x.it", username=f"u{n}", password="pw12345")


def _event(db, **over):
    start = datetime(2030, 1, 1, 9, 0)
    data = dict(title="E", start_at=start, end_at=start + timedelta(hours=1), mode="physical")
    data.update(over)
    ev = event_service.create(db, created_by=None, **data)
    ev.status = "published"
    db.flush()
    return ev


def test_register_confirmed_when_space(db):
    ev = _event(db, capacity=2)
    u = _user(db, 1)
    reg = registration_service.register(db, event_id=ev.id, user_id=u.id, registered_by=None, answers=[])
    assert reg.status == "confirmed"


def test_register_waitlisted_when_full(db):
    ev = _event(db, capacity=1, waitlist_enabled=True)
    registration_service.register(db, event_id=ev.id, user_id=_user(db, 1).id, registered_by=None, answers=[])
    reg2 = registration_service.register(db, event_id=ev.id, user_id=_user(db, 2).id, registered_by=None, answers=[])
    assert reg2.status == "waitlisted"
    assert reg2.waitlist_position == 1


def test_register_full_no_waitlist_raises(db):
    ev = _event(db, capacity=1, waitlist_enabled=False)
    registration_service.register(db, event_id=ev.id, user_id=_user(db, 1).id, registered_by=None, answers=[])
    with pytest.raises(registration_service.RegistrationError):
        registration_service.register(db, event_id=ev.id, user_id=_user(db, 2).id, registered_by=None, answers=[])


def test_duplicate_active_blocked_by_max_per_user(db):
    ev = _event(db, capacity=10, max_per_user=1)
    u = _user(db, 1)
    registration_service.register(db, event_id=ev.id, user_id=u.id, registered_by=None, answers=[])
    with pytest.raises(registration_service.RegistrationError):
        registration_service.register(db, event_id=ev.id, user_id=u.id, registered_by=None, answers=[])


def test_register_rejected_when_not_published(db):
    ev = _event(db, capacity=5)
    ev.status = "draft"
    db.flush()
    with pytest.raises(registration_service.RegistrationError):
        registration_service.register(db, event_id=ev.id, user_id=_user(db, 1).id, registered_by=None, answers=[])


def test_register_outside_window_raises(db):
    ev = _event(db, capacity=5, registration_close_at=datetime(2020, 1, 1, 0, 0))
    with pytest.raises(registration_service.RegistrationError):
        registration_service.register(db, event_id=ev.id, user_id=_user(db, 1).id, registered_by=None, answers=[])


def test_required_answer_missing_raises(db):
    from app.schemas.custom_field import CustomFieldIn
    from app.services import custom_field_service
    ev = _event(db, capacity=5)
    custom_field_service.replace_set(db, ev.id, [
        CustomFieldIn(label="Nome", field_type="text", required=True, position=0, options=[]),
    ])
    with pytest.raises(registration_service.RegistrationError):
        registration_service.register(db, event_id=ev.id, user_id=_user(db, 1).id, registered_by=None, answers=[])
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_registration_service.py -v` → ModuleNotFoundError.

- [ ] **Step 3: Implement.** `backend/app/services/registration_service.py`:

```python
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Event, EventCustomField, Registration, RegistrationCustomAnswer,
)

_ACTIVE = ("pending", "confirmed", "waitlisted", "attended")
_OCCUPYING = ("confirmed", "attended")


class RegistrationError(Exception):
    pass


def _event_locked(db: Session, event_id: int) -> Event:
    ev = db.scalar(select(Event).where(Event.id == event_id).with_for_update())
    if ev is None:
        raise RegistrationError("event not found")
    return ev


def _occupied(db: Session, event_id: int) -> int:
    return db.scalar(
        select(func.count()).select_from(Registration)
        .where(Registration.event_id == event_id, Registration.status.in_(_OCCUPYING))
    ) or 0


def _active_for_user(db: Session, event_id: int, user_id: int) -> int:
    return db.scalar(
        select(func.count()).select_from(Registration)
        .where(Registration.event_id == event_id, Registration.user_id == user_id,
               Registration.status.in_(_ACTIVE))
    ) or 0


def _max_waitlist_pos(db: Session, event_id: int) -> int:
    return db.scalar(
        select(func.coalesce(func.max(Registration.waitlist_position), 0))
        .where(Registration.event_id == event_id, Registration.status == "waitlisted")
    ) or 0


def _validate_answers(db: Session, event_id: int, answers: list) -> None:
    fields = db.scalars(
        select(EventCustomField).where(EventCustomField.event_id == event_id)
    ).all()
    provided = {a.field_id: (a.value or "").strip() for a in answers}
    for f in fields:
        if f.required and not provided.get(f.id):
            raise RegistrationError(f"missing required answer: {f.label}")


def register(db: Session, *, event_id: int, user_id: int, registered_by: int | None, answers: list) -> Registration:
    ev = _event_locked(db, event_id)
    if ev.status != "published":
        raise RegistrationError("event not open for registration")
    now = datetime.utcnow()
    if ev.registration_open_at and now < ev.registration_open_at:
        raise RegistrationError("registration not yet open")
    if ev.registration_close_at and now > ev.registration_close_at:
        raise RegistrationError("registration closed")
    if _active_for_user(db, event_id, user_id) >= (ev.max_per_user or 1):
        raise RegistrationError("registration limit reached for user")
    _validate_answers(db, event_id, answers)

    has_space = ev.capacity is None or _occupied(db, event_id) < ev.capacity
    if has_space:
        status, pos = "confirmed", None
    elif ev.waitlist_enabled:
        status, pos = "waitlisted", _max_waitlist_pos(db, event_id) + 1
    else:
        raise RegistrationError("event full")

    reg = Registration(
        event_id=event_id, user_id=user_id, status=status, waitlist_position=pos,
        registered_by=registered_by,
    )
    db.add(reg)
    db.flush()
    for a in answers:
        db.add(RegistrationCustomAnswer(registration_id=reg.id, field_id=a.field_id, value=a.value))
    db.flush()
    return reg
```

> `answers` items are `AnswerIn` (have `.field_id`, `.value`). The service accepts any object with those attributes.

- [ ] **Step 4: Run to verify it passes.** `... -m pytest tests/test_registration_service.py -v` → 7 passed.
- [ ] **Step 5: Commit.**
```bash
git add backend/app/services/registration_service.py backend/tests/test_registration_service.py
git commit -m "feat(f4): registration_service.register (capacity lock, limits, answers)"
```

---

### Task A7: registration_service cancel / promote / no-show / list / get

**Files:**
- Modify: `backend/app/services/registration_service.py`
- Test: `backend/tests/test_registration_service.py` (append)

- [ ] **Step 1: Append failing tests** to `backend/tests/test_registration_service.py`:

```python
def test_cancel_promotes_waitlist(db):
    ev = _event(db, capacity=1, waitlist_enabled=True)
    u1, u2 = _user(db, 1), _user(db, 2)
    r1 = registration_service.register(db, event_id=ev.id, user_id=u1.id, registered_by=None, answers=[])
    r2 = registration_service.register(db, event_id=ev.id, user_id=u2.id, registered_by=None, answers=[])
    assert r2.status == "waitlisted"
    registration_service.cancel(db, r1.id, actor_id=None)
    db.refresh(r2)
    assert r2.status == "confirmed"
    assert r2.waitlist_position is None


def test_cancel_blocked_when_not_allowed(db):
    ev = _event(db, capacity=5, cancellation_allowed=False)
    r = registration_service.register(db, event_id=ev.id, user_id=_user(db, 1).id, registered_by=None, answers=[])
    with pytest.raises(registration_service.RegistrationError):
        registration_service.cancel(db, r.id, actor_id=None)


def test_manual_promote_requires_space(db):
    ev = _event(db, capacity=1, waitlist_enabled=True)
    registration_service.register(db, event_id=ev.id, user_id=_user(db, 1).id, registered_by=None, answers=[])
    r2 = registration_service.register(db, event_id=ev.id, user_id=_user(db, 2).id, registered_by=None, answers=[])
    with pytest.raises(registration_service.RegistrationError):
        registration_service.promote(db, r2.id)  # no space


def test_mark_no_show(db):
    ev = _event(db, capacity=5)
    r = registration_service.register(db, event_id=ev.id, user_id=_user(db, 1).id, registered_by=None, answers=[])
    registration_service.mark_no_show(db, r.id)
    db.refresh(r)
    assert r.status == "no_show"
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_registration_service.py -k "cancel or promote or no_show" -v` → AttributeError.

- [ ] **Step 3: Append implementation** to `backend/app/services/registration_service.py`:

```python
from datetime import datetime as _dt  # noqa: E402  (already importing datetime above)


def get(db: Session, registration_id: int) -> Registration:
    reg = db.get(Registration, registration_id)
    if reg is None:
        raise RegistrationError("not found")
    return reg


def _promote_next(db: Session, event_id: int) -> None:
    ev = _event_locked(db, event_id)
    if ev.capacity is not None and _occupied(db, event_id) >= ev.capacity:
        return
    nxt = db.scalar(
        select(Registration)
        .where(Registration.event_id == event_id, Registration.status == "waitlisted")
        .order_by(Registration.waitlist_position).limit(1)
    )
    if nxt is None:
        return
    nxt.status = "confirmed"
    nxt.waitlist_position = None
    db.flush()
    _recompact(db, event_id)


def _recompact(db: Session, event_id: int) -> None:
    rows = db.scalars(
        select(Registration)
        .where(Registration.event_id == event_id, Registration.status == "waitlisted")
        .order_by(Registration.waitlist_position)
    ).all()
    for i, r in enumerate(rows, start=1):
        r.waitlist_position = i
    db.flush()


def cancel(db: Session, registration_id: int, *, actor_id: int | None) -> Registration:
    reg = get(db, registration_id)
    if reg.status not in ("confirmed", "waitlisted", "pending"):
        raise RegistrationError("registration cannot be cancelled in its current state")
    ev = _event_locked(db, reg.event_id)
    if reg.status == "confirmed":
        if not ev.cancellation_allowed:
            raise RegistrationError("cancellation not allowed for this event")
        if ev.cancellation_deadline_at and datetime.utcnow() > ev.cancellation_deadline_at:
            raise RegistrationError("cancellation deadline passed")
    was_confirmed = reg.status == "confirmed"
    reg.status = "cancelled"
    reg.cancelled_at = datetime.utcnow()
    reg.waitlist_position = None
    db.flush()
    _recompact(db, reg.event_id)
    if was_confirmed:
        _promote_next(db, reg.event_id)
    return reg


def promote(db: Session, registration_id: int) -> Registration:
    reg = get(db, registration_id)
    if reg.status != "waitlisted":
        raise RegistrationError("only waitlisted registrations can be promoted")
    ev = _event_locked(db, reg.event_id)
    if ev.capacity is not None and _occupied(db, reg.event_id) >= ev.capacity:
        raise RegistrationError("no available capacity")
    reg.status = "confirmed"
    reg.waitlist_position = None
    db.flush()
    _recompact(db, reg.event_id)
    return reg


def mark_no_show(db: Session, registration_id: int) -> Registration:
    reg = get(db, registration_id)
    if reg.status != "confirmed":
        raise RegistrationError("only confirmed registrations can be marked no_show")
    reg.status = "no_show"
    db.flush()
    return reg


def list_for_event(
    db: Session, event_id: int, *, status: str | None, q: str | None, page: int, page_size: int,
) -> tuple[list[Registration], int]:
    from app.models import User
    stmt = select(Registration).where(Registration.event_id == event_id)
    count_stmt = select(func.count()).select_from(Registration).where(Registration.event_id == event_id)
    if status:
        stmt = stmt.where(Registration.status == status)
        count_stmt = count_stmt.where(Registration.status == status)
    if q:
        stmt = stmt.join(User, User.id == Registration.user_id).where(
            (User.username.like(f"%{q}%")) | (User.email.like(f"%{q}%"))
        )
        count_stmt = count_stmt.join(User, User.id == Registration.user_id).where(
            (User.username.like(f"%{q}%")) | (User.email.like(f"%{q}%"))
        )
    total = db.scalar(count_stmt) or 0
    stmt = stmt.order_by(Registration.created_at).offset((page - 1) * page_size).limit(page_size)
    return list(db.scalars(stmt)), total


def list_for_user(db: Session, user_id: int) -> list[Registration]:
    return list(
        db.scalars(select(Registration).where(Registration.user_id == user_id)
                   .order_by(Registration.created_at.desc()))
    )
```

> Remove the unused `_dt` alias line if your linter (ruff F401) complains — it's only there to avoid confusion; `datetime` is already imported at the top of the file from Task A6. Prefer deleting that line.

- [ ] **Step 4: Run to verify it passes.** `... -m pytest tests/test_registration_service.py -v` → 11 passed.
- [ ] **Step 5: Commit.**
```bash
git add backend/app/services/registration_service.py backend/tests/test_registration_service.py
git commit -m "feat(f4): registration cancel/promote/no-show/list with waitlist promotion"
```

---

### Task A8: Registrations router (+ /me/registrations)

**Files:**
- Create: `backend/app/api/routers/registrations.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_registration_api.py`

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_registration_api.py`:

```python
from datetime import datetime, timedelta

from app.services import event_service, user_service


def _cookie(client, db, *, username, super_admin):
    u = user_service.create_user(db, email=f"{username}@x.it", username=username, password="pw12345")
    if super_admin:
        user_service.assign_role(db, u, "super_admin")
    db.flush()
    pair = client.post("/api/auth/login", json={"identifier": username, "password": "pw12345"}).json()
    client.cookies.set("access_token", pair["access_token"])
    return u


def _published_event(db, **over):
    start = datetime(2030, 1, 1, 9, 0)
    data = dict(title="E", start_at=start, end_at=start + timedelta(hours=1), mode="physical")
    data.update(over)
    ev = event_service.create(db, created_by=None, **data)
    ev.status = "published"
    db.flush()
    return ev


def test_self_register_and_me(client, db):
    ev = _published_event(db, capacity=5)
    _cookie(client, db, username="emp", super_admin=False)
    r = client.post(f"/api/events/{ev.id}/registrations", json={"answers": []})
    assert r.status_code == 201
    assert r.json()["status"] == "confirmed"
    me = client.get("/api/me/registrations")
    assert me.status_code == 200
    assert len(me.json()) == 1


def test_list_requires_permission(client, db):
    ev = _published_event(db, capacity=5)
    _cookie(client, db, username="emp", super_admin=False)
    r = client.get(f"/api/events/{ev.id}/registrations")
    assert r.status_code == 403


def test_admin_list_and_cancel(client, db):
    ev = _published_event(db, capacity=5)
    admin = _cookie(client, db, username="admin", super_admin=True)  # noqa: F841
    rid = client.post(f"/api/events/{ev.id}/registrations", json={"answers": []}).json()["id"]
    lst = client.get(f"/api/events/{ev.id}/registrations")
    assert lst.status_code == 200 and lst.json()["total"] == 1
    c = client.post(f"/api/registrations/{rid}/cancel")
    assert c.status_code == 200
    assert c.json()["status"] == "cancelled"


def test_cannot_register_other_user_without_permission(client, db):
    ev = _published_event(db, capacity=5)
    other = user_service.create_user(db, email="o@x.it", username="other", password="pw12345")
    db.flush()
    _cookie(client, db, username="emp", super_admin=False)
    r = client.post(f"/api/events/{ev.id}/registrations", json={"user_id": other.id, "answers": []})
    assert r.status_code == 403
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_registration_api.py -v` → 404.

- [ ] **Step 3: Implement.** `backend/app/api/routers/registrations.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models import Checkin, RegistrationCustomAnswer, User
from app.schemas.registration import (
    AnswerOut, RegisterIn, RegistrationDetail, RegistrationListItem,
    RegistrationListResult, RegistrationOut,
)
from app.services import registration_service
from app.services.rbac import user_has_permission

router = APIRouter(tags=["registrations"])


def _require(db: Session, user: User, code: str) -> None:
    if not user_has_permission(db, user, code):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permesso negato")


def _owns_or_perm(db: Session, user: User, reg, code: str) -> None:
    if reg.user_id != user.id:
        _require(db, user, code)


@router.post("/api/events/{event_id}/registrations", response_model=RegistrationOut,
             status_code=status.HTTP_201_CREATED)
def register(event_id: int, payload: RegisterIn, db: Session = Depends(get_db),
             user: User = Depends(get_current_user)) -> RegistrationOut:
    target_user_id = payload.user_id or user.id
    registered_by = None
    if target_user_id != user.id:
        _require(db, user, "registrations.write")
        registered_by = user.id
    try:
        reg = registration_service.register(
            db, event_id=event_id, user_id=target_user_id,
            registered_by=registered_by, answers=payload.answers,
        )
    except registration_service.RegistrationError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    db.commit()
    return RegistrationOut.model_validate(reg)


@router.get("/api/events/{event_id}/registrations", response_model=RegistrationListResult)
def list_event_registrations(event_id: int, status: str | None = None, q: str | None = None,
                             page: int = 1, page_size: int = 50,
                             db: Session = Depends(get_db),
                             user: User = Depends(get_current_user)) -> RegistrationListResult:
    _require(db, user, "registrations.read")
    regs, total = registration_service.list_for_event(
        db, event_id, status=status, q=q, page=page, page_size=page_size
    )
    user_ids = {r.user_id for r in regs}
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids))} if user_ids else {}
    items = [
        RegistrationListItem(
            id=r.id, user_id=r.user_id,
            username=users[r.user_id].username if r.user_id in users else "",
            email=users[r.user_id].email if r.user_id in users else "",
            status=r.status, waitlist_position=r.waitlist_position,
            checked_in=(r.status == "attended"),
        )
        for r in regs
    ]
    return RegistrationListResult(items=items, total=total, page=page, page_size=page_size)


@router.get("/api/registrations/{registration_id}", response_model=RegistrationDetail)
def get_registration(registration_id: int, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)) -> RegistrationDetail:
    try:
        reg = registration_service.get(db, registration_id)
    except registration_service.RegistrationError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Iscrizione non trovata")
    _owns_or_perm(db, user, reg, "registrations.read")
    answers = db.query(RegistrationCustomAnswer).filter(
        RegistrationCustomAnswer.registration_id == reg.id
    ).all()
    out = RegistrationDetail.model_validate(reg)
    out.answers = [AnswerOut(field_id=a.field_id, value=a.value) for a in answers]
    return out


@router.post("/api/registrations/{registration_id}/cancel", response_model=RegistrationOut)
def cancel_registration(registration_id: int, db: Session = Depends(get_db),
                        user: User = Depends(get_current_user)) -> RegistrationOut:
    try:
        reg = registration_service.get(db, registration_id)
    except registration_service.RegistrationError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Iscrizione non trovata")
    _owns_or_perm(db, user, reg, "registrations.write")
    try:
        reg = registration_service.cancel(db, registration_id, actor_id=user.id)
    except registration_service.RegistrationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    db.commit()
    return RegistrationOut.model_validate(reg)


@router.post("/api/registrations/{registration_id}/promote", response_model=RegistrationOut)
def promote_registration(registration_id: int, db: Session = Depends(get_db),
                         user: User = Depends(get_current_user)) -> RegistrationOut:
    _require(db, user, "registrations.write")
    try:
        reg = registration_service.promote(db, registration_id)
    except registration_service.RegistrationError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    db.commit()
    return RegistrationOut.model_validate(reg)


@router.post("/api/registrations/{registration_id}/no-show", response_model=RegistrationOut)
def no_show_registration(registration_id: int, db: Session = Depends(get_db),
                         user: User = Depends(get_current_user)) -> RegistrationOut:
    _require(db, user, "registrations.write")
    try:
        reg = registration_service.mark_no_show(db, registration_id)
    except registration_service.RegistrationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    db.commit()
    return RegistrationOut.model_validate(reg)


@router.get("/api/me/registrations", response_model=list[RegistrationOut])
def my_registrations(db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)) -> list[RegistrationOut]:
    return [RegistrationOut.model_validate(r) for r in registration_service.list_for_user(db, user.id)]
```

Mount in `backend/app/main.py`: add `registrations` to routers import and `app.include_router(registrations.router)`.

> `Checkin` import is used in Task A9's router additions; if ruff flags it unused here, remove it from this file's imports and add it in A9. Keep imports clean.

- [ ] **Step 4: Run to verify it passes.** `... -m pytest tests/test_registration_api.py -v` → 4 passed.
- [ ] **Step 5: Commit.**
```bash
git add backend/app/api/routers/registrations.py backend/app/main.py backend/tests/test_registration_api.py
git commit -m "feat(f4): registrations router (register/list/get/cancel/promote/no-show/me)"
```

---

### Task A9: Check-in service + router + QR/token endpoints

**Files:**
- Create: `backend/app/services/checkin_service.py`, `backend/app/api/routers/checkin.py`
- Modify: `backend/app/api/routers/registrations.py` (add `/qr` + `/token`), `backend/app/main.py`
- Test: `backend/tests/test_checkin_api.py`

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_checkin_api.py`:

```python
from datetime import datetime, timedelta

from app.services import event_service, user_service


def _admin(client, db):
    u = user_service.create_user(db, email="a@x.it", username="admin", password="pw12345")
    user_service.assign_role(db, u, "super_admin")
    db.flush()
    pair = client.post("/api/auth/login", json={"identifier": "admin", "password": "pw12345"}).json()
    client.cookies.set("access_token", pair["access_token"])


def _event(db):
    start = datetime(2030, 1, 1, 9, 0)
    ev = event_service.create(db, created_by=None, title="E", start_at=start,
                              end_at=start + timedelta(hours=1), mode="physical", capacity=5)
    ev.status = "published"
    db.flush()
    return ev


def test_checkin_flow(client, db):
    _admin(client, db)
    ev = _event(db)
    rid = client.post(f"/api/events/{ev.id}/registrations", json={"answers": []}).json()["id"]
    tok = client.get(f"/api/registrations/{rid}/token").json()["token"]
    r = client.post("/api/checkin", json={"token": tok})
    assert r.status_code == 200
    assert r.json()["status"] == "attended"
    # second check-in is idempotent-rejected
    r2 = client.post("/api/checkin", json={"token": tok})
    assert r2.status_code == 409


def test_checkin_bad_token_400(client, db):
    _admin(client, db)
    r = client.post("/api/checkin", json={"token": "garbage"})
    assert r.status_code == 400


def test_qr_returns_png(client, db):
    _admin(client, db)
    ev = _event(db)
    rid = client.post(f"/api/events/{ev.id}/registrations", json={"answers": []}).json()["id"]
    r = client.get(f"/api/registrations/{rid}/qr")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_checkin_api.py -v` → 404 on /token, /checkin.

- [ ] **Step 3: Implement check-in service.** `backend/app/services/checkin_service.py`:

```python
from sqlalchemy.orm import Session

from app.core.security import TokenError, decode_checkin_token
from app.models import Checkin, Registration


class CheckinError(Exception):
    def __init__(self, message: str, code: int):
        super().__init__(message)
        self.code = code


def check_in(db: Session, *, token: str, operator_id: int | None) -> Registration:
    try:
        reg_id = decode_checkin_token(token)
    except TokenError:
        raise CheckinError("invalid token", 400)
    reg = db.get(Registration, reg_id)
    if reg is None:
        raise CheckinError("registration not found", 404)
    if reg.status == "attended":
        raise CheckinError("already checked in", 409)
    if reg.status != "confirmed":
        raise CheckinError("registration not in a checkable state", 422)
    reg.status = "attended"
    db.add(Checkin(registration_id=reg.id, checked_in_by=operator_id))
    db.flush()
    return reg
```

- [ ] **Step 4: Implement check-in router.** `backend/app/api/routers/checkin.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models import User
from app.schemas.checkin import CheckinIn, CheckinResult
from app.services import checkin_service
from app.services.rbac import user_has_permission

router = APIRouter(tags=["checkin"])


@router.post("/api/checkin", response_model=CheckinResult)
def checkin(payload: CheckinIn, db: Session = Depends(get_db),
            user: User = Depends(get_current_user)) -> CheckinResult:
    if not user_has_permission(db, user, "checkin.write"):
        raise HTTPException(status_code=403, detail="Permesso negato")
    try:
        reg = checkin_service.check_in(db, token=payload.token, operator_id=user.id)
    except checkin_service.CheckinError as exc:
        raise HTTPException(status_code=exc.code, detail=str(exc))
    db.commit()
    from app.models import Event
    target = db.get(User, reg.user_id)
    ev = db.get(Event, reg.event_id)
    return CheckinResult(
        registration_id=reg.id, user_id=reg.user_id,
        username=target.username if target else "",
        event_title=ev.title if ev else "", status=reg.status,
    )
```

Mount `checkin.router` in `main.py`.

- [ ] **Step 5: Add `/qr` and `/token` to `backend/app/api/routers/registrations.py`:**

```python
from fastapi import Response

from app.core.security import create_checkin_token
from app.services import qr_service


@router.get("/api/registrations/{registration_id}/token")
def registration_token(registration_id: int, db: Session = Depends(get_db),
                       user: User = Depends(get_current_user)) -> dict:
    try:
        reg = registration_service.get(db, registration_id)
    except registration_service.RegistrationError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Iscrizione non trovata")
    _owns_or_perm(db, user, reg, "registrations.read")
    return {"token": create_checkin_token(reg.id)}


@router.get("/api/registrations/{registration_id}/qr")
def registration_qr(registration_id: int, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)) -> Response:
    try:
        reg = registration_service.get(db, registration_id)
    except registration_service.RegistrationError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Iscrizione non trovata")
    _owns_or_perm(db, user, reg, "registrations.read")
    png = qr_service.png_for_token(create_checkin_token(reg.id))
    return Response(content=png, media_type="image/png")
```

Merge these imports with the existing import block at the top of `registrations.py`.

- [ ] **Step 6: Run to verify it passes.** `... -m pytest tests/test_checkin_api.py -v` → 3 passed. Then full suite `... -m pytest -q` → all green.
- [ ] **Step 7: Commit.**
```bash
git add backend/app/services/checkin_service.py backend/app/api/routers/checkin.py backend/app/api/routers/registrations.py backend/app/main.py backend/tests/test_checkin_api.py
git commit -m "feat(f4): check-in service + router + QR/token endpoints"
```

---

# PART B — Admin + operator UI

### Task B1: Registration schemas + status badge + registrations panel

**Files:**
- Create: `frontend/lib/registration-schemas.ts`, `frontend/components/admin/registration-status-badge.tsx`, `frontend/components/admin/registrations-panel.tsx`
- Test: `frontend/__tests__/registrations-panel.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `frontend/__tests__/registrations-panel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ items: [
      { id: 1, user_id: 5, username: "mrossi", email: "m@x.it", status: "confirmed", waitlist_position: null, checked_in: false },
      { id: 2, user_id: 6, username: "gverdi", email: "g@x.it", status: "waitlisted", waitlist_position: 1, checked_in: false },
    ], total: 2, page: 1, page_size: 50 }),
  })) as unknown as typeof fetch);
});

import { RegistrationsPanel } from "@/components/admin/registrations-panel";

describe("RegistrationsPanel", () => {
  it("renders registrant rows with status", async () => {
    render(<RegistrationsPanel eventId={1} />);
    expect(await screen.findByText("mrossi")).toBeInTheDocument();
    expect(screen.getByText("gverdi")).toBeInTheDocument();
    expect(screen.getByText("waitlisted")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `cd frontend && pnpm test registrations-panel` → cannot find module.

- [ ] **Step 3: Implement.**

`frontend/lib/registration-schemas.ts`:

```ts
import { z } from "zod";

export const manualRegisterSchema = z.object({
  user_id: z.coerce.number().int().positive(),
});
export type ManualRegisterInput = z.infer<typeof manualRegisterSchema>;

export const checkinTokenSchema = z.object({
  token: z.string().min(1),
});
```

`frontend/components/admin/registration-status-badge.tsx`:

```tsx
const COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  confirmed: "bg-green-100 text-green-700",
  waitlisted: "bg-yellow-100 text-yellow-800",
  cancelled: "bg-red-100 text-red-700",
  attended: "bg-blue-100 text-blue-700",
  no_show: "bg-orange-100 text-orange-800",
};

export function RegistrationStatusBadge({ status }: { status: string }) {
  return <span className={`rounded px-2 py-0.5 text-xs ${COLORS[status] ?? "bg-gray-100"}`}>{status}</span>;
}
```

`frontend/components/admin/registrations-panel.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/admin-api";
import { RegistrationStatusBadge } from "./registration-status-badge";

type Row = {
  id: number; user_id: number; username: string; email: string;
  status: string; waitlist_position: number | null; checked_in: boolean;
};
type ListResult = { items: Row[]; total: number };

export function RegistrationsPanel({ eventId }: { eventId: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    const res = await api.get<ListResult>(`/events/${eventId}/registrations?${params.toString()}`);
    setRows(res.items);
  }
  useEffect(() => { load().catch((e) => setError((e as Error).message)); }, [statusFilter]);

  async function act(id: number, action: "cancel" | "promote" | "no-show") {
    if (action === "cancel" && !window.confirm("Annullare l'iscrizione?")) return;
    try { await api.post(`/registrations/${id}/${action}`); await load(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select className="rounded border p-2" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Tutti</option>
          {["confirmed", "waitlisted", "attended", "cancelled", "no_show"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <table className="w-full rounded border bg-white text-sm">
        <thead className="bg-gray-50 text-left">
          <tr><th className="p-2">Utente</th><th className="p-2">Stato</th><th className="p-2">Pos.</th><th className="p-2">Check-in</th><th className="p-2">Azioni</th></tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="p-2">{r.username}<div className="text-xs text-gray-500">{r.email}</div></td>
              <td className="p-2"><RegistrationStatusBadge status={r.status} /></td>
              <td className="p-2">{r.waitlist_position ?? "—"}</td>
              <td className="p-2">{r.checked_in ? "✓" : "—"}</td>
              <td className="p-2 space-x-2">
                <a className="text-blue-700" href={`/api/registrations/${r.id}/qr`} target="_blank" rel="noreferrer">QR</a>
                {r.status === "waitlisted" && <button className="text-gray-700" onClick={() => act(r.id, "promote")}>Promuovi</button>}
                {r.status === "confirmed" && <button className="text-gray-700" onClick={() => act(r.id, "no-show")}>No-show</button>}
                {(r.status === "confirmed" || r.status === "waitlisted") && <button className="text-red-700" onClick={() => act(r.id, "cancel")}>Annulla</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes.** `cd frontend && pnpm test registrations-panel` → PASS. Then `pnpm test` (all) green.
- [ ] **Step 5: Commit.**
```bash
git add frontend/lib/registration-schemas.ts frontend/components/admin/registration-status-badge.tsx frontend/components/admin/registrations-panel.tsx frontend/__tests__/registrations-panel.test.tsx
git commit -m "feat(f4): registrations panel + status badge + schemas"
```

---

### Task B2: Manual register dialog + wire "Iscritti" tab

**Files:**
- Create: `frontend/components/admin/manual-register-dialog.tsx`
- Modify: `frontend/app/admin/events/[id]/page.tsx`

- [ ] **Step 1: Manual register dialog.** `frontend/components/admin/manual-register-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { api } from "@/lib/admin-api";

export function ManualRegisterDialog({ eventId, onDone }: { eventId: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    try {
      await api.post(`/events/${eventId}/registrations`, { user_id: Number(userId), answers: [] });
      setOpen(false); setUserId(""); onDone();
    } catch (e) { setError((e as Error).message); }
  }

  if (!open) return <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => setOpen(true)}>Iscrivi manualmente</button>;
  return (
    <div className="rounded border bg-white p-3 space-y-2">
      <p className="text-sm font-medium">Iscrizione manuale</p>
      <input className="rounded border p-2 text-sm" placeholder="ID utente" value={userId} onChange={(e) => setUserId(e.target.value)} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={submit}>Iscrivi</button>
        <button className="rounded border px-3 py-1.5 text-sm" onClick={() => setOpen(false)}>Annulla</button>
      </div>
    </div>
  );
}
```

> User selection is by numeric ID in F4 (a searchable user picker arrives with the F5/users UI). This keeps the dialog dependency-free; the backend validates the user exists via the FK.

- [ ] **Step 2: Wire the "Iscritti" tab.** Edit `frontend/app/admin/events/[id]/page.tsx`: add `"Iscritti"` to the `TABS` array, import `RegistrationsPanel` and `ManualRegisterDialog`, and render them when the tab is active. The TABS line becomes:

```tsx
const TABS = ["Dettagli", "Campi custom", "Allegati", "Visibilità", "Iscritti"] as const;
```

Add imports at the top:
```tsx
import { ManualRegisterDialog } from "@/components/admin/manual-register-dialog";
import { RegistrationsPanel } from "@/components/admin/registrations-panel";
import { useState as useReactState } from "react";
```

(If `useState` is already imported, reuse it — do not add a duplicate; the `useReactState` alias above is only a hint. Use the existing `useState`.) Add a refresh key so the dialog can refresh the panel:

```tsx
  const [regRefresh, setRegRefresh] = useState(0);
```

And in the render, after the existing tab blocks, add:
```tsx
      {tab === "Iscritti" && (
        <div className="space-y-3">
          <ManualRegisterDialog eventId={eventId} onDone={() => setRegRefresh((n) => n + 1)} />
          <RegistrationsPanel key={regRefresh} eventId={eventId} />
        </div>
      )}
```

(The `key={regRefresh}` remounts the panel to reload after a manual registration.)

- [ ] **Step 3: Verify build.** `cd frontend && pnpm build` → success.
- [ ] **Step 4: Commit.**
```bash
git add frontend/components/admin/manual-register-dialog.tsx "frontend/app/admin/events/[id]/page.tsx"
git commit -m "feat(f4): manual register dialog + Iscritti tab"
```

---

### Task B3: Operator check-in page + scanner

**Files:**
- Create: `frontend/components/admin/checkin-scanner.tsx`, `frontend/app/admin/checkin/page.tsx`
- Modify: `frontend/components/admin/sidebar.tsx`
- Test: `frontend/__tests__/checkin-scanner.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `frontend/__tests__/checkin-scanner.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ registration_id: 1, user_id: 5, username: "mrossi", event_title: "Corso", status: "attended" }),
  })) as unknown as typeof fetch);
});

import { CheckinScanner } from "@/components/admin/checkin-scanner";

describe("CheckinScanner", () => {
  it("shows success result after submitting a token", async () => {
    render(<CheckinScanner />);
    fireEvent.change(screen.getByPlaceholderText("Token QR"), { target: { value: "abc" } });
    fireEvent.click(screen.getByText("Check-in"));
    await waitFor(() => expect(screen.getByText(/mrossi/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `cd frontend && pnpm test checkin-scanner` → cannot find module.

- [ ] **Step 3: Implement.**

`frontend/components/admin/checkin-scanner.tsx`:

```tsx
"use client";

import { useState } from "react";
import { api } from "@/lib/admin-api";

type Result = { registration_id: number; username: string; event_title: string; status: string };
type LogEntry = { ok: boolean; text: string };

export function CheckinScanner() {
  const [token, setToken] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);

  async function submit() {
    if (!token.trim()) return;
    try {
      const res = await api.post<Result>("/checkin", { token: token.trim() });
      setLog((l) => [{ ok: true, text: `✓ ${res.username} — ${res.event_title} (${res.status})` }, ...l]);
    } catch (e) {
      setLog((l) => [{ ok: false, text: `✗ ${(e as Error).message}` }, ...l]);
    }
    setToken("");
  }

  return (
    <div className="max-w-lg space-y-3">
      <div className="flex gap-2">
        <input className="flex-1 rounded border p-2" placeholder="Token QR" value={token}
               onChange={(e) => setToken(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={submit}>Check-in</button>
      </div>
      <ul className="space-y-1 text-sm">
        {log.map((e, i) => (
          <li key={i} className={`rounded p-2 ${e.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{e.text}</li>
        ))}
      </ul>
    </div>
  );
}
```

`frontend/app/admin/checkin/page.tsx`:

```tsx
import { CheckinScanner } from "@/components/admin/checkin-scanner";

export default function CheckinPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Check-in</h1>
      <p className="text-sm text-gray-600">Scansiona o incolla il token QR del partecipante.</p>
      <CheckinScanner />
    </div>
  );
}
```

Add a sidebar link in `frontend/components/admin/sidebar.tsx` (after the Categorie `<li>`):
```tsx
        <li><Link className="block rounded px-3 py-2 hover:bg-blue-100" href="/admin/checkin">Check-in</Link></li>
```

- [ ] **Step 4: Run to verify it passes.** `cd frontend && pnpm test checkin-scanner` → PASS. Then `pnpm test` (all) + `pnpm build` → green.
- [ ] **Step 5: Commit.**
```bash
git add frontend/components/admin/checkin-scanner.tsx frontend/app/admin/checkin/page.tsx frontend/components/admin/sidebar.tsx frontend/__tests__/checkin-scanner.test.tsx
git commit -m "feat(f4): operator check-in page + scanner"
```

---

### Task B4: End-to-end verification + docs

**Files:** Modify `INSTALL.md`

- [ ] **Step 1: Backend e2e via curl** on a fresh DB (mirror F2/F3): migrate to head, create super_admin (`ADMIN_PASSWORD=... python -m app.cli create-admin --email ... --username admin`), start backend, login (use access token as `Cookie: access_token=...`), then: create+publish an event with `capacity`, self-register a second user, fill to capacity, verify waitlist, cancel a confirmed → verify promotion, fetch `/registrations/{id}/token`, `POST /api/checkin` → `attended`, second check-in → `409`, `GET /qr` → PNG. Capture HTTP codes. Drop the throwaway DB.

- [ ] **Step 2: Document in INSTALL.md.** Append:

```markdown
## Iscrizioni e check-in (F4)
- Dalla pagina evento (`/admin/events/{id}`), tab **Iscritti**: elenco iscritti con stato, iscrizione manuale, annulla, promuovi (lista d'attesa), segna no-show, QR per iscrizione.
- Pagina **Check-in** (`/admin/checkin`): l'operatore (ruolo `checkin_operator`) incolla/scansiona il token QR del partecipante per registrare la presenza (`attended`).
- Capienza e `max_per_user` sono applicati lato server con lock dell'evento; la lista d'attesa promuove automaticamente alla cancellazione di un confermato. Le email di conferma/promozione arrivano in F6.
```

- [ ] **Step 3: Commit.**
```bash
git add INSTALL.md
git commit -m "docs(f4): registrations + check-in instructions"
```

---

## Self-Review Notes

- **Spec coverage:** §3 models/migration (3 tables + perm/role seed) → A3/A4; §4 state machine → A6 (register paths) + A7 (cancel/promote/no_show) + A9 (attended via check-in); §5 APIs — register/list/get/cancel/promote/no-show/me → A8, qr/token → A9, checkin → A9; §6 UI — Iscritti tab/panel/manual dialog → B1/B2, operator check-in → B3; §7 security — RBAC per endpoint + self-access (`_owns_or_perm`), signed token (A1), capacity lock (A6 `with_for_update`), answer validation (A6), idempotent check-in (A9); §8 tests per task.
- **Deviation honored:** no `waiting_list` table — waitlist via `status='waitlisted'` + `waitlist_position`; promotion/recompaction in `registration_service`.
- **max_per_user vs duplicate:** unified into one rule — `_active_for_user >= max_per_user` (default 1) blocks the second active registration, covering both "one active per event" and the per-user cap.
- **Type/name consistency:** `registration_service` fns (`register/cancel/promote/mark_no_show/get/list_for_event/list_for_user`) match router calls; `checkin_service.check_in` + `CheckinError.code` map to HTTP status in the router; `create_checkin_token`/`decode_checkin_token` consistent A1↔A9; frontend `api` methods + `RegistrationStatusBadge` props consistent.
- **Capacity counts `confirmed`+`attended`** (`_OCCUPYING`); waitlisted/pending/cancelled/no_show do not occupy. Consistent across register/promote/_promote_next.
- **Commit-isolation note:** API tests set the cookie on the client and rely on the per-test rolled-back session (endpoints call `db.commit()`), same pattern proven in F2/F3. `with_for_update()` runs inside that transaction on MySQL InnoDB — fine.
- **Migration head:** `down_revision = "0005_events"` (current head). Executor verifies before writing.
