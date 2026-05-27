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

## Test
- Backend: `cd backend && TEST_DATABASE_URL=mysql+pymysql://eventi:eventi@127.0.0.1:3307/eventi_test uv run pytest`
- Frontend: `cd frontend && pnpm test && pnpm build`

## Note infrastruttura
- F0 non usa MySQL/redis/worker: solo frontend + backend + nginx.
- Redis + worker Celery arrivano in F6 (notifiche).
- nginx dello stack fa solo routing interno e security headers; non termina TLS.
