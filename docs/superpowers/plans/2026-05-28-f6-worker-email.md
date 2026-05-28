# Plan F6 — Worker, Celery, email notifiche

Branch: `f6-worker-email`. Plan TDD step-by-step. Riferimento: [design F6](../specs/2026-05-28-f6-worker-email-design.md).

Convenzioni:
- Backend: `cd backend && uv run python -m pytest`.
- Frontend: `cd frontend && pnpm test` e `pnpm build`.
- DB test: container `mysql` profilo `dev` (`docker compose --profile dev up -d mysql`), `TEST_DATABASE_URL` da `.env`.

---

## A — Backend

### A1. Migrazione `0008_notifications`

- [ ] **Step 1: Test fallisce.** In `backend/tests/test_migration.py` aggiungi:

```python
def test_notification_templates_seeded(db_session):
    rows = db_session.execute(text(
        "select code from notification_templates order by code"
    )).all()
    codes = [r[0] for r in rows]
    assert codes == [
        "registration_cancelled",
        "registration_confirmed",
        "registration_promoted",
        "registration_waitlisted",
    ]

def test_notifications_manage_permission_seeded(db_session):
    row = db_session.execute(text(
        "select 1 from permissions p "
        "join role_permissions rp on rp.permission_id=p.id "
        "join roles r on r.id=rp.role_id "
        "where p.code='notifications.manage' and r.code='super_admin'"
    )).first()
    assert row is not None
```

- [ ] **Step 2: Verifica fallimento.** `uv run python -m pytest tests/test_migration.py -v` → fail.

- [ ] **Step 3: Modelli.** Crea `backend/app/models/notification_template.py`:

```python
from datetime import datetime
from sqlalchemy import BigInteger, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class NotificationTemplate(Base):
    __tablename__ = "notification_templates"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
```

E `backend/app/models/notification_log.py`:

```python
from datetime import datetime
from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class NotificationLog(Base):
    __tablename__ = "notification_logs"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    template_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    registration_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("registrations.id", ondelete="SET NULL"), nullable=True
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    to_address: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    error_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
```

In `backend/app/models/__init__.py` aggiungi:
```python
from app.models.notification_template import NotificationTemplate
from app.models.notification_log import NotificationLog
```

- [ ] **Step 4: Migrazione.** Crea `backend/alembic/versions/0008_notifications.py` con down `0007_employee_role`. Crea tabelle (DDL allineato ai modelli), insert 4 template di default (subject/body HTML semplici con placeholder Jinja), insert permesso `notifications.manage`, link al ruolo `super_admin`.

- [ ] **Step 5: Test verde.** `uv run python -m pytest tests/test_migration.py -v` → 4+ green (esistenti + 2 nuovi).

- [ ] **Step 6: Commit.**
```bash
git add backend/app/models/notification_template.py backend/app/models/notification_log.py \
        backend/app/models/__init__.py backend/alembic/versions/0008_notifications.py \
        backend/tests/test_migration.py
git commit -m "feat(f6): notification_templates + notification_logs + permesso notifications.manage"
```

---

### A2. Notification service (render + send + log)

- [ ] **Step 1: Test fallisce.** Crea `backend/tests/test_notification_service.py`:

```python
from unittest.mock import patch, MagicMock
import pytest
from app.services import notification_service

def test_render_template_with_context():
    out = notification_service.render(
        subject="Conferma {{ event.title }}",
        body_html="<p>Ciao {{ user.full_name }}, evento {{ event.title }}.</p>",
        context={"user": {"full_name": "Mario Rossi"}, "event": {"title": "Workshop X"}},
    )
    assert out["subject"] == "Conferma Workshop X"
    assert "Mario Rossi" in out["body_html"]
    assert "Workshop X" in out["body_html"]

def test_render_escapes_html_in_context():
    out = notification_service.render(
        subject="x",
        body_html="<p>{{ user.full_name }}</p>",
        context={"user": {"full_name": "<script>x</script>"}},
    )
    assert "<script>" not in out["body_html"]
    assert "&lt;script&gt;" in out["body_html"]

@patch("app.services.notification_service.smtplib.SMTP")
def test_send_smtp_success(mock_smtp):
    smtp_cfg = MagicMock(host="smtp.x", port=587, tls_mode="starttls",
                         username="u", password_decrypted="p",
                         from_address="from@x", from_name="X")
    notification_service.send_smtp(smtp_cfg, to="a@x", subject="s", body_html="<p>b</p>")
    mock_smtp.assert_called_once_with("smtp.x", 587, timeout=30)
```

