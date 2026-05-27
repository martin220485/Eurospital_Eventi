# F0 Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an avviabile "hello-world" monorepo (frontend + backend + nginx) that runs with `docker-compose up` and passes CI.

**Architecture:** Three Docker services on one bridge network. nginx (alpine) is the only ingress, exposes host port 8080 for the existing NPM upstream, routes `/`→Next.js frontend (:3000) and `/api`→FastAPI backend (:8000) and sets security headers. Backend exposes `GET /api/health`. Frontend home server-component fetches it and shows backend status. No DB, no redis, no worker in F0.

**Tech Stack:** Python 3.12 + uv + FastAPI + uvicorn (backend), Node 20 LTS + pnpm + Next.js App Router (frontend), nginx alpine, GitHub Actions CI.

**Reference spec:** `docs/superpowers/specs/2026-05-27-f0-scaffolding-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `.gitignore` | exclude secrets/build artifacts |
| `.env.example` | document env keys (no real secrets) |
| `backend/pyproject.toml` | backend deps + tool config (ruff, pytest) |
| `backend/app/main.py` | FastAPI app + `/api/health` |
| `backend/tests/test_health.py` | health endpoint test |
| `backend/Dockerfile` | multi-stage uv build, runtime Python 3.12 |
| `frontend/package.json` | frontend deps + scripts |
| `frontend/next.config.js` | standalone output |
| `frontend/tsconfig.json` | TS config |
| `frontend/app/layout.tsx` | root layout |
| `frontend/app/page.tsx` | home: fetch `/api/health`, show status |
| `frontend/Dockerfile` | multi-stage pnpm build, Node 20 standalone runtime |
| `nginx/default.conf` | routing `/` + `/api`, security headers |
| `docker-compose.yml` | 3 services + healthcheck + network |
| `.github/workflows/ci.yml` | backend + frontend lint/test jobs |
| `INSTALL.md` | setup/run instructions |

---

## Task 1: Repo root config files

**Files:**
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Write `.gitignore`**

```gitignore
# Secrets
.env
.env.*
!.env.example

# Python
__pycache__/
*.py[cod]
.venv/
.pytest_cache/
.ruff_cache/

# Node / Next
node_modules/
.next/
.pnpm-store/

# Misc
.DS_Store
*.log
```

- [ ] **Step 2: Write `.env.example`**

```dotenv
# Database esterno (DB vuoto pre-creato dal DBA, grant sul solo quel DB)
MYSQL_HOST=
MYSQL_PORT=3306
MYSQL_DB=
MYSQL_USER=
MYSQL_PASSWORD=

# Cifratura segreti at-rest (chiave Fernet) — usata da F1 in poi
APP_SECRET_KEY=

# URL interni stack
BACKEND_INTERNAL_URL=http://backend:8000

# Porta host esposta verso NPM
PROXY_HOST_PORT=8080
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore .env.example
git commit -m "chore(f0): add gitignore and env example"
```

---

## Task 2: Backend project + health endpoint (TDD)

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Test: `backend/tests/__init__.py`, `backend/tests/test_health.py`

- [ ] **Step 1: Write `backend/pyproject.toml`**

```toml
[project]
name = "eurospital-eventi-backend"
version = "0.1.0"
description = "Eurospital Eventi backend (FastAPI)"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
]

[dependency-groups]
dev = [
    "ruff>=0.8",
    "pytest>=8.3",
    "httpx>=0.27",
]

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 2: Create package files**

Create empty `backend/app/__init__.py` and `backend/tests/__init__.py`.

- [ ] **Step 3: Write the failing test**

`backend/tests/test_health.py`:

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 4: Sync deps and run test to verify it fails**

Run:
```bash
cd backend && uv sync
uv run pytest tests/test_health.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.main'` (main.py not created yet).

- [ ] **Step 5: Write minimal implementation**

`backend/app/main.py`:

```python
from fastapi import FastAPI

app = FastAPI(title="Eurospital Eventi API")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 6: Run test to verify it passes**

Run:
```bash
cd backend && uv run pytest tests/test_health.py -v
```
Expected: PASS (1 passed).

- [ ] **Step 7: Run ruff**

Run:
```bash
cd backend && uv run ruff check .
```
Expected: "All checks passed!"

- [ ] **Step 8: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock backend/app backend/tests
git commit -m "feat(f0): backend FastAPI with /api/health endpoint"
```

---

## Task 3: Backend Dockerfile

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

