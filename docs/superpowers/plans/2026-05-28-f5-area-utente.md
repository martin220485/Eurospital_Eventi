# F5 Area utente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the employee area (`/app`): dashboard, event catalog with filters, calendar (month/week/day/list), event detail with self-service registration (dynamic custom-field form + consents), receipt/QR, my-registrations history with cancel, and profile with password change.

**Architecture:** A read-only catalog backend (`/api/catalog/*`, any authenticated user, published + visibility=all only) plus a self change-password endpoint, on top of F3 events and F4 registrations. A new Next `/app` route group parallel to `/admin`, sharing the cookie session and `api` client; login routes by role (permissions present → `/admin`, none → `/app`).

**Tech Stack:** Backend — FastAPI, SQLAlchemy 2.0, Alembic, argon2 (F1), pytest. Frontend — Next.js 15 App Router, React 19, Tailwind v3, TanStack Query, Zod, Vitest + RTL.

## Run commands (environment)

- No pip; use `backend/.venv/bin/python`. Install: `cd backend && uv pip install <pkg>` (none needed for F5).
- Backend tests (both env vars): `cd backend && TEST_DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" .venv/bin/python -m pytest <args>`
- Frontend: `cd frontend && pnpm test <pattern>` / `pnpm build`.
- Branch: create `f5-area-utente` from `main` before Task A1 (executor handles this).
- Migration head is `0006_registrations`; new migration uses `down_revision = "0006_registrations"` (verify with `grep "revision =" backend/alembic/versions/0006_registrations.py`).

---

## File Structure

**Backend**
- `alembic/versions/0007_employee_role.py` — seed `employee` role
- `app/services/catalog_service.py`, `app/schemas/catalog.py`, `app/api/routers/catalog.py`
- `app/services/auth_service.py` (MODIFY), `app/schemas/auth.py` (MODIFY), `app/api/routers/auth.py` (MODIFY), `app/main.py` (MODIFY)
- Tests: `test_migration.py` (MODIFY), `test_catalog_api.py`, `test_change_password_api.py`

**Frontend**
- `middleware.ts` (MODIFY), `lib/admin-api.ts` (MODIFY), `app/login/page.tsx` (MODIFY)
- `lib/{catalog-api,catalog-schemas,calendar-utils}.ts`
- `app/app/{layout,page}.tsx`, `app/app/catalog/page.tsx`, `app/app/calendar/page.tsx`, `app/app/events/[id]/page.tsx`, `app/app/registrations/page.tsx`, `app/app/profile/page.tsx`
- `components/app/{user-nav,user-topbar,event-card,register-form,registration-receipt}.tsx`, `components/app/calendar/{calendar-view,month-grid,week-grid,day-list,agenda-list}.tsx`
- Tests: `__tests__/{calendar-utils,register-form,event-card}.test.tsx`

---

# PART A — Backend

### Task A1: Migration 0007 — employee role

**Files:**
- Create: `backend/alembic/versions/0007_employee_role.py`
- Modify: `backend/tests/test_migration.py`

- [ ] **Step 1: Add a test.** Append to `backend/tests/test_migration.py`:

```python
def test_employee_role_seeded(engine):
    from sqlalchemy import text
    with engine.connect() as c:
        roles = c.execute(text("SELECT name FROM roles")).scalars().all()
    assert "employee" in roles
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_migration.py::test_employee_role_seeded -v` → fails.

- [ ] **Step 3: Confirm down revision.** `grep "revision =" backend/alembic/versions/0006_registrations.py` → `0006_registrations`. Create `backend/alembic/versions/0007_employee_role.py`:

```python
"""seed employee role

Revision ID: 0007_employee_role
Revises: 0006_registrations
Create Date: 2026-05-28
"""
import sqlalchemy as sa

from alembic import op

revision = "0007_employee_role"
down_revision = "0006_registrations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO roles (name, description) SELECT 'employee', 'Dipendente' "
            "WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'employee')"
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE rp FROM role_permissions rp JOIN roles r ON rp.role_id = r.id "
            "WHERE r.name = 'employee'"
        )
    )
    conn.execute(sa.text("DELETE FROM roles WHERE name = 'employee'"))
```

- [ ] **Step 4: Run to verify it passes.** `... -m pytest tests/test_migration.py -v` → all pass.
- [ ] **Step 5: Commit.**
```bash
git add backend/alembic/versions/0007_employee_role.py backend/tests/test_migration.py
git commit -m "feat(f5): migration 0007 seed employee role"
```

---

### Task A2: Catalog schemas + service

**Files:**
- Create: `backend/app/schemas/catalog.py`, `backend/app/services/catalog_service.py`
- Test: `backend/tests/test_catalog_service.py`

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_catalog_service.py`:

```python
from datetime import datetime, timedelta

import pytest

from app.services import catalog_service, event_service, registration_service, user_service, visibility_service


def _event(db, **over):
    start = datetime(2030, 1, 1, 9, 0)
    data = dict(title="E", start_at=start, end_at=start + timedelta(hours=1), mode="physical")
    data.update(over)
    ev = event_service.create(db, created_by=None, **data)
    db.flush()
    return ev


def test_list_hides_draft_and_restricted(db):
    pub = _event(db, title="Pub")
    pub.status = "published"
    draft = _event(db, title="Draft")  # stays draft
    restricted = _event(db, title="Restr")
    restricted.status = "published"
    db.flush()
    visibility_service.set_visibility(db, restricted.id, "restricted", ["Reparto X"])
    events, total = catalog_service.list_visible_events(
        db, category_id=None, q=None, date_from=None, date_to=None, page=1, page_size=50
    )
    titles = {e.title for e in events}
    assert "Pub" in titles
    assert "Draft" not in titles
    assert "Restr" not in titles


def test_available_spots(db):
    ev = _event(db, capacity=2)
    ev.status = "published"
    db.flush()
    assert catalog_service.available_spots(db, ev) == 2
    registration_service.register(db, event_id=ev.id, user_id=user_service.create_user(
        db, email="a@x.it", username="a", password="pw12345").id, registered_by=None, answers=[])
    assert catalog_service.available_spots(db, ev) == 1


def test_available_spots_unlimited(db):
    ev = _event(db, capacity=None)
    ev.status = "published"
    db.flush()
    assert catalog_service.available_spots(db, ev) is None


def test_my_status_reflects_registration(db):
    ev = _event(db, capacity=5)
    ev.status = "published"
    db.flush()
    u = user_service.create_user(db, email="b@x.it", username="b", password="pw12345")
    assert catalog_service.my_status(db, ev.id, u.id) is None
    registration_service.register(db, event_id=ev.id, user_id=u.id, registered_by=None, answers=[])
    assert catalog_service.my_status(db, ev.id, u.id) == "confirmed"


def test_get_visible_event_404_on_draft(db):
    ev = _event(db, title="D")  # draft
    with pytest.raises(catalog_service.CatalogError):
        catalog_service.get_visible_event(db, ev.id)
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_catalog_service.py -v` → ModuleNotFoundError.

- [ ] **Step 3: Implement schemas.** `backend/app/schemas/catalog.py`:

```python
from datetime import datetime

from pydantic import BaseModel


