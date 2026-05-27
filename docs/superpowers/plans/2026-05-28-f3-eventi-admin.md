# F3 Eventi (admin) + Auth Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authenticated admin area (login, httpOnly-cookie session, protected layout) and complete admin-side event management (categories, events with full field set + state machine, custom-field form builder, volume-stored attachments, visibility rules).

**Architecture:** Part A adds a thin auth shell over F1 auth: the backend accepts the access token from a cookie as well as the `Bearer` header; Next route handlers proxy login/refresh/logout and set httpOnly cookies; a Next middleware gates `/admin/*`. Part B adds an isolated events domain (`routers → services → models`, 6 new tables, migration `0004`). Part C adds the admin UI (list, forms, form builder, attachments, visibility).

**Tech Stack:** Backend — FastAPI, SQLAlchemy 2.0, Alembic, PyMySQL, argon2/JWT (F1), `nh3` (HTML sanitize, new), `python-multipart` (uploads, new), pytest. Frontend — Next.js 15 App Router, React 19, Tailwind v3, TanStack Query, Zod, Vitest + RTL.

## Run commands (environment)

- Python venv has no pip; use `backend/.venv/bin/python`. Install with `cd backend && uv pip install <pkg>`.
- Backend tests need both DB env vars:
  `cd backend && TEST_DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" DATABASE_URL="mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test" .venv/bin/python -m pytest <args>`
- Frontend: `cd frontend && pnpm test <pattern>` / `pnpm build`.
- Branch: create `f3-eventi-admin` from `main` before Task A1 (the executor handles this).

---

## File Structure

**Backend**
- `app/api/deps.py` — MODIFY: `get_current_user` reads token from Bearer or `access_token` cookie
- `app/core/config.py` — MODIFY: `upload_dir`, `max_upload_bytes`
- `app/models/{event_category,event,event_custom_field,event_custom_field_option,attachment,event_visibility}.py` — new models
- `app/models/__init__.py` — MODIFY: register new models
- `alembic/versions/0005_events.py` — tables + event permission seed
- `app/services/{html_sanitize,category_service,event_service,custom_field_service,attachment_service,visibility_service}.py`
- `app/schemas/{category,event,custom_field,attachment,visibility}.py`
- `app/api/routers/{categories,events,attachments}.py`
- `app/main.py` — MODIFY: include new routers
- `pyproject.toml` — MODIFY: `nh3`, `python-multipart`

**Frontend**
- `middleware.ts`, `app/api/session/{login,refresh,logout}/route.ts`
- `app/login/page.tsx`, `app/admin/{layout,page}.tsx`, `app/admin/events/{page,new/page,[id]/page}.tsx`, `app/admin/categories/page.tsx`
- `components/admin/{sidebar,topbar,status-badge,event-table,event-form,field-builder,attachment-manager,visibility-editor}.tsx`
- `lib/admin-api.ts`, `lib/event-schemas.ts`
- `__tests__/{event-schemas,field-builder,event-table}.test.tsx`

> Migration revision id: the latest existing head is `0003_settings`. New migration uses `down_revision = "0003_settings"`. Verify with `grep -r "revision =" backend/alembic/versions/0003_settings.py` before writing; use the actual id.

---

# PART A — Auth Shell

### Task A1: Backend accepts access token from cookie

**Files:**
- Modify: `backend/app/api/deps.py`
- Test: `backend/tests/test_cookie_auth.py`

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_cookie_auth.py`:

```python
from app.services import user_service


def _seed_admin(db):
    u = user_service.create_user(db, email="a@x.it", username="admin", password="pw12345")
    user_service.assign_role(db, u, "super_admin")
    db.flush()
    return u


def test_me_via_cookie(client, db):
    _seed_admin(db)
    pair = client.post(
        "/api/auth/login", json={"identifier": "admin", "password": "pw12345"}
    ).json()
    # no Authorization header; access token in cookie instead
    client.cookies.set("access_token", pair["access_token"])
    r = client.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["username"] == "admin"


def test_me_no_token_401(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401
```

- [ ] **Step 2: Run to verify it fails.**
`... -m pytest tests/test_cookie_auth.py -v` → `test_me_via_cookie` fails (401, Bearer required).

- [ ] **Step 3: Implement cookie fallback.** In `backend/app/api/deps.py`, replace the bearer setup and `get_current_user` with:

```python
from fastapi import Cookie

_bearer = HTTPBearer(auto_error=False)


def _extract_token(
    creds: HTTPAuthorizationCredentials | None,
    access_cookie: str | None,
) -> str | None:
    if creds is not None:
        return creds.credentials
    return access_cookie


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    access_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    token = _extract_token(creds, access_token)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token mancante")
    try:
        payload = decode_token(token)
    except TokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token non valido")
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token non valido")
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utente non valido")
    return user
```

Keep the existing `import`s; add `from fastapi import Cookie` (or extend the existing `from fastapi import ...` line). Leave `require_permission`, `require_setup_open`, `require_setup_token` unchanged.

- [ ] **Step 4: Run to verify it passes.** `... -m pytest tests/test_cookie_auth.py -v` → 2 passed.
- [ ] **Step 5: Run full suite.** `... -m pytest -q` → all green (the existing auth tests still pass with `auto_error=False` because `test_me_requires_auth` accepts 401/403).
- [ ] **Step 6: Commit.**
```bash
git add backend/app/api/deps.py backend/tests/test_cookie_auth.py
git commit -m "feat(f3): accept access token from cookie in get_current_user"
```

---

### Task A2: Next session route handlers (cookie proxy)

**Files:**
- Create: `frontend/app/api/session/login/route.ts`, `frontend/app/api/session/refresh/route.ts`, `frontend/app/api/session/logout/route.ts`
- Create: `frontend/lib/backend.ts` (server-side base URL helper)

- [ ] **Step 1: Backend base helper.** `frontend/lib/backend.ts`:

```ts
// Server-side only: base URL the Next server uses to reach the backend.
// In Docker this is the backend service; locally default to the dev backend.
export const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8000";

export const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
```

- [ ] **Step 2: Login route.** `frontend/app/api/session/login/route.ts`:

```ts
import { NextResponse } from "next/server";
import { BACKEND_URL, COOKIE_OPTS } from "@/lib/backend";

export async function POST(req: Request) {
  const body = await req.json();
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return NextResponse.json({ detail: "Credenziali non valide" }, { status: res.status });
  }
  const { access_token, refresh_token } = await res.json();
  const out = NextResponse.json({ ok: true });
  out.cookies.set("access_token", access_token, COOKIE_OPTS);
  out.cookies.set("refresh_token", refresh_token, COOKIE_OPTS);
  return out;
}
```

- [ ] **Step 3: Refresh route.** `frontend/app/api/session/refresh/route.ts`:

```ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BACKEND_URL, COOKIE_OPTS } from "@/lib/backend";

export async function POST() {
  const jar = await cookies();
  const refresh = jar.get("refresh_token")?.value;
  if (!refresh) return NextResponse.json({ detail: "No session" }, { status: 401 });
  const res = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) return NextResponse.json({ detail: "Refresh fallito" }, { status: 401 });
  const { access_token, refresh_token } = await res.json();
  const out = NextResponse.json({ ok: true });
  out.cookies.set("access_token", access_token, COOKIE_OPTS);
  out.cookies.set("refresh_token", refresh_token, COOKIE_OPTS);
  return out;
}
```

- [ ] **Step 4: Logout route.** `frontend/app/api/session/logout/route.ts`:

```ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend";