- [ ] **Step 1: Write `backend/.dockerignore`**

```
.venv
__pycache__
.pytest_cache
.ruff_cache
tests
```

- [ ] **Step 2: Write `backend/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS build
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY app ./app

FROM python:3.12-slim-bookworm AS runtime
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1
COPY --from=build /app/.venv /app/.venv
COPY --from=build /app/app /app/app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 3: Build to verify**

Run:
```bash
cd backend && docker build -t eventi-backend:f0 .
```
Expected: build succeeds, image created.

- [ ] **Step 4: Smoke-run the container**

Run:
```bash
docker run --rm -d -p 8000:8000 --name eventi-be-test eventi-backend:f0
sleep 2
curl -s http://localhost:8000/api/health
docker stop eventi-be-test
```
Expected: `{"status":"ok"}`.

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore
git commit -m "feat(f0): backend multi-stage Dockerfile (uv)"
```

---

## Task 4: Frontend project + home page

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/next.config.js`
- Create: `frontend/tsconfig.json`
- Create: `frontend/next-env.d.ts`
- Create: `frontend/app/layout.tsx`
- Create: `frontend/app/page.tsx`
- Create: `frontend/.eslintrc.json`

- [ ] **Step 1: Write `frontend/package.json`**

```json
{
  "name": "eurospital-eventi-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "15.1.3",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  },
  "devDependencies": {
    "@types/node": "22.10.2",
    "@types/react": "19.0.2",
    "@types/react-dom": "19.0.2",
    "eslint": "9.17.0",
    "eslint-config-next": "15.1.3",
    "typescript": "5.7.2"
  }
}
```

- [ ] **Step 2: Write `frontend/next.config.js`**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
};

module.exports = nextConfig;
```

- [ ] **Step 3: Write `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write `frontend/next-env.d.ts`**

```typescript
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 5: Write `frontend/.eslintrc.json`**

```json
{
  "extends": "next/core-web-vitals"
}
```

- [ ] **Step 6: Write `frontend/app/layout.tsx`**

```tsx
import type { ReactNode } from "react";

export const metadata = {
  title: "Eurospital Eventi",
  description: "Event booking platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Write `frontend/app/page.tsx`**

```tsx
const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? "http://backend:8000";

async function getBackendStatus(): Promise<string> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, { cache: "no-store" });
    if (!res.ok) return "backend ko";
    const data = (await res.json()) as { status?: string };
    return data.status === "ok" ? "backend ok" : "backend ko";
  } catch {
    return "backend ko";
  }
}

export default async function Home() {
  const status = await getBackendStatus();
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>Eurospital Eventi</h1>
      <p>{status}</p>
    </main>
  );
}
```

- [ ] **Step 8: Install deps, lint, build to verify**

Run:
```bash
cd frontend && pnpm install
pnpm lint
pnpm build
```
Expected: lint clean, build compiles (Creating an optimized production build … success).

- [ ] **Step 9: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/next.config.js \
  frontend/tsconfig.json frontend/next-env.d.ts frontend/.eslintrc.json frontend/app
git commit -m "feat(f0): frontend Next.js home with backend health check"
```

---

## Task 5: Frontend Dockerfile

**Files:**
- Create: `frontend/Dockerfile`
- Create: `frontend/.dockerignore`

- [ ] **Step 1: Write `frontend/.dockerignore`**

```
node_modules
.next
.pnpm-store
```