- [ ] **Step 2: Implementa.** `backend/app/services/notification_service.py` con:
  - `render(subject, body_html, context) -> {"subject":..., "body_html":...}` usando `jinja2.sandbox.SandboxedEnvironment(autoescape=True)`;
  - `send_smtp(cfg, to, subject, body_html)` con `smtplib.SMTP` o `SMTP_SSL` in base a `tls_mode`, `starttls()` quando serve, MIME multipart con part `text/html`;
  - `decrypt_smtp_password(cfg)` riusa il Fernet di F2 (`app.core.crypto`).

- [ ] **Step 3: Test verde.** `uv run python -m pytest tests/test_notification_service.py -v`.

- [ ] **Step 4: Commit.**
```bash
git add backend/app/services/notification_service.py backend/tests/test_notification_service.py
git commit -m "feat(f6): notification_service (render Jinja sandbox + invio SMTP)"
```

---

### A3. Celery app + task `send_notification`

- [ ] **Step 1: Settings.** In `backend/app/core/config.py` aggiungi:
```python
REDIS_URL: str = "redis://redis:6379/0"
CELERY_BROKER_URL: str | None = None  # default → REDIS_URL
```

- [ ] **Step 2: Dipendenze.** `backend/pyproject.toml` aggiungi `"celery[redis]>=5.4"`, `"jinja2>=3.1"`. `uv sync`.

- [ ] **Step 3: Test fallisce.** Crea `backend/tests/test_celery_task.py`:

```python
from unittest.mock import patch
from app.workers.tasks import send_notification

@patch("app.workers.tasks.notification_service.send_smtp")
def test_send_notification_writes_log_sent(mock_send, db_session, user_factory, registration_factory):
    user = user_factory(email="u@x")
    reg = registration_factory(user_id=user.id)
    send_notification.run(  # .run = sync invocation per test
        template_code="registration_confirmed",
        user_id=user.id,
        registration_id=reg.id,
        context={"user": {"full_name": user.full_name}, "event": {"title": "E"}, "registration": {"id": reg.id}},
    )
    from app.models import NotificationLog
    log = db_session.query(NotificationLog).filter_by(user_id=user.id).one()
    assert log.status == "sent"
    assert log.to_address == "u@x"
    mock_send.assert_called_once()
```

- [ ] **Step 4: Implementa.** `backend/app/workers/celery_app.py`:

```python
from celery import Celery
from app.core.config import settings

broker = settings.CELERY_BROKER_URL or settings.REDIS_URL
celery_app = Celery("eurospital_eventi", broker=broker, backend=broker, include=["app.workers.tasks"])
celery_app.conf.task_acks_late = True
celery_app.conf.task_default_retry_delay = 60
celery_app.conf.broker_connection_retry_on_startup = True
```

`backend/app/workers/tasks.py`:

```python
from celery.exceptions import MaxRetriesExceededError
from datetime import datetime
from app.workers.celery_app import celery_app
from app.db.session import SessionLocal
from app.services import notification_service
from app.models import NotificationTemplate, NotificationLog, User, SmtpSettings

@celery_app.task(bind=True, autoretry_for=(OSError,), retry_backoff=True,
                 retry_kwargs={"max_retries": 3})
def send_notification(self, template_code, user_id, registration_id, context):
    db = SessionLocal()
    try:
        tmpl = db.query(NotificationTemplate).filter_by(code=template_code).one()
        user = db.query(User).get(user_id)
        smtp = db.query(SmtpSettings).get(1)
        rendered = notification_service.render(tmpl.subject, tmpl.body_html, context)
        log = NotificationLog(
            template_code=template_code, registration_id=registration_id,
            user_id=user_id, to_address=user.email, subject=rendered["subject"],
            status="pending", attempts=self.request.retries + 1,
        )
        db.add(log); db.flush()
        try:
            notification_service.send_smtp(smtp, user.email, rendered["subject"], rendered["body_html"])
            log.status = "sent"; log.sent_at = datetime.utcnow()
        except Exception as e:
            log.status = "failed"; log.error_text = f"{type(e).__name__}: {e}"
            db.commit()
            raise
        db.commit()
    finally:
        db.close()
```

- [ ] **Step 5: Test verde.** `pytest tests/test_celery_task.py -v`.

- [ ] **Step 6: Commit.**
```bash
git add backend/app/workers/ backend/app/core/config.py backend/pyproject.toml backend/uv.lock \
        backend/tests/test_celery_task.py
git commit -m "feat(f6): Celery app + task send_notification con retry e log"
```

---

### A4. Enqueue dal flusso registrazioni

- [ ] **Step 1: Test fallisce.** Crea `backend/tests/test_registration_enqueues.py`:

