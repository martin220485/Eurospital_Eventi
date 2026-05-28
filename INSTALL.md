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

## Prima configurazione (setup wizard)
Al primo avvio la piattaforma parte non configurata: lo schema applicativo (eventi,
iscrizioni, impostazioni) e il primo amministratore si creano dal wizard.

1. Avvia lo stack: `docker compose up -d`.
2. Leggi il `SETUP TOKEN` dai log del backend (loggato a ogni avvio finché il setup non è completo):
   `docker compose logs backend | grep "SETUP TOKEN"`.
3. Apri `https://eventi.eurospital.it/setup`.
4. Inserisci il token, testa la connessione al MySQL esterno, crea lo schema (applica le
   migrazioni), crea l'amministratore (`super_admin`).
5. SMTP, AD/SSO e configurazione base sono opzionali ("Configura dopo"): si impostano poi dal backoffice.
6. Al termine il wizard si blocca (gli endpoint `/api/setup/*` rispondono `409`) e la
   piattaforma reindirizza al login.

> Il `SETUP_TOKEN` si imposta in `.env`; in mancanza usa un default di sviluppo non sicuro.
> Fallback di emergenza per creare un admin senza wizard: `python -m app.cli create-admin`.

## Area amministrativa (F3)
Dopo il setup, l'admin accede da `/login` con le credenziali del super_admin.
Da `/admin` gestisce:
- **Categorie**: CRUD.
- **Eventi**: creazione/modifica con tutti i parametri, stati (bozza→pubblicato→sospeso/annullato→archiviato), duplica.
- **Campi custom** (form builder), **Allegati** (banner + file su volume `/data/uploads`), **Visibilità** (tutti / reparti-gruppi).

Sessione via cookie httpOnly (route handler Next `/api/session/*`); i file caricati risiedono sul volume `uploads_data`.

