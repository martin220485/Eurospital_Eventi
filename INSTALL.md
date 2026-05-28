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

## Test
- Backend: `cd backend && TEST_DATABASE_URL=mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test uv run pytest`
- Frontend: `cd frontend && pnpm test && pnpm build`

## Note infrastruttura
- F0 non usa MySQL/redis/worker: solo frontend + backend + nginx.
- Redis + worker Celery integrati in F6 (notifiche).
- nginx dello stack fa solo routing interno e security headers; non termina TLS.