```python
from unittest.mock import patch

@patch("app.api.routers.registrations.send_notification.delay")
def test_register_confirmed_enqueues_confirmation(mock_delay, client, ...):
    # auth as employee, POST /api/events/{id}/registrations → 201
    ...
    mock_delay.assert_called_once()
    args = mock_delay.call_args.kwargs or dict(zip(["template_code","user_id","registration_id","context"], mock_delay.call_args.args))
    assert args["template_code"] == "registration_confirmed"

@patch("app.api.routers.registrations.send_notification.delay")
def test_cancel_enqueues_cancelled_and_promotion(mock_delay, ...):
    # B confirmed, A waitlisted; B cancels
    # → 2 calls: cancelled per B, promoted per A
    ...
```

- [ ] **Step 2: Implementa.** In `backend/app/api/routers/registrations.py`:
  - Importa `from app.workers.tasks import send_notification`.
  - Dopo `db.commit()` su register: scegli `confirmed` vs `waitlisted` in base allo stato e chiama `send_notification.delay(...)` con context costruito da reg/event/user.
  - Su cancel: dopo `db.commit()`, chiama `send_notification.delay("registration_cancelled", ...)`. Poi prova `registration_service.promote_next_waitlisted(db, event_id)`: se ritorna `Registration`, `db.commit()` e enqueue `registration_promoted`.
- [ ] **Step 3: Implementa `promote_next_waitlisted`.** In `registration_service.py`: scegli il primo `waitlisted` per `waitlist_position`, set `status='confirmed'`, `waitlist_position=NULL`, ritorna la riga (o `None`). **NON committa** (lascia al chiamante).
- [ ] **Step 4: Test verde.** `pytest tests/test_registration_enqueues.py tests/test_registration_service.py -v`.

- [ ] **Step 5: Commit.**
```bash
git add backend/app/api/routers/registrations.py backend/app/services/registration_service.py \
        backend/tests/test_registration_enqueues.py
git commit -m "feat(f6): enqueue notifiche email su register/cancel/promote waitlist"
```

---

### A5. Endpoint admin templates + logs

- [ ] **Step 1: Test fallisce.** Crea `backend/tests/test_notifications_api.py` con:
  - GET/PUT template richiede permesso `notifications.manage` (403 senza, 200 con).
  - PUT salva `subject`/`body_html`; rilettura conferma.
  - `POST /preview` ritorna `subject_rendered`/`body_rendered` non vuoti con sample context default.
  - GET logs con filtri `status`, `user_id`, `template`.
  - `POST /logs/{id}/resend` ritorna 202 e chiama `send_notification.delay`.

- [ ] **Step 2: Implementa.** `backend/app/api/routers/notifications.py`:
  - `GET /api/admin/notification-templates`
  - `GET /api/admin/notification-templates/{code}`
  - `PUT /api/admin/notification-templates/{code}` — sanitizza `body_html` con `nh3.clean()`.
  - `POST /api/admin/notification-templates/{code}/preview`
  - `GET /api/admin/notification-logs?...`
  - `POST /api/admin/notification-logs/{id}/resend`
  
  Tutto dietro `Depends(require_permission("notifications.manage"))`.

- [ ] **Step 3: Schema.** `backend/app/schemas/notifications.py` con `TemplateOut`, `TemplateUpdate`, `LogOut`, `PreviewIn`, `PreviewOut`.

- [ ] **Step 4: Include router.** `backend/app/main.py` aggiungi `app.include_router(notifications.router)`.

- [ ] **Step 5: Test verde.** `pytest tests/test_notifications_api.py -v`. Poi suite completa: `pytest -q`.

- [ ] **Step 6: Commit.**
```bash
git add backend/app/api/routers/notifications.py backend/app/schemas/notifications.py \
        backend/app/main.py backend/tests/test_notifications_api.py
git commit -m "feat(f6): API admin notification templates + logs + resend"
```

---

## B — Compose + worker

### B1. Servizi `redis` + `worker`

- [ ] **Step 1: Modifica `docker-compose.yml`**: aggiungi `redis` e `worker` (vedi design §2). Backend e worker hanno entrambi `environment` con `REDIS_URL` e `CELERY_BROKER_URL`.
- [ ] **Step 2: `.env.example`**: aggiungi `REDIS_URL=redis://redis:6379/0`.
- [ ] **Step 3: Smoke test locale.** `docker compose up -d redis worker backend`. `docker logs worker` → "Connected to redis". Niente test automatici qui (rinviato a `INSTALL.md`).
- [ ] **Step 4: Commit.**
```bash
git add docker-compose.yml .env.example
git commit -m "feat(f6): servizi compose redis + worker celery"
```

