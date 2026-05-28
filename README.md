# Eurospital Eventi

Piattaforma di gestione eventi aziendali per Eurospital: dipendenti scoprono e si iscrivono agli eventi, l'amministrazione li pubblica, gestisce iscritti, presenze, notifiche e report. Docker compose orchestra frontend + backend + worker + redis + nginx; MySQL e SMTP/AD sono esterni.

## Quickstart locale

```bash
# 1. Configura ambiente
cp .env.example .env   # poi compila MYSQL_*, APP_SECRET_KEY, JWT_SECRET

# 2. Avvia stack di sviluppo (mysql container + backend + worker + redis)
docker compose --profile dev up -d

# 3. Migrazioni
docker compose exec backend uv run alembic upgrade head

# 4. Bootstrap admin
docker compose exec backend uv run python -m app.cli create-admin \
  --email admin@eurospital.it --username admin

# 5. Browser
open http://localhost:8080
```

Setup guidato alternativo: `http://localhost:8080/setup` (richiede il `SETUP_TOKEN` stampato nei log del backend al primo avvio).

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router, TS) + shadcn/ui + Tailwind |
| Backend  | FastAPI + SQLAlchemy 2 + Alembic + Pydantic |
| DB       | MySQL 8 (esterno in produzione; container in dev/CI) |
| Worker   | Celery + Redis (notifiche email) |
| Auth     | JWT cookies httpOnly + refresh rotabili; LDAP/AD opzionale |
| Proxy    | Nginx interno → NPM esterno (TLS su `eventi.eurospital.it`) |

## Funzionalità (F0-F9 completate)

- **F1** identità & RBAC (Argon2id, JWT, refresh token revocabili)
- **F2** wizard setup (test connessione MySQL/SMTP/LDAP, settings cifrate)
- **F3** dominio eventi: categorie, campi custom, allegati, visibilità
- **F4** iscrizioni: capienza, lista d'attesa, check-in via QR
- **F5** area dipendente: catalogo, calendario (mese/sett/giorno/lista), profilo
- **F6** notifiche email: worker Celery, template Jinja sandbox, log, retry
- **F7** report & dashboard: KPI, report evento, export CSV (UTF-8 BOM)
- **F8** AD/LDAP: bind login + sync utenti + role mapping + visibility ristretta
- **F9** sicurezza & GDPR: rate limit auth, security headers, audit log, export/anonymize, retention CLI

## Test

```bash
# Backend
cd backend && uv sync && \
  TEST_DATABASE_URL=mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test \
  APP_SECRET_KEY=$(openssl rand -hex 16) \
  JWT_SECRET=$(openssl rand -hex 32) \
  uv run pytest

# Frontend
cd frontend && pnpm install && pnpm test && pnpm build
```

Pipeline CI: `.github/workflows/ci.yml` (lint + test su ogni push/PR).

## Documentazione

- [`INSTALL.md`](INSTALL.md) — setup, configurazione, deploy produzione, backup/restore.
- [`docs/PIANO_DI_SVILUPPO.md`](docs/PIANO_DI_SVILUPPO.md) — architettura e piano fasi.
- [`docs/PROMPT.md`](docs/PROMPT.md) — brief originale.
- [`docs/superpowers/specs/`](docs/superpowers/specs/) — design spec per fase.
- [`docs/superpowers/plans/`](docs/superpowers/plans/) — piani implementativi TDD.
- [`scripts/`](scripts/) — backup/restore MySQL.

## Operatività

| Cosa | Come |
|---|---|
| Healthcheck base | `GET /api/health` |
| Healthcheck DB + Redis | `GET /api/health/detailed` |
| Backup MySQL | `./scripts/backup-mysql.sh /var/backups/eventi` (cron giornaliero) |
| Restore | `./scripts/restore-mysql.sh /var/backups/eventi/eventi-YYYYMMDD-HHMMSS.sql.gz` |
| Pulizia audit log | `docker compose exec backend uv run python -m app.cli cleanup-audit-logs` |
| Aggiunta admin | `... uv run python -m app.cli create-admin --email ... --username ...` |
