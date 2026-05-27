# Piano di sviluppo — Eurospital Event Booking Platform

Stack: **Next.js + FastAPI + MySQL**, containerizzato con Docker.
Documento di pianificazione: architettura, struttura, schema dati, fasi, stime, rischi, qualità e deploy.

---

## 1. Architettura

Sistema a microservizi leggeri orchestrati con `docker-compose`. Comunicazione frontend↔backend via REST/JSON; backend↔worker via coda Redis.

Lo stack Docker contiene frontend, backend, worker, redis e proxy. **MySQL è esterno** (server già esistente) e raggiunto via rete; SMTP e AD/LDAP sono anch'essi esterni.

> **TLS e routing pubblico** di `eventi.eurospital.it` sono gestiti dall'**Nginx Proxy Manager (NPM) esistente su `*.eurospital.it`**, a monte dello stack. Il `proxy` nginx dello stack **non** termina TLS: espone una porta host (es. `8080`) verso cui NPM fa upstream, applica routing interno e security headers.

```
                  ┌──────────────────┐
   Browser ─HTTPS▶│  NPM (.129)       │  TLS + routing *.eurospital.it
                  │  eventi.euro...   │
                  └─────────┬─────────┘
                            │ HTTP (porta host es. 8080)
                       ┌────┴─────┐
                       │  Nginx   │  (proxy stack: routing interno, headers)
                       └────┬─────┘
                  ┌─────────┴───────────┐
                  ▼                     ▼
          ┌──────────────┐      ┌──────────────┐
          │  Frontend    │      │   Backend    │
          │  Next.js     │─REST▶│   FastAPI    │
          └──────────────┘      └──────┬───────┘
                                       │ SQLAlchemy
                        ┌──────────────┼───────────────┐
                        ▼              ▼               ▼
                  ┌──────────┐   ┌──────────┐    ┌──────────┐
                  │  Redis   │◀─▶│  Worker  │    │  (DB)    │
                  └──────────┘   └────┬─────┘    └────┬─────┘
                                      │               │
═════════ stack Docker ═══════════════╪═══════════════╪═══════ confini ══════
                                      │               │  (rete/VPN/firewall)
                                 ┌────┴────┐    ┌──────┴──────┐   ┌─────────┐
                                 │  SMTP   │    │  MySQL 8    │   │ AD/LDAP │
                                 │(esterno)│    │ (esterno    │   │(esterno)│
                                 └─────────┘    │  esistente) │   └─────────┘
                                                └─────────────┘
```

**Pattern backend:** layered/clean — `routers` (HTTP) → `services` (logica) → `repositories/models` (dati). Schemi Pydantic per I/O, dependency injection per auth/permessi/sessione DB.

**Pattern frontend:** Next.js App Router con route group per area utente e area admin; server components per fetch, client components per interazioni; React Query per cache/stato server; design system shadcn/ui.

**Segreti:** credenziali MySQL/SMTP/LDAP cifrate at-rest (Fernet/AES) con chiave da `.env`; mai in chiaro nel DB o nei log.

---

## 2. Struttura cartelle (monorepo)

```
Eurospital_Eventi/
├─ docker-compose.yml
├─ .env.example
├─ README.md
├─ INSTALL.md
├─ docs/
│  ├─ PROMPT.md
│  └─ PIANO_DI_SVILUPPO.md
├─ nginx/
│  └─ default.conf
├─ backend/
│  ├─ Dockerfile
│  ├─ pyproject.toml
│  ├─ alembic/                 # migrazioni
│  ├─ app/
│  │  ├─ main.py
│  │  ├─ core/                 # config, security, crypto, settings runtime
│  │  ├─ db/                   # session, base, init, views
│  │  ├─ models/               # SQLAlchemy
│  │  ├─ schemas/              # Pydantic
│  │  ├─ api/                  # routers: auth, events, registrations, users,
│  │  │                        #          reports, notifications, settings, setup
│  │  ├─ services/             # logica di dominio
│  │  ├─ workers/              # task Celery
│  │  └─ integrations/         # ldap/ad, smtp, oidc/saml
│  └─ tests/                   # unit + integration (pytest)
└─ frontend/
   ├─ Dockerfile
   ├─ package.json
   ├─ app/
   │  ├─ (auth)/login
   │  ├─ (user)/dashboard, eventi, calendario, prenotazioni, storico, profilo
   │  ├─ (admin)/dashboard, eventi, iscritti, report, utenti, ruoli,
   │  │          notifiche, template, impostazioni, audit, stato
   │  └─ setup/                # wizard prima configurazione
   ├─ components/              # ui (shadcn), form, tabelle, calendario, grafici
   ├─ lib/                     # api client, auth, hooks, validazioni zod
   └─ __tests__/
```