## Iscrizioni e check-in (F4)
- Dalla pagina evento (`/admin/events/{id}`), tab **Iscritti**: elenco iscritti con stato, iscrizione manuale (per ID utente), annulla, promuovi (lista d'attesa), segna no-show, QR per iscrizione.
- Pagina **Check-in** (`/admin/checkin`): l'operatore (ruolo `checkin_operator`) incolla/scansiona il token QR del partecipante per registrare la presenza (`attended`).
- Capienza e `max_per_user` sono applicati lato server con lock dell'evento (niente overbooking); la lista d'attesa promuove automaticamente alla cancellazione di un confermato. Le email di conferma/promozione arrivano in F6.

## Area dipendente (F5)
- I dipendenti (ruolo `employee`, senza permessi admin) accedono da `/login` e atterrano su `/app` (lo staff con permessi va su `/admin`).
- `/app`: dashboard, **Catalogo** (eventi pubblicati a visibilità "tutti"), **Calendario** (mese/settimana/giorno/lista), scheda evento con **iscrizione** (campi custom + consensi) e **ricevuta/QR**, **Le mie iscrizioni** (futuri/passati/annullati, annulla), **Profilo** (cambio password).
- Gli eventi a visibilità ristretta restano nascosti finché l'integrazione AD (F8) non fornisce reparti/gruppi. Le email di conferma arrivano in F6.

## Notifiche email (F6)
- Stack include **Redis** (`redis:7-alpine`, volume `redis_data`, healthcheck `redis-cli ping`) e **worker Celery** (`celery -A app.workers.celery_app worker`, concurrency=2). Avvio: `docker compose up -d redis worker backend`.
- Variabili: `REDIS_URL=redis://redis:6379/0` (default), `CELERY_BROKER_URL` override opzionale. Worker e backend leggono `APP_SECRET_KEY` per decifrare SMTP via Fernet.
- Trigger automatici: iscrizione confermata → `registration_confirmed`; in lista d'attesa → `registration_waitlisted`; annullamento → `registration_cancelled`; promozione da waitlist (auto su cancel di un confermato, o admin manuale) → `registration_promoted`. Enqueue dopo `db.commit()`; errori broker loggati ma non bloccano la request.
- Retry: Celery autoretry 3 volte con backoff esponenziale su `OSError`/`SMTPException`. Ogni tentativo scrive una riga in `notification_logs` con `attempts`, `status` (`pending`/`sent`/`failed`), `error_text`.
- Configurazione SMTP: via wizard `/setup` (F2) o `/admin/settings/smtp` — host, port, tls_mode (`starttls`/`ssl`/`none`), from, username, password (cifrata at-rest).
- Editor template: `/admin/notifications` → "Modifica" su un template apre l'editor (`subject`, `body_html` Jinja2 sandbox, placeholder `{{ user.full_name }}`, `{{ event.title }}`, `{{ event.start_at }}`, `{{ event.location }}`, `{{ registration.id }}`). HTML salvato sanitizzato con `nh3`. Anteprima in iframe `sandbox=""`.
- Log invii: `/admin/notifications/logs` — filtri stato/template, paginazione, **Rinvia** per riga.
- Permesso `notifications.manage` necessario (seed automatico su ruolo `super_admin`).

## Report & dashboard (F7)
- `/admin` mostra dashboard KPI: eventi totali / pubblicati / prossimi, iscrizioni per stato, tasso partecipazione, grafico iscrizioni per mese (ultimi 12), top eventi (90gg). Filtri periodo via querystring (`?date_from=YYYY-MM-DD&date_to=...`) o link rapidi 30g/90g/anno.
- Tab **Report** nella scheda evento `/admin/events/[id]`: cards per stato (confermati/in attesa/annullati/presenti/no-show/partecipazione), pulsante **Esporta CSV iscritti**, summary campi custom (select/multiselect/radio).
- Export CSV globale: `GET /api/admin/reports/registrations.csv?event_id?&date_from?&date_to?` (UTF-8 BOM, Excel-friendly).
- Endpoint API: `/api/admin/reports/{kpis,events/{id},events/{id}/registrations.csv,registrations.csv}`.
- Permesso `reports.read` richiesto (seed automatico su `super_admin`).
- Out of scope F7: report per reparto (richiede F8 AD), export PDF/Excel (rinviati a F10/F7-stretch), report schedulati.

## AD/LDAP (F8)
- Pagina `/admin/settings/ldap`: configurazione (server URI, base DN, bind DN+password cifrata, user_filter, attr_mapping JSON, gruppi utenti/admin), pulsante **Test connessione**, toggle **SSO attivo**.
- Quando `sso_enabled=true`, il login `/login` prova prima il bind LDAP; in caso di successo l'utente è creato/aggiornato automaticamente come `auth_source='ldap'` con `ldap_groups`, `department`, `ldap_dn`. Utenti `auth_source='local'` (admin di emergenza) restano attivi col fallback password locale.
- Mapping attributi di default (Active Directory): `{username: sAMAccountName, email: mail, full_name: displayName, department: department, groups: memberOf}` — override nel JSON.
- Mapping ruoli: membro di `admins_group` → ruolo locale `super_admin`; membro di `users_group` → ruolo locale `employee` (default).
- Sync manuale dal pannello: **Anteprima** mostra attrs/gruppi/ruoli senza scrivere; **Sync utente** crea/aggiorna; **Sync tutti gli utenti del gruppo** itera i membri del `users_group`.
- Visibility eventi ristretti: utenti AD con `ldap_groups`/`department` matchante un record di `event_visibility` (mode=restricted) vedono l'evento nel catalogo; utenti locali continuano a non vedere gli eventi ristretti (compat F5).
- Permesso `users.ldap_sync` richiesto per tutti gli endpoint admin LDAP. Out of scope F8: OIDC, SAML, sync schedulato, custom group→role mapping oltre ai due slot.

## Sicurezza & GDPR (F9)
- **Rate limit** auth: 10 tentativi / 15 min per IP su `/api/auth/login` e `/api/auth/refresh` (config `RATE_LIMIT_AUTH_MAX`, `RATE_LIMIT_AUTH_WINDOW`). Sliding-window Redis (riusa il broker F6). Se Redis non risponde → fail-open con warning a log.
- **Security headers** globali su ogni response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), microphone=(), camera=()`, `Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'`. HSTS gestito a livello NPM upstream.
- **Audit log**: tabella `audit_logs(actor_id, action, target_type, target_id, ip, user_agent, payload, created_at)`. Eventi auditati (espandibile): `auth.login.success`, `auth.login.fail`, `auth.refresh`, `auth.refresh.fail`, `auth.logout`, `user.anonymize`. Lista admin: `/admin/audit` (permesso `users.admin`).
- **GDPR export self** (Art. 15): `GET /api/me/data-export` ritorna JSON con profilo, iscrizioni+answers, log notifiche (ultimi 100), audit log (ultimi 200). Pulsante "Esporta i miei dati" su `/app/profile`.
- **GDPR anonymize** (Art. 17): `POST /api/admin/users/{id}/anonymize` rimuove PII (email/username/full_name/department/ldap_*) sostituendo con placeholder e disattiva l'account; le iscrizioni e gli audit log restano. Disponibile da `/admin/audit` (form). Permesso `users.admin`.
- **Retention**: variabile `AUDIT_LOG_RETENTION_DAYS` (default 730). Pulizia manuale: `uv run python -m app.cli cleanup-audit-logs [--days N]` (eseguibile via cron).
- Consensi GDPR già supportati dai form di iscrizione (F4) tramite campi custom `consent_*`.

