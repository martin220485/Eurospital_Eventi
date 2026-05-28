# Design F6 — Notifiche (worker, email, template)

**Fase:** F6 (piano di sviluppo, sezione 5)
**Obiettivo:** Sistema di notifiche email asincrono: worker Celery + Redis, template editabili in backoffice, invii automatici su eventi del dominio (conferma iscrizione, annullamento, promozione waitlist), log esiti con retry, e API/UI admin per consultare/rinviare. Output: il dipendente che si iscrive riceve email di conferma; al cancel riceve email di annullamento; quando si libera un posto e viene promosso dalla waitlist riceve l'email di conferma. Tutti gli invii sono tracciati in `notification_logs`.
**Prerequisito:** F2 (`smtp_settings` cifrate via Fernet + endpoint test SMTP), F3 (eventi), F4 (registrations: register/cancel + waitlist), F5 (catalog/area utente) già in `main`.

---

## 1. Decisioni fissate (brainstorming)

| Ambito | Scelta |
|---|---|
| Broker | **Redis 7** come servizio compose (`redis:7-alpine`), `appendonly yes`, volume `redis_data`. Stessa rete `eventi`. Non esposto su host (solo rete interna). |
| Worker | **Celery 5** (`celery[redis]`), processo separato `worker` nello stack compose, stessa immagine backend, comando `celery -A app.workers.celery_app worker -l info`. Concorrenza default (prefork, 2 worker). Beat **rinviato** (promemoria F6-stretch o F7). |
| Trigger invii | Il `registration_service` (F4) **enqueua** un task Celery al termine di ogni transizione che richiede notifica (register→confirmed, register→waitlisted, cancel, promote waitlist→confirmed). Niente trigger DB, niente polling. La transazione DB committa prima dell'enqueue (after-commit hook semplice: enqueue dopo `db.commit()` nel router/service). |
| Template | Tabella `notification_templates` con `code` univoco (`registration_confirmed`, `registration_cancelled`, `registration_waitlisted`, `registration_promoted`), `subject` e `body_html` con placeholder `{{user.full_name}}`, `{{event.title}}`, `{{event.start_at}}`, `{{event.location}}`, `{{registration.id}}`. Rendering Jinja2 sandboxed (`jinja2.sandbox.SandboxedEnvironment`). Seed di 4 template di base via migrazione. CRUD via API admin `/api/admin/notification-templates` (permesso `notifications.manage`). |
| Invio | SMTP via `smtplib` standard library; legge `smtp_settings` (F2), password decifrata con Fernet. TLS modes: `starttls` (default), `ssl`, `none`. From: `from_address` + `from_name` da settings. To: `users.email`. Niente attachments in F6 (rinviati). |
| Log | Tabella `notification_logs(id, template_code, registration_id?, user_id, to_address, subject, status enum(sent,failed), error_text?, attempts, sent_at?, created_at)`. Una riga per tentativo finale di un task (Celery autoretry crea righe diverse? no — una riga aggiornata: status=`failed` finché ok, poi `sent`). Indici `(user_id, created_at)`, `(status, created_at)`. |
| Retry | Celery autoretry: 3 tentativi con backoff esponenziale (10s, 60s, 300s) su `SMTPException`/`OSError`. Dopo l'ultimo: log `failed`. |
| Admin UI (frontend) | Pagina `/admin/notifications` con due tab: **Template** (lista+editor con preview) e **Log** (tabella ultimi N con filtri user/status/template). Rinvio manuale dal log (`POST /api/admin/notification-logs/{id}/resend`). |
| Permessi | Nuovo permesso `notifications.manage` (seed via migrazione) assegnato al ruolo `super_admin`. Tutti gli endpoint admin notifiche dietro `require_permission('notifications.manage')`. Il dipendente non vede l'area. |
| Out of scope F6 | Promemoria schedulati (beat), notifiche mirate "broadcast" ad una lista, preferenze utente notifiche, SMS/push, attachments ICS. |

---

## 2. Architettura

Worker isolato, comunicazione via Redis. Il backend produce task; il worker consuma. Stesso codice Python condiviso (modelli, settings, SMTP). Niente HTTP circolare.

```
┌──────────┐   enqueue   ┌────────┐   pop   ┌────────┐
│ backend  │────────────▶│ redis  │────────▶│ worker │──SMTP──▶ esterno
└────┬─────┘             └────────┘         └────┬───┘
     │ commit                                    │ write log
     ▼                                           ▼
   MySQL ◀──────── notification_logs ────────────┘
```

### Struttura backend (file aggiunti/modificati in F6)

```
backend/
  app/
    workers/
      __init__.py
      celery_app.py            # Celery() configurato da Settings
      tasks.py                 # send_notification(template_code, user_id, registration_id, context)
    services/
      notification_service.py  # render(template, ctx), send_smtp(smtp, to, subj, html), log_attempt(...)
      registration_service.py  # MODIFY: enqueue dopo commit (helper pubblico enqueue_notification)
    models/
      notification_template.py
      notification_log.py
      __init__.py              # MODIFY: export
    schemas/
      notifications.py         # TemplateIn/Out, LogOut
    api/routers/
      notifications.py         # /api/admin/notification-templates (CRUD), /api/admin/notification-logs (list+resend)
      registrations.py         # MODIFY: enqueue notifiche nei router (dopo commit)
    main.py                    # MODIFY: include router
    core/config.py             # MODIFY: REDIS_URL, CELERY_BROKER_URL
  alembic/versions/
    0008_notifications.py      # tabelle + seed template + seed permesso
  tests/
    test_notification_template_render.py
    test_notification_service.py   # SMTP mockato
    test_notifications_api.py
    test_registration_enqueues.py  # patch su .delay per asserire chiamata
```