class CatalogEventItem(BaseModel):
    id: int
    title: str
    short_description: str | None = None
    category_id: int | None = None
    category_name: str | None = None
    category_color: str | None = None
    mode: str
    start_at: datetime
    end_at: datetime
    available_spots: int | None = None
    registration_open: bool
    my_status: str | None = None


class CustomFieldOption(BaseModel):
    label: str
    value: str


class CustomField(BaseModel):
    id: int
    label: str
    field_type: str
    required: bool
    placeholder: str | None = None
    options: list[CustomFieldOption] = []


class CatalogEventDetail(CatalogEventItem):
    description: str | None = None
    location_name: str | None = None
    address: str | None = None
    online_url: str | None = None
    waitlist_enabled: bool
    custom_fields: list[CustomField] = []


class MyEventItem(BaseModel):
    registration_id: int
    event_id: int
    event_title: str
    event_start_at: datetime
    status: str
```

- [ ] **Step 4: Implement service.** `backend/app/services/catalog_service.py`:

```python
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Event, EventCategory, EventVisibility, Registration

_OCCUPYING = ("confirmed", "attended")
_ACTIVE = ("pending", "confirmed", "waitlisted", "attended")


class CatalogError(Exception):
    pass


def _restricted_event_ids(db: Session):
    return select(EventVisibility.event_id).where(EventVisibility.mode == "restricted")


def available_spots(db: Session, event: Event) -> int | None:
    if event.capacity is None:
        return None
    occupied = db.scalar(
        select(func.count()).select_from(Registration)
        .where(Registration.event_id == event.id, Registration.status.in_(_OCCUPYING))
    ) or 0
    return max(event.capacity - occupied, 0)


def my_status(db: Session, event_id: int, user_id: int) -> str | None:
    return db.scalar(
        select(Registration.status)
        .where(Registration.event_id == event_id, Registration.user_id == user_id,
               Registration.status.in_(_ACTIVE)).limit(1)
    )


def registration_open(db: Session, event: Event) -> bool:
    if event.status != "published":
        return False
    now = datetime.utcnow()
    if event.registration_open_at and now < event.registration_open_at:
        return False
    if event.registration_close_at and now > event.registration_close_at:
        return False
    spots = available_spots(db, event)
    return spots is None or spots > 0 or bool(event.waitlist_enabled)


def list_visible_events(
    db: Session, *, category_id, q, date_from, date_to, page, page_size,
) -> tuple[list[Event], int]:
    base = select(Event).where(
        Event.status == "published", Event.id.notin_(_restricted_event_ids(db))
    )
    count = select(func.count()).select_from(Event).where(
        Event.status == "published", Event.id.notin_(_restricted_event_ids(db))
    )
    conds = []
    if category_id:
        conds.append(Event.category_id == category_id)
    if q:
        conds.append(Event.title.like(f"%{q}%"))
    if date_from:
        conds.append(Event.start_at >= date_from)
    if date_to:
        conds.append(Event.start_at <= date_to)
    for c in conds:
        base = base.where(c)
        count = count.where(c)
    total = db.scalar(count) or 0
    base = base.order_by(Event.start_at).offset((page - 1) * page_size).limit(page_size)
    return list(db.scalars(base)), total


def get_visible_event(db: Session, event_id: int) -> Event:
    ev = db.scalar(
        select(Event).where(
            Event.id == event_id, Event.status == "published",
            Event.id.notin_(_restricted_event_ids(db)),
        )
    )
    if ev is None:
        raise CatalogError("event not visible")
    return ev


def category_of(db: Session, event: Event) -> EventCategory | None:
    return db.get(EventCategory, event.category_id) if event.category_id else None


def my_events(db: Session, user_id: int) -> list[tuple[Registration, Event]]:
    rows = db.scalars(
        select(Registration).where(Registration.user_id == user_id)
        .order_by(Registration.created_at.desc())
    ).all()
    out = []
    for r in rows:
        ev = db.get(Event, r.event_id)
        if ev is not None:
            out.append((r, ev))
    return out
```

- [ ] **Step 5: Run to verify it passes.** `... -m pytest tests/test_catalog_service.py -v` → 5 passed.
- [ ] **Step 6: Commit.**
```bash
git add backend/app/schemas/catalog.py backend/app/services/catalog_service.py backend/tests/test_catalog_service.py
git commit -m "feat(f5): catalog schemas + service (visible events, spots, my_status)"
```

---

### Task A3: Catalog router

**Files:**
- Create: `backend/app/api/routers/catalog.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_catalog_api.py`

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_catalog_api.py`:

```python
from datetime import datetime, timedelta

from app.services import event_service, user_service


def _employee_cookie(client, db):
    u = user_service.create_user(db, email="emp@x.it", username="emp", password="pw12345")
    db.flush()
    pair = client.post("/api/auth/login", json={"identifier": "emp", "password": "pw12345"}).json()
    client.cookies.set("access_token", pair["access_token"])
    return u


def _published(db, **over):
    start = datetime(2030, 1, 1, 9, 0)
    data = dict(title="Pub", start_at=start, end_at=start + timedelta(hours=1), mode="physical")
    data.update(over)
    ev = event_service.create(db, created_by=None, **data)
    ev.status = "published"
    db.flush()
    return ev


def test_catalog_list_no_admin_permission_needed(client, db):
    _published(db)
    _employee_cookie(client, db)
    r = client.get("/api/catalog/events")
    assert r.status_code == 200
    assert r.json()["total"] >= 1


def test_catalog_detail_includes_fields_and_status(client, db):
    ev = _published(db, capacity=5)
    _employee_cookie(client, db)
    r = client.get(f"/api/catalog/events/{ev.id}")
    assert r.status_code == 200
    body = r.json()
    assert body["available_spots"] == 5
    assert body["my_status"] is None
    assert "custom_fields" in body


def test_catalog_detail_404_on_draft(client, db):
    start = datetime(2030, 1, 1, 9, 0)
    ev = event_service.create(db, created_by=None, title="D", start_at=start,
                              end_at=start + timedelta(hours=1), mode="physical")
    db.flush()
    _employee_cookie(client, db)
    assert client.get(f"/api/catalog/events/{ev.id}").status_code == 404


def test_my_events(client, db):
    ev = _published(db, capacity=5)
    _employee_cookie(client, db)
    client.post(f"/api/events/{ev.id}/registrations", json={"answers": []})
    r = client.get("/api/catalog/my-events")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["event_title"] == "Pub"
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_catalog_api.py -v` → 404.

- [ ] **Step 3: Implement.** `backend/app/api/routers/catalog.py`:

