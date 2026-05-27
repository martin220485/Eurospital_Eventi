# Design F3 — Eventi (admin) + Auth Shell

**Fase:** F3 (piano di sviluppo, sezione 5)
**Obiettivo:** Area amministrativa autenticata e gestione eventi completa lato admin. Include: (a) **auth shell** — login, sessione via cookie httpOnly, layout admin protetto; (b) **dominio eventi** — categorie, eventi con set di campi completo e macchina a stati, form builder dei campi custom, allegati su volume, regole di visibilità. Output: un amministratore accede, crea/modifica/pubblica/sospende/annulla/archivia/duplica eventi, gestisce categorie, campi custom e allegati.
**Prerequisito:** F1 (auth API + RBAC) e F2 (setup completato, super_admin esistente) già in `main`.

---

## 1. Decisioni fissate (brainstorming)

| Ambito | Scelta |
|---|---|
| Scope | F3 unico: prima auth shell (login + sessione + layout admin protetto), poi dominio eventi admin (backend + UI). |
| Campi evento | Set completo del PROMPT §77 in `events`; F3 li edita tutti, F4/F6 ne consumano la logica (capienza/waitlist/max-utente/finestra iscrizioni/promemoria sono memorizzati ora, applicati dopo). |
| Storage file | Volume Docker locale (`/data/uploads`), metadata in `attachments`. Upload multipart validato (tipo + dimensione), nome file random, download via endpoint backend con RBAC. |
| Visibilità | F3 memorizza le regole (`mode` = all/restricted + lista reparti/gruppi come stringhe). Enforcement nel catalogo in F5; sync reparti/gruppi AD in F8. |
| Token sessione | Cookie httpOnly + Secure + SameSite=Lax, settati da route handler Next. Il backend accetta l'access token da header `Authorization: Bearer` **oppure** dal cookie `access_token` (fallback). |
| Permessi | Migrazione F3 aggiunge `events.read`, `events.write`, `events.delete`, `events.publish`, `categories.write` e li concede al ruolo `super_admin`. |
| Rich text | HTML sanitizzato server-side con `nh3` prima del salvataggio (anti XSS stored). |
| CSRF | Mitigato da SameSite=Lax; token CSRF completo rinviato a F9. |

---

## 2. Architettura

Pattern invariato: `routers → services → models` (backend), Next App Router (frontend). Due sottosistemi:

1. **Auth shell** — strato sottile sopra l'auth F1, che non cambia la logica di autenticazione ma aggiunge: lettura token da cookie (backend), proxy di sessione + cookie httpOnly (Next), gate di routing (middleware Next), e le pagine login + layout admin.
2. **Dominio eventi** — nuovo modulo coeso: modelli, migrazione, servizi e router per categorie/eventi/campi custom/allegati/visibilità, più le pagine admin.

### Struttura backend (file aggiunti/modificati in F3)

```
backend/
  app/
    api/
      deps.py                  # MODIFY: get_current_user legge token da Bearer o cookie access_token
      routers/
        categories.py          # /api/categories
        events.py              # /api/events (+ transition, duplicate, fields, visibility)
        attachments.py         # /api/events/{id}/attachments, /api/attachments/{id}/download|DELETE
    core/
      config.py                # MODIFY: upload_dir (default /data/uploads), max_upload_bytes (10MB)
    models/
      event_category.py        # EventCategory
      event.py                 # Event
      event_custom_field.py    # EventCustomField
      event_custom_field_option.py  # EventCustomFieldOption
      attachment.py            # Attachment
      event_visibility.py      # EventVisibility
      __init__.py              # MODIFY: register new models
    schemas/
      category.py              # CategoryIn/Out
      event.py                 # EventIn/Out/ListItem, EventTransition
      custom_field.py          # CustomFieldIn/Out (+ options)
      attachment.py            # AttachmentOut
      visibility.py            # VisibilityIn/Out
    services/
      category_service.py
      event_service.py         # CRUD + transition (state machine) + duplicate + publish validation
      custom_field_service.py  # PUT-set of fields+options in one transaction
      attachment_service.py    # volume storage + upload validation + delete
      visibility_service.py
      html_sanitize.py         # nh3 wrapper
  alembic/versions/
    0004_events.py             # 5 tables + seed event permissions + grant to super_admin
  tests/
    test_event_models.py, test_event_state_machine.py, test_event_service.py,
    test_category_api.py, test_event_api.py, test_attachment_api.py,
    test_custom_field_api.py, test_cookie_auth.py, test_migration.py (MODIFY)
  pyproject.toml               # MODIFY: add nh3, python-multipart
```

