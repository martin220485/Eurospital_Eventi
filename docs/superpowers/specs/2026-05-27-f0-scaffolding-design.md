# Design F0 — Scaffolding monorepo

**Fase:** F0 (piano di sviluppo, sezione 5)
**Obiettivo:** monorepo avviabile "hello-world" con `docker-compose up`, CI verde. Nessuna logica applicativa, solo struttura e infrastruttura per le fasi successive.

---

## 1. Decisioni tecniche fissate

| Ambito | Scelta | Motivazione |
|---|---|---|
| Backend runtime | **Python 3.12** | Versione stabile, supporto lungo |
| Backend deps | **uv** (pyproject.toml + uv.lock) | Risolver/installer veloce, lockfile riproducibile, ottimo in Docker multi-stage |
| Backend framework | **FastAPI + uvicorn** | Da piano: OpenAPI, Pydantic, async |
| Frontend runtime | **Node 20 LTS** | LTS stabile |
| Frontend deps | **pnpm** (pnpm-lock.yaml) | Veloce, disco efficiente, lockfile rigoroso |
| Frontend framework | **Next.js (App Router)** | Da piano |
| Routing interno | **nginx alpine nello stack** (opzione C) | Routing `/` + `/api` e security headers versionati nel repo; NPM resta semplice (un solo upstream) |
| Database | **MySQL esterno** | Da piano. DB vuoto creato dal DBA con grant sul solo quel DB; il software crea tabelle/viste (da F1 in poi). **F0 non tocca il DB.** |
| Redis + worker Celery | **Rinviati a F6** | Servono solo per notifiche/promemoria/promozione waitlist |
| CI | **GitHub Actions** | Repo già su GitHub; lint+test su push/PR |

---

## 2. Architettura F0 (runtime)

```
Browser ─HTTPS▶ NPM (.129, eventi.eurospital.it)  ── TLS + routing pubblico
                     │ HTTP upstream
                     ▼
              nginx (stack, porta host 8080)        ── routing interno + security headers
              ├── /      ──▶ frontend  (Next.js :3000)
              └── /api   ──▶ backend   (FastAPI :8000)
```

- **NPM** (esistente, fuori stack): termina TLS, instrada `eventi.eurospital.it` → `host:8080`. Non modificato in F0.
- **nginx** (stack): unico ingress dello stack. Espone porta host **8080**. Instrada path, applica security headers (CSP base, X-Frame-Options, X-Content-Type-Options, Referrer-Policy). Non termina TLS.
- **frontend**: Next.js, ascolta :3000. Home server component che fa fetch di `/api/health` e mostra lo stato.
- **backend**: FastAPI, ascolta :8000. Espone `GET /api/health` → `{"status":"ok"}`.

**Data flow hello-world:** Browser → NPM → nginx:8080 → `/` (frontend) → il frontend fetch `/api/health` → nginx → backend → `{"status":"ok"}` → reso in pagina come "backend ok".

---

## 3. Struttura cartelle creata in F0

```
Eurospital_Eventi/
├─ docker-compose.yml          # 3 servizi (frontend, backend, nginx) + healthcheck + network
├─ .env.example                # variabili: DB esterno, crypto key, URL interni (nessun segreto reale)
├─ .gitignore                  # .env, __pycache__, node_modules, .next, *.pyc
├─ README.md                   # (esistente, aggiornato)
├─ INSTALL.md                  # prerequisiti, avvio dev, avvio stack, note NPM/DB esterno
├─ docs/                       # (esistente)
├─ nginx/
│  └─ default.conf             # server :8080, location / e /api, security headers, gzip
├─ backend/
│  ├─ Dockerfile               # multi-stage: build con uv, runtime slim Python 3.12
│  ├─ pyproject.toml           # deps: fastapi, uvicorn[standard]; dev: ruff, pytest, httpx
│  ├─ uv.lock
│  ├─ app/
│  │  ├─ __init__.py
│  │  └─ main.py               # FastAPI app, GET /api/health
│  └─ tests/
│     └─ test_health.py        # asserisce 200 + {"status":"ok"}
├─ frontend/
│  ├─ Dockerfile               # multi-stage: build pnpm, runtime Node 20 standalone
│  ├─ package.json             # next, react; dev: eslint, typescript
│  ├─ pnpm-lock.yaml
│  ├─ next.config.js           # output: 'standalone'
│  ├─ tsconfig.json
│  └─ app/
│     ├─ layout.tsx
│     └─ page.tsx              # home: fetch /api/health, mostra stato backend
└─ .github/
   └─ workflows/
      └─ ci.yml                # job backend (uv + ruff + pytest), job frontend (pnpm + eslint + build)
```