```python
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models import User
from app.schemas.catalog import (
    CatalogEventDetail, CatalogEventItem, CustomField, CustomFieldOption, MyEventItem,
)
from app.services import catalog_service, custom_field_service

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


def _item(db: Session, ev, user_id: int) -> CatalogEventItem:
    cat = catalog_service.category_of(db, ev)
    return CatalogEventItem(
        id=ev.id, title=ev.title, short_description=ev.short_description,
        category_id=ev.category_id, category_name=cat.name if cat else None,
        category_color=cat.color if cat else None, mode=ev.mode,
        start_at=ev.start_at, end_at=ev.end_at,
        available_spots=catalog_service.available_spots(db, ev),
        registration_open=catalog_service.registration_open(db, ev),
        my_status=catalog_service.my_status(db, ev.id, user_id),
    )


@router.get("/events")
def list_events(db: Session = Depends(get_db), user: User = Depends(get_current_user),
                category_id: int | None = None, q: str | None = None,
                date_from: datetime | None = Query(default=None, alias="from"),
                date_to: datetime | None = Query(default=None, alias="to"),
                page: int = 1, page_size: int = 100) -> dict:
    events, total = catalog_service.list_visible_events(
        db, category_id=category_id, q=q, date_from=date_from, date_to=date_to,
        page=page, page_size=page_size,
    )
    return {"items": [_item(db, e, user.id) for e in events], "total": total,
            "page": page, "page_size": page_size}


@router.get("/events/{event_id}", response_model=CatalogEventDetail)
def get_event(event_id: int, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)) -> CatalogEventDetail:
    try:
        ev = catalog_service.get_visible_event(db, event_id)
    except catalog_service.CatalogError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento non disponibile")
    base = _item(db, ev, user.id)
    fields = []
    for f in custom_field_service.get_fields(db, ev.id):
        opts = [CustomFieldOption(label=o.label, value=o.value)
                for o in custom_field_service.get_options(db, f.id)]
        fields.append(CustomField(id=f.id, label=f.label, field_type=f.field_type,
                                  required=f.required, placeholder=f.placeholder, options=opts))
    return CatalogEventDetail(
        **base.model_dump(), description=ev.description, location_name=ev.location_name,
        address=ev.address, online_url=ev.online_url, waitlist_enabled=ev.waitlist_enabled,
        custom_fields=fields,
    )


@router.get("/my-events", response_model=list[MyEventItem])
def my_events(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[MyEventItem]:
    return [
        MyEventItem(registration_id=r.id, event_id=ev.id, event_title=ev.title,
                    event_start_at=ev.start_at, status=r.status)
        for r, ev in catalog_service.my_events(db, user.id)
    ]
```

Mount `catalog.router` in `backend/app/main.py`.

- [ ] **Step 4: Run to verify it passes.** `... -m pytest tests/test_catalog_api.py -v` → 4 passed.
- [ ] **Step 5: Commit.**
```bash
git add backend/app/api/routers/catalog.py backend/app/main.py backend/tests/test_catalog_api.py
git commit -m "feat(f5): catalog router (events list/detail/my-events)"
```

---

### Task A4: Change password (self)

**Files:**
- Modify: `backend/app/services/auth_service.py`, `backend/app/schemas/auth.py`, `backend/app/api/routers/auth.py`
- Test: `backend/tests/test_change_password_api.py`

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_change_password_api.py`:

```python
from app.services import user_service


def _cookie(client, db):
    user_service.create_user(db, email="u@x.it", username="u", password="oldpass123")
    db.flush()
    pair = client.post("/api/auth/login", json={"identifier": "u", "password": "oldpass123"}).json()
    client.cookies.set("access_token", pair["access_token"])


def test_change_password_wrong_old_400(client, db):
    _cookie(client, db)
    r = client.post("/api/auth/change-password",
                    json={"old_password": "WRONG", "new_password": "newpass123"})
    assert r.status_code == 400


def test_change_password_success_then_login(client, db):
    _cookie(client, db)
    r = client.post("/api/auth/change-password",
                    json={"old_password": "oldpass123", "new_password": "newpass123"})
    assert r.status_code == 204
    # old no longer works, new does
    assert client.post("/api/auth/login", json={"identifier": "u", "password": "oldpass123"}).status_code == 401
    assert client.post("/api/auth/login", json={"identifier": "u", "password": "newpass123"}).status_code == 200
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_change_password_api.py -v` → 404.

- [ ] **Step 3: Implement.** Add to `backend/app/schemas/auth.py`:

```python
class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8, max_length=128)
```

(Add `Field` to the existing `from pydantic import ...` import.)

Append to `backend/app/services/auth_service.py`:

```python
def change_password(db: Session, user: User, *, old_password: str, new_password: str) -> None:
    if not user.hashed_password or not verify_password(old_password, user.hashed_password):
        raise AuthError("invalid old password")
    user.hashed_password = hash_password(new_password)
    db.flush()
```

Add to `backend/app/api/routers/auth.py` (import `ChangePasswordIn` from `app.schemas.auth`):

```python
@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(payload: ChangePasswordIn, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)) -> Response:
    try:
        auth_service.change_password(db, user, old_password=payload.old_password,
                                     new_password=payload.new_password)
    except auth_service.AuthError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vecchia password errata")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

(`Response`, `get_current_user`, `status`, `HTTPException` are already imported in `auth.py`.)

- [ ] **Step 4: Run to verify it passes.** `... -m pytest tests/test_change_password_api.py -v` → 2 passed. Then full suite `... -m pytest -q` → all green.
- [ ] **Step 5: Commit.**
```bash
git add backend/app/services/auth_service.py backend/app/schemas/auth.py backend/app/api/routers/auth.py backend/tests/test_change_password_api.py
git commit -m "feat(f5): self change-password endpoint"
```

---

# PART B — Frontend

### Task B1: Calendar date utils

**Files:**
- Create: `frontend/lib/calendar-utils.ts`
- Test: `frontend/__tests__/calendar-utils.test.ts`

- [ ] **Step 1: Write the failing test.** Create `frontend/__tests__/calendar-utils.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dayRange, groupByDay, monthRange, weekRange } from "@/lib/calendar-utils";

describe("calendar-utils", () => {
  it("monthRange covers full weeks around the month", () => {
    const { from, to } = monthRange(new Date("2026-02-15T00:00:00"));
    expect(from.getDay()).toBe(1); // Monday
    expect(from <= new Date("2026-02-01")).toBe(true);
    expect(to >= new Date("2026-02-28")).toBe(true);
  });
  it("weekRange is Monday..Sunday", () => {
    const { from, to } = weekRange(new Date("2026-02-18T00:00:00")); // Wed
    expect(from.getDay()).toBe(1);
    expect(to.getDay()).toBe(0);
  });
  it("dayRange spans one day", () => {
    const { from, to } = dayRange(new Date("2026-02-18T13:00:00"));
    expect(from.getHours()).toBe(0);
    expect(to.getTime() - from.getTime()).toBeGreaterThan(23 * 3600 * 1000);
  });
  it("groupByDay buckets events by ISO date", () => {
    const evs = [
      { id: 1, start_at: "2026-02-18T09:00:00" },
      { id: 2, start_at: "2026-02-18T15:00:00" },
      { id: 3, start_at: "2026-02-19T10:00:00" },
    ];
    const g = groupByDay(evs);
    expect(g.get("2026-02-18")?.length).toBe(2);
    expect(g.get("2026-02-19")?.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `cd frontend && pnpm test calendar-utils` → cannot find module.

- [ ] **Step 3: Implement.** `frontend/lib/calendar-utils.ts`:

```ts
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function mondayOf(d: Date): Date {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - day);
  return x;
}