### Struttura frontend (file aggiunti/modificati in F3)

```
frontend/
  middleware.ts                # protect /admin/* (presence of access_token cookie)
  app/
    api/session/
      login/route.ts           # POST → backend /api/auth/login, set httpOnly cookies
      refresh/route.ts         # POST → backend /api/auth/refresh, rotate cookies
      logout/route.ts          # POST → backend /api/auth/logout, clear cookies
    login/page.tsx
    admin/
      layout.tsx               # protected shell (sidebar + topbar)
      page.tsx                 # redirect → /admin/events
      events/page.tsx          # list + filters
      events/new/page.tsx      # create form
      events/[id]/page.tsx     # edit form with tabs
      categories/page.tsx      # category CRUD
  components/admin/
    sidebar.tsx, topbar.tsx, status-badge.tsx
    event-form.tsx, event-table.tsx, field-builder.tsx,
    attachment-manager.tsx, visibility-editor.tsx
  lib/
    admin-api.ts               # typed client, credentials:include, auto-refresh on 401
    event-schemas.ts           # zod schemas
  __tests__/
    event-schemas.test.ts, field-builder.test.tsx, event-table.test.tsx
```

---

## 3. Modelli dati (migrazione `0004_events`)

**`event_categories`**: `id` PK, `name` (unique, not null), `color` (str, default `#0a66c2`), `description?`, `created_at`, `updated_at`.

**`events`**:
- Base: `id` PK, `title` (not null), `slug?`, `short_description?`, `description?` (TEXT, HTML sanitizzato), `banner_attachment_id?` (FK `attachments.id`, SET NULL).
- Classificazione: `category_id?` (FK `event_categories.id`, SET NULL), `status` (str enum `draft/published/suspended/cancelled/archived`, default `draft`, not null).
- Luogo: `mode` (str enum `physical/online/hybrid`, default `physical`), `location_name?`, `address?`, `online_url?`.
- Date: `start_at` (not null), `end_at` (not null), `registration_open_at?`, `registration_close_at?`.
- Capienza: `capacity?` (int, null = illimitata), `waitlist_enabled` (bool, default false), `max_per_user` (int, default 1).
- Annullamento: `cancellation_allowed` (bool, default true), `cancellation_deadline_at?`.
- Promemoria: `reminder_config` (JSON, default `{}`, usato da F6).
- Altro: `internal_notes?`, `created_by` (FK `users.id`), `created_at`, `updated_at`.
- Indici: `(status, start_at)`, `(category_id)`.

**`event_custom_fields`**: `id` PK, `event_id` (FK `events.id`, ON DELETE CASCADE), `label` (not null), `field_type` (str enum: `text/textarea/number/email/phone/date/time/datetime/checkbox/checkbox_multi/radio/select/select_multi/file/privacy_consent`), `required` (bool, default false), `placeholder?`, `default_value?`, `validation` (JSON, default `{}`), `position` (int, default 0).

**`event_custom_field_options`**: `id` PK, `field_id` (FK `event_custom_fields.id`, ON DELETE CASCADE), `label` (not null), `value` (not null), `position` (int, default 0).

**`attachments`**: `id` PK, `event_id?` (FK `events.id`, ON DELETE CASCADE), `filename` (not null, nome originale), `stored_path` (not null, path su volume), `content_type` (not null), `size_bytes` (int, not null), `kind` (str enum `banner/attachment`, default `attachment`), `uploaded_by` (FK `users.id`), `created_at`.
> Nota FK circolare `events.banner_attachment_id` ↔ `attachments.event_id`: la migrazione crea `attachments` prima, poi `events`, poi aggiunge la FK `banner_attachment_id` con `ALTER TABLE` (o la dichiara `use_alter=True`). `banner_attachment_id` è nullable e SET NULL.

**`event_visibility`**: `id` PK, `event_id` (FK `events.id`, ON DELETE CASCADE), `mode` (str enum `all/restricted`, default `all`), `dept_or_group` (str, nullable; una riga per voce quando `restricted`).

**Seed permessi** (nella stessa migrazione, idempotente come `0002`): inserisce `events.read`, `events.write`, `events.delete`, `events.publish`, `categories.write` in `permissions` e li collega a `super_admin` in `role_permissions`. `downgrade` rimuove i collegamenti, i permessi e le tabelle (ordine inverso, rispettando le FK).

---

## 4. API backend (tutte RBAC-protette, sessione via Bearer o cookie)