- [ ] **Step 2: Write `frontend/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1

FROM node:20-slim AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:20-slim AS build
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: Create empty `frontend/public/.gitkeep`**

The Dockerfile copies `public`; ensure it exists.

```bash
mkdir -p frontend/public && touch frontend/public/.gitkeep
```

- [ ] **Step 4: Build to verify**

Run:
```bash
cd frontend && docker build -t eventi-frontend:f0 .
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/Dockerfile frontend/.dockerignore frontend/public/.gitkeep
git commit -m "feat(f0): frontend multi-stage Dockerfile (pnpm standalone)"
```

---

## Task 6: nginx routing config

**Files:**
- Create: `nginx/default.conf`

- [ ] **Step 1: Write `nginx/default.conf`**

```nginx
server {
    listen 8080;
    server_name _;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://frontend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

- [ ] **Step 2: Validate config syntax**

Run:
```bash
docker run --rm -v "$PWD/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine nginx -t
```
Expected: "syntax is ok" / "test is successful".

- [ ] **Step 3: Commit**

```bash
git add nginx/default.conf
git commit -m "feat(f0): nginx internal routing and security headers"
```

---

## Task 7: docker-compose

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  backend:
    build: ./backend
    expose:
      - "8000"
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"]
      interval: 10s
      timeout: 3s
      retries: 5
    networks:
      - eventi

  frontend:
    build: ./frontend
    environment:
      BACKEND_INTERNAL_URL: http://backend:8000
    expose:
      - "3000"
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - eventi

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    ports:
      - "${PROXY_HOST_PORT:-8080}:8080"
    depends_on:
      - frontend
      - backend
    networks:
      - eventi

networks:
  eventi:
    driver: bridge
```

- [ ] **Step 2: Validate compose config**

Run:
```bash
docker compose config
```
Expected: prints resolved config, no errors.

- [ ] **Step 3: Bring the stack up and verify end-to-end**

Run:
```bash
docker compose up -d --build
sleep 5
curl -s http://localhost:8080/api/health
curl -s http://localhost:8080/ | grep -o "backend ok"
docker compose down
```
Expected: `{"status":"ok"}` from `/api/health`, and `backend ok` found in home HTML.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(f0): docker-compose with frontend, backend, nginx"
```

---

## Task 8: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
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
      - name: Test
        run: uv run pytest -v

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm
          cache-dependency-path: frontend/pnpm-lock.yaml
      - name: Install deps
        run: pnpm install --frozen-lockfile
      - name: Lint
        run: pnpm lint
      - name: Build
        run: pnpm build
```

- [ ] **Step 2: Validate YAML locally**

Run:
```bash
python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"
```
Expected: `yaml ok`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(f0): GitHub Actions backend and frontend jobs"
```

---

## Task 9: INSTALL.md and README update

**Files:**
- Create: `INSTALL.md`
- Modify: `README.md`

- [ ] **Step 1: Write `INSTALL.md`**

```markdown
# INSTALL — Eurospital Eventi

## Prerequisiti
- Docker + Docker Compose
- Per sviluppo locale senza Docker: Python 3.12 + uv, Node 20 + pnpm

## Configurazione
1. Copia `.env.example` in `.env` e compila i valori (DB esterno fornito dal DBA, `APP_SECRET_KEY`).
   Il DB MySQL deve essere un database vuoto pre-creato dal DBA, con grant sull'utente applicativo solo su quel DB.
2. `.env` non va committato (vedi `.gitignore`).

## Avvio stack (Docker)
```bash
docker compose up -d --build
```
- App esposta su `http://<host>:8080` (porta configurabile con `PROXY_HOST_PORT`).
- L'NPM esistente fa upstream verso questa porta per `eventi.eurospital.it` (TLS gestito da NPM).
- Health backend: `http://<host>:8080/api/health` → `{"status":"ok"}`.

Stop: `docker compose down`.

## Sviluppo locale (senza Docker)
Backend:
```bash
cd backend && uv sync && uv run uvicorn app.main:app --reload --port 8000
```
Frontend:
```bash
cd frontend && pnpm install && pnpm dev
```

## Test
- Backend: `cd backend && uv run pytest`
- Frontend: `cd frontend && pnpm lint && pnpm build`

## Note infrastruttura
- F0 non usa MySQL/redis/worker: solo frontend + backend + nginx.
- Redis + worker Celery arrivano in F6 (notifiche).
- nginx dello stack fa solo routing interno e security headers; non termina TLS.
```

- [ ] **Step 2: Update `README.md`**

Replace its content with:

```markdown
# Eurospital Eventi

Piattaforma di prenotazione eventi (Next.js + FastAPI + MySQL), containerizzata con Docker.

- Documentazione: `docs/PIANO_DI_SVILUPPO.md`, `docs/PROMPT.md`
- Setup e avvio: `INSTALL.md`

Stato: **F0 (scaffolding)** — stack avviabile hello-world.
```

- [ ] **Step 3: Commit**

```bash
git add INSTALL.md README.md
git commit -m "docs(f0): add INSTALL and update README"
```

---

## Acceptance Criteria (verify at end of F0)
1. `docker compose up -d --build` starts frontend+backend+nginx, no errors.
2. `http://<host>:8080/` shows home with "backend ok".
3. `http://<host>:8080/api/health` returns `{"status":"ok"}`.
4. `cd backend && uv run pytest` passes.
5. `cd frontend && pnpm lint && pnpm build` pass.
6. CI green on push (both jobs).