export async function POST() {
  const jar = await cookies();
  const refresh = jar.get("refresh_token")?.value;
  if (refresh) {
    await fetch(`${BACKEND_URL}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    }).catch(() => {});
  }
  const out = NextResponse.json({ ok: true });
  out.cookies.delete("access_token");
  out.cookies.delete("refresh_token");
  return out;
}
```

- [ ] **Step 5: Verify build.** `cd frontend && pnpm build` → success.
- [ ] **Step 6: Commit.**
```bash
git add frontend/lib/backend.ts frontend/app/api/session/
git commit -m "feat(f3): Next session route handlers with httpOnly cookies"
```

---

### Task A3: Middleware protecting /admin

**Files:**
- Create: `frontend/middleware.ts`

- [ ] **Step 1: Implement middleware.** `frontend/middleware.ts`:

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("access_token");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

- [ ] **Step 2: Verify build.** `cd frontend && pnpm build` → success.
- [ ] **Step 3: Commit.**
```bash
git add frontend/middleware.ts
git commit -m "feat(f3): middleware gates /admin behind session cookie"
```

---

### Task A4: admin-api client + login page + admin shell

**Files:**
- Create: `frontend/lib/admin-api.ts`, `frontend/app/login/page.tsx`, `frontend/app/admin/layout.tsx`, `frontend/app/admin/page.tsx`, `frontend/components/admin/sidebar.tsx`, `frontend/components/admin/topbar.tsx`

- [ ] **Step 1: API client.** `frontend/lib/admin-api.ts`:

```ts
// Client-side calls to the backend; cookies travel automatically (same origin
// behind nginx). On 401, try one refresh then retry; otherwise redirect to login.
async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 401 && retry) {
    const r = await fetch("/api/session/refresh", { method: "POST" });
    if (r.ok) return request<T>(path, init, false);
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Sessione scaduta");
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(p: string, body: unknown) =>
    request<T>(p, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(p: string, body: unknown) =>
    request<T>(p, { method: "PUT", body: JSON.stringify(body) }),
  del: <T>(p: string) => request<T>(p, { method: "DELETE" }),
};

export async function login(identifier: string, password: string) {
  const res = await fetch("/api/session/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) throw new Error("Credenziali non valide");
}

export async function logout() {
  await fetch("/api/session/logout", { method: "POST" });
}
```

- [ ] **Step 2: Login page.** `frontend/app/login/page.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "@/lib/admin-api";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(form.identifier, form.password);
      router.push("/admin/events");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-24 max-w-sm rounded-lg border bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-xl font-semibold">Accedi</h1>
      <form onSubmit={submit} className="space-y-3">
        <input
          className="w-full rounded border p-2"
          placeholder="Email o username"
          value={form.identifier}
          onChange={(e) => setForm({ ...form, identifier: e.target.value })}
        />
        <input
          className="w-full rounded border p-2"
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={busy}
        >
          {busy ? "Accesso…" : "Accedi"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Sidebar + topbar.** `frontend/components/admin/sidebar.tsx`:

```tsx
import Link from "next/link";

export function Sidebar() {
  return (
    <nav className="w-56 shrink-0 border-r bg-gray-50 p-4">
      <div className="mb-6 text-lg font-semibold text-blue-700">Eurospital Eventi</div>
      <ul className="space-y-1 text-sm">
        <li><Link className="block rounded px-3 py-2 hover:bg-blue-100" href="/admin/events">Eventi</Link></li>
        <li><Link className="block rounded px-3 py-2 hover:bg-blue-100" href="/admin/categories">Categorie</Link></li>
      </ul>
    </nav>
  );
}
```

`frontend/components/admin/topbar.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, logout } from "@/lib/admin-api";

export function Topbar() {
  const router = useRouter();
  const [name, setName] = useState("");

  useEffect(() => {
    api.get<{ username: string }>("/auth/me").then((u) => setName(u.username)).catch(() => {});
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

- [ ] **Step 4: Admin layout + index redirect.** `frontend/app/admin/layout.tsx`:

```tsx
import { Sidebar } from "@/components/admin/sidebar";
import { Topbar } from "@/components/admin/topbar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar />
        <main className="flex-1 bg-gray-50 p-6">{children}</main>
      </div>
    </div>
  );
}
```

`frontend/app/admin/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function AdminIndex() {
  redirect("/admin/events");
}
```

- [ ] **Step 5: Verify build.** `cd frontend && pnpm build` → success (`/login`, `/admin` routes compile).
- [ ] **Step 6: Commit.**
```bash
git add frontend/lib/admin-api.ts frontend/app/login frontend/app/admin/layout.tsx frontend/app/admin/page.tsx frontend/components/admin/
git commit -m "feat(f3): admin api client, login page, protected admin shell"
```

---

# PART B — Events backend

### Task B1: Config + dependencies (nh3, python-multipart)

**Files:**
- Modify: `backend/app/core/config.py`, `backend/pyproject.toml`
- Test: `backend/tests/test_config.py`

- [ ] **Step 1: Write the failing test.** Add to `backend/tests/test_config.py`:

```python
def test_upload_settings_defaults():
    from app.core.config import Settings

    s = Settings()
    assert s.upload_dir
    assert s.max_upload_bytes > 0
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_config.py::test_upload_settings_defaults -v` → AttributeError.
- [ ] **Step 3: Add settings.** In `backend/app/core/config.py`, inside `Settings` after `setup_token`:

```python
    upload_dir: str = "/data/uploads"
    max_upload_bytes: int = 10 * 1024 * 1024
```

- [ ] **Step 4: Install deps.** `cd backend && uv pip install nh3 python-multipart`. Add to `pyproject.toml` `dependencies`: `"nh3>=0.2"` and `"python-multipart>=0.0.9"`.
- [ ] **Step 5: Verify.** `... -m pytest tests/test_config.py -v` → PASS; `.venv/bin/python -c "import nh3, multipart; print('ok')"` → ok.
- [ ] **Step 6: Commit.**
```bash
git add backend/app/core/config.py backend/pyproject.toml
git commit -m "feat(f3): upload settings + nh3/python-multipart deps"
```

---

### Task B2: Event domain models

**Files:**
- Create: `backend/app/models/event_category.py`, `event.py`, `event_custom_field.py`, `event_custom_field_option.py`, `attachment.py`, `event_visibility.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/test_event_models.py`

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_event_models.py`:

```python
def test_event_models_importable():
    from app.models import (
        Attachment, Event, EventCategory, EventCustomField,
        EventCustomFieldOption, EventVisibility,
    )

    assert Event.__tablename__ == "events"
    assert EventCategory.__tablename__ == "event_categories"
    assert EventCustomField.__tablename__ == "event_custom_fields"
    assert EventCustomFieldOption.__tablename__ == "event_custom_field_options"
    assert Attachment.__tablename__ == "attachments"
    assert EventVisibility.__tablename__ == "event_visibility"
    assert hasattr(Event, "status")
    assert hasattr(Event, "capacity")
    assert hasattr(Attachment, "stored_path")
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_event_models.py -v` → ImportError.
- [ ] **Step 3: Create the models.**

`backend/app/models/event_category.py`:

```python
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EventCategory(Base):
    __tablename__ = "event_categories"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    color: Mapped[str] = mapped_column(String(16), nullable=False, default="#0a66c2")
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
```

`backend/app/models/event.py`:

```python
from datetime import datetime

from sqlalchemy import (
    JSON, BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str | None] = mapped_column(String(255), nullable=True)
    short_description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    banner_attachment_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("attachments.id", ondelete="SET NULL", use_alter=True,
                               name="fk_events_banner"), nullable=True,
    )
    category_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("event_categories.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft", index=True)
    mode: Mapped[str] = mapped_column(String(16), nullable=False, default="physical")
    location_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    online_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    registration_open_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    registration_close_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    waitlist_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    max_per_user: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    cancellation_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    cancellation_deadline_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reminder_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    internal_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
```

`backend/app/models/event_custom_field.py`:

```python
from sqlalchemy import JSON, BigInteger, Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EventCustomField(Base):
    __tablename__ = "event_custom_fields"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    field_type: Mapped[str] = mapped_column(String(32), nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    placeholder: Mapped[str | None] = mapped_column(String(255), nullable=True)
    default_value: Mapped[str | None] = mapped_column(String(512), nullable=True)
    validation: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
```

`backend/app/models/event_custom_field_option.py`:

```python
from sqlalchemy import BigInteger, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EventCustomFieldOption(Base):
    __tablename__ = "event_custom_field_options"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    field_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("event_custom_fields.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
```

`backend/app/models/attachment.py`:

```python
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("events.id", ondelete="CASCADE"), nullable=True, index=True,
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(512), nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="attachment")
    uploaded_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
```

`backend/app/models/event_visibility.py`:

```python
from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EventVisibility(Base):
    __tablename__ = "event_visibility"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    mode: Mapped[str] = mapped_column(String(16), nullable=False, default="all")
    dept_or_group: Mapped[str | None] = mapped_column(String(255), nullable=True)
```

Add the six classes to `backend/app/models/__init__.py` imports and `__all__` (keep existing entries):

```python
from app.models.attachment import Attachment
from app.models.event import Event
from app.models.event_category import EventCategory
from app.models.event_custom_field import EventCustomField
from app.models.event_custom_field_option import EventCustomFieldOption
from app.models.event_visibility import EventVisibility
```

Append to `__all__`: `"Event", "EventCategory", "EventCustomField", "EventCustomFieldOption", "Attachment", "EventVisibility"`.

- [ ] **Step 4: Run to verify it passes.** `... -m pytest tests/test_event_models.py -v` → PASS.
- [ ] **Step 5: Commit.**
```bash
git add backend/app/models/
git commit -m "feat(f3): event domain ORM models"
```

---

### Task B3: Migration 0005 (tables + permission seed)

**Files:**
- Create: `backend/alembic/versions/0005_events.py`
- Modify: `backend/tests/test_migration.py`

- [ ] **Step 1: Update migration test.** Replace the `expected` set in `backend/tests/test_migration.py` to add the new tables:

```python
from sqlalchemy import inspect


def test_all_tables_created(engine):
    tables = set(inspect(engine).get_table_names())
    expected = {
        "users", "roles", "permissions", "role_permissions",
        "user_roles", "refresh_tokens", "alembic_version",
        "platform_settings", "smtp_settings", "ldap_settings",
        "event_categories", "events", "event_custom_fields",
        "event_custom_field_options", "attachments", "event_visibility",
    }
    assert expected.issubset(tables)


def test_event_permissions_seeded(engine):
    from sqlalchemy import text
    with engine.connect() as c:
        rows = c.execute(text("SELECT code FROM permissions")).scalars().all()
    for code in ("events.read", "events.write", "events.delete", "events.publish", "categories.write"):
        assert code in rows
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_migration.py -v` → fails (tables/perms missing).
- [ ] **Step 3: Write the migration.** First confirm the down revision: `grep "revision =" backend/alembic/versions/0003_settings.py` (expect `revision = "0003_settings"`). Create `backend/alembic/versions/0005_events.py`:

```python
"""event domain tables + permissions

Revision ID: 0005_events
Revises: 0003_settings
Create Date: 2026-05-28
"""
import sqlalchemy as sa

from alembic import op

revision = "0005_events"
down_revision = "0003_settings"
branch_labels = None
depends_on = None

_PERMS = [
    ("events.read", "Visualizzare eventi"),
    ("events.write", "Creare/modificare eventi"),
    ("events.delete", "Eliminare eventi"),
    ("events.publish", "Pubblicare eventi"),
    ("categories.write", "Gestire categorie eventi"),
]


def upgrade() -> None:
    op.create_table(
        "event_categories",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(150), nullable=False, unique=True),
        sa.Column("color", sa.String(16), nullable=False),
        sa.Column("description", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "attachments",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.BigInteger(), nullable=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("stored_path", sa.String(512), nullable=False),
        sa.Column("content_type", sa.String(128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("uploaded_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=True),
        sa.Column("short_description", sa.String(512), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("banner_attachment_id", sa.BigInteger(), nullable=True),
        sa.Column("category_id", sa.BigInteger(),
                  sa.ForeignKey("event_categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("mode", sa.String(16), nullable=False),
        sa.Column("location_name", sa.String(255), nullable=True),
        sa.Column("address", sa.String(512), nullable=True),
        sa.Column("online_url", sa.String(512), nullable=True),
        sa.Column("start_at", sa.DateTime(), nullable=False),
        sa.Column("end_at", sa.DateTime(), nullable=False),
        sa.Column("registration_open_at", sa.DateTime(), nullable=True),
        sa.Column("registration_close_at", sa.DateTime(), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("waitlist_enabled", sa.Boolean(), nullable=False),
        sa.Column("max_per_user", sa.Integer(), nullable=False),
        sa.Column("cancellation_allowed", sa.Boolean(), nullable=False),
        sa.Column("cancellation_deadline_at", sa.DateTime(), nullable=True),
        sa.Column("reminder_config", sa.JSON(), nullable=False),
        sa.Column("internal_notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_events_status_start", "events", ["status", "start_at"])
    op.create_index("ix_events_category_id", "events", ["category_id"])
    # circular FK: events.banner_attachment_id -> attachments.id (added after both exist)
    op.create_foreign_key(
        "fk_events_banner", "events", "attachments",
        ["banner_attachment_id"], ["id"], ondelete="SET NULL",
    )
    # attachments.event_id -> events.id (added after events exists)
    op.create_foreign_key(
        "fk_attachments_event", "attachments", "events",
        ["event_id"], ["id"], ondelete="CASCADE",
    )
    op.create_index("ix_attachments_event_id", "attachments", ["event_id"])
    op.create_table(
        "event_custom_fields",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.BigInteger(),
                  sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("field_type", sa.String(32), nullable=False),
        sa.Column("required", sa.Boolean(), nullable=False),
        sa.Column("placeholder", sa.String(255), nullable=True),
        sa.Column("default_value", sa.String(512), nullable=True),
        sa.Column("validation", sa.JSON(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
    )
    op.create_index("ix_custom_fields_event", "event_custom_fields", ["event_id"])
    op.create_table(
        "event_custom_field_options",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("field_id", sa.BigInteger(),
                  sa.ForeignKey("event_custom_fields.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("value", sa.String(255), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
    )
    op.create_index("ix_field_options_field", "event_custom_field_options", ["field_id"])
    op.create_table(
        "event_visibility",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.BigInteger(),
                  sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mode", sa.String(16), nullable=False),
        sa.Column("dept_or_group", sa.String(255), nullable=True),
    )
    op.create_index("ix_visibility_event", "event_visibility", ["event_id"])

    # seed event permissions + grant to super_admin (idempotent)
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
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
            "WHERE r.name = 'super_admin' AND p.code IN "
            "('events.read','events.write','events.delete','events.publish','categories.write') "
            "AND NOT EXISTS (SELECT 1 FROM role_permissions rp "
            "WHERE rp.role_id = r.id AND rp.permission_id = p.id)"
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE rp FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id "
            "WHERE p.code IN ('events.read','events.write','events.delete','events.publish','categories.write')"
        )
    )
    conn.execute(
        sa.text(
            "DELETE FROM permissions WHERE code IN "
            "('events.read','events.write','events.delete','events.publish','categories.write')"
        )
    )
    op.drop_table("event_visibility")
    op.drop_table("event_custom_field_options")
    op.drop_table("event_custom_fields")
    op.drop_constraint("fk_events_banner", "events", type_="foreignkey")
    op.drop_constraint("fk_attachments_event", "attachments", type_="foreignkey")
    op.drop_table("events")
    op.drop_table("attachments")
    op.drop_table("event_categories")
```

- [ ] **Step 4: Run to verify it passes.** `... -m pytest tests/test_migration.py -v` → 2 passed (conftest runs downgrade base + upgrade head, exercising both directions).
- [ ] **Step 5: Commit.**
```bash
git add backend/alembic/versions/0005_events.py backend/tests/test_migration.py
git commit -m "feat(f3): migration 0005 event tables + permission seed"
```

---

### Task B4: HTML sanitize service

**Files:**
- Create: `backend/app/services/html_sanitize.py`
- Test: `backend/tests/test_html_sanitize.py`

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_html_sanitize.py`:

```python
from app.services.html_sanitize import sanitize_html


def test_strips_script():
    out = sanitize_html("<p>ok</p><script>alert(1)</script>")
    assert "ok" in out
    assert "<script>" not in out


def test_keeps_basic_formatting():
    out = sanitize_html("<p><strong>bold</strong> <em>i</em></p>")
    assert "<strong>" in out and "<em>" in out


def test_none_passthrough():
    assert sanitize_html(None) is None
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_html_sanitize.py -v` → ImportError.
- [ ] **Step 3: Implement.** `backend/app/services/html_sanitize.py`:

```python
import nh3

_ALLOWED_TAGS = {
    "p", "br", "strong", "em", "u", " s", "ul", "ol", "li",
    "a", "h1", "h2", "h3", "h4", "blockquote", "span",
}
_ALLOWED_ATTRS = {"a": {"href", "title", "target", "rel"}}


def sanitize_html(value: str | None) -> str | None:
    if value is None:
        return None
    return nh3.clean(value, tags=_ALLOWED_TAGS, attributes=_ALLOWED_ATTRS)
```

> Note: the `" s"` entry in the spec text is a typo; use `"s"` (strikethrough) — i.e. the set is `{"p","br","strong","em","u","s","ul","ol","li","a","h1","h2","h3","h4","blockquote","span"}`.

Fix the set literal accordingly (no leading space in `"s"`).

- [ ] **Step 4: Run to verify it passes.** `... -m pytest tests/test_html_sanitize.py -v` → PASS.
- [ ] **Step 5: Commit.**
```bash
git add backend/app/services/html_sanitize.py backend/tests/test_html_sanitize.py
git commit -m "feat(f3): html sanitize service (nh3)"
```

---

### Task B5: Categories — service, schemas, router

**Files:**
- Create: `backend/app/services/category_service.py`, `backend/app/schemas/category.py`, `backend/app/api/routers/categories.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_category_api.py`

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_category_api.py`:

```python
from app.services import user_service


def _admin_cookie(client, db):
    u = user_service.create_user(db, email="a@x.it", username="admin", password="pw12345")
    user_service.assign_role(db, u, "super_admin")
    db.flush()
    pair = client.post("/api/auth/login", json={"identifier": "admin", "password": "pw12345"}).json()
    client.cookies.set("access_token", pair["access_token"])


def _user_cookie(client, db):
    u = user_service.create_user(db, email="u@x.it", username="user", password="pw12345")
    db.flush()
    pair = client.post("/api/auth/login", json={"identifier": "user", "password": "pw12345"}).json()
    client.cookies.set("access_token", pair["access_token"])


def test_create_list_category(client, db):
    _admin_cookie(client, db)
    r = client.post("/api/categories", json={"name": "Formazione", "color": "#123456"})
    assert r.status_code == 201
    r2 = client.get("/api/categories")
    assert r2.status_code == 200
    assert any(c["name"] == "Formazione" for c in r2.json())


def test_create_requires_permission(client, db):
    _user_cookie(client, db)
    r = client.post("/api/categories", json={"name": "X"})
    assert r.status_code == 403


def test_duplicate_name_409(client, db):
    _admin_cookie(client, db)
    client.post("/api/categories", json={"name": "Dup"})
    r = client.post("/api/categories", json={"name": "Dup"})
    assert r.status_code == 409
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_category_api.py -v` → 404 (router not mounted).
- [ ] **Step 3: Implement schemas.** `backend/app/schemas/category.py`:

```python
from pydantic import BaseModel, Field


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    color: str = "#0a66c2"
    description: str | None = None


class CategoryOut(BaseModel):
    id: int
    name: str
    color: str
    description: str | None = None
```

`backend/app/services/category_service.py`:

```python
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Event, EventCategory


class CategoryError(Exception):
    pass


def list_categories(db: Session) -> list[EventCategory]:
    return list(db.scalars(select(EventCategory).order_by(EventCategory.name)))


def create(db: Session, *, name: str, color: str, description: str | None) -> EventCategory:
    if db.scalar(select(EventCategory).where(EventCategory.name == name)):
        raise CategoryError("duplicate name")
    cat = EventCategory(name=name, color=color, description=description)
    db.add(cat)
    db.flush()
    return cat


def update(db: Session, cat_id: int, **fields) -> EventCategory:
    cat = db.get(EventCategory, cat_id)
    if cat is None:
        raise CategoryError("not found")
    if "name" in fields and fields["name"] != cat.name:
        if db.scalar(select(EventCategory).where(EventCategory.name == fields["name"])):
            raise CategoryError("duplicate name")
    for k, v in fields.items():
        setattr(cat, k, v)
    db.flush()
    return cat


def delete(db: Session, cat_id: int) -> None:
    cat = db.get(EventCategory, cat_id)
    if cat is None:
        raise CategoryError("not found")
    if db.scalar(select(Event.id).where(Event.category_id == cat_id).limit(1)):
        raise CategoryError("category in use")
    db.delete(cat)
    db.flush()
```

`backend/app/api/routers/categories.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_permission
from app.schemas.category import CategoryIn, CategoryOut
from app.services import category_service

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut], dependencies=[Depends(require_permission("events.read"))])
def list_categories(db: Session = Depends(get_db)) -> list:
    return category_service.list_categories(db)


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_permission("categories.write"))])
def create(payload: CategoryIn, db: Session = Depends(get_db)) -> CategoryOut:
    try:
        cat = category_service.create(db, name=payload.name, color=payload.color,
                                      description=payload.description)
    except category_service.CategoryError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    db.commit()
    return cat


@router.patch("/{cat_id}", response_model=CategoryOut,
              dependencies=[Depends(require_permission("categories.write"))])
def update(cat_id: int, payload: CategoryIn, db: Session = Depends(get_db)) -> CategoryOut:
    try:
        cat = category_service.update(db, cat_id, name=payload.name, color=payload.color,
                                      description=payload.description)
    except category_service.CategoryError as exc:
        code = status.HTTP_404_NOT_FOUND if str(exc) == "not found" else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail=str(exc))
    db.commit()
    return cat


@router.delete("/{cat_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_permission("categories.write"))])
def delete(cat_id: int, db: Session = Depends(get_db)) -> None:
    try:
        category_service.delete(db, cat_id)
    except category_service.CategoryError as exc:
        code = status.HTTP_404_NOT_FOUND if str(exc) == "not found" else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail=str(exc))
    db.commit()
```

In `backend/app/main.py` add `categories` to the routers import and `app.include_router(categories.router)`.

> `CategoryOut` reads ORM objects; add `model_config = {"from_attributes": True}` to the `CategoryOut` class (Pydantic v2) so returning an ORM instance works.

- [ ] **Step 4: Run to verify it passes.** `... -m pytest tests/test_category_api.py -v` → 3 passed.
- [ ] **Step 5: Commit.**
```bash
git add backend/app/services/category_service.py backend/app/schemas/category.py backend/app/api/routers/categories.py backend/app/main.py backend/tests/test_category_api.py
git commit -m "feat(f3): categories service + API"
```

---

### Task B6: Events — schemas, CRUD service, router (no transitions yet)

**Files:**
- Create: `backend/app/schemas/event.py`, `backend/app/services/event_service.py`, `backend/app/api/routers/events.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_event_api.py`

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_event_api.py`:

```python
from datetime import datetime, timedelta

from app.services import user_service


def _admin_cookie(client, db):
    u = user_service.create_user(db, email="a@x.it", username="admin", password="pw12345")
    user_service.assign_role(db, u, "super_admin")
    db.flush()
    pair = client.post("/api/auth/login", json={"identifier": "admin", "password": "pw12345"}).json()
    client.cookies.set("access_token", pair["access_token"])


def _event_payload():
    start = datetime(2030, 1, 1, 9, 0)
    return {
        "title": "Corso",
        "start_at": start.isoformat(),
        "end_at": (start + timedelta(hours=2)).isoformat(),
        "mode": "physical",
    }


def test_create_event_is_draft(client, db):
    _admin_cookie(client, db)
    r = client.post("/api/events", json=_event_payload())
    assert r.status_code == 201
    assert r.json()["status"] == "draft"


def test_list_and_filter(client, db):
    _admin_cookie(client, db)
    client.post("/api/events", json=_event_payload())
    r = client.get("/api/events?status=draft")
    assert r.status_code == 200
    assert r.json()["total"] >= 1
    assert len(r.json()["items"]) >= 1


def test_patch_event_sanitizes_html(client, db):
    _admin_cookie(client, db)
    eid = client.post("/api/events", json=_event_payload()).json()["id"]
    r = client.patch(f"/api/events/{eid}", json={"description": "<p>ok</p><script>x</script>"})
    assert r.status_code == 200
    assert "<script>" not in r.json()["description"]


def test_delete_only_draft(client, db):
    _admin_cookie(client, db)
    eid = client.post("/api/events", json=_event_payload()).json()["id"]
    r = client.delete(f"/api/events/{eid}")
    assert r.status_code == 204
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_event_api.py -v` → 404.
- [ ] **Step 3: Implement schemas.** `backend/app/schemas/event.py`:

```python
from datetime import datetime

from pydantic import BaseModel, Field


class EventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    short_description: str | None = None
    description: str | None = None
    category_id: int | None = None
    mode: str = "physical"
    location_name: str | None = None
    address: str | None = None
    online_url: str | None = None
    start_at: datetime
    end_at: datetime
    registration_open_at: datetime | None = None
    registration_close_at: datetime | None = None
    capacity: int | None = None
    waitlist_enabled: bool = False
    max_per_user: int = 1
    cancellation_allowed: bool = True
    cancellation_deadline_at: datetime | None = None
    reminder_config: dict = {}
    internal_notes: str | None = None


class EventUpdate(BaseModel):
    title: str | None = None
    short_description: str | None = None
    description: str | None = None
    category_id: int | None = None
    banner_attachment_id: int | None = None
    mode: str | None = None
    location_name: str | None = None
    address: str | None = None
    online_url: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    registration_open_at: datetime | None = None
    registration_close_at: datetime | None = None
    capacity: int | None = None
    waitlist_enabled: bool | None = None
    max_per_user: int | None = None
    cancellation_allowed: bool | None = None
    cancellation_deadline_at: datetime | None = None
    reminder_config: dict | None = None
    internal_notes: str | None = None


class EventOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    title: str
    status: str
    short_description: str | None = None
    description: str | None = None
    category_id: int | None = None
    banner_attachment_id: int | None = None
    mode: str
    location_name: str | None = None
    address: str | None = None
    online_url: str | None = None
    start_at: datetime
    end_at: datetime
    registration_open_at: datetime | None = None
    registration_close_at: datetime | None = None
    capacity: int | None = None
    waitlist_enabled: bool
    max_per_user: int
    cancellation_allowed: bool
    cancellation_deadline_at: datetime | None = None
    reminder_config: dict
    internal_notes: str | None = None


class EventListItem(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    title: str
    status: str
    category_id: int | None = None
    start_at: datetime
    end_at: datetime


class EventListResult(BaseModel):
    items: list[EventListItem]
    total: int
    page: int
    page_size: int


class EventTransition(BaseModel):
    target: str
```

`backend/app/services/event_service.py`:

```python
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Event
from app.services.html_sanitize import sanitize_html


class EventError(Exception):
    pass


_HTML_FIELDS = ("short_description", "description")


def _apply_html(data: dict) -> None:
    for f in _HTML_FIELDS:
        if f in data and data[f] is not None:
            data[f] = sanitize_html(data[f])


def create(db: Session, *, created_by: int | None, **data) -> Event:
    _apply_html(data)
    ev = Event(status="draft", created_by=created_by, **data)
    db.add(ev)
    db.flush()
    return ev


def get(db: Session, event_id: int) -> Event:
    ev = db.get(Event, event_id)
    if ev is None:
        raise EventError("not found")
    return ev


def update(db: Session, event_id: int, data: dict) -> Event:
    ev = get(db, event_id)
    _apply_html(data)
    for k, v in data.items():
        setattr(ev, k, v)
    db.flush()
    return ev


def delete(db: Session, event_id: int) -> None:
    ev = get(db, event_id)
    if ev.status != "draft":
        raise EventError("only draft events can be deleted")
    db.delete(ev)
    db.flush()


def list_events(
    db: Session, *, status: str | None, category_id: int | None, q: str | None,
    date_from: datetime | None, date_to: datetime | None, page: int, page_size: int,
) -> tuple[list[Event], int]:
    stmt = select(Event)
    count_stmt = select(func.count()).select_from(Event)
    conds = []
    if status:
        conds.append(Event.status == status)
    if category_id:
        conds.append(Event.category_id == category_id)
    if q:
        conds.append(Event.title.like(f"%{q}%"))
    if date_from:
        conds.append(Event.start_at >= date_from)
    if date_to:
        conds.append(Event.start_at <= date_to)
    for c in conds:
        stmt = stmt.where(c)
        count_stmt = count_stmt.where(c)
    total = db.scalar(count_stmt) or 0
    stmt = stmt.order_by(Event.start_at.desc()).offset((page - 1) * page_size).limit(page_size)
    return list(db.scalars(stmt)), total
```

`backend/app/api/routers/events.py`:

```python
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_permission
from app.models import User
from app.schemas.event import (
    EventCreate, EventListItem, EventListResult, EventOut, EventUpdate,
)
from app.services import event_service

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=EventListResult, dependencies=[Depends(require_permission("events.read"))])
def list_events(
    db: Session = Depends(get_db),
    status: str | None = None,
    category_id: int | None = None,
    q: str | None = None,
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    page: int = 1,
    page_size: int = 20,
) -> EventListResult:
    items, total = event_service.list_events(
        db, status=status, category_id=category_id, q=q,
        date_from=date_from, date_to=date_to, page=page, page_size=page_size,
    )
    return EventListResult(
        items=[EventListItem.model_validate(e) for e in items],
        total=total, page=page, page_size=page_size,
    )


@router.get("/{event_id}", response_model=EventOut, dependencies=[Depends(require_permission("events.read"))])
def get_event(event_id: int, db: Session = Depends(get_db)) -> EventOut:
    try:
        return EventOut.model_validate(event_service.get(db, event_id))
    except event_service.EventError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento non trovato")


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_permission("events.write"))])
def create_event(payload: EventCreate, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)) -> EventOut:
    ev = event_service.create(db, created_by=user.id, **payload.model_dump())
    db.commit()
    return EventOut.model_validate(ev)


@router.patch("/{event_id}", response_model=EventOut,
              dependencies=[Depends(require_permission("events.write"))])
def update_event(event_id: int, payload: EventUpdate, db: Session = Depends(get_db)) -> EventOut:
    try:
        ev = event_service.update(db, event_id, payload.model_dump(exclude_unset=True))
    except event_service.EventError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento non trovato")
    db.commit()
    return EventOut.model_validate(ev)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_permission("events.delete"))])
def delete_event(event_id: int, db: Session = Depends(get_db)) -> None:
    try:
        event_service.delete(db, event_id)
    except event_service.EventError as exc:
        code = status.HTTP_404_NOT_FOUND if str(exc) == "not found" else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail=str(exc))
    db.commit()
```

Mount `events.router` in `main.py`.

- [ ] **Step 4: Run to verify it passes.** `... -m pytest tests/test_event_api.py -v` → 4 passed.
- [ ] **Step 5: Commit.**
```bash
git add backend/app/schemas/event.py backend/app/services/event_service.py backend/app/api/routers/events.py backend/app/main.py backend/tests/test_event_api.py
git commit -m "feat(f3): events CRUD service + API"
```

---

### Task B7: Event state machine + duplicate

**Files:**
- Modify: `backend/app/services/event_service.py`, `backend/app/api/routers/events.py`
- Test: `backend/tests/test_event_state_machine.py`

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_event_state_machine.py`:

```python
from datetime import datetime, timedelta

import pytest

from app.models import Event
from app.services import event_service


def _draft(db, **over):
    start = datetime(2030, 1, 1, 9, 0)
    data = dict(title="E", start_at=start, end_at=start + timedelta(hours=1), mode="physical")
    data.update(over)
    return event_service.create(db, created_by=None, **data)


def test_legal_transitions(db):
    ev = _draft(db)
    event_service.transition(db, ev.id, "published", can_publish=True)
    assert db.get(Event, ev.id).status == "published"
    event_service.transition(db, ev.id, "suspended", can_publish=True)
    assert db.get(Event, ev.id).status == "suspended"
    event_service.transition(db, ev.id, "archived", can_publish=True)
    assert db.get(Event, ev.id).status == "archived"


def test_illegal_transition_raises(db):
    ev = _draft(db)
    with pytest.raises(event_service.EventError):
        event_service.transition(db, ev.id, "suspended", can_publish=True)  # draft->suspended illegal


def test_publish_requires_permission(db):
    ev = _draft(db)
    with pytest.raises(event_service.EventError):
        event_service.transition(db, ev.id, "published", can_publish=False)


def test_publish_validates_dates(db):
    start = datetime(2030, 1, 1, 9, 0)
    ev = _draft(db, end_at=start - timedelta(hours=1))  # end before start
    with pytest.raises(event_service.EventError):
        event_service.transition(db, ev.id, "published", can_publish=True)


def test_duplicate_creates_draft(db):
    ev = _draft(db, title="Original")
    event_service.transition(db, ev.id, "published", can_publish=True)
    dup = event_service.duplicate(db, ev.id, created_by=None)
    assert dup.id != ev.id
    assert dup.status == "draft"
    assert dup.title.startswith("Original")
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_event_state_machine.py -v` → AttributeError (`transition`/`duplicate` missing).
- [ ] **Step 3: Implement.** Append to `backend/app/services/event_service.py`:

```python
from app.models import EventCustomField, EventCustomFieldOption, EventVisibility

_TRANSITIONS = {
    "draft": {"published", "archived"},
    "published": {"suspended", "cancelled", "archived"},
    "suspended": {"published", "cancelled", "archived"},
    "cancelled": {"archived"},
    "archived": set(),
}


def _validate_publishable(ev: Event) -> None:
    if not ev.title or not ev.title.strip():
        raise EventError("title required to publish")
    if ev.end_at <= ev.start_at:
        raise EventError("end_at must be after start_at")
    if ev.registration_open_at and ev.registration_close_at:
        if ev.registration_close_at < ev.registration_open_at:
            raise EventError("registration window invalid")
        if ev.registration_close_at > ev.start_at:
            raise EventError("registration must close before start")


def transition(db: Session, event_id: int, target: str, *, can_publish: bool) -> Event:
    ev = get(db, event_id)
    allowed = _TRANSITIONS.get(ev.status, set())
    if target not in allowed:
        raise EventError(f"illegal transition {ev.status} -> {target}")
    if target == "published":
        if not can_publish:
            raise EventError("missing events.publish permission")
        _validate_publishable(ev)
    ev.status = target
    db.flush()
    return ev


def duplicate(db: Session, event_id: int, *, created_by: int | None) -> Event:
    src = get(db, event_id)
    cols = {
        c: getattr(src, c) for c in (
            "short_description", "description", "category_id", "mode", "location_name",
            "address", "online_url", "start_at", "end_at", "registration_open_at",
            "registration_close_at", "capacity", "waitlist_enabled", "max_per_user",
            "cancellation_allowed", "cancellation_deadline_at", "reminder_config", "internal_notes",
        )
    }
    dup = Event(title=f"{src.title} (copia)", status="draft", created_by=created_by, **cols)
    db.add(dup)
    db.flush()
    # copy custom fields + options
    src_fields = db.scalars(
        select(EventCustomField).where(EventCustomField.event_id == src.id)
    ).all()
    for f in src_fields:
        nf = EventCustomField(
            event_id=dup.id, label=f.label, field_type=f.field_type, required=f.required,
            placeholder=f.placeholder, default_value=f.default_value, validation=f.validation,
            position=f.position,
        )
        db.add(nf)
        db.flush()
        opts = db.scalars(
            select(EventCustomFieldOption).where(EventCustomFieldOption.field_id == f.id)
        ).all()
        for o in opts:
            db.add(EventCustomFieldOption(field_id=nf.id, label=o.label, value=o.value, position=o.position))
    # copy visibility
    vis = db.scalars(select(EventVisibility).where(EventVisibility.event_id == src.id)).all()
    for v in vis:
        db.add(EventVisibility(event_id=dup.id, mode=v.mode, dept_or_group=v.dept_or_group))
    db.flush()
    return dup
```

Add the transition + duplicate endpoints to `backend/app/api/routers/events.py`:

```python
from app.services import rbac
from app.schemas.event import EventTransition


@router.post("/{event_id}/transition", response_model=EventOut,
             dependencies=[Depends(require_permission("events.write"))])
def transition_event(event_id: int, payload: EventTransition, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)) -> EventOut:
    can_publish = rbac.user_has_permission(db, user, "events.publish")
    try:
        ev = event_service.transition(db, event_id, payload.target, can_publish=can_publish)
    except event_service.EventError as exc:
        code = status.HTTP_404_NOT_FOUND if str(exc) == "not found" else status.HTTP_422_UNPROCESSABLE_ENTITY
        raise HTTPException(status_code=code, detail=str(exc))
    db.commit()
    return EventOut.model_validate(ev)


@router.post("/{event_id}/duplicate", response_model=EventOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_permission("events.write"))])
def duplicate_event(event_id: int, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)) -> EventOut:
    try:
        ev = event_service.duplicate(db, event_id, created_by=user.id)
    except event_service.EventError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento non trovato")
    db.commit()
    return EventOut.model_validate(ev)
```

> Confirm `rbac.user_has_permission(db, user, code)` exists (used by `require_permission`); it does (F1 `app/services/rbac.py`).

- [ ] **Step 4: Run to verify it passes.** `... -m pytest tests/test_event_state_machine.py -v` → 5 passed.
- [ ] **Step 5: Commit.**
```bash
git add backend/app/services/event_service.py backend/app/api/routers/events.py backend/tests/test_event_state_machine.py
git commit -m "feat(f3): event state machine + duplicate"
```

---

### Task B8: Custom fields (form builder) — service + API

**Files:**
- Create: `backend/app/services/custom_field_service.py`, `backend/app/schemas/custom_field.py`
- Modify: `backend/app/api/routers/events.py`
- Test: `backend/tests/test_custom_field_api.py`

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_custom_field_api.py`:

```python
from datetime import datetime, timedelta

from app.services import user_service


def _admin_cookie(client, db):
    u = user_service.create_user(db, email="a@x.it", username="admin", password="pw12345")
    user_service.assign_role(db, u, "super_admin")
    db.flush()
    pair = client.post("/api/auth/login", json={"identifier": "admin", "password": "pw12345"}).json()
    client.cookies.set("access_token", pair["access_token"])


def _event(client):
    start = datetime(2030, 1, 1, 9, 0)
    return client.post("/api/events", json={
        "title": "E", "start_at": start.isoformat(),
        "end_at": (start + timedelta(hours=1)).isoformat(), "mode": "physical",
    }).json()["id"]


def test_put_and_get_fields(client, db):
    _admin_cookie(client, db)
    eid = _event(client)
    body = {"fields": [
        {"label": "Nome", "field_type": "text", "required": True, "position": 0, "options": []},
        {"label": "Taglia", "field_type": "select", "required": False, "position": 1,
         "options": [{"label": "S", "value": "s", "position": 0},
                     {"label": "M", "value": "m", "position": 1}]},
    ]}
    r = client.put(f"/api/events/{eid}/fields", json=body)
    assert r.status_code == 200
    g = client.get(f"/api/events/{eid}/fields")
    assert len(g.json()) == 2
    assert g.json()[1]["options"][0]["value"] == "s"


def test_select_without_options_422(client, db):
    _admin_cookie(client, db)
    eid = _event(client)
    body = {"fields": [{"label": "X", "field_type": "select", "required": False, "position": 0, "options": []}]}
    r = client.put(f"/api/events/{eid}/fields", json=body)
    assert r.status_code == 422


def test_put_replaces_previous_set(client, db):
    _admin_cookie(client, db)
    eid = _event(client)
    client.put(f"/api/events/{eid}/fields", json={"fields": [
        {"label": "A", "field_type": "text", "required": False, "position": 0, "options": []}]})
    client.put(f"/api/events/{eid}/fields", json={"fields": [
        {"label": "B", "field_type": "text", "required": False, "position": 0, "options": []}]})
    g = client.get(f"/api/events/{eid}/fields")
    labels = [f["label"] for f in g.json()]
    assert labels == ["B"]
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_custom_field_api.py -v` → 404/405.
- [ ] **Step 3: Implement schemas.** `backend/app/schemas/custom_field.py`:

```python
from pydantic import BaseModel

_OPTION_TYPES = {"radio", "select", "select_multi", "checkbox_multi"}
_FIELD_TYPES = {
    "text", "textarea", "number", "email", "phone", "date", "time", "datetime",
    "checkbox", "checkbox_multi", "radio", "select", "select_multi", "file", "privacy_consent",
}


class OptionIn(BaseModel):
    label: str
    value: str
    position: int = 0


class OptionOut(OptionIn):
    pass


class CustomFieldIn(BaseModel):
    label: str
    field_type: str
    required: bool = False
    placeholder: str | None = None
    default_value: str | None = None
    validation: dict = {}
    position: int = 0
    options: list[OptionIn] = []


class CustomFieldOut(BaseModel):
    id: int
    label: str
    field_type: str
    required: bool
    placeholder: str | None = None
    default_value: str | None = None
    validation: dict
    position: int
    options: list[OptionOut] = []


class CustomFieldSet(BaseModel):
    fields: list[CustomFieldIn]
```

`backend/app/services/custom_field_service.py`:

```python
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import EventCustomField, EventCustomFieldOption
from app.schemas.custom_field import _FIELD_TYPES, _OPTION_TYPES, CustomFieldIn


class CustomFieldError(Exception):
    pass


def get_fields(db: Session, event_id: int) -> list[EventCustomField]:
    return list(
        db.scalars(
            select(EventCustomField)
            .where(EventCustomField.event_id == event_id)
            .order_by(EventCustomField.position)
        )
    )


def get_options(db: Session, field_id: int) -> list[EventCustomFieldOption]:
    return list(
        db.scalars(
            select(EventCustomFieldOption)
            .where(EventCustomFieldOption.field_id == field_id)
            .order_by(EventCustomFieldOption.position)
        )
    )


def replace_set(db: Session, event_id: int, fields: list[CustomFieldIn]) -> None:
    for f in fields:
        if f.field_type not in _FIELD_TYPES:
            raise CustomFieldError(f"invalid field_type: {f.field_type}")
        if f.field_type in _OPTION_TYPES and not f.options:
            raise CustomFieldError(f"field '{f.label}' requires options")
    existing = get_fields(db, event_id)
    for ef in existing:
        db.delete(ef)  # options cascade via FK
    db.flush()
    for f in fields:
        nf = EventCustomField(
            event_id=event_id, label=f.label, field_type=f.field_type, required=f.required,
            placeholder=f.placeholder, default_value=f.default_value, validation=f.validation,
            position=f.position,
        )
        db.add(nf)
        db.flush()
        for o in f.options:
            db.add(EventCustomFieldOption(field_id=nf.id, label=o.label, value=o.value, position=o.position))
    db.flush()
```

Add endpoints to `backend/app/api/routers/events.py`:

```python
from app.schemas.custom_field import CustomFieldOut, CustomFieldSet, OptionOut
from app.services import custom_field_service


@router.get("/{event_id}/fields", response_model=list[CustomFieldOut],
            dependencies=[Depends(require_permission("events.read"))])
def get_fields(event_id: int, db: Session = Depends(get_db)) -> list[CustomFieldOut]:
    out = []
    for f in custom_field_service.get_fields(db, event_id):
        opts = [OptionOut(label=o.label, value=o.value, position=o.position)
                for o in custom_field_service.get_options(db, f.id)]
        out.append(CustomFieldOut(
            id=f.id, label=f.label, field_type=f.field_type, required=f.required,
            placeholder=f.placeholder, default_value=f.default_value, validation=f.validation,
            position=f.position, options=opts,
        ))
    return out


@router.put("/{event_id}/fields", status_code=status.HTTP_200_OK,
            dependencies=[Depends(require_permission("events.write"))])
def put_fields(event_id: int, payload: CustomFieldSet, db: Session = Depends(get_db)) -> dict:
    try:
        custom_field_service.replace_set(db, event_id, payload.fields)
    except custom_field_service.CustomFieldError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    db.commit()
    return {"ok": True, "count": len(payload.fields)}
```

- [ ] **Step 4: Run to verify it passes.** `... -m pytest tests/test_custom_field_api.py -v` → 3 passed.
- [ ] **Step 5: Commit.**
```bash
git add backend/app/services/custom_field_service.py backend/app/schemas/custom_field.py backend/app/api/routers/events.py backend/tests/test_custom_field_api.py
git commit -m "feat(f3): custom fields form builder service + API"
```

---

### Task B9: Attachments — service + API (upload/download/delete)

**Files:**
- Create: `backend/app/services/attachment_service.py`, `backend/app/schemas/attachment.py`, `backend/app/api/routers/attachments.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_attachment_api.py`

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_attachment_api.py`:

```python
import io
from datetime import datetime, timedelta

from app.services import user_service


def _admin_cookie(client, db):
    u = user_service.create_user(db, email="a@x.it", username="admin", password="pw12345")
    user_service.assign_role(db, u, "super_admin")
    db.flush()
    pair = client.post("/api/auth/login", json={"identifier": "admin", "password": "pw12345"}).json()
    client.cookies.set("access_token", pair["access_token"])


def _event(client):
    start = datetime(2030, 1, 1, 9, 0)
    return client.post("/api/events", json={
        "title": "E", "start_at": start.isoformat(),
        "end_at": (start + timedelta(hours=1)).isoformat(), "mode": "physical",
    }).json()["id"]


def test_upload_download_delete(client, db, tmp_path, monkeypatch):
    from app.core import config
    monkeypatch.setattr(config.get_settings(), "upload_dir", str(tmp_path), raising=False)
    _admin_cookie(client, db)
    eid = _event(client)
    files = {"file": ("logo.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 50), "image/png")}
    r = client.post(f"/api/events/{eid}/attachments", files=files, data={"kind": "banner"})
    assert r.status_code == 201
    aid = r.json()["id"]
    d = client.get(f"/api/attachments/{aid}/download")
    assert d.status_code == 200
    x = client.delete(f"/api/attachments/{aid}")
    assert x.status_code == 204


def test_reject_bad_mime(client, db, tmp_path, monkeypatch):
    from app.core import config
    monkeypatch.setattr(config.get_settings(), "upload_dir", str(tmp_path), raising=False)
    _admin_cookie(client, db)
    eid = _event(client)
    files = {"file": ("evil.exe", io.BytesIO(b"MZ"), "application/x-msdownload")}
    r = client.post(f"/api/events/{eid}/attachments", files=files, data={"kind": "attachment"})
    assert r.status_code == 422
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_attachment_api.py -v` → 404.
- [ ] **Step 3: Implement.** `backend/app/schemas/attachment.py`:

```python
from pydantic import BaseModel


class AttachmentOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    event_id: int | None = None
    filename: str
    content_type: str
    size_bytes: int
    kind: str
```

`backend/app/services/attachment_service.py`:

```python
import os
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Attachment

ALLOWED = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
}


class AttachmentError(Exception):
    pass


def save(db: Session, *, event_id: int, filename: str, content_type: str,
         data: bytes, kind: str, uploaded_by: int | None) -> Attachment:
    if content_type not in ALLOWED:
        raise AttachmentError(f"unsupported content type: {content_type}")
    if len(data) > get_settings().max_upload_bytes:
        raise AttachmentError("file too large")
    upload_dir = get_settings().upload_dir
    os.makedirs(upload_dir, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{ALLOWED[content_type]}"
    stored_path = os.path.join(upload_dir, stored_name)
    with open(stored_path, "wb") as fh:
        fh.write(data)
    att = Attachment(
        event_id=event_id, filename=filename, stored_path=stored_path,
        content_type=content_type, size_bytes=len(data), kind=kind, uploaded_by=uploaded_by,
    )
    db.add(att)
    db.flush()
    return att


def get(db: Session, attachment_id: int) -> Attachment:
    att = db.get(Attachment, attachment_id)
    if att is None:
        raise AttachmentError("not found")
    return att


def list_for_event(db: Session, event_id: int) -> list[Attachment]:
    return list(db.scalars(select(Attachment).where(Attachment.event_id == event_id)))


def delete(db: Session, attachment_id: int) -> str:
    att = get(db, attachment_id)
    path = att.stored_path
    db.delete(att)
    db.flush()
    return path  # caller removes the file after commit
```

`backend/app/api/routers/attachments.py`:

```python
import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_permission
from app.models import User
from app.schemas.attachment import AttachmentOut
from app.services import attachment_service

router = APIRouter(tags=["attachments"])


@router.post("/api/events/{event_id}/attachments", response_model=AttachmentOut,
             status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_permission("events.write"))])
async def upload(event_id: int, file: UploadFile = File(...), kind: str = Form("attachment"),
                 db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> AttachmentOut:
    data = await file.read()
    try:
        att = attachment_service.save(
            db, event_id=event_id, filename=file.filename or "file",
            content_type=file.content_type or "application/octet-stream",
            data=data, kind=kind, uploaded_by=user.id,
        )
    except attachment_service.AttachmentError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    db.commit()
    return AttachmentOut.model_validate(att)


@router.get("/api/attachments/{attachment_id}/download",
            dependencies=[Depends(require_permission("events.read"))])
def download(attachment_id: int, db: Session = Depends(get_db)) -> FileResponse:
    try:
        att = attachment_service.get(db, attachment_id)
    except attachment_service.AttachmentError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allegato non trovato")
    if not os.path.exists(att.stored_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File mancante")
    return FileResponse(att.stored_path, media_type=att.content_type, filename=att.filename)


@router.delete("/api/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_permission("events.write"))])
def delete(attachment_id: int, db: Session = Depends(get_db)) -> None:
    try:
        path = attachment_service.delete(db, attachment_id)
    except attachment_service.AttachmentError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allegato non trovato")
    db.commit()
    if os.path.exists(path):
        os.remove(path)
```

Mount `attachments.router` in `main.py`.

- [ ] **Step 4: Run to verify it passes.** `... -m pytest tests/test_attachment_api.py -v` → 2 passed.
- [ ] **Step 5: Commit.**
```bash
git add backend/app/services/attachment_service.py backend/app/schemas/attachment.py backend/app/api/routers/attachments.py backend/app/main.py backend/tests/test_attachment_api.py
git commit -m "feat(f3): attachments upload/download/delete on local volume"
```

---

### Task B10: Visibility — service + API

**Files:**
- Create: `backend/app/services/visibility_service.py`, `backend/app/schemas/visibility.py`
- Modify: `backend/app/api/routers/events.py`
- Test: `backend/tests/test_visibility_api.py`

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_visibility_api.py`:

```python
from datetime import datetime, timedelta

from app.services import user_service


def _admin_cookie(client, db):
    u = user_service.create_user(db, email="a@x.it", username="admin", password="pw12345")
    user_service.assign_role(db, u, "super_admin")
    db.flush()
    pair = client.post("/api/auth/login", json={"identifier": "admin", "password": "pw12345"}).json()
    client.cookies.set("access_token", pair["access_token"])


def _event(client):
    start = datetime(2030, 1, 1, 9, 0)
    return client.post("/api/events", json={
        "title": "E", "start_at": start.isoformat(),
        "end_at": (start + timedelta(hours=1)).isoformat(), "mode": "physical",
    }).json()["id"]


def test_set_and_get_visibility(client, db):
    _admin_cookie(client, db)
    eid = _event(client)
    r = client.put(f"/api/events/{eid}/visibility",
                   json={"mode": "restricted", "groups": ["Reparto A", "Reparto B"]})
    assert r.status_code == 200
    g = client.get(f"/api/events/{eid}/visibility").json()
    assert g["mode"] == "restricted"
    assert set(g["groups"]) == {"Reparto A", "Reparto B"}


def test_all_mode_clears_groups(client, db):
    _admin_cookie(client, db)
    eid = _event(client)
    client.put(f"/api/events/{eid}/visibility", json={"mode": "restricted", "groups": ["X"]})
    client.put(f"/api/events/{eid}/visibility", json={"mode": "all", "groups": []})
    g = client.get(f"/api/events/{eid}/visibility").json()
    assert g["mode"] == "all"
    assert g["groups"] == []
```

- [ ] **Step 2: Run to verify it fails.** `... -m pytest tests/test_visibility_api.py -v` → 404.
- [ ] **Step 3: Implement.** `backend/app/schemas/visibility.py`:

```python
from pydantic import BaseModel


class VisibilityIn(BaseModel):
    mode: str = "all"
    groups: list[str] = []


class VisibilityOut(BaseModel):
    mode: str
    groups: list[str]
```

`backend/app/services/visibility_service.py`:

```python
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import EventVisibility


def get_visibility(db: Session, event_id: int) -> tuple[str, list[str]]:
    rows = list(db.scalars(select(EventVisibility).where(EventVisibility.event_id == event_id)))
    if not rows:
        return "all", []
    mode = rows[0].mode
    groups = [r.dept_or_group for r in rows if r.dept_or_group]
    return mode, groups


def set_visibility(db: Session, event_id: int, mode: str, groups: list[str]) -> None:
    for row in db.scalars(select(EventVisibility).where(EventVisibility.event_id == event_id)):
        db.delete(row)
    db.flush()
    if mode == "all":
        db.add(EventVisibility(event_id=event_id, mode="all", dept_or_group=None))
    else:
        if not groups:
            db.add(EventVisibility(event_id=event_id, mode="restricted", dept_or_group=None))
        for g in groups:
            db.add(EventVisibility(event_id=event_id, mode="restricted", dept_or_group=g))
    db.flush()
```

Add endpoints to `backend/app/api/routers/events.py`:

```python
from app.schemas.visibility import VisibilityIn, VisibilityOut
from app.services import visibility_service


@router.get("/{event_id}/visibility", response_model=VisibilityOut,
            dependencies=[Depends(require_permission("events.read"))])
def get_visibility(event_id: int, db: Session = Depends(get_db)) -> VisibilityOut:
    mode, groups = visibility_service.get_visibility(db, event_id)
    return VisibilityOut(mode=mode, groups=groups)


@router.put("/{event_id}/visibility", response_model=VisibilityOut,
            dependencies=[Depends(require_permission("events.write"))])
def set_visibility(event_id: int, payload: VisibilityIn, db: Session = Depends(get_db)) -> VisibilityOut:
    visibility_service.set_visibility(db, event_id, payload.mode, payload.groups)
    db.commit()
    mode, groups = visibility_service.get_visibility(db, event_id)
    return VisibilityOut(mode=mode, groups=groups)
```

- [ ] **Step 4: Run to verify it passes.** `... -m pytest tests/test_visibility_api.py -v` → 2 passed.
- [ ] **Step 5: Run FULL backend suite.** `... -m pytest -q` → all green.
- [ ] **Step 6: Commit.**
```bash
git add backend/app/services/visibility_service.py backend/app/schemas/visibility.py backend/app/api/routers/events.py backend/tests/test_visibility_api.py
git commit -m "feat(f3): event visibility service + API"
```

---

# PART C — Events admin UI

### Task C1: Zod schemas + admin-api event methods

**Files:**
- Create: `frontend/lib/event-schemas.ts`
- Test: `frontend/__tests__/event-schemas.test.ts`

- [ ] **Step 1: Write the failing test.** Create `frontend/__tests__/event-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eventSchema, categorySchema } from "@/lib/event-schemas";

describe("eventSchema", () => {
  it("requires a title", () => {
    expect(eventSchema.safeParse({ title: "", start_at: "2030-01-01T09:00", end_at: "2030-01-01T10:00", mode: "physical" }).success).toBe(false);
  });
  it("accepts a valid event", () => {
    expect(eventSchema.safeParse({ title: "C", start_at: "2030-01-01T09:00", end_at: "2030-01-01T10:00", mode: "physical" }).success).toBe(true);
  });
});

describe("categorySchema", () => {
  it("requires a name", () => {
    expect(categorySchema.safeParse({ name: "", color: "#fff" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `cd frontend && pnpm test event-schemas` → cannot find module.
- [ ] **Step 3: Implement.** `frontend/lib/event-schemas.ts`:

```ts
import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().min(1).max(150),
  color: z.string().default("#0a66c2"),
  description: z.string().optional(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const eventSchema = z.object({
  title: z.string().min(1).max(255),
  short_description: z.string().optional(),
  description: z.string().optional(),
  category_id: z.coerce.number().int().optional().nullable(),
  mode: z.enum(["physical", "online", "hybrid"]).default("physical"),
  location_name: z.string().optional(),
  address: z.string().optional(),
  online_url: z.string().optional(),
  start_at: z.string().min(1),
  end_at: z.string().min(1),
  registration_open_at: z.string().optional().nullable(),
  registration_close_at: z.string().optional().nullable(),
  capacity: z.coerce.number().int().positive().optional().nullable(),
  waitlist_enabled: z.boolean().default(false),
  max_per_user: z.coerce.number().int().positive().default(1),
  cancellation_allowed: z.boolean().default(true),
  internal_notes: z.string().optional(),
});
export type EventInput = z.infer<typeof eventSchema>;

export const FIELD_TYPES = [
  "text", "textarea", "number", "email", "phone", "date", "time", "datetime",
  "checkbox", "checkbox_multi", "radio", "select", "select_multi", "file", "privacy_consent",
] as const;

export const OPTION_TYPES = ["radio", "select", "select_multi", "checkbox_multi"];
```

- [ ] **Step 4: Run to verify it passes.** `cd frontend && pnpm test event-schemas` → PASS.
- [ ] **Step 5: Commit.**
```bash
git add frontend/lib/event-schemas.ts frontend/__tests__/event-schemas.test.ts
git commit -m "feat(f3): event/category zod schemas"
```

---

### Task C2: Categories admin page

**Files:**
- Create: `frontend/app/admin/categories/page.tsx`

- [ ] **Step 1: Implement.** `frontend/app/admin/categories/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/admin-api";

type Category = { id: number; name: string; color: string; description?: string };

export default function CategoriesPage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [form, setForm] = useState({ name: "", color: "#0a66c2" });
  const [error, setError] = useState("");

  async function load() {
    setCats(await api.get<Category[]>("/categories"));
  }
  useEffect(() => { load().catch((e) => setError((e as Error).message)); }, []);

  async function create() {
    try {
      await api.post("/categories", form);
      setForm({ name: "", color: "#0a66c2" });
      await load();
    } catch (e) { setError((e as Error).message); }
  }
  async function remove(id: number) {
    try { await api.del(`/categories/${id}`); await load(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Categorie</h1>
      <div className="flex gap-2">
        <input className="rounded border p-2" placeholder="Nome"
               value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="h-10 w-14 rounded border" type="color"
               value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={create}>Aggiungi</button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <ul className="divide-y rounded border bg-white">
        {cats.map((c) => (
          <li key={c.id} className="flex items-center justify-between p-3">
            <span className="flex items-center gap-2">
              <span className="inline-block h-4 w-4 rounded" style={{ background: c.color }} />
              {c.name}
            </span>
            <button className="text-sm text-red-700" onClick={() => remove(c.id)}>Elimina</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Verify build.** `cd frontend && pnpm build` → success.
- [ ] **Step 3: Commit.**
```bash
git add frontend/app/admin/categories/page.tsx
git commit -m "feat(f3): categories admin page"
```

---

### Task C3: Event table + list page

**Files:**
- Create: `frontend/components/admin/status-badge.tsx`, `frontend/components/admin/event-table.tsx`, `frontend/app/admin/events/page.tsx`
- Test: `frontend/__tests__/event-table.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `frontend/__tests__/event-table.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventTable } from "@/components/admin/event-table";

const items = [
  { id: 1, title: "Alpha", status: "draft", category_id: null, start_at: "2030-01-01T09:00", end_at: "2030-01-01T10:00" },
  { id: 2, title: "Beta", status: "published", category_id: null, start_at: "2030-02-01T09:00", end_at: "2030-02-01T10:00" },
];

describe("EventTable", () => {
  it("renders rows with titles and status", () => {
    render(<EventTable items={items} onAction={() => {}} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `cd frontend && pnpm test event-table` → cannot find module.
- [ ] **Step 3: Implement.** `frontend/components/admin/status-badge.tsx`:

```tsx
const COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  published: "bg-green-100 text-green-700",
  suspended: "bg-yellow-100 text-yellow-800",
  cancelled: "bg-red-100 text-red-700",
  archived: "bg-blue-100 text-blue-700",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded px-2 py-0.5 text-xs ${COLORS[status] ?? "bg-gray-100"}`}>{status}</span>;
}
```

`frontend/components/admin/event-table.tsx`:

```tsx
import Link from "next/link";
import { StatusBadge } from "./status-badge";

export type EventRow = {
  id: number; title: string; status: string;
  category_id: number | null; start_at: string; end_at: string;
};

const NEXT_ACTIONS: Record<string, { label: string; target: string; danger?: boolean }[]> = {
  draft: [{ label: "Pubblica", target: "published" }, { label: "Archivia", target: "archived" }],
  published: [{ label: "Sospendi", target: "suspended" }, { label: "Annulla", target: "cancelled", danger: true }, { label: "Archivia", target: "archived" }],
  suspended: [{ label: "Riattiva", target: "published" }, { label: "Annulla", target: "cancelled", danger: true }, { label: "Archivia", target: "archived" }],
  cancelled: [{ label: "Archivia", target: "archived" }],
  archived: [],
};

export function EventTable({
  items, onAction,
}: { items: EventRow[]; onAction: (id: number, kind: "transition" | "duplicate", target?: string) => void }) {
  return (
    <table className="w-full rounded border bg-white text-sm">
      <thead className="bg-gray-50 text-left">
        <tr><th className="p-3">Titolo</th><th className="p-3">Stato</th><th className="p-3">Inizio</th><th className="p-3">Azioni</th></tr>
      </thead>
      <tbody className="divide-y">
        {items.map((e) => (
          <tr key={e.id}>
            <td className="p-3"><Link className="text-blue-700 hover:underline" href={`/admin/events/${e.id}`}>{e.title}</Link></td>
            <td className="p-3"><StatusBadge status={e.status} /></td>
            <td className="p-3">{new Date(e.start_at).toLocaleString("it-IT")}</td>
            <td className="p-3 space-x-2">
              <button className="text-blue-700" onClick={() => onAction(e.id, "duplicate")}>Duplica</button>
              {(NEXT_ACTIONS[e.status] ?? []).map((a) => (
                <button
                  key={a.target}
                  className={a.danger ? "text-red-700" : "text-gray-700"}
                  onClick={() => {
                    if (a.danger && !window.confirm(`Confermi: ${a.label}?`)) return;
                    onAction(e.id, "transition", a.target);
                  }}
                >
                  {a.label}
                </button>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

`frontend/app/admin/events/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EventTable, type EventRow } from "@/components/admin/event-table";
import { api } from "@/lib/admin-api";

type ListResult = { items: EventRow[]; total: number };

export default function EventsPage() {
  const [items, setItems] = useState<EventRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (q) params.set("q", q);
    const res = await api.get<ListResult>(`/events?${params.toString()}`);
    setItems(res.items);
  }
  useEffect(() => { load().catch((e) => setError((e as Error).message)); }, [statusFilter]);

  async function onAction(id: number, kind: "transition" | "duplicate", target?: string) {
    try {
      if (kind === "duplicate") await api.post(`/events/${id}/duplicate`);
      else await api.post(`/events/${id}/transition`, { target });
      await load();
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Eventi</h1>
        <Link className="rounded bg-blue-600 px-4 py-2 text-white" href="/admin/events/new">Nuovo evento</Link>
      </div>
      <div className="flex gap-2">
        <select className="rounded border p-2" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Tutti gli stati</option>
          {["draft", "published", "suspended", "cancelled", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="rounded border p-2" placeholder="Cerca titolo" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="rounded border px-4 py-2" onClick={() => load()}>Cerca</button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <EventTable items={items} onAction={onAction} />
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes.** `cd frontend && pnpm test event-table` → PASS; `pnpm build` → success.
- [ ] **Step 5: Commit.**
```bash
git add frontend/components/admin/status-badge.tsx frontend/components/admin/event-table.tsx frontend/app/admin/events/page.tsx frontend/__tests__/event-table.test.tsx
git commit -m "feat(f3): event list page + table with state actions"
```

---

### Task C4: Event form + new/edit pages

**Files:**
- Create: `frontend/components/admin/event-form.tsx`, `frontend/app/admin/events/new/page.tsx`, `frontend/app/admin/events/[id]/page.tsx`

- [ ] **Step 1: Implement the form.** `frontend/components/admin/event-form.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/admin-api";
import { eventSchema, type EventInput } from "@/lib/event-schemas";

type Category = { id: number; name: string };

const EMPTY: EventInput = {
  title: "", short_description: "", description: "", category_id: null,
  mode: "physical", location_name: "", address: "", online_url: "",
  start_at: "", end_at: "", waitlist_enabled: false, max_per_user: 1,
  cancellation_allowed: true, internal_notes: "",
};

export function EventForm({
  initial, onSubmit,
}: { initial?: Partial<EventInput>; onSubmit: (data: EventInput) => Promise<void> }) {
  const [form, setForm] = useState<EventInput>({ ...EMPTY, ...initial });
  const [cats, setCats] = useState<Category[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get<Category[]>("/categories").then(setCats).catch(() => {}); }, []);

  function set<K extends keyof EventInput>(k: K, v: EventInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    const parsed = eventSchema.safeParse(form);
    if (!parsed.success) { setError("Controlla i campi obbligatori (titolo, date)."); return; }
    setBusy(true); setError("");
    try { await onSubmit(parsed.data); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const inp = "w-full rounded border p-2";
  return (
    <div className="space-y-3">
      <input className={inp} placeholder="Titolo" value={form.title} onChange={(e) => set("title", e.target.value)} />
      <input className={inp} placeholder="Descrizione breve" value={form.short_description ?? ""} onChange={(e) => set("short_description", e.target.value)} />
      <textarea className={inp} rows={5} placeholder="Descrizione (HTML semplice)" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
      <div className="flex gap-2">
        <select className={inp} value={form.category_id ?? ""} onChange={(e) => set("category_id", e.target.value ? Number(e.target.value) : null)}>
          <option value="">Nessuna categoria</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={inp} value={form.mode} onChange={(e) => set("mode", e.target.value as EventInput["mode"])}>
          <option value="physical">In sede</option><option value="online">Online</option><option value="hybrid">Ibrido</option>
        </select>
      </div>
      <input className={inp} placeholder="Luogo" value={form.location_name ?? ""} onChange={(e) => set("location_name", e.target.value)} />
      <input className={inp} placeholder="Indirizzo" value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
      <input className={inp} placeholder="Link online" value={form.online_url ?? ""} onChange={(e) => set("online_url", e.target.value)} />
      <div className="flex gap-2">
        <label className="flex-1 text-sm">Inizio<input className={inp} type="datetime-local" value={form.start_at} onChange={(e) => set("start_at", e.target.value)} /></label>
        <label className="flex-1 text-sm">Fine<input className={inp} type="datetime-local" value={form.end_at} onChange={(e) => set("end_at", e.target.value)} /></label>
      </div>
      <div className="flex gap-2">
        <label className="flex-1 text-sm">Capienza<input className={inp} type="number" value={form.capacity ?? ""} onChange={(e) => set("capacity", e.target.value ? Number(e.target.value) : null)} /></label>
        <label className="flex-1 text-sm">Max per utente<input className={inp} type="number" value={form.max_per_user} onChange={(e) => set("max_per_user", Number(e.target.value))} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.waitlist_enabled} onChange={(e) => set("waitlist_enabled", e.target.checked)} /> Lista d'attesa</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.cancellation_allowed} onChange={(e) => set("cancellation_allowed", e.target.checked)} /> Annullamento consentito</label>
      <textarea className={inp} rows={2} placeholder="Note interne" value={form.internal_notes ?? ""} onChange={(e) => set("internal_notes", e.target.value)} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={submit}>Salva</button>
    </div>
  );
}
```

- [ ] **Step 2: New page.** `frontend/app/admin/events/new/page.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { EventForm } from "@/components/admin/event-form";
import { api } from "@/lib/admin-api";
import type { EventInput } from "@/lib/event-schemas";

export default function NewEventPage() {
  const router = useRouter();
  async function create(data: EventInput) {
    const ev = await api.post<{ id: number }>("/events", data);
    router.push(`/admin/events/${ev.id}`);
  }
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Nuovo evento</h1>
      <EventForm onSubmit={create} />
    </div>
  );
}
```

- [ ] **Step 3: Edit page with tabs.** `frontend/app/admin/events/[id]/page.tsx`:

```tsx
"use client";

import { use, useEffect, useState } from "react";
import { AttachmentManager } from "@/components/admin/attachment-manager";
import { EventForm } from "@/components/admin/event-form";
import { FieldBuilder } from "@/components/admin/field-builder";
import { VisibilityEditor } from "@/components/admin/visibility-editor";
import { api } from "@/lib/admin-api";
import type { EventInput } from "@/lib/event-schemas";

const TABS = ["Dettagli", "Campi custom", "Allegati", "Visibilità"] as const;

export default function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const eventId = Number(id);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Dettagli");
  const [initial, setInitial] = useState<Partial<EventInput> | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get<Record<string, unknown>>(`/events/${eventId}`).then((e) => {
      setInitial({
        ...e,
        start_at: String(e.start_at ?? "").slice(0, 16),
        end_at: String(e.end_at ?? "").slice(0, 16),
      } as Partial<EventInput>);
    }).catch((err) => setMsg((err as Error).message));
  }, [eventId]);

  async function save(data: EventInput) {
    await api.patch(`/events/${eventId}`, data);
    setMsg("Salvato.");
  }

  if (!initial) return <p>Caricamento…</p>;
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Modifica evento</h1>
      <div className="flex gap-2 border-b">
        {TABS.map((t) => (
          <button key={t} className={`px-3 py-2 text-sm ${tab === t ? "border-b-2 border-blue-600 font-medium" : "text-gray-500"}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {tab === "Dettagli" && <EventForm initial={initial} onSubmit={save} />}
      {tab === "Campi custom" && <FieldBuilder eventId={eventId} />}
      {tab === "Allegati" && <AttachmentManager eventId={eventId} />}
      {tab === "Visibilità" && <VisibilityEditor eventId={eventId} />}
    </div>
  );
}
```

- [ ] **Step 4: Verify build** AFTER Task C5/C6 (this page imports FieldBuilder/AttachmentManager/VisibilityEditor created next). For now run `pnpm test` to ensure no regression; build is verified at the end of C6.
- [ ] **Step 5: Commit.**
```bash
git add frontend/components/admin/event-form.tsx frontend/app/admin/events/new/page.tsx frontend/app/admin/events/[id]/page.tsx
git commit -m "feat(f3): event create/edit forms with tabs"
```

---

### Task C5: Field builder component

**Files:**
- Create: `frontend/components/admin/field-builder.tsx`
- Test: `frontend/__tests__/field-builder.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `frontend/__tests__/field-builder.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, status: 200, json: async () => [],
  })) as unknown as typeof fetch);
});

import { FieldBuilder } from "@/components/admin/field-builder";

describe("FieldBuilder", () => {
  it("adds a field row when clicking add", async () => {
    render(<FieldBuilder eventId={1} />);
    fireEvent.click(await screen.findByText("Aggiungi campo"));
    expect(screen.getByPlaceholderText("Etichetta campo")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `cd frontend && pnpm test field-builder` → cannot find module.
- [ ] **Step 3: Implement.** `frontend/components/admin/field-builder.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/admin-api";
import { FIELD_TYPES, OPTION_TYPES } from "@/lib/event-schemas";

type Option = { label: string; value: string; position: number };
type Field = {
  label: string; field_type: string; required: boolean;
  placeholder?: string; position: number; options: Option[];
};

export function FieldBuilder({ eventId }: { eventId: number }) {
  const [fields, setFields] = useState<Field[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get<Field[]>(`/events/${eventId}/fields`).then((f) =>
      setFields(f.map((x) => ({ ...x, options: x.options ?? [] })))
    ).catch(() => {});
  }, [eventId]);

  function add() {
    setFields((f) => [...f, { label: "", field_type: "text", required: false, position: f.length, options: [] }]);
  }
  function update(i: number, patch: Partial<Field>) {
    setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function remove(i: number) {
    setFields((f) => f.filter((_, idx) => idx !== i).map((x, idx) => ({ ...x, position: idx })));
  }
  function move(i: number, dir: -1 | 1) {
    setFields((f) => {
      const j = i + dir;
      if (j < 0 || j >= f.length) return f;
      const copy = [...f];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy.map((x, idx) => ({ ...x, position: idx }));
    });
  }
  function addOption(i: number) {
    setFields((f) => f.map((x, idx) => idx === i
      ? { ...x, options: [...x.options, { label: "", value: "", position: x.options.length }] } : x));
  }

  async function save() {
    try {
      await api.put(`/events/${eventId}/fields`, { fields });
      setMsg("Campi salvati.");
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      {fields.map((f, i) => (
        <div key={i} className="rounded border bg-white p-3 space-y-2">
          <div className="flex gap-2">
            <input className="flex-1 rounded border p-2" placeholder="Etichetta campo"
                   value={f.label} onChange={(e) => update(i, { label: e.target.value })} />
            <select className="rounded border p-2" value={f.field_type}
                    onChange={(e) => update(i, { field_type: e.target.value })}>
              {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="text-gray-500" onClick={() => move(i, -1)}>↑</button>
            <button className="text-gray-500" onClick={() => move(i, 1)}>↓</button>
            <button className="text-red-700" onClick={() => remove(i)}>✕</button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.required} onChange={(e) => update(i, { required: e.target.checked })} /> Obbligatorio
          </label>
          {OPTION_TYPES.includes(f.field_type) && (
            <div className="pl-4">
              {f.options.map((o, oi) => (
                <div key={oi} className="mb-1 flex gap-2">
                  <input className="rounded border p-1 text-sm" placeholder="Etichetta opzione"
                         value={o.label}
                         onChange={(e) => update(i, { options: f.options.map((x, idx) => idx === oi ? { ...x, label: e.target.value } : x) })} />
                  <input className="rounded border p-1 text-sm" placeholder="Valore"
                         value={o.value}
                         onChange={(e) => update(i, { options: f.options.map((x, idx) => idx === oi ? { ...x, value: e.target.value } : x) })} />
                </div>
              ))}
              <button className="text-sm text-blue-700" onClick={() => addOption(i)}>+ opzione</button>
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <button className="rounded border px-4 py-2" onClick={add}>Aggiungi campo</button>
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={save}>Salva campi</button>
      </div>
      {msg && <p className="text-sm text-gray-700">{msg}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes.** `cd frontend && pnpm test field-builder` → PASS.
- [ ] **Step 5: Commit.**
```bash
git add frontend/components/admin/field-builder.tsx frontend/__tests__/field-builder.test.tsx
git commit -m "feat(f3): custom field builder component"
```

---

### Task C6: Attachment manager + visibility editor

**Files:**
- Create: `frontend/components/admin/attachment-manager.tsx`, `frontend/components/admin/visibility-editor.tsx`

- [ ] **Step 1: Attachment manager.** `frontend/components/admin/attachment-manager.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/admin-api";

type Attachment = { id: number; filename: string; kind: string; content_type: string };

export function AttachmentManager({ eventId }: { eventId: number }) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    // attachments listed via event detail; refetch the event and read its attachments
    const ev = await api.get<{ attachments?: Attachment[] }>(`/events/${eventId}`);
    setItems(ev.attachments ?? []);
  }
  useEffect(() => { load().catch(() => {}); }, [eventId]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>, kind: string) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    const res = await fetch(`/api/events/${eventId}/attachments`, {
      method: "POST", body: fd, credentials: "include",
    });
    if (!res.ok) { setMsg("Upload non riuscito (tipo o dimensione non validi)."); return; }
    setMsg("Caricato.");
    await load();
  }

  async function remove(id: number) {
    await api.del(`/attachments/${id}`);
    await load();
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm">Banner (immagine)
        <input className="block" type="file" accept="image/*" onChange={(e) => upload(e, "banner")} />
      </label>
      <label className="block text-sm">Allegato
        <input className="block" type="file" onChange={(e) => upload(e, "attachment")} />
      </label>
      {msg && <p className="text-sm text-gray-700">{msg}</p>}
      <ul className="divide-y rounded border bg-white">
        {items.map((a) => (
          <li key={a.id} className="flex items-center justify-between p-2 text-sm">
            <a className="text-blue-700" href={`/api/attachments/${a.id}/download`}>{a.filename} ({a.kind})</a>
            <button className="text-red-700" onClick={() => remove(a.id)}>Elimina</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

> The event detail (`GET /api/events/{id}`) currently returns `EventOut` without an `attachments` array. To support this component, extend `EventOut` and the `get_event` endpoint to include `attachments: list[AttachmentOut]` (query `attachment_service.list_for_event`). Add this small change in this task: update `backend/app/schemas/event.py` `EventOut` to add `attachments: list = []` and the `get_event` handler to attach them. Re-run `backend/tests/test_event_api.py` to confirm still green.

- [ ] **Step 2: Visibility editor.** `frontend/components/admin/visibility-editor.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/admin-api";

export function VisibilityEditor({ eventId }: { eventId: number }) {
  const [mode, setMode] = useState<"all" | "restricted">("all");
  const [groups, setGroups] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get<{ mode: "all" | "restricted"; groups: string[] }>(`/events/${eventId}/visibility`)
      .then((v) => { setMode(v.mode); setGroups(v.groups); }).catch(() => {});
  }, [eventId]);

  async function save() {
    await api.put(`/events/${eventId}/visibility`, { mode, groups });
    setMsg("Visibilità salvata.");
  }

  return (
    <div className="space-y-3">
      <select className="rounded border p-2" value={mode} onChange={(e) => setMode(e.target.value as "all" | "restricted")}>
        <option value="all">Tutti</option>
        <option value="restricted">Reparti/gruppi specifici</option>
      </select>
      {mode === "restricted" && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input className="rounded border p-2" placeholder="Reparto o gruppo" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button className="rounded border px-3" onClick={() => { if (draft) { setGroups([...groups, draft]); setDraft(""); } }}>Aggiungi</button>
          </div>
          <ul className="text-sm">
            {groups.map((g, i) => (
              <li key={i} className="flex justify-between border-b py-1">
                {g}<button className="text-red-700" onClick={() => setGroups(groups.filter((_, idx) => idx !== i))}>✕</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={save}>Salva visibilità</button>
      {msg && <p className="text-sm text-green-700">{msg}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Backend EventOut attachments** (per the note in Step 1): in `backend/app/schemas/event.py` add `attachments: list = []` to `EventOut`; in `backend/app/api/routers/events.py` `get_event`, build the response with attachments:

```python
@router.get("/{event_id}", response_model=EventOut, dependencies=[Depends(require_permission("events.read"))])
def get_event(event_id: int, db: Session = Depends(get_db)) -> EventOut:
    from app.services import attachment_service
    from app.schemas.attachment import AttachmentOut
    try:
        ev = event_service.get(db, event_id)
    except event_service.EventError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento non trovato")
    out = EventOut.model_validate(ev)
    out.attachments = [AttachmentOut.model_validate(a) for a in attachment_service.list_for_event(db, event_id)]
    return out
```

- [ ] **Step 4: Verify everything.** `cd backend && ... -m pytest -q` → all green. `cd frontend && pnpm test && pnpm build` → all green (edit page now resolves all imports).
- [ ] **Step 5: Commit.**
```bash
git add frontend/components/admin/attachment-manager.tsx frontend/components/admin/visibility-editor.tsx backend/app/schemas/event.py backend/app/api/routers/events.py
git commit -m "feat(f3): attachment manager + visibility editor + event detail attachments"
```

---

### Task C7: End-to-end verification + docs

**Files:**
- Modify: `INSTALL.md`, `docker-compose.yml` (uploads volume)

- [ ] **Step 1: Add uploads volume.** In `docker-compose.yml`, mount a named volume for `/data/uploads` on the backend service and declare it under `volumes:` (e.g. `uploads_data:/data/uploads`). Match the existing compose style.

- [ ] **Step 2: Backend e2e via curl** against a fresh RBAC+events DB (mirror the F2 verification): start the backend with `DATABASE_URL`/`SETUP_TOKEN`, create a super_admin (CLI `python -m app.cli create-admin` or via setup), login, then exercise: create category → create event → upload banner → PUT custom fields → set visibility → transition draft→published → list filter. Capture the HTTP codes. Drop the throwaway DB after.

- [ ] **Step 3: Document admin area in INSTALL.md.** Append a section:

```markdown
## Area amministrativa (F3)
Dopo il setup, l'admin accede da `/login` con le credenziali del super_admin.
Da `/admin` gestisce:
- **Categorie**: CRUD.
- **Eventi**: creazione/modifica con tutti i parametri, stati (bozza→pubblicato→sospeso/annullato→archiviato), duplica.
- **Campi custom** (form builder), **Allegati** (banner + file su volume `/data/uploads`), **Visibilità** (tutti / reparti-gruppi).

Sessione via cookie httpOnly; i file caricati risiedono sul volume `uploads_data`.
```

- [ ] **Step 4: Commit.**
```bash
git add INSTALL.md docker-compose.yml
git commit -m "docs(f3): admin area instructions + uploads volume"
```

---

## Self-Review Notes

- **Spec coverage:** §2 auth shell → A1–A4; §3 models/migration (6 tables, circular FK via `use_alter` + `create_foreign_key`, permission seed) → B2/B3; §4 APIs — categories (B5), events CRUD (B6), state machine+duplicate (B7), custom fields PUT-set (B8), attachments upload/download/delete (B9), visibility (B10); §5 UI — login/shell (A4), categories (C2), list+table (C3), forms+tabs (C4), field-builder (C5), attachment-manager+visibility-editor (C6); §6 security — cookie fallback (A1), httpOnly cookies (A2), middleware (A3), upload whitelist/random name (B9), nh3 sanitize (B4/B6), RBAC per endpoint (B5–B10); §7 tests present per task; §8 out-of-scope respected (no registration/notify/catalog enforcement).
- **Migration revision:** down_revision pinned to `0003_settings` (current head; `0004` id is unused — file named `0005_events` to avoid collision and the executor verifies the real head before writing). The 0002 seed id is `0002` and 0001 is `0001`, but the chain only needs the head, which is `0003_settings`.
- **Circular FK:** `events.banner_attachment_id` ↔ `attachments.event_id` handled by creating both tables without the cross FKs, then `create_foreign_key` for both; model uses `use_alter=True` on the banner FK so SQLAlchemy metadata also orders correctly.
- **Type/name consistency:** service function names match router calls (`event_service.transition(..., can_publish=...)`, `duplicate`, `custom_field_service.replace_set`, `attachment_service.save/get/list_for_event/delete`, `visibility_service.get_visibility/set_visibility`). Frontend `api` client methods (`get/post/patch/put/del`) used consistently; `EventRow`/`EventInput` shapes match backend `EventListItem`/`EventOut`.
- **Known commit-isolation note:** API tests set the cookie on the test client and rely on the same per-test rolled-back session as F1/F2 tests (endpoints call `db.commit()`; the fixture resets state per test). Same pattern proven green in F2.
- **Attachment list in EventOut:** added in C6 (schema field + endpoint) because `attachment-manager` reads it; `test_event_api` still green since `attachments` defaults to `[]`.