export function dayRange(d: Date): { from: Date; to: Date } {
  const from = startOfDay(d);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  to.setMilliseconds(-1);
  return { from, to };
}

export function weekRange(d: Date): { from: Date; to: Date } {
  const from = mondayOf(d);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  to.setMilliseconds(-1);
  return { from, to };
}

export function monthRange(d: Date): { from: Date; to: Date } {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const from = mondayOf(first);
  const to = new Date(mondayOf(last));
  to.setDate(to.getDate() + 7);
  to.setMilliseconds(-1);
  return { from, to };
}

export function isoDay(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export function groupByDay<T extends { start_at: string }>(events: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const e of events) {
    const key = isoDay(e.start_at);
    const list = m.get(key) ?? [];
    list.push(e);
    m.set(key, list);
  }
  return m;
}

export function eachDay(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const cur = startOfDay(from);
  while (cur <= to) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}
```

- [ ] **Step 4: Run to verify it passes.** `cd frontend && pnpm test calendar-utils` → 4 passed.
- [ ] **Step 5: Commit.**
```bash
git add frontend/lib/calendar-utils.ts frontend/__tests__/calendar-utils.test.ts
git commit -m "feat(f5): calendar date utils"
```

---

### Task B2: Catalog client, schemas, login routing, middleware

**Files:**
- Create: `frontend/lib/catalog-api.ts`, `frontend/lib/catalog-schemas.ts`
- Modify: `frontend/lib/admin-api.ts`, `frontend/app/login/page.tsx`, `frontend/middleware.ts`

- [ ] **Step 1: Catalog client + schemas.** `frontend/lib/catalog-api.ts`:

```ts
import { api } from "@/lib/admin-api";

export type CatalogEvent = {
  id: number; title: string; short_description: string | null;
  category_id: number | null; category_name: string | null; category_color: string | null;
  mode: string; start_at: string; end_at: string;
  available_spots: number | null; registration_open: boolean; my_status: string | null;
};
export type CustomField = {
  id: number; label: string; field_type: string; required: boolean;
  placeholder: string | null; options: { label: string; value: string }[];
};
export type CatalogEventDetail = CatalogEvent & {
  description: string | null; location_name: string | null; address: string | null;
  online_url: string | null; waitlist_enabled: boolean; custom_fields: CustomField[];
};
export type MyEvent = {
  registration_id: number; event_id: number; event_title: string;
  event_start_at: string; status: string;
};

export const catalogApi = {
  list: (qs = "") => api.get<{ items: CatalogEvent[]; total: number }>(`/catalog/events${qs}`),
  detail: (id: number) => api.get<CatalogEventDetail>(`/catalog/events/${id}`),
  myEvents: () => api.get<MyEvent[]>("/catalog/my-events"),
};
```

`frontend/lib/catalog-schemas.ts`:

```ts
import { z } from "zod";

export const changePasswordSchema = z.object({
  old_password: z.string().min(1),
  new_password: z.string().min(8).max(128),
});
```

- [ ] **Step 2: Add `resolveLanding` to `frontend/lib/admin-api.ts`** (append, after the existing `login`/`logout`):

```ts
export async function resolveLanding(): Promise<string> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) return "/login";
    const me = await res.json();
    return Array.isArray(me.permissions) && me.permissions.length > 0 ? "/admin/events" : "/app";
  } catch {
    return "/login";
  }
}
```

- [ ] **Step 3: Update login redirect.** In `frontend/app/login/page.tsx`, change the post-login navigation to use `resolveLanding`. Replace the `router.push("/admin/events")` line so the submit handler becomes:

```tsx
import { login, resolveLanding } from "@/lib/admin-api";
// ...
    try {
      await login(form.identifier, form.password);
      router.push(await resolveLanding());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
```

(Update the existing import line to include `resolveLanding`.)

- [ ] **Step 4: Extend middleware.** In `frontend/middleware.ts`, change the matcher to gate both areas:

```ts
export const config = {
  matcher: ["/admin/:path*", "/app/:path*"],
};
```

- [ ] **Step 5: Verify build.** `cd frontend && pnpm build` → success. `pnpm test` → green.
- [ ] **Step 6: Commit.**
```bash
git add frontend/lib/catalog-api.ts frontend/lib/catalog-schemas.ts frontend/lib/admin-api.ts frontend/app/login/page.tsx frontend/middleware.ts
git commit -m "feat(f5): catalog client + role-based login routing + /app gate"
```

---

### Task B3: User shell (layout, nav, topbar) + dashboard

**Files:**
- Create: `frontend/components/app/user-nav.tsx`, `frontend/components/app/user-topbar.tsx`, `frontend/app/app/layout.tsx`, `frontend/app/app/page.tsx`

- [ ] **Step 1: Nav + topbar.** `frontend/components/app/user-nav.tsx`:

```tsx
import Link from "next/link";

const LINKS = [
  ["Dashboard", "/app"],
  ["Catalogo", "/app/catalog"],
  ["Calendario", "/app/calendar"],
  ["Le mie iscrizioni", "/app/registrations"],
  ["Profilo", "/app/profile"],
];

export function UserNav() {
  return (
    <nav className="w-56 shrink-0 border-r bg-gray-50 p-4">
      <div className="mb-6 text-lg font-semibold text-blue-700">Eurospital Eventi</div>
      <ul className="space-y-1 text-sm">
        {LINKS.map(([label, href]) => (
          <li key={href}><Link className="block rounded px-3 py-2 hover:bg-blue-100" href={href}>{label}</Link></li>
        ))}
      </ul>
    </nav>
  );
}
```

`frontend/components/app/user-topbar.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, logout } from "@/lib/admin-api";