---

## 3. Schema database (sintesi)

Tabelle principali e relazioni chiave:

- **Identità & RBAC:** `users`, `roles`, `permissions`, `role_permissions`, `user_roles`. Un utente ha N ruoli; un ruolo ha N permessi.
- **Eventi:** `events` (FK `category_id`), `event_categories`, `event_custom_fields` (FK `event_id`), `event_custom_field_options` (FK `field_id`), `attachments` (FK `event_id`), `event_visibility` (reparti/gruppi AD).
- **Iscrizioni:** `registrations` (FK `event_id`, `user_id`, stato), `registration_custom_answers` (FK `registration_id`, `field_id`), `waiting_list` (FK `event_id`, `user_id`, posizione), `checkins` (FK `registration_id`).
- **Notifiche:** `notification_templates`, `notifications`, `notification_logs` (FK `registration_id`/`user_id`, esito, errore).
- **Configurazione:** `platform_settings`, `smtp_settings`, `ldap_settings` (campi sensibili cifrati).
- **Operatività:** `audit_logs`, `system_jobs`, `calendar_tokens`, `alembic_version`.

**Viste** per reportistica: iscritti per evento, posti disponibili, eventi attivi, storico utente, report per reparto, lista d'attesa, notifiche inviate, presenze evento.

**Indici:** su FK, `events(status, start_at)`, `registrations(event_id, status)`, `users(email, username)`, `audit_logs(created_at, actor_id)`.

**Macchina a stati iscrizione:** `pending → confirmed → (cancelled | attended | no_show)` e `waitlisted → confirmed`. La transizione waitlist→confirmed è gestita dal worker quando si libera un posto.

---

## 4. Decisioni tecniche principali (trade-off)

