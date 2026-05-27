# Design F2 — Setup Wizard

**Fase:** F2 (piano di sviluppo, sezione 5)
**Obiettivo:** Wizard di prima configurazione a 10 step accessibile su `/setup`. Testa connessione al MySQL esterno, applica le migrazioni Alembic a runtime (crea schema/viste/seed), crea il primo `super_admin`, configura SMTP e AD/SSO (opzionali) e i parametri base della piattaforma. Output: piattaforma configurata e pronta, con `setup_completed=true`.
**Prerequisito:** DB MySQL vuoto pre-creato dal DBA con grant sul solo quel DB (come F1). Lo schema RBAC base (migrazioni F1 `0001`/`0002`) è già applicabile; il wizard porta il DB a `head`.

---

## 1. Decisioni fissate (brainstorming)

| Ambito | Scelta |
|---|---|
| Creazione schema | Il wizard (step 4) lancia `alembic upgrade head` a runtime via API controllata. Nessuna esecuzione di SQL arbitrario o downgrade. |
| Gating accesso | `SETUP_TOKEN` da `.env`, loggato **una volta** all'avvio del backend se `setup_completed=false`. Inviato come header `X-Setup-Token` su ogni chiamata setup. |
| Auto-blocco | Quando `setup_completed=true`, tutti gli endpoint `/api/setup/*` (eccetto `/status`) rispondono `409 Setup already completed`. |
| Primo admin | Creato dallo step 5 del wizard (riusa `user_service` di F1, assegna ruolo seed `super_admin`). Il comando CLI `create-admin` resta come fallback di emergenza. |
| Step obbligatori | Solo MySQL → test → schema → admin iniziale. SMTP, AD/SSO e config base piattaforma sono **saltabili** ("Configura dopo"), configurabili in seguito dal backoffice. |
| Persistenza | Incrementale: ogni step salva subito sulla tabella singleton e aggiorna `setup_step` (wizard resume-able). `setup_completed` flippa solo allo step finale. |
| Segreti | Password SMTP/LDAP cifrate at-rest con Fernet (`core/crypto.py`, pronto da F1). Le API di lettura mascherano i valori con `****`. |

---

## 2. Architettura

Pattern layered invariato (F1): `routers (HTTP) → services (logica) → models (dati)`. Schemi Pydantic per I/O. Dependency injection per sessione DB e per la verifica del `SETUP_TOKEN`.

Il wizard è un sottosistema isolato: un router backend (`setup.py`), un service (`setup_service.py`), tre modelli singleton di configurazione, e una route frontend (`app/setup/`) indipendente dal resto dell'app. Comunica col resto del sistema solo tramite: `user_service` (creazione admin), `crypto.py` (cifratura segreti), Alembic (migrazioni).

### Struttura backend (file aggiunti in F2)

```
backend/
  app/
    core/
      config.py             # + SETUP_TOKEN (env)
    models/
      platform_settings.py  # PlatformSettings (singleton id=1)
      smtp_settings.py       # SmtpSettings (singleton id=1)
      ldap_settings.py       # LdapSettings (singleton id=1)
    schemas/
      setup.py               # SetupStatus, DbTestResult, MigrateResult, AdminCreate,
                             #   SmtpIn/Out, LdapIn/Out, PlatformIn/Out, CompleteResult
    services/
      setup_service.py       # status, test_db, run_migrations, create_first_admin,
                             #   save_smtp/test_smtp, save_ldap/test_ldap,
                             #   save_platform, complete
      settings_service.py    # get/set singleton settings (cifratura + mascheramento)
    api/
      deps.py                # + require_setup_token (header X-Setup-Token), require_setup_open
      routers/
        setup.py             # /api/setup/*
  alembic/
    versions/
      0003_settings.py       # platform_settings, smtp_settings, ldap_settings
```

### Struttura frontend (file aggiunti in F2)

```
frontend/
  app/
    setup/
      layout.tsx             # guard: GET /api/setup/status → se completed, redirect /login
      page.tsx               # stepper orchestratore (10 step), legge current_step per resume
      steps/
        01-welcome.tsx       # benvenuto + input SETUP_TOKEN (memoria sessione, non localStorage)
        02-db-config.tsx     # mostra host/db da .env (read-only) + bottone test
        03-db-test.tsx       # esito test connessione
        04-schema.tsx        # bottone "crea schema" → migrate; mostra tabelle/viste create
        05-admin.tsx         # form primo super_admin (zod) — OBBLIGATORIO
        06-smtp.tsx          # form smtp + test + [Configura dopo]
        07-ad.tsx            # form ldap + test + [Configura dopo]
        08-platform.tsx      # nome, logo, colori, lingua, timezone + [Configura dopo]
        09-summary.tsx       # riepilogo scelte
        10-done.tsx          # complete → link dashboard admin
  lib/
    setup-api.ts             # client tipizzato; inietta header X-Setup-Token
  components/
    stepper.tsx              # stepper shadcn riusabile
```

---

## 3. Modelli dati (migrazione `0003_settings`)

Tutte tabelle **singleton** (riga unica `id=1`, garantita dal service).

**`platform_settings`**
- `id` (PK, =1), `name`, `logo_url` (nullable), `primary_color`, `language` (default `it`), `timezone` (default `Europe/Rome`), `public_url` (nullable), `retention_days` (nullable), `feature_flags` (JSON), `setup_completed` (bool, default false), `setup_step` (int, default 0), `created_at`, `updated_at`.