### Struttura frontend (file aggiunti/modificati in F6)

```
frontend/
  app/admin/notifications/
    page.tsx                   # tabs Template / Log
    templates/[code]/page.tsx  # editor template (subject, body html) + preview
  components/admin/notifications/
    template-list.tsx
    template-editor.tsx
    log-table.tsx
  lib/notifications-api.ts
  __tests__/template-editor.test.tsx
```

### Compose

```yaml
redis:
  image: redis:7-alpine
  command: ["redis-server", "--appendonly", "yes"]
  volumes: [redis_data:/data]
  networks: [eventi]
  healthcheck: ...

worker:
  build: ./backend
  command: ["celery", "-A", "app.workers.celery_app", "worker", "-l", "info"]
  environment:
    DATABASE_URL: ...
    REDIS_URL: redis://redis:6379/0
    CELERY_BROKER_URL: redis://redis:6379/0
    APP_SECRET_KEY: ...
  depends_on: [redis]
  networks: [eventi]
```

---

## 3. Contratti API

### `GET /api/admin/notification-templates` (perm `notifications.manage`)
→ `[{ code, name, subject, body_html, updated_at }, ...]`

### `GET /api/admin/notification-templates/{code}`
→ `{ code, name, subject, body_html, updated_at }`

### `PUT /api/admin/notification-templates/{code}`
Body: `{ subject, body_html }` (code immutabile)
→ `{ code, name, subject, body_html, updated_at }`

### `POST /api/admin/notification-templates/{code}/preview`
Body: `{ sample_context? }` (default: dataset finto user/event/registration)
→ `{ subject_rendered, body_rendered }`

### `GET /api/admin/notification-logs?user_id=&status=&template=&limit=50&offset=0`
→ `{ items: [...], total }`

### `POST /api/admin/notification-logs/{id}/resend`
→ `202 Accepted` (re-enqueue del task con stesso context salvato; oppure rebuild context dai FK)

Nessun endpoint pubblico per utente in F6 (preferenze utente fuori scope).

---

## 4. Macchina trigger → template

| Evento di dominio | Trigger | Template code |
|---|---|---|
| `register()` con esito `confirmed` | `registrations` router dopo commit | `registration_confirmed` |
| `register()` con esito `waitlisted` | idem | `registration_waitlisted` |
| `cancel()` su iscrizione `confirmed`/`waitlisted` | router dopo commit | `registration_cancelled` |
| `promote_next_waitlisted()` (chiamata da cancel quando si libera un posto) | helper interno dopo commit | `registration_promoted` |

`promote_next_waitlisted` è una piccola funzione nuova in `registration_service`: dopo che un confirmed annulla, se ci sono waitlisted, promuovi il primo (`status='confirmed'`, `waitlist_position=NULL`) e ritorna l'id; il router enqueua `registration_promoted` con quell'id.

---

## 5. Sicurezza & robustezza

- Jinja2 **SandboxedEnvironment** sui template: niente accesso a oggetti pericolosi; solo i campi del context vengono passati.
- Body HTML degli amministratori sanitizzato con `nh3` (lo stesso modulo già in dipendenze F3) prima del salvataggio — niente `<script>`/handlers.
- Password SMTP **mai loggata**; in caso di errore l'`error_text` salvato include solo classe eccezione + messaggio standard, mai credenziali.
- Worker e backend leggono la stessa `APP_SECRET_KEY` per decifrare Fernet.
- Idempotenza retry: il task riusa lo stesso `notification_log` (passa `log_id` ai retry); il client non vede duplicati.

---

## 6. Test (obiettivi)

- `test_notification_template_render`: render Jinja sandbox con context tipo, gestione missing var, escape HTML.
- `test_notification_service`: send con SMTP mock (`unittest.mock.patch('smtplib.SMTP')`), success path → log `sent`; SMTP error → log `failed`.
- `test_notifications_api`: CRUD template + permessi (403 senza `notifications.manage`); list log con filtri; resend re-enqueua.
- `test_registration_enqueues`: register/cancel chiamano `send_notification.delay(...)` con il template giusto e il `registration_id` corretto (mock di `.delay`).
- `test_migration`: tabelle + seed 4 template + seed permesso presenti.
- Frontend: `template-editor.test.tsx` (form submit chiama API), `log-table.test.tsx` (render + filtri).

---

## 7. Out-of-scope F6 (rinviati)

- Promemoria 24h/1h prima evento (richiede Celery beat, F6-stretch o F7).
- Notifiche broadcast manuali da admin a lista utenti (può essere un thin wrapper su `send_notification` ma UI dedicata rinviata).
- Preferenze utente (opt-out per tipo notifica).
- Allegati ICS per calendari.
- SMS/push.
