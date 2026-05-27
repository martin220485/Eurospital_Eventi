# Design F1 — Fondamenta (Identity, RBAC, Auth locale, Crypto)

**Fase:** F1 (piano di sviluppo, sezione 5)
**Obiettivo:** DB Identity & RBAC con migrazioni Alembic, autenticazione locale (login admin) con JWT + refresh revocabile, hashing Argon2id, utilità crypto at-rest, OpenAPI base. Output: schema DB applicato + `/api/auth/login` funzionante per un admin locale.
**Prerequisito deploy reale:** DB MySQL vuoto pre-creato dal DBA con grant sul solo quel DB. Dev/CI usano MySQL containerizzato (vedi sotto), prod resta esterno.

---

## 1. Decisioni fissate (brainstorming)

| Ambito | Scelta |
|---|---|
| DB dev/test | MySQL containerizzato: servizio compose profilo `dev` + service container nel job CI. Prod invariato (esterno DBA). |
| Modelli F1 | Solo Identity & RBAC: `users`, `roles`, `permissions`, `role_permissions`, `user_roles` (+ `refresh_tokens` per l'auth). Eventi/iscrizioni/settings rinviati. |
| Token sessione | Access JWT breve (~15min) + refresh opaco long-lived, revocabile, salvato hashed in DB, con rotazione. |
| Hashing password | Argon2id (argon2-cffi). |
| Bootstrap admin | Comando CLI idempotente `python -m app.cli create-admin`. |
| Seed RBAC | Data migration Alembic (catalogo permessi + ruolo `super_admin`). |

---

## 2. Architettura

Pattern layered: `routers (HTTP) → services (logica di dominio) → models/repositories (dati)`. Schemi Pydantic per I/O. Dependency injection per sessione DB, utente corrente, verifica permessi. Configurazione runtime via `pydantic-settings` (legge env). Permessi verificati **server-side a ogni richiesta** rileggendo dal DB (no fiducia nei claim del token → evita privilegi stale dopo revoca/ban).

### Struttura backend (file aggiunti in F1)

```
backend/
  app/
    core/
      config.py        # Settings (pydantic-settings): DB url da MYSQL_*, JWT_SECRET, scadenze, parametri argon2, APP_SECRET_KEY
      security.py      # Argon2id hash/verify; JWT encode/decode (HS256), gestione scadenza/firma
      crypto.py        # Fernet encrypt/decrypt segreti at-rest (chiave derivata da APP_SECRET_KEY) — pronto per F2
    db/
      base.py          # DeclarativeBase + naming_convention per constraint (autogenerate Alembic stabile)
      session.py       # engine SQLAlchemy, SessionLocal, dependency get_db
    models/
      user.py          # User
      role.py          # Role
      permission.py    # Permission
      associations.py  # tabelle role_permissions, user_roles
      refresh_token.py # RefreshToken
    schemas/
      auth.py          # LoginRequest, RefreshRequest, TokenPair
      user.py          # UserOut (con roles[], permissions[])
    services/
      auth_service.py  # authenticate, issue_tokens, refresh (rotazione), revoke
      user_service.py  # creazione utente, assegnazione ruoli, lookup permessi
      rbac.py          # risoluzione permessi utente
    api/
      deps.py          # get_db, get_current_user, require_permission(code)
      routers/
        auth.py        # /api/auth: login, refresh, logout, me
    cli.py             # comando create-admin
  alembic/
    env.py             # target_metadata = Base.metadata; url da settings
    versions/
      0001_initial_rbac.py   # tabelle Identity & RBAC + refresh_tokens
      0002_seed_rbac.py      # data migration: catalogo permessi + ruolo super_admin
  alembic.ini
```

`app/main.py` esistente (F0) viene esteso: include il router auth e registra lo schema security HTTPBearer per OpenAPI. L'endpoint `/api/health` resta invariato.

---

## 3. Schema DB (Identity & RBAC)

Engine **InnoDB**, charset **utf8mb4**. Naming convention SQLAlchemy applicata ai constraint per migrazioni deterministiche.

```
users
  id              BIGINT PK auto
  email           VARCHAR(255) UNIQUE NOT NULL
  username        VARCHAR(100) UNIQUE NOT NULL
  hashed_password VARCHAR(255) NULL          -- NULL = utente solo-SSO (F8); admin locale valorizzato (Argon2id)
  full_name       VARCHAR(255) NULL
  is_active       BOOL NOT NULL DEFAULT 1
  created_at      DATETIME NOT NULL
  updated_at      DATETIME NOT NULL
  INDEX(email), INDEX(username)

roles
  id            BIGINT PK auto
  name          VARCHAR(100) UNIQUE NOT NULL   -- es. "super_admin"
  description   VARCHAR(255) NULL

permissions
  id            BIGINT PK auto
  code          VARCHAR(100) UNIQUE NOT NULL   -- es. "users.read"
  description   VARCHAR(255) NULL

role_permissions
  role_id       BIGINT FK->roles(id) ON DELETE CASCADE
  permission_id BIGINT FK->permissions(id) ON DELETE CASCADE
  PK(role_id, permission_id)

user_roles
  user_id       BIGINT FK->users(id) ON DELETE CASCADE
  role_id       BIGINT FK->roles(id) ON DELETE CASCADE
  PK(user_id, role_id)

refresh_tokens
  id            BIGINT PK auto
  user_id       BIGINT FK->users(id) ON DELETE CASCADE
  token_hash    VARCHAR(255) UNIQUE NOT NULL   -- sha256 del token opaco; mai in chiaro
  expires_at    DATETIME NOT NULL
  revoked_at    DATETIME NULL                  -- set su logout/rotazione/ban
  created_at    DATETIME NOT NULL
  INDEX(user_id), INDEX(token_hash)

alembic_version    -- gestita da Alembic
```

**Note di modellazione:**
- `hashed_password` nullable da ora per non alterare la tabella in F8 (SSO).
- Niente flag `is_superuser`: il "superadmin" è il ruolo `super_admin` con tutti i permessi (RBAC puro).
- `refresh_tokens` aggiunto rispetto alla lista del piano per supportare la revoca.

---

## 4. Flusso auth + endpoint

### Token
- **Access JWT** (~15min, configurabile). Claims: `sub`=user_id, `iat`, `exp`, `type:"access"`. Firma **HS256** con `JWT_SECRET`. I ruoli/permessi NON sono nel token: vengono riletti dal DB a ogni richiesta.
- **Refresh** opaco: random >=32 byte base64url. In DB solo lo **sha256** (`token_hash`). TTL lungo (~7gg, configurabile). **Rotazione**: ogni `/refresh` revoca il token usato ed emette una nuova coppia.

### Endpoint (prefix `/api/auth`)

| Metodo | Path | Body / Header | Risposta | Errori |
|---|---|---|---|---|
| POST | `/login` | `{identifier, password}` (identifier = email o username) | `{access_token, refresh_token, token_type:"bearer"}` | 401 credenziali errate o utente inattivo |
| POST | `/refresh` | `{refresh_token}` | nuova coppia `{access_token, refresh_token, token_type}` (rotazione) | 401 token invalido/scaduto/revocato |
| POST | `/logout` | `{refresh_token}` | 204 No Content | 401 |
| GET | `/me` | header `Authorization: Bearer <access>` | `{id, email, username, full_name, roles[], permissions[]}` | 401 |

### Dependencies (DI)
- `get_db` — sessione SQLAlchemy per-request (chiusa a fine richiesta).
- `get_current_user` — estrae bearer, decodifica/valida JWT, carica utente dal DB, verifica `is_active`. 401 se manca/invalido.
- `require_permission("code")` — factory che ritorna una dependency: risolve i permessi dell'utente (`user_roles → role_permissions → permissions`), solleva 403 se il permesso manca.

### Sicurezza
- Login esegue **sempre** una verifica Argon2id (dummy hash se utente inesistente) → niente user-enumeration via timing.
- Messaggi di errore generici ("credenziali non valide"); 401 per auth, 403 per autorizzazione.
- Token mai loggati; refresh salvato solo hashed.
- Errori in shape JSON coerente (`{detail: "..."}`).

### OpenAPI
Schema security `HTTPBearer` registrato → `/docs` mostra "Authorize". Generazione automatica FastAPI.

---

## 5. Bootstrap admin + seed RBAC

### Seed RBAC — data migration `0002_seed_rbac`
Eseguita dopo la creazione tabelle (`0001`):
- Inserisce il **catalogo permessi** base con codici stabili. Set iniziale F1 (gestione identità): `users.read`, `users.write`, `roles.read`, `roles.write`, `permissions.read`. Cresce in fasi successive con nuove migrazioni.
- Crea il ruolo `super_admin` e lo collega a **tutti** i permessi esistenti.
- **Idempotente**: insert condizionati su `code`/`name` (no duplicati su re-run o ambienti già seminati).
- `downgrade`: rimuove ruolo e permessi seminati.

### Bootstrap admin — CLI `python -m app.cli create-admin`
- Opzioni: `--email`, `--username`, password da **prompt nascosto** oppure env `ADMIN_PASSWORD` (ambienti non interattivi/CI). Flag `--update` per aggiornare un utente esistente.
- Crea l'utente con hash **Argon2id** e gli assegna il ruolo `super_admin`.
- **Idempotente**: se l'email esiste, senza `--update` non duplica e segnala; con `--update` aggiorna password e garantisce il ruolo.
- Eseguibile in Docker: `docker compose exec backend python -m app.cli create-admin --email ... --username ...`.

Dopo `alembic upgrade head` + `create-admin`, `/api/auth/login` funziona (output F1).

---

## 6. DB dev/CI

- **docker-compose**: servizio `mysql` (immagine `mysql:8`) sotto profilo `dev` (non parte di default; prod usa l'esterno). Variabili da `.env` dedicate dev. Volume per persistenza locale.
- **`.env.example`**: aggiungere chiavi `JWT_SECRET`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`, e (per dev) `TEST_DATABASE_URL` / credenziali MySQL dev. `APP_SECRET_KEY` già presente (F0).
- **CI**: il job backend ottiene un `services: mysql:8` con healthcheck; le variabili di test puntano a quel servizio; gli step eseguono `alembic upgrade head` poi `pytest`.

---

## 7. Testing (TDD)

DB di test = MySQL reale (service CI / container dev). `conftest.py`:
- Engine verso DB di test da env (`TEST_DATABASE_URL` o MYSQL_* dedicati).
- Una volta per sessione: `alembic upgrade head` sullo schema di test.
- Per-test: transazione con rollback per isolamento.

Test:
- **crypto.py**: round-trip encrypt/decrypt Fernet; chiave da settings.
- **security.py**: Argon2 hash != password e verify ok/ko; JWT encode/decode; token scaduto e firma errata → reject.
- **auth flow** (integration, TestClient + DB test): login ok → coppia token; password errata → 401; utente inattivo → 401; `/me` con bearer → utente+ruoli+permessi; `/refresh` ruota e revoca il precedente (vecchio refresh → 401); `/logout` revoca.
- **RBAC**: endpoint protetto con `require_permission` → 200 con permesso, 403 senza.
- **migration**: `alembic upgrade head` poi `downgrade base` puliti; `0002` semina permessi + `super_admin`; re-run idempotente.
- **CLI**: `create-admin` crea utente+ruolo; re-run idempotente (e `--update`).

---

## 8. Criteri di accettazione F1
1. `alembic upgrade head` crea tutte le tabelle Identity & RBAC + `refresh_tokens` su MySQL.
2. Seed `0002`: catalogo permessi + ruolo `super_admin` (con tutti i permessi) presenti.
3. `python -m app.cli create-admin` crea l'admin locale (idempotente).
4. `/api/auth/login` → coppia token; `/api/auth/me` → utente+ruoli+permessi; `/api/auth/refresh` ruota e revoca; `/api/auth/logout` revoca.
5. Endpoint protetto da `require_permission`: 403 senza permesso, 200 con.
6. `pytest` verde su MySQL; CI verde (con service MySQL).
7. `/docs` mostra "Authorize" (HTTPBearer).

## 9. Fuori scope F1 (fasi successive)
- Setup wizard (test connessioni MySQL/SMTP/AD, seed da UI) → **F2**.
- Tabelle settings cifrate (smtp/ldap/platform) → **F2** (la util crypto è pronta in F1).
- Eventi, categorie, form builder → **F3**.
- AD/LDAP/OIDC, sync utenti → **F8**.
- audit_logs, rate limiting, GDPR → **F9**.