## Test
- Backend: `cd backend && TEST_DATABASE_URL=mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test uv run pytest`
- Frontend: `cd frontend && pnpm test && pnpm build`

## Note infrastruttura
- F0 non usa MySQL/redis/worker: solo frontend + backend + nginx.
- Redis + worker Celery integrati in F6 (notifiche).
- nginx dello stack fa solo routing interno e security headers; non termina TLS.

---

## Deploy produzione (F10)

### 1. Prerequisiti server

- Host Linux con Docker + Docker Compose v2.
- MySQL 8 esterno (DBA crea il database vuoto + grant `ALL` sul solo DB applicativo).
- Accesso di rete (firewall/VPN) dai container al MySQL, allo SMTP aziendale, all'AD/LDAP.
- DNS `eventi.eurospital.it` puntato all'NPM esistente su `.129`.
- NPM configurato per fare upstream HTTP a `host:PROXY_HOST_PORT` (default `8080`).

### 2. Configurazione `.env` produzione

Genera valori robusti:

```bash
APP_SECRET_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
SETUP_TOKEN=$(openssl rand -hex 16)
```

Compila `MYSQL_*` (host, user, password, db), `SMTP_*`, `REDIS_URL=redis://redis:6379/0`. Mai committare `.env`.

### 3. Avvio stack

```bash
docker compose pull          # se usi tag versionati
docker compose up -d --build
docker compose exec backend uv run alembic upgrade head
docker compose exec backend uv run python -m app.cli create-admin \
  --email admin@eurospital.it --username admin
```

Verifica `GET https://eventi.eurospital.it/api/health/detailed` → `{"status":"ok","checks":{"db":"ok","redis":"ok"}}`.

### 4. Backup & restore

Dump giornaliero:

```bash
# /etc/cron.d/eurospital-eventi-backup
30 2 * * * eventi /opt/eurospital-eventi/scripts/backup-mysql.sh /var/backups/eventi >> /var/log/eventi-backup.log 2>&1
```

Lo script ruota tenendo gli ultimi 14 dump. Esportarlo su storage remoto (rsync/S3) per disaster recovery off-site.

Restore (in finestra di manutenzione, con worker fermo):

```bash
docker compose stop worker backend
./scripts/restore-mysql.sh /var/backups/eventi/eventi-YYYYMMDD-HHMMSS.sql.gz
docker compose start backend worker
```

### 5. Manutenzione ricorrente

| Cosa | Quando |
|---|---|
| `cleanup-audit-logs` | settimanale (cron) |
| Rotazione `JWT_SECRET` | annuale (richiede logout forzato di tutti) |
| Update immagini base | mensile + dopo CVE rilevanti |
| Verifica backup ripristinabili | trimestrale (test su DB stage) |

### 6. Monitoraggio

- `GET /api/health` per liveness/readiness in Docker compose (già configurato).
- `GET /api/health/detailed` per check DB + Redis ad uso monitoring.
- Log strutturati su stdout: integrare con journald / Loki / Grafana se disponibili.
- Alert su: `/api/health/detailed` ≠ ok, queue Celery in errore prolungato, percentuale `notification_logs.status='failed'` > soglia.

### 6.bis Variante "lab" su stesso host del DB (compose.prod.yml)

Quando il MySQL non è un server esterno ma un **altro container Docker** sullo
stesso host (es. setup di lab), usa `docker-compose.prod.yml` invece del file
standard. Differenze:
- `backend`, `worker`, `beat` partecipano alla rete docker esistente del MySQL
  (nominata `mysql_shared`/`eurospital_eventi_eventi`) per risolverlo via DNS
  service-name.
- `frontend`, `nginx`, `redis` restano sulla **sola** rete interna `eventi`
  (multi-NIC produce 502 perché Next.js bind solo su una interfaccia).

Avvio:
```bash
docker compose -p eventi-prod -f docker-compose.prod.yml up -d --build
```

In `.env`: `MYSQL_HOST=<nome-container-mysql>` (es. `eurospital_eventi-mysql-1`),
`MYSQL_PORT=3306`.

### 7. Smoke test post-deploy

1. `GET /api/health/detailed` → `db: ok, redis: ok`.
2. Login admin via `/login` → atterra su `/admin`.
3. Crea evento di test draft → publish → registra utente fittizio → cancella → riceve email conferma + cancellazione (verifica casella).
4. Verifica `/admin/audit` mostra le voci dei passi sopra.
5. Esporta CSV iscritti su evento di test.
