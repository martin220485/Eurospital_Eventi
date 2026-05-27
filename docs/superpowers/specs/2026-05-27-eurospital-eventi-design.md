# Design — Eurospital Event Booking Platform

**Data:** 2026-05-27
**Stato:** in revisione
**Documenti collegati:** [PROMPT.md](../../PROMPT.md) · [PIANO_DI_SVILUPPO.md](../../PIANO_DI_SVILUPPO.md)

---

## 1. Obiettivo e ambito

Piattaforma web aziendale per la gestione di eventi Eurospital: i dipendenti scoprono eventi, si iscrivono/annullano, ricevono notifiche, consultano lo storico; gli amministratori gestiscono eventi, utenti, notifiche, reportistica e configurazione di sistema da un backoffice. Interfaccia in italiano.

Progetto ampio (10 fasi, ~9-11 settimane/uomo). **Va costruito a fasi**, ognuna con proprio ciclo spec → plan → implementazione, committata incrementalmente. Questo documento fissa l'architettura complessiva e i confini; i piani di dettaglio sono per fase.

**MVP target:** fine F6 (eventi + iscrizioni + notifiche + area utente + login locale).

---

## 2. Decisioni di contesto (questa sessione)

Decisioni prese che vincolano lo scaffolding e il deploy:

1. **Dominio pubblico:** `eventi.eurospital.it`.
2. **Reverse proxy a due livelli.** L'**NPM (Nginx Proxy Manager) esistente su `.129`** che già instrada `*.eurospital.it` termina il TLS e fa upstream verso lo stack. Il `proxy` nginx dello stack **non** gestisce certificati: espone una porta host HTTP (default `8080`), fa routing interno frontend/backend e applica security headers non-TLS. HSTS e cert restano su NPM.
3. **Esecuzione in Docker.** Sviluppo e produzione girano nello stack `docker-compose`.
4. **MySQL esterno.** Nessun container DB in produzione; connessione via `.env` a un server MySQL 8 esistente. Container MySQL "usa e getta" solo per dev/test, documentato a parte.
5. **Prima iterazione = solo documentazione.** Nessun codice finché questo spec non è approvato.

---

## 3. Architettura

Microservizi leggeri orchestrati da `docker-compose`. Servizi:

| Servizio | Ruolo | Espone |
|---|---|---|
| `proxy` (nginx) | Routing interno + security headers; riceve upstream da NPM | porta host (es. 8080) |
| `frontend` (Next.js) | UI utente + admin + wizard | interno |
| `backend` (FastAPI) | API REST, auth, RBAC, logica | interno |
| `worker` (Celery) | Email, promemoria, promozione waitlist, job schedulati (beat) | — |
| `redis` | Broker/coda Celery | interno |

Esterni (fuori stack, via rete): **MySQL 8**, **SMTP**, **AD/LDAP**.

**Flusso:** Browser →(HTTPS)→ NPM →(HTTP)→ proxy → frontend/backend. Backend ↔ MySQL via SQLAlchemy. Backend → Redis → worker per job async.

**Backend layered:** `routers` (HTTP) → `services` (dominio) → `models/repositories` (dati). Pydantic per I/O. Dependency injection per sessione DB, utente corrente, controllo permessi.

**Frontend:** App Router con route group `(auth)`, `(user)`, `(admin)`, `setup`. Server components per fetch, client components per interazioni. React Query per stato server. shadcn/ui + Tailwind.

---

## 4. Confini dei moduli (unità isolate)

- **core/crypto** — cifra/decifra segreti (Fernet, chiave da `.env`). Interfaccia: `encrypt(str)→str`, `decrypt(str)→str`. Dipende solo da chiave env.
- **core/settings runtime** — legge/scrive config (DB MySQL/SMTP/LDAP/piattaforma) dal DB con campi sensibili cifrati. Consumatori non vedono il cifrato.
- **auth** — login locale (Argon2), sessioni JWT, refresh; in F8 estende a LDAP/OIDC/SAML dietro la stessa interfaccia `authenticate(credentials)→Principal`.
- **rbac** — dependency `require(permission)` su ogni endpoint protetto. Tabelle ruoli/permessi.
- **events / registrations / notifications / reports** — service per dominio, testabili in isolamento.
- **integrations** — `ldap`, `smtp`, `oidc/saml`: adattatori verso sistemi esterni, mockabili nei test.