export function UserTopbar() {
  const router = useRouter();
  const [name, setName] = useState("");

  useEffect(() => {
    api.get<{ full_name?: string; username: string }>("/auth/me")
      .then((u) => setName(u.full_name || u.username)).catch(() => {});
  }, []);

  async function doLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <header className="flex items-center justify-between border-b bg-white px-6 py-3">
      <div />
      <div className="flex items-center gap-3 text-sm">
        <span className="text-gray-600">{name}</span>
        <button className="rounded border px-3 py-1 hover:bg-gray-50" onClick={doLogout}>Logout</button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Layout + dashboard.** `frontend/app/app/layout.tsx`:

```tsx
import { UserNav } from "@/components/app/user-nav";
import { UserTopbar } from "@/components/app/user-topbar";

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <UserNav />
      <div className="flex flex-1 flex-col">
        <UserTopbar />
        <main className="flex-1 bg-gray-50 p-6">{children}</main>
      </div>
    </div>
  );
}
```

`frontend/app/app/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { catalogApi, type CatalogEvent, type MyEvent } from "@/lib/catalog-api";

export default function DashboardPage() {
  const [mine, setMine] = useState<MyEvent[]>([]);
  const [featured, setFeatured] = useState<CatalogEvent[]>([]);

  useEffect(() => {
    catalogApi.myEvents().then(setMine).catch(() => {});
    catalogApi.list("?page=1&page_size=4").then((r) => setFeatured(r.items)).catch(() => {});
  }, []);

  const upcoming = mine.filter((m) => ["confirmed", "waitlisted"].includes(m.status)
    && new Date(m.event_start_at) >= new Date());

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Ciao!</h1>
      <section>
        <h2 className="mb-2 font-medium">Le tue prossime iscrizioni</h2>
        {upcoming.length === 0 ? <p className="text-sm text-gray-500">Nessuna iscrizione futura.</p> : (
          <ul className="space-y-1 text-sm">
            {upcoming.map((m) => (
              <li key={m.registration_id} className="rounded border bg-white p-2">
                <Link className="text-blue-700" href={`/app/events/${m.event_id}`}>{m.event_title}</Link>
                {" — "}{new Date(m.event_start_at).toLocaleString("it-IT")} ({m.status})
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 font-medium">Eventi in evidenza</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {featured.map((e) => (
            <Link key={e.id} href={`/app/events/${e.id}`} className="rounded border bg-white p-3 hover:shadow">
              <div className="font-medium">{e.title}</div>
              <div className="text-xs text-gray-500">{new Date(e.start_at).toLocaleString("it-IT")}</div>
            </Link>
          ))}
        </div>
        <Link className="mt-3 inline-block text-sm text-blue-700" href="/app/catalog">Vedi tutto il catalogo →</Link>
      </section>
    </div>
  );
}
```

> `/auth/me` returns `full_name` (it's in `UserOut`). If not present the topbar falls back to `username`.

- [ ] **Step 3: Verify build.** `cd frontend && pnpm build` → success.
- [ ] **Step 4: Commit.**
```bash
git add frontend/components/app/user-nav.tsx frontend/components/app/user-topbar.tsx frontend/app/app/layout.tsx frontend/app/app/page.tsx
git commit -m "feat(f5): user shell + dashboard"
```

---

### Task B4: Event card + catalog page

**Files:**
- Create: `frontend/components/app/event-card.tsx`, `frontend/app/app/catalog/page.tsx`
- Test: `frontend/__tests__/event-card.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `frontend/__tests__/event-card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventCard } from "@/components/app/event-card";

const base = {
  id: 1, title: "Corso", short_description: "desc", category_id: null, category_name: "Form",
  category_color: "#123", mode: "online", start_at: "2030-01-01T09:00:00", end_at: "2030-01-01T10:00:00",
  available_spots: 0, registration_open: false, my_status: null,
};

describe("EventCard", () => {
  it("shows full badge when no spots", () => {
    render(<EventCard event={base} />);
    expect(screen.getByText("Corso")).toBeInTheDocument();
    expect(screen.getByText(/esauriti/i)).toBeInTheDocument();
  });
  it("shows my status when registered", () => {
    render(<EventCard event={{ ...base, available_spots: 5, my_status: "confirmed" }} />);
    expect(screen.getByText("confirmed")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `cd frontend && pnpm test event-card` → cannot find module.

- [ ] **Step 3: Implement.** `frontend/components/app/event-card.tsx`:

```tsx
import Link from "next/link";
import type { CatalogEvent } from "@/lib/catalog-api";

export function EventCard({ event }: { event: CatalogEvent }) {
  const full = event.available_spots === 0;
  return (
    <Link href={`/app/events/${event.id}`} className="block rounded-lg border bg-white p-4 hover:shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs rounded px-2 py-0.5" style={{ background: event.category_color ?? "#eee" }}>
          {event.category_name ?? "Evento"}
        </span>
        <span className="text-xs text-gray-500">{event.mode === "online" ? "Online" : event.mode === "hybrid" ? "Ibrido" : "In sede"}</span>
      </div>
      <h3 className="mt-2 font-medium">{event.title}</h3>
      {event.short_description && <p className="text-sm text-gray-600">{event.short_description}</p>}
      <div className="mt-2 text-xs text-gray-500">{new Date(event.start_at).toLocaleString("it-IT")}</div>
      <div className="mt-2 flex gap-2 text-xs">
        {event.my_status
          ? <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700">{event.my_status}</span>
          : full
            ? <span className="rounded bg-red-100 px-2 py-0.5 text-red-700">Posti esauriti</span>
            : <span className="rounded bg-green-100 px-2 py-0.5 text-green-700">
                {event.available_spots === null ? "Posti liberi" : `${event.available_spots} posti`}
              </span>}
        {!event.registration_open && !event.my_status && <span className="text-gray-400">Iscrizioni chiuse</span>}
      </div>
    </Link>
  );
}
```

`frontend/app/app/catalog/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { EventCard } from "@/components/app/event-card";
import { catalogApi, type CatalogEvent } from "@/lib/catalog-api";

export default function CatalogPage() {
  const [events, setEvents] = useState<CatalogEvent[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const res = await catalogApi.list(`?${params.toString()}`);
    setEvents(res.items);
  }
  useEffect(() => { load().catch((e) => setError((e as Error).message)); }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Catalogo eventi</h1>
      <div className="flex gap-2">
        <input className="rounded border p-2" placeholder="Cerca" value={q}
               onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(); }} />
        <button className="rounded border px-4 py-2" onClick={() => load()}>Cerca</button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {events.length === 0 ? <p className="text-sm text-gray-500">Nessun evento disponibile.</p> : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes.** `cd frontend && pnpm test event-card` → 2 passed. Then `pnpm build` → success.
- [ ] **Step 5: Commit.**
```bash
git add frontend/components/app/event-card.tsx frontend/app/app/catalog/page.tsx frontend/__tests__/event-card.test.tsx
git commit -m "feat(f5): catalog page + event card"
```

---

### Task B5: Register form + event detail + receipt

**Files:**
- Create: `frontend/components/app/register-form.tsx`, `frontend/components/app/registration-receipt.tsx`, `frontend/app/app/events/[id]/page.tsx`
- Test: `frontend/__tests__/register-form.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `frontend/__tests__/register-form.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RegisterForm } from "@/components/app/register-form";

const fields = [
  { id: 1, label: "Note", field_type: "text", required: false, placeholder: null, options: [] },
  { id: 2, label: "Privacy", field_type: "privacy_consent", required: true, placeholder: null, options: [] },
];

describe("RegisterForm", () => {
  it("blocks submit until required consent is checked", () => {
    const onSubmit = vi.fn();
    render(<RegisterForm eventId={1} fields={fields} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText("Iscriviti"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/consenso/i)).toBeInTheDocument();
  });

  it("submits answers when consent given", () => {
    const onSubmit = vi.fn();
    render(<RegisterForm eventId={1} fields={fields} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByLabelText("Privacy"));
    fireEvent.click(screen.getByText("Iscriviti"));
    expect(onSubmit).toHaveBeenCalledWith([
      { field_id: 1, value: "" },
      { field_id: 2, value: "true" },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `cd frontend && pnpm test register-form` → cannot find module.

- [ ] **Step 3: Implement.** `frontend/components/app/register-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { CustomField } from "@/lib/catalog-api";

type Answer = { field_id: number; value: string };

export function RegisterForm({
  eventId, fields, onSubmit,
}: { eventId: number; fields: CustomField[]; onSubmit: (answers: Answer[]) => void }) {
  const [values, setValues] = useState<Record<number, string>>({});
  const [error, setError] = useState("");

  function set(id: number, v: string) { setValues((s) => ({ ...s, [id]: v })); }

  function submit() {
    for (const f of fields) {
      const v = values[f.id] ?? "";
      if (f.field_type === "privacy_consent" && f.required && v !== "true") {
        setError("Devi accettare il consenso per procedere.");
        return;
      }
      if (f.required && f.field_type !== "privacy_consent" && !v.trim()) {
        setError(`Campo obbligatorio: ${f.label}`);
        return;
      }
    }
    setError("");
    onSubmit(fields.map((f) => ({ field_id: f.id, value: values[f.id] ?? "" })));
  }

  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.id}>
          {f.field_type === "privacy_consent" ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" aria-label={f.label}
                     checked={values[f.id] === "true"}
                     onChange={(e) => set(f.id, e.target.checked ? "true" : "false")} />
              {f.label}{f.required && " *"}
            </label>
          ) : ["select", "radio"].includes(f.field_type) ? (
            <label className="block text-sm">{f.label}{f.required && " *"}
              <select className="mt-1 w-full rounded border p-2" value={values[f.id] ?? ""}
                      onChange={(e) => set(f.id, e.target.value)}>
                <option value="">—</option>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          ) : f.field_type === "textarea" ? (
            <label className="block text-sm">{f.label}{f.required && " *"}
              <textarea className="mt-1 w-full rounded border p-2" value={values[f.id] ?? ""}
                        onChange={(e) => set(f.id, e.target.value)} />
            </label>
          ) : (
            <label className="block text-sm">{f.label}{f.required && " *"}
              <input
                className="mt-1 w-full rounded border p-2"
                type={["number", "email", "date", "time"].includes(f.field_type) ? f.field_type
                  : f.field_type === "datetime" ? "datetime-local" : f.field_type === "phone" ? "tel"
                  : f.field_type === "file" ? "file" : "text"}
                placeholder={f.placeholder ?? ""}
                value={f.field_type === "file" ? undefined : (values[f.id] ?? "")}
                onChange={(e) => set(f.id, e.target.value)} />
            </label>
          )}
        </div>
      ))}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={submit}>Iscriviti</button>
    </div>
  );
}
```

`frontend/components/app/registration-receipt.tsx`:

```tsx
export function RegistrationReceipt({ registrationId, status }: { registrationId: number; status: string }) {
  return (
    <div className="rounded border bg-white p-4 text-center">
      <p className="mb-2 text-sm">Stato iscrizione: <span className="font-medium">{status}</span></p>
      {status === "confirmed" && (
        <>
          <p className="mb-2 text-xs text-gray-500">Mostra questo QR all'ingresso</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mx-auto" alt="QR check-in" width={180} height={180}
               src={`/api/registrations/${registrationId}/qr`} />
        </>
      )}
    </div>
  );
}
```

`frontend/app/app/events/[id]/page.tsx`:

```tsx
"use client";