---

## 4. Dettaglio componenti

### docker-compose.yml
- Network bridge unica `eventi`.
- `backend`: build `./backend`, espone :8000 interno, healthcheck su `/api/health`.
- `frontend`: build `./frontend`, espone :3000 interno, dipende da backend.
- `nginx`: build/immagine alpine, monta `nginx/default.conf`, pubblica `8080:8080`, dipende da frontend+backend.
- Nessun servizio MySQL/redis/worker.

### nginx/default.conf
- `server { listen 8080; }`
- `location /api/ { proxy_pass http://backend:8000; }`
- `location / { proxy_pass http://frontend:3000; }`
- Header proxy (`Host`, `X-Forwarded-*`) e security headers.
- gzip per asset statici.

### backend
- `app/main.py`: istanzia `FastAPI()`, router minimale con `GET /api/health`.
- Dockerfile multi-stage: stage build installa deps con `uv sync --frozen`, stage runtime copia venv + app, esegue `uvicorn app.main:app`.
- `tests/test_health.py`: usa `httpx`/`TestClient`, verifica 200 e body.

### frontend
- `app/page.tsx`: server component, fetch lato server di `http://backend:8000/api/health` (URL backend da env interna), mostra "backend ok"/"backend ko".
- Dockerfile multi-stage: build `pnpm install --frozen-lockfile` + `pnpm build`, runtime con output standalone Node 20.

### .env.example (chiavi, senza valori reali)
```
# Database esterno (DB vuoto pre-creato dal DBA)
MYSQL_HOST=
MYSQL_PORT=3306
MYSQL_DB=
MYSQL_USER=
MYSQL_PASSWORD=
# Cifratura segreti at-rest (chiave Fernet/AES) — usata da F1
APP_SECRET_KEY=
# URL interni
BACKEND_INTERNAL_URL=http://backend:8000
# Porta host esposta verso NPM
PROXY_HOST_PORT=8080
```

### .github/workflows/ci.yml
- Trigger: `push`, `pull_request`.
- Job **backend**: setup Python 3.12, install uv, `uv sync`, `ruff check`, `pytest`.
- Job **frontend**: setup Node 20 + pnpm, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm build`.

---

## 5. Error handling (F0)
- `frontend` se `/api/health` fallisce: pagina mostra "backend ko" invece di crashare (try/catch sul fetch).
- `nginx`: upstream non disponibile → 502 standard (accettabile in hello-world).
- Healthcheck compose: backend marcato unhealthy se `/api/health` non risponde.

## 6. Testing (F0)
- Backend: `pytest` su `/api/health` (200 + body corretto).
- Frontend: `pnpm build` deve compilare senza errori (smoke test build); lint pulito.
- Integrazione manuale: `docker-compose up` → aprire `http://localhost:8080` → vedere "backend ok".

---

## 7. Criteri di accettazione F0
1. `docker-compose up` avvia frontend+backend+nginx senza errori.
2. `http://<host>:8080/` mostra la home con "backend ok".
3. `http://<host>:8080/api/health` risponde `{"status":"ok"}`.
4. `pytest` passa nel backend.
5. `pnpm build` e `pnpm lint` passano nel frontend.
6. CI GitHub Actions verde su push.

## 8. Fuori scope F0 (fasi successive)
- Modelli, migrazioni Alembic, RBAC, auth → **F1**.
- Connessione reale al MySQL esterno + creazione tabelle/viste → **F1/F2**.
- Setup wizard (test connessioni, seed) → **F2**.
- Redis + worker Celery → **F6**.