Criterio: ogni unità deve rispondere a "cosa fa / come si usa / da cosa dipende" senza leggere internamente le altre.

---

## 5. Dati (sintesi)

Schema normalizzato MySQL. Gruppi: **Identità/RBAC** (`users`, `roles`, `permissions`, `role_permissions`, `user_roles`), **Eventi** (`events`, `event_categories`, `event_custom_fields`, `event_custom_field_options`, `attachments`, `event_visibility`), **Iscrizioni** (`registrations`, `registration_custom_answers`, `waiting_list`, `checkins`), **Notifiche** (`notification_templates`, `notifications`, `notification_logs`), **Config** (`platform_settings`, `smtp_settings`, `ldap_settings` — sensibili cifrati), **Operatività** (`audit_logs`, `system_jobs`, `calendar_tokens`, `alembic_version`).

Viste per reportistica. Indici su FK + `events(status,start_at)`, `registrations(event_id,status)`, `users(email,username)`, `audit_logs(created_at,actor_id)`.

**Macchina a stati iscrizione:** `pending → confirmed → (cancelled | attended | no_show)`; `waitlisted → confirmed` (gestita dal worker al liberarsi di un posto, con lock di riga per evitare race sull'ultimo posto).

Dettaglio completo: [PIANO_DI_SVILUPPO.md §3](../../PIANO_DI_SVILUPPO.md).

---

## 6. Gestione errori

- Backend: handler centralizzato → risposta JSON uniforme `{error: {code, message, details}}`, messaggi utente in italiano, log strutturato (mai segreti in chiaro).
- Validazione doppia: Pydantic (server) + Zod (client). Il server è la fonte di verità.
- RBAC: `403` su permesso mancante, `401` su sessione assente/scaduta.
- Job async: retry con backoff nel worker; esiti/errori in `notification_logs` e `system_jobs`.
- UI: ogni pagina ha stati loading (skeleton) / empty / error; toast per feedback azioni.

---

## 7. Sicurezza

Credenziali MySQL/SMTP/LDAP cifrate at-rest (chiave fuori dal DB). Password locali Argon2. JWT con refresh. RBAC server-side su ogni endpoint. Rate limiting su auth/API. Security headers (allo stack; HSTS/TLS su NPM). Input sanitizzato; upload file validati. Audit log su operazioni sensibili.

---

## 8. Test

- **Unit (pytest):** capienza, transizioni stato iscrizione, promozione waitlist, validazione campi custom, crypto.
- **Integration:** endpoint con MySQL di test (container effimero), flusso iscrizione/annullamento, RBAC (403), wizard.
- **Frontend:** componenti chiave (form iscrizione, form builder, tabelle), validazioni Zod; e2e Playwright opzionale su login→iscrizione→annullamento.
- **DoD per feature:** validazione client+server, controllo permessi, gestione errori, stati UI loading/empty/error, test minimi verdi.

---

## 9. Roadmap a fasi

F0 Setup · F1 Fondamenta · F2 Wizard · F3 Eventi admin · F4 Iscrizioni · F5 Area utente · F6 Notifiche (**MVP**) · F7 Report · F8 AD/SSO · F9 Sicurezza/GDPR · F10 QA/docs/deploy. Dettaglio e stime: [PIANO_DI_SVILUPPO.md §5](../../PIANO_DI_SVILUPPO.md).

**Prossima iterazione dopo approvazione:** writing-plans per **F0 (scaffolding)**, poi **F1 (fondamenta)**.

---

## 10. Questioni aperte / assunzioni

- Porta host upstream NPM: assunta `8080`, da confermare con la config NPM esistente.
- Package manager: frontend `npm` (default Next.js), backend `pip` + `pyproject.toml`; sostituibili (pnpm/uv) se preferito.
- Dettagli mapping attributi AD e modalità SSO (LDAP vs OIDC vs SAML) da raccogliere prima di F8.
- Requisiti retention/anonimizzazione GDPR da dettagliare prima di F9.