**`smtp_settings`**
- `id` (PK, =1), `host`, `port`, `tls_mode` (enum: `none`/`starttls`/`ssl`), `from_address`, `from_name`, `username` (nullable), `password_encrypted` (LargeBinary/Text, nullable, Fernet), `created_at`, `updated_at`.

**`ldap_settings`**
- `id` (PK, =1), `server_uri`, `base_dn`, `bind_dn`, `bind_pw_encrypted` (Fernet, nullable), `user_filter`, `group_filter` (nullable), `attr_mapping` (JSON: nome/cognome/email/reparto/matricola), `users_group` (nullable), `admins_group` (nullable), `sso_enabled` (bool, default false), `created_at`, `updated_at`.

Indici: PK sufficiente (singleton). Naming convention da `db/base.py` (F1) per autogenerate stabile.

---

## 4. API `/api/setup`

Router `setup.py`. Gating:
- `require_setup_open`: se `setup_completed=true` → `409 Setup already completed` (applicato a tutti tranne `/status`).
- `require_setup_token`: header `X-Setup-Token` deve combaciare con `SETUP_TOKEN`; altrimenti `403`.

| Endpoint | Token | Azione |
|---|---|---|
| `GET /api/setup/status` | no | `{setup_completed, current_step}`. Pubblico, per redirect frontend. |
| `POST /api/setup/db/test` | sì | Test connessione MySQL con credenziali da `.env` (`SELECT 1`). Ritorna ok/errore chiaro. |
| `POST /api/setup/db/migrate` | sì | `alembic upgrade head` programmatic. Ritorna revisione applicata + elenco tabelle/viste. |
| `POST /api/setup/admin` | sì | Crea primo `super_admin` (riusa `user_service`). Idempotente: 409 se esiste già un super_admin. |
| `PUT /api/setup/smtp` | sì | Salva smtp (pw cifrata). |
| `POST /api/setup/smtp/test` | sì | Invio email di test al mittente. Skippabile. |
| `PUT /api/setup/ad` | sì | Salva ldap (pw cifrata). |
| `POST /api/setup/ad/test` | sì | Test bind LDAP (no login utente — quello arriva in F8). Skippabile. |
| `PUT /api/setup/platform` | sì | Salva config base. |
| `POST /api/setup/complete` | sì | Verifica prerequisiti (DB a `head` + super_admin esiste) → `setup_completed=true`. |

**Regole:**
- Test connessione (DB/SMTP/AD) **non** richiede salvataggio preventivo; per SMTP/AD usa i valori inviati nel body.
- Salvataggio segreti solo su `PUT` esplicito; GET di lettura (backoffice futuro) maschera con `****`.
- `/migrate` esegue solo `upgrade head` (no downgrade, no SQL arbitrario).
- `/complete` fallisce con `422` se DB non a `head` o nessun super_admin.

---

## 5. Frontend — wizard `/setup`

Next.js App Router. `layout.tsx` fa da guard: chiama `GET /api/setup/status`; se `setup_completed`, redirect a `/login`. Lo stepper (`page.tsx`) usa `current_step` da `/status` per il resume.

- `SETUP_TOKEN`: inserito allo step 1, tenuto in **memoria sessione** (state React, non `localStorage`/`cookie`), iniettato come header `X-Setup-Token` da `lib/setup-api.ts` su ogni chiamata.
- React Query per chiamate e cache; validazione form con Zod.
- Ogni step ha stati **loading / error / success** (criterio di accettazione del piano §6).
- Step saltabili (6 SMTP, 7 AD, 8 platform): bottone "Configura dopo" che avanza senza salvare.
- Design: stepper shadcn, palette azzurro/blu/bianco (PROMPT §117), responsive desktop/mobile.

---

## 6. Sicurezza

- `SETUP_TOKEN` loggato **una sola volta** all'avvio del backend e solo se `setup_completed=false`; mai loggato lato frontend.
- Endpoint setup → `409` dopo completamento: nessuna riapertura del wizard senza intervento DB/CLI.
- Segreti SMTP/LDAP cifrati Fernet at-rest; chiave da `APP_SECRET_KEY` (`.env`); GET maschera `****`; mai in chiaro nei log.
- `/api/setup/db/migrate` ristretto a `upgrade head`.
- Rate limit base su `/db/test`, `/admin`, e validazione token (anti brute-force su `SETUP_TOKEN`).
- RBAC: il primo admin riceve il ruolo `super_admin` (seed F1) con tutti i permessi.

---

## 7. Strategia di test

- **Unit (pytest):** cifratura/mascheramento segreti (`settings_service`); enforcement singleton; validazione settings; gating token (`403` senza header, `409` dopo `complete`); idempotenza creazione admin.
- **Integration:** flusso completo su MySQL container — `status` → `db/test` → `migrate` (verifica tabelle/viste presenti) → `admin` → `complete`; verifica `setup_completed=true` e blocco successivo `409`; persistenza incrementale `setup_step`.
- **Frontend:** componenti step chiave (admin form con validazione zod; stepper con resume da `current_step`; bottone "Configura dopo"); e2e opzionale (Playwright) sul percorso minimo DB → admin → done.
- **Criteri accettazione:** ogni endpoint setup verifica gating; ogni form valida client+server; ogni step ha stati loading/empty/error.

---

## 8. Fuori scope (rinviato)

- Login utente via LDAP/OIDC/SAML reale → **F8** (qui solo test bind).
- Backoffice di modifica settings post-setup → fase backoffice (le API di lettura/mascheramento sono predisposte).
- Invio notifiche reali / worker Celery → **F6** (qui solo email di test SMTP one-shot).
- Modelli eventi/iscrizioni → **F3/F4** (il wizard applica solo le migrazioni esistenti fino a F2).