**Categorie** — `/api/categories`:
| Endpoint | Permesso | Azione |
|---|---|---|
| `GET /api/categories` | events.read | lista categorie |
| `POST /api/categories` | categories.write | crea (409 su nome duplicato) |
| `PATCH /api/categories/{id}` | categories.write | modifica |
| `DELETE /api/categories/{id}` | categories.write | elimina; `409` se eventi collegati |

**Eventi** — `/api/events`:
| Endpoint | Permesso | Azione |
|---|---|---|
| `GET /api/events` | events.read | lista con filtri `status`, `category_id`, `q` (ricerca su titolo), `from`/`to` (range su `start_at`) + paginazione (`page`, `page_size`) |
| `GET /api/events/{id}` | events.read | dettaglio completo (campi custom + opzioni, visibilità, allegati, banner) |
| `POST /api/events` | events.write | crea (status forzato `draft`); `created_by` = utente corrente |
| `PATCH /api/events/{id}` | events.write | modifica campi (no cambio stato qui) |
| `POST /api/events/{id}/duplicate` | events.write | crea nuovo `draft` copiando campi base + custom fields/opzioni + visibilità (non gli allegati) |
| `POST /api/events/{id}/transition` | events.write (+ events.publish per `published`) | body `{target}`; applica state machine |
| `DELETE /api/events/{id}` | events.delete | elimina solo se `status=draft`; altrimenti `409` (usare `archived`) |

**State machine** (`event_service.transition`): transizioni consentite
`draft→published`, `published→suspended`, `suspended→published`, `published→cancelled`, `suspended→cancelled`, e `→archived` da qualsiasi stato non già `archived`. Qualsiasi altra → `422`. Il passaggio a `published` richiede il permesso `events.publish` e supera la **validazione di pubblicazione**: `title` non vuoto, `end_at > start_at`, e (se entrambe presenti) `registration_close_at >= registration_open_at` e `registration_close_at <= start_at`. Validazione fallita → `422` con dettaglio.

**Campi custom** — `/api/events/{id}/fields` (perm `events.write`, lettura `events.read`):
- `GET` lista ordinata per `position` con opzioni annidate.
- `PUT` sostituisce l'intero set: cancella i campi esistenti dell'evento e ricrea campi + opzioni nell'ordine inviato, in un'unica transazione. Valida che i tipi con opzioni (`radio/select/select_multi/checkbox_multi`) abbiano almeno un'opzione.

**Allegati** — `/api/events/{id}/attachments` (perm `events.write`):
| Endpoint | Azione |
|---|---|
| `POST` (multipart `file`, `kind`) | valida `content_type` su whitelist (`image/png,image/jpeg,image/webp,application/pdf` + office docx/xlsx), `size_bytes <= max_upload_bytes`; salva su `{upload_dir}/{uuid4}{ext}`; crea record `attachments` |
| `GET /api/attachments/{id}/download` | `events.read` + check visibilità; risponde con `FileResponse` e `Content-Disposition` |
| `DELETE /api/attachments/{id}` | `events.write`; elimina record + file dal volume (in transazione: rimuove il file solo dopo commit del record) |

Il banner si carica con `kind=banner` e si associa via `PATCH /api/events/{id}` impostando `banner_attachment_id`.

**Visibilità** — `/api/events/{id}/visibility` (perm `events.write`):
- `GET` ritorna `mode` + lista voci. `PUT` imposta `mode` (`all`/`restricted`) e rimpiazza la lista `dept_or_group` (ignorata se `all`).

**Servizi**: `category_service`, `event_service` (CRUD/transition/duplicate/publish-validation), `custom_field_service` (PUT-set), `attachment_service` (storage volume + validazione + delete sicura), `visibility_service`, `html_sanitize` (wrapper `nh3` applicato a `short_description`/`description` in create/update).

**Sicurezza upload**: nome file generato server-side (`uuid4` + estensione derivata dal content-type whitelisted, non dal nome client) → niente path traversal; file salvati fuori dal webroot; estensione/MIME validati; dimensione limitata.

---

## 5. UI admin (Next App Router)

**Sessione**: i route handler `app/api/session/*` proxano verso il backend e gestiscono i cookie httpOnly. Il client (`lib/admin-api.ts`) chiama gli endpoint backend `/api/*` con `credentials: "include"` (stessa origine dietro nginx, il cookie `access_token` viaggia automaticamente); su `401` tenta `POST /api/session/refresh` una volta e ripete, altrimenti redirect `/login`.

**Middleware** (`middleware.ts`): per richieste a `/admin/*`, se manca il cookie `access_token` → redirect `/login`. Solo gate UX; l'autorizzazione reale è server-side.