import { use, useEffect, useState } from "react";
import { RegisterForm } from "@/components/app/register-form";
import { RegistrationReceipt } from "@/components/app/registration-receipt";
import { api } from "@/lib/admin-api";
import { catalogApi, type CatalogEventDetail } from "@/lib/catalog-api";

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const eventId = Number(id);
  const [ev, setEv] = useState<CatalogEventDetail | null>(null);
  const [result, setResult] = useState<{ id: number; status: string } | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setEv(await catalogApi.detail(eventId));
  }
  useEffect(() => { load().catch((e) => setError((e as Error).message)); }, [eventId]);

  async function register(answers: { field_id: number; value: string }[]) {
    try {
      const reg = await api.post<{ id: number; status: string }>(`/events/${eventId}/registrations`, { answers });
      setResult({ id: reg.id, status: reg.status });
    } catch (e) { setError((e as Error).message); }
  }

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!ev) return <p>Caricamento…</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">{ev.title}</h1>
      <div className="text-sm text-gray-600">
        {new Date(ev.start_at).toLocaleString("it-IT")} — {new Date(ev.end_at).toLocaleString("it-IT")}
      </div>
      {ev.description && <div className="prose text-sm" dangerouslySetInnerHTML={{ __html: ev.description }} />}
      <div className="text-sm">
        {ev.mode === "online" ? `Online${ev.online_url ? `: ${ev.online_url}` : ""}` : `${ev.location_name ?? ""} ${ev.address ?? ""}`}
      </div>
      <div className="text-sm text-gray-600">
        {ev.available_spots === null ? "Posti illimitati" : `${ev.available_spots} posti disponibili`}
        {ev.waitlist_enabled && ev.available_spots === 0 && " (lista d'attesa attiva)"}
      </div>

      {result ? (
        <RegistrationReceipt registrationId={result.id} status={result.status} />
      ) : ev.my_status ? (
        <p className="rounded bg-blue-50 p-3 text-sm text-blue-800">Sei già iscritto (stato: {ev.my_status}).</p>
      ) : ev.registration_open ? (
        <div className="rounded border bg-white p-4">
          <h2 className="mb-3 font-medium">Iscriviti</h2>
          <RegisterForm eventId={eventId} fields={ev.custom_fields} onSubmit={register} />
        </div>
      ) : (
        <p className="rounded bg-gray-100 p-3 text-sm text-gray-600">Iscrizioni non aperte.</p>
      )}
    </div>
  );
}
```

> The `description` is server-sanitized HTML (F3 `nh3`), so `dangerouslySetInnerHTML` is safe here.

- [ ] **Step 4: Run to verify it passes.** `cd frontend && pnpm test register-form` → 2 passed. Then `pnpm build` → success.
- [ ] **Step 5: Commit.**
```bash
git add frontend/components/app/register-form.tsx frontend/components/app/registration-receipt.tsx "frontend/app/app/events/[id]/page.tsx" frontend/__tests__/register-form.test.tsx
git commit -m "feat(f5): event detail + dynamic register form + receipt"
```

---

### Task B6: My registrations / history

**Files:**
- Create: `frontend/app/app/registrations/page.tsx`

- [ ] **Step 1: Implement.** `frontend/app/app/registrations/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RegistrationReceipt } from "@/components/app/registration-receipt";
import { api } from "@/lib/admin-api";
import { catalogApi, type MyEvent } from "@/lib/catalog-api";