---

## C — Frontend admin

### C1. Client API e tipi

- [ ] **Step 1.** `frontend/lib/notifications-api.ts`:
```ts
import { api } from "./admin-api";
export const notificationsApi = {
  listTemplates: () => api<TemplateOut[]>("/admin/notification-templates"),
  getTemplate: (code: string) => api<TemplateOut>(`/admin/notification-templates/${code}`),
  updateTemplate: (code: string, body: TemplateUpdate) =>
    api<TemplateOut>(`/admin/notification-templates/${code}`, { method: "PUT", body }),
  preview: (code: string, ctx?: object) =>
    api<PreviewOut>(`/admin/notification-templates/${code}/preview`, { method: "POST", body: { sample_context: ctx } }),
  listLogs: (q: LogQuery) => api<{ items: LogOut[]; total: number }>(`/admin/notification-logs?${qs(q)}`),
  resend: (id: number) => api<void>(`/admin/notification-logs/${id}/resend`, { method: "POST" }),
};
```

- [ ] **Step 2: Commit.**
```bash
git add frontend/lib/notifications-api.ts
git commit -m "feat(f6): client API notifiche admin"
```

---

### C2. Pagina + editor template

- [ ] **Step 1: Test fallisce.** `frontend/__tests__/template-editor.test.tsx`: render con template iniziale, modifica subject, click "Salva" → `updateTemplate` chiamata con payload atteso.
- [ ] **Step 2: Implementa.** `components/admin/notifications/template-editor.tsx` (textarea subject + body, pulsante "Anteprima" che chiama `preview` e renderizza HTML in iframe sandboxata, pulsante "Salva").
- [ ] **Step 3: Pagina.** `app/admin/notifications/page.tsx` con tabs "Template" / "Log" (semplici link). `app/admin/notifications/templates/[code]/page.tsx` per editor singolo.
- [ ] **Step 4: Build + test verdi.** `pnpm test` + `pnpm build`.
- [ ] **Step 5: Commit.**
```bash
git add frontend/app/admin/notifications frontend/components/admin/notifications/template-editor.tsx \
        frontend/__tests__/template-editor.test.tsx
git commit -m "feat(f6): admin UI editor template notifiche"
```

---

### C3. Tabella log

- [ ] **Step 1.** `components/admin/notifications/log-table.tsx` con filtri stato/utente/template + pulsante "Rinvia" per riga (chiama `resend`).
- [ ] **Step 2.** Aggiungi nav-link "Notifiche" in `components/admin/admin-nav.tsx` (gated su permesso `notifications.manage`).
- [ ] **Step 3.** `pnpm build`.
- [ ] **Step 4: Commit.**
```bash
git add frontend/components/admin/notifications/log-table.tsx frontend/components/admin/admin-nav.tsx
git commit -m "feat(f6): admin UI log notifiche + rinvio"
```

---

## D — Docs

- [ ] **Step 1.** Aggiorna `INSTALL.md` con sezione "Notifiche (F6)":
  - Avvio worker: `docker compose up -d redis worker`.
  - Variabili: `REDIS_URL`, `CELERY_BROKER_URL` (default `REDIS_URL`).
  - Configurazione SMTP via wizard F2 o `/admin/settings/smtp`.
  - Editor template `/admin/notifications`.
  - Permesso `notifications.manage` per accesso.
- [ ] **Step 2: Commit.**
```bash
git add INSTALL.md
git commit -m "docs(f6): istruzioni worker + notifiche email"
```

---

## Self-Review Notes

- **Coverage spec:** §1 decisioni → A1-A5 + B1; §3 contratti API → A5; §4 trigger→template → A4; §5 sicurezza (Jinja sandbox, nh3, Fernet) → A2/A5; §6 test obiettivi → tutti.
- **Reuse:** Fernet già in F1, `smtp_settings` da F2, registration flow F4, `nh3` già in deps.
- **Out-of-scope rispettato:** niente beat, broadcast, ICS, preferenze utente.
- **Tx + enqueue:** enqueue dopo `db.commit()` nel router, non nel service — evita di accodare email se la tx rollback.
- **Worker DB session:** ogni task apre/chiude la propria `SessionLocal` (no scope app).
- **Idempotenza retry:** il task crea un nuovo `NotificationLog` per ogni tentativo (con `attempts=retries+1`) — semplifica il debug e mantiene la storia degli errori.
- **Frontend preview sandbox:** iframe con `sandbox=""` evita esecuzione script anche se il template contenesse markup malevolo.