**Pagine**:
- `app/login/page.tsx` — form `identifier`+`password` (zod), POST `/api/session/login`, su successo redirect `/admin/events`.
- `app/admin/layout.tsx` — shell: `sidebar` (Eventi, Categorie), `topbar` (nome utente da `/api/auth/me`, logout → `/api/session/logout`).
- `app/admin/events/page.tsx` — `event-table`: filtri (stato, categoria, ricerca), `status-badge`, azioni per riga (modifica, duplica, transizioni pubblica/sospendi/annulla/archivia con conferma per le distruttive).
- `app/admin/events/new/page.tsx` — `event-form` (creazione).
- `app/admin/events/[id]/page.tsx` — tab: **Dettagli** (`event-form`), **Campi custom** (`field-builder`), **Allegati** (`attachment-manager`, incl. scelta banner), **Visibilità** (`visibility-editor`).
- `app/admin/categories/page.tsx` — CRUD categorie inline.

**Componenti**:
- `event-form.tsx` — tutti i campi §77; editor rich text leggero (Tiptap o textarea con toolbar minima) per le descrizioni; date/datetime picker; sezioni capienza/annullamento; stati loading/error/success.
- `field-builder.tsx` — aggiungi/rimuovi/riordina campi custom, configura tipo/obbligatorietà/placeholder/validazione e opzioni per i tipi a scelta; salva l'intero set via `PUT`.
- `attachment-manager.tsx` — upload (progress), lista, elimina, marca un'immagine come banner.
- `visibility-editor.tsx` — toggle `all`/`restricted` + lista voci reparto/gruppo.
- `lib/event-schemas.ts` — zod per event, category, custom field, visibility (mirror dei vincoli backend).

React Query per fetch/mutation e invalidazione cache.

---

## 6. Sicurezza

- RBAC verificato server-side su ogni endpoint (`require_permission`); il middleware Next è solo gate UX.
- Cookie `access_token`/`refresh_token` httpOnly + Secure + SameSite=Lax; access breve, refresh con rotazione (F1). Logout revoca il refresh lato backend e cancella i cookie.
- Backend `get_current_user`: accetta token da `Authorization: Bearer` o cookie `access_token`; nessun downgrade di sicurezza (stessa validazione JWT).
- Upload: whitelist MIME + limite dimensione + nome file random server-side + storage fuori dal webroot; download solo con permesso e check visibilità.
- HTML rich text sanitizzato server-side (`nh3`) in create/update contro XSS stored.
- Eliminazioni (evento→cascade, allegato→file) coerenti: record in transazione, file rimosso dopo commit.

---

## 7. Strategia di test

- **Backend unit (pytest)**: state machine (ogni transizione valida + illegali → `422`); validazione pubblicazione (date incoerenti → `422`); sanitizzazione HTML (script rimosso); validazione upload (MIME non in whitelist → `422`, oversize → `422`, nome random senza traversal); duplicazione (copia campi+opzioni+visibilità, non allegati, nuovo `draft`); cascade delete (eliminando evento spariscono campi/opzioni/visibilità/allegati).
- **Backend integration**: RBAC (`403` senza permesso, es. utente senza `events.write`); CRUD categorie (409 duplicato/collegato); CRUD eventi + filtri/paginazione; `PUT` set campi custom; ciclo upload→download→delete; **cookie-auth** (login via route handler simulato: chiamata con cookie `access_token` raggiunge endpoint protetto; senza cookie/bearer → `401`).
- **Frontend (vitest + RTL)**: zod schemas; `field-builder` (aggiungi/riordina/opzioni, set valido/invalido); `event-table` (filtri); e2e opzionale (Playwright, se ambiente lo consente) login→crea evento→pubblica.
- **Criteri accettazione**: ogni endpoint verifica permesso; ogni form valida client+server; ogni pagina ha stati loading/empty/error; transizioni di stato sempre validate server-side.

---

## 8. Fuori scope (rinviato)

- Iscrizioni, enforcement capienza, lista d'attesa, QR, check-in → **F4** (i campi `events` esistono, la logica no).
- Invio notifiche/promemoria reali, worker Celery → **F6** (`reminder_config` solo memorizzato).
- Enforcement della visibilità nel catalogo utente + sincronizzazione reparti/gruppi da AD → **F5/F8** (F3 memorizza solo le regole).
- Area utente: dashboard, catalogo, calendario, dettaglio pubblico, profilo → **F5**.
- Reportistica/dashboard KPI ed export → **F7**.
- Token CSRF dedicati e hardening avanzato → **F9**.