- **FastAPI + SQLAlchemy/Alembic** invece di NestJS: backend Python con migrazioni mature e ottima generazione OpenAPI; costo: due linguaggi nel monorepo (TS + Python) → mitigato da contratti API tipizzati.
- **Celery + Redis** per i job: separa l'invio email/promemoria dal ciclo richiesta-risposta, evita timeout e rende le notifiche ritentabili; costo: due servizi in più.
- **Config runtime in DB (non solo .env)**: MySQL/SMTP/AD modificabili dal backoffice come richiesto; le credenziali sono cifrate, la chiave resta in `.env`.
- **MySQL esterno (non containerizzato)**: la piattaforma si connette a un server MySQL già esistente. Vantaggi: backup/HA/manutenzione gestiti dall'infrastruttura aziendale, nessun dato applicativo nei volumi Docker. Implicazioni: i dati di connessione stanno in `.env`, va garantito l'accesso di rete (firewall/VPN) dai container al server, e l'utente applicativo deve avere i privilegi per applicare le migrazioni (creazione tabelle/viste/indici) sul solo DB della piattaforma.
- **Reverse proxy in due livelli**: NPM esistente (`*.eurospital.it`, su .129) termina TLS e instrada `eventi.eurospital.it` verso lo stack; il nginx dello stack fa routing interno frontend/backend e applica security headers. Vantaggio: coerenza con l'infra esistente, gestione cert centralizzata. Implicazione: lo stack espone una porta host HTTP a cui NPM fa upstream.
- **Setup wizard + migrazioni**: il wizard testa la connessione al MySQL esterno e applica le migrazioni Alembic per creare schema/viste/seed; la config DB di base arriva da `.env` (niente "chicken-and-egg", perché il DB è fornito dall'esterno).
- **Auth ibrida**: SSO AD/LDAP/OIDC come primaria, login locale solo per admin di emergenza; sessioni JWT con refresh e RBAC verificato server-side su ogni endpoint.

---

## 5. Fasi e milestone

| Fase | Contenuto | Output | Stima |
|---|---|---|---|
| **F0 — Setup** | Scaffolding monorepo, docker-compose, Nginx, CI lint/test, `.env.example` | Ambiente avviabile "hello world" | 3–4 gg |
| **F1 — Fondamenta** | Modelli + migrazioni Alembic, RBAC, auth locale, crypto segreti, OpenAPI base | DB + login admin locale | 5–7 gg |
| **F2 — Setup wizard** | Wizard 10 step, test connessioni MySQL/SMTP/AD, creazione schema/viste/seed | Prima configurazione funzionante | 4–5 gg |
| **F3 — Eventi (admin)** | CRUD eventi + stati, categorie, allegati, form builder campi custom | Gestione eventi completa | 6–8 gg |
| **F4 — Iscrizioni** | Iscrizione utente, campi custom, capienza, lista d'attesa, annullamento, QR | Flusso prenotazione end-to-end | 6–8 gg |
| **F5 — Area utente** | Dashboard, catalogo, calendario, dettaglio, prenotazioni, storico, profilo | UX dipendente completa | 6–8 gg |
| **F6 — Notifiche** | Worker Celery, template, invii automatici/mirati, log, promemoria, promozione waitlist | Sistema notifiche | 5–6 gg |
| **F7 — Report & dashboard** | KPI, report per evento/reparto/periodo, export PDF/Excel/CSV, grafici | Reportistica | 5–6 gg |
| **F8 — Integrazione AD/SSO** | LDAP sync, mapping attributi, gruppi, OIDC/SAML, test login | SSO aziendale | 5–7 gg |
| **F9 — Sicurezza & GDPR** | Rate limit, headers, audit log, consensi, export/retention dati, hardening | Compliance & security | 4–5 gg |
| **F10 — QA & docs & deploy** | Test unit/integration, README/INSTALL, backup/restore, guida produzione | Release candidate | 5–6 gg |

**Totale indicativo:** ~9–11 settimane/uomo per un MVP solido. Le fasi F3–F5 possono parzialmente parallelizzarsi tra backend e frontend.

Suggerimento: rilascio **MVP** a fine F6 (eventi + iscrizioni + notifiche + area utente + login locale), poi F7–F9 come incrementi.

---

## 6. Strategia di test (QA)

- **Unit (pytest)**: servizi di dominio — capienza, transizioni di stato iscrizione, promozione lista d'attesa, validazione campi custom, cifratura segreti.
- **Integration**: endpoint API con DB di test (MySQL in container), flusso iscrizione/annullamento, RBAC (403 su permessi mancanti), setup wizard.
- **Frontend**: test componenti chiave (form iscrizione, builder, tabelle), validazioni Zod; e2e opzionale (Playwright) sui percorsi critici login→iscrizione→annullamento.
- **Criteri di accettazione**: ogni endpoint verifica permessi; ogni form valida client+server; ogni pagina ha stati loading/empty/error.

---

## 7. Rischi e mitigazioni

| Rischio | Impatto | Mitigazione |
|---|---|---|
| Integrazione AD/LDAP eterogenea per ambiente | Alto | Test connessione + test login nel wizard; mapping attributi configurabile; fallback admin locale |
| Accesso di rete al MySQL esterno (firewall/VPN/latenza) | Medio | Verifica connettività dai container nel wizard; documentare host/porta/whitelist; connection pool con retry |
| Privilegi insufficienti dell'utente DB sul server esterno | Medio | Checklist privilegi richiesti; il wizard segnala errori di permessi in modo chiaro prima delle migrazioni |
| Race condition su ultimo posto disponibile | Medio | Transazioni con lock a livello riga + ricontrollo capienza in commit |
| Deliverability email | Medio | SMTP configurabile, email di test, log esiti, retry nel worker |
| Sicurezza segreti | Alto | Cifratura at-rest, chiave fuori dal DB, niente segreti nei log |
| Scope ampio | Alto | Rilascio per fasi con MVP a F6 |

---

## 8. Deployment in produzione

- **Container**: build immagini ottimizzate (multi-stage), tag versionati. **TLS e ingress pubblico gestiti dall'NPM esistente** su `eventi.eurospital.it`; lo stack espone una porta host HTTP per l'upstream NPM.
- **Segreti/config**: `.env` fuori dal repo; chiave di cifratura gestita come secret; variabili separate per ambienti (dev/stage/prod).
- **Database**: **MySQL esterno già esistente** (non nello stack Docker). Backup/HA/patch a carico dell'infrastruttura DB aziendale; garantire accesso di rete dai container (firewall/VPN); connessione TLS verso il DB dove disponibile; utente applicativo con privilegi minimi sul solo DB della piattaforma; migrazioni Alembic applicate in fase di deploy.
- **Worker/coda**: Redis persistente; più worker Celery scalabili orizzontalmente; beat per i job schedulati (promemoria, retention).
- **Osservabilità**: log strutturati, healthcheck per ogni servizio, pagina admin "Stato sistema", alert su errori notifiche.
- **CI/CD**: pipeline lint + test + build immagini + deploy; migrazioni come step controllato.
- **Hardening**: security headers (CSP, HSTS lato NPM), rate limiting su auth/API, principio del minimo privilegio sull'utente MySQL applicativo.

---

## 9. Prossimi passi operativi

1. Approvare questo piano e l'MVP a F6. ✅ approvato
2. **Abilitare la scrittura sul collegamento GitHub.** ✅ deploy key con write attiva
3. Avviare **F0** (scaffolding + docker-compose) e **F1** (modelli, migrazioni, RBAC, auth locale).