export default function MyRegistrationsPage() {
  const [items, setItems] = useState<MyEvent[]>([]);
  const [error, setError] = useState("");

  async function load() { setItems(await catalogApi.myEvents()); }
  useEffect(() => { load().catch((e) => setError((e as Error).message)); }, []);

  async function cancel(id: number) {
    if (!window.confirm("Annullare l'iscrizione?")) return;
    try { await api.post(`/registrations/${id}/cancel`); await load(); }
    catch (e) { setError((e as Error).message); }
  }

  const now = new Date();
  const future = items.filter((m) => new Date(m.event_start_at) >= now && m.status !== "cancelled");
  const past = items.filter((m) => new Date(m.event_start_at) < now && m.status !== "cancelled");
  const cancelled = items.filter((m) => m.status === "cancelled");

  function section(title: string, list: MyEvent[], opts: { qr?: boolean; cancel?: boolean }) {
    return (
      <section>
        <h2 className="mb-2 font-medium">{title}</h2>
        {list.length === 0 ? <p className="text-sm text-gray-500">Nessuna.</p> : (
          <ul className="space-y-2">
            {list.map((m) => (
              <li key={m.registration_id} className="rounded border bg-white p-3 text-sm">
                <div className="flex items-center justify-between">
                  <Link className="text-blue-700" href={`/app/events/${m.event_id}`}>{m.event_title}</Link>
                  <span className="text-xs">{new Date(m.event_start_at).toLocaleString("it-IT")} — {m.status}</span>
                </div>
                {opts.qr && m.status === "confirmed" && (
                  <div className="mt-2"><RegistrationReceipt registrationId={m.registration_id} status={m.status} /></div>
                )}
                {opts.cancel && ["confirmed", "waitlisted"].includes(m.status) && (
                  <button className="mt-2 text-xs text-red-700" onClick={() => cancel(m.registration_id)}>Annulla iscrizione</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Le mie iscrizioni</h1>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {section("Futuri", future, { qr: true, cancel: true })}
      {section("Passati", past, {})}
      {section("Annullati", cancelled, {})}
    </div>
  );
}
```

- [ ] **Step 2: Verify build.** `cd frontend && pnpm build` → success.
- [ ] **Step 3: Commit.**
```bash
git add frontend/app/app/registrations/page.tsx
git commit -m "feat(f5): my registrations / history page"
```

---

### Task B7: Profile + change password

**Files:**
- Create: `frontend/app/app/profile/page.tsx`

- [ ] **Step 1: Implement.** `frontend/app/app/profile/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/admin-api";
import { changePasswordSchema } from "@/lib/catalog-schemas";

type Me = { username: string; email: string; full_name?: string };

export default function ProfilePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [form, setForm] = useState({ old_password: "", new_password: "" });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { api.get<Me>("/auth/me").then(setMe).catch(() => {}); }, []);

  async function changePassword() {
    setMsg(""); setErr("");
    const parsed = changePasswordSchema.safeParse(form);
    if (!parsed.success) { setErr("La nuova password deve avere almeno 8 caratteri."); return; }
    try {
      await api.post("/auth/change-password", form);
      setMsg("Password aggiornata.");
      setForm({ old_password: "", new_password: "" });
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-xl font-semibold">Profilo</h1>
      <section className="rounded border bg-white p-4 text-sm">
        <p><span className="text-gray-500">Nome:</span> {me?.full_name ?? "—"}</p>
        <p><span className="text-gray-500">Username:</span> {me?.username ?? "—"}</p>
        <p><span className="text-gray-500">Email:</span> {me?.email ?? "—"}</p>
      </section>
      <section className="rounded border bg-white p-4 space-y-2">
        <h2 className="font-medium">Cambia password</h2>
        <input className="w-full rounded border p-2" type="password" placeholder="Vecchia password"
               value={form.old_password} onChange={(e) => setForm({ ...form, old_password: e.target.value })} />
        <input className="w-full rounded border p-2" type="password" placeholder="Nuova password (min 8)"
               value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} />
        {err && <p className="text-sm text-red-700">{err}</p>}
        {msg && <p className="text-sm text-green-700">{msg}</p>}
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={changePassword}>Aggiorna password</button>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify build.** `cd frontend && pnpm build` → success.
- [ ] **Step 3: Commit.**
```bash
git add frontend/app/app/profile/page.tsx
git commit -m "feat(f5): profile + change password page"
```

---

### Task B8: Calendar views

**Files:**
- Create: `frontend/components/app/calendar/calendar-view.tsx`, `month-grid.tsx`, `week-grid.tsx`, `day-list.tsx`, `agenda-list.tsx`, `frontend/app/app/calendar/page.tsx`

- [ ] **Step 1: Sub-views.**

`frontend/components/app/calendar/agenda-list.tsx`:

```tsx
import Link from "next/link";
import type { CatalogEvent } from "@/lib/catalog-api";
import { groupByDay } from "@/lib/calendar-utils";

export function AgendaList({ events }: { events: CatalogEvent[] }) {
  const groups = [...groupByDay(events).entries()].sort();
  if (groups.length === 0) return <p className="text-sm text-gray-500">Nessun evento nel periodo.</p>;
  return (
    <div className="space-y-3">
      {groups.map(([day, evs]) => (
        <div key={day}>
          <div className="text-sm font-medium">{new Date(day).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</div>
          <ul className="ml-2 text-sm">
            {evs.map((e) => (
              <li key={e.id}><Link className="text-blue-700" href={`/app/events/${e.id}`}>
                {new Date(e.start_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} — {e.title}
              </Link></li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

`frontend/components/app/calendar/day-list.tsx`:

```tsx
import Link from "next/link";
import type { CatalogEvent } from "@/lib/catalog-api";
import { isoDay } from "@/lib/calendar-utils";

export function DayList({ events, date }: { events: CatalogEvent[]; date: Date }) {
  const key = isoDay(date);
  const evs = events.filter((e) => isoDay(e.start_at) === key)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  return (
    <div>
      <div className="mb-2 text-sm font-medium">{date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</div>
      {evs.length === 0 ? <p className="text-sm text-gray-500">Nessun evento.</p> : (
        <ul className="space-y-1 text-sm">
          {evs.map((e) => (
            <li key={e.id} className="rounded border bg-white p-2">
              <Link className="text-blue-700" href={`/app/events/${e.id}`}>
                {new Date(e.start_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} — {e.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

`frontend/components/app/calendar/week-grid.tsx`:

```tsx
import Link from "next/link";
import type { CatalogEvent } from "@/lib/catalog-api";
import { eachDay, isoDay, weekRange } from "@/lib/calendar-utils";

export function WeekGrid({ events, date }: { events: CatalogEvent[]; date: Date }) {
  const { from, to } = weekRange(date);
  const days = eachDay(from, to);
  return (
    <div className="grid grid-cols-7 gap-1 text-xs">
      {days.map((d) => {
        const key = isoDay(d);
        const evs = events.filter((e) => isoDay(e.start_at) === key);
        return (
          <div key={key} className="min-h-24 rounded border bg-white p-1">
            <div className="mb-1 font-medium">{d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric" })}</div>
            {evs.map((e) => (
              <Link key={e.id} href={`/app/events/${e.id}`} className="mb-0.5 block truncate rounded px-1"
                    style={{ background: e.category_color ?? "#e5e7eb" }}>{e.title}</Link>
            ))}
          </div>
        );
      })}
    </div>
  );
}
```

`frontend/components/app/calendar/month-grid.tsx`:

```tsx
import Link from "next/link";
import type { CatalogEvent } from "@/lib/catalog-api";
import { eachDay, isoDay, monthRange } from "@/lib/calendar-utils";

export function MonthGrid({ events, date }: { events: CatalogEvent[]; date: Date }) {
  const { from, to } = monthRange(date);
  const days = eachDay(from, to);
  const month = date.getMonth();
  return (
    <div className="grid grid-cols-7 gap-1 text-xs">
      {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => (
        <div key={d} className="p-1 text-center font-medium text-gray-500">{d}</div>
      ))}
      {days.map((d) => {
        const key = isoDay(d);
        const evs = events.filter((e) => isoDay(e.start_at) === key);
        return (
          <div key={key} className={`min-h-20 rounded border p-1 ${d.getMonth() === month ? "bg-white" : "bg-gray-50"}`}>
            <div className="text-right text-gray-400">{d.getDate()}</div>
            {evs.slice(0, 3).map((e) => (
              <Link key={e.id} href={`/app/events/${e.id}`} className="mb-0.5 block truncate rounded px-1"
                    style={{ background: e.category_color ?? "#e5e7eb" }}>{e.title}</Link>
            ))}
            {evs.length > 3 && <div className="text-gray-400">+{evs.length - 3}</div>}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Orchestrator.** `frontend/components/app/calendar/calendar-view.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { catalogApi, type CatalogEvent } from "@/lib/catalog-api";
import { dayRange, monthRange, weekRange } from "@/lib/calendar-utils";
import { AgendaList } from "./agenda-list";
import { DayList } from "./day-list";
import { MonthGrid } from "./month-grid";
import { WeekGrid } from "./week-grid";

type View = "month" | "week" | "day" | "list";
const VIEWS: [View, string][] = [["month", "Mese"], ["week", "Settimana"], ["day", "Giorno"], ["list", "Lista"]];

export function CalendarView() {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState<CatalogEvent[]>([]);

  const range = view === "month" ? monthRange(cursor) : view === "week" ? weekRange(cursor)
    : view === "day" ? dayRange(cursor) : monthRange(cursor);

  useEffect(() => {
    const qs = `?from=${range.from.toISOString()}&to=${range.to.toISOString()}&page_size=500`;
    catalogApi.list(qs).then((r) => setEvents(r.items)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cursor]);

  function shift(dir: -1 | 1) {
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + dir);
    setCursor(d);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {VIEWS.map(([v, label]) => (
            <button key={v} className={`rounded px-3 py-1 text-sm ${view === v ? "bg-blue-600 text-white" : "border"}`}
                    onClick={() => setView(v)}>{label}</button>
          ))}
        </div>
        <div className="ml-auto flex gap-1">
          <button className="rounded border px-2 py-1 text-sm" onClick={() => shift(-1)}>‹</button>
          <button className="rounded border px-2 py-1 text-sm" onClick={() => setCursor(new Date())}>Oggi</button>
          <button className="rounded border px-2 py-1 text-sm" onClick={() => shift(1)}>›</button>
        </div>
      </div>
      {view === "month" && <MonthGrid events={events} date={cursor} />}
      {view === "week" && <WeekGrid events={events} date={cursor} />}
      {view === "day" && <DayList events={events} date={cursor} />}
      {view === "list" && <AgendaList events={events} />}
    </div>
  );
}
```

`frontend/app/app/calendar/page.tsx`:

```tsx
import { CalendarView } from "@/components/app/calendar/calendar-view";

export default function CalendarPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Calendario</h1>
      <CalendarView />
    </div>
  );
}
```

- [ ] **Step 3: Verify build + tests.** `cd frontend && pnpm build` → success. `pnpm test` → all green.
- [ ] **Step 4: Commit.**
```bash
git add frontend/components/app/calendar/ "frontend/app/app/calendar/page.tsx"
git commit -m "feat(f5): calendar views (month/week/day/list)"
```

---

### Task B9: End-to-end verification + docs

**Files:** Modify `INSTALL.md`

- [ ] **Step 1: Backend e2e via curl** on a fresh DB: migrate to head, create a super_admin (CLI), create an `employee` user (CLI creates super_admin only — instead create the employee via a short python snippet using `user_service.create_user` + assign role `employee`, OR register through the admin). Steps to verify: login as the employee → `/api/auth/me` returns empty `permissions`; create+publish an event as admin; `GET /api/catalog/events` as employee shows it; `POST /api/events/{id}/registrations` (self) → confirmed; `GET /api/catalog/my-events` shows it; `POST /api/auth/change-password` works and re-login with the new password succeeds. Capture HTTP codes; drop the throwaway DB.

> To create the employee in the e2e: run a one-off python with the app session, e.g.
> `DATABASE_URL=... .venv/bin/python -c "from app.db.session import SessionLocal; from app.services import user_service; db=SessionLocal(); u=user_service.create_user(db, email='emp@x.it', username='emp', password='emppass123'); user_service.assign_role(db, u, 'employee'); db.commit()"`

- [ ] **Step 2: Document in INSTALL.md.** Append:

```markdown
## Area dipendente (F5)
- I dipendenti (ruolo `employee`, senza permessi admin) accedono da `/login` e atterrano su `/app`.
- `/app`: dashboard, **Catalogo** (eventi pubblicati a visibilità "tutti"), **Calendario** (mese/settimana/giorno/lista), scheda evento con **iscrizione** (campi custom + consensi) e **ricevuta/QR**, **Le mie iscrizioni** (futuri/passati/annullati, annulla), **Profilo** (cambio password).
- Gli eventi a visibilità ristretta restano nascosti finché l'integrazione AD (F8) non fornisce i reparti/gruppi. Le email di conferma arrivano in F6.
```

- [ ] **Step 3: Commit.**
```bash
git add INSTALL.md
git commit -m "docs(f5): employee area instructions"
```

---

## Self-Review Notes

- **Spec coverage:** §2/§3.1 employee role → A1; §3.2 catalog service+API (visible list, available_spots, my_status, registration_open, detail w/ custom fields, my-events) → A2/A3; §3.3 change-password → A4; §4 routing/middleware/shell → B2/B3; catalog page → B4; event detail + register form + receipt → B5; my registrations → B6; profile → B7; §5 calendar (4 views + utils) → B1/B8; §7 tests per task; §8 out-of-scope respected (no email, restricted hidden, file upload stubbed).
- **Visibility:** "all" = not present in `event_visibility` with `mode='restricted'` (`Event.id.notin_(restricted_event_ids)`). An event with no visibility rows is treated as all (matches F3 default). Verified by `test_list_hides_draft_and_restricted`.
- **Type/name consistency:** `catalog_service` fns (`list_visible_events`, `available_spots`, `my_status`, `registration_open`, `get_visible_event`, `category_of`, `my_events`) match router usage; `CatalogEvent`/`CatalogEventDetail`/`MyEvent` TS types mirror the Pydantic schemas; `catalogApi`/`api` methods consistent across pages; calendar-utils (`monthRange`/`weekRange`/`dayRange`/`groupByDay`/`isoDay`/`eachDay`) used consistently.
- **Routing:** `resolveLanding` keys off `/auth/me` `permissions.length`; employees (employee role, zero perms) → `/app`, staff (any perm) → `/admin/events`. Middleware gates both trees by cookie; backend RBAC remains the real guard.
- **Reuse:** registration + cancel + QR via F4 endpoints (no duplication); `custom_field_service` (F3) feeds the dynamic form.
- **Commit-isolation note:** backend API tests set the cookie + per-test rolled-back session (endpoints commit), same proven pattern. Frontend tests mock `fetch`.
- **Known nit:** the calendar fetch uses `page_size=500` to approximate "all events in range" — acceptable for the expected event volume; true range-pagination is a future refinement.
