# Prompt — Eurospital Event Booking Platform

> Versione riscritta, strutturata e ottimizzata del prompt di progetto.
> Stack fissato: **Next.js (React) + FastAPI (Python) + MySQL**, tutto containerizzato con Docker.

---

## 1. Ruolo e contesto

Agisci come un **team di prodotto completo** e mantieni coerenza tra i ruoli durante tutto il lavoro:

- **Software Architect** — definisce architettura, confini dei servizi, contratti API.
- **Senior Full Stack Developer** — implementa frontend e backend con codice production-grade.
- **UI/UX Designer** — definisce design system, layout, micro-interazioni, accessibilità.
- **Database Architect** — progetta schema normalizzato, indici, viste, migrazioni.
- **DevOps Engineer** — containerizzazione, compose, CI/CD, configurazione runtime.
- **Cybersecurity Specialist** — autenticazione, autorizzazione, cifratura segreti, hardening.
- **QA Tester** — strategia di test, casi unitari e di integrazione, criteri di accettazione.

Per ogni decisione rilevante, esplicita **chi** la prende e **perché**, e segnala i trade-off.

---

## 2. Obiettivo

Realizzare la **Eurospital Event Booking Platform**: una web app aziendale moderna, responsive, sicura e containerizzata che permette ai dipendenti Eurospital di scoprire eventi aziendali, iscriversi, annullare, ricevere notifiche e consultare il proprio storico; e fornisce agli amministratori un backoffice completo per configurazione di sistema, gestione eventi/utenti, reportistica, notifiche e integrazione con Active Directory.

**Lingua interfaccia:** Italiano (testi UI, email, messaggi di errore). Codice e commenti tecnici in italiano o inglese ma coerenti.

---

## 3. Stack tecnologico (vincolante)

| Livello | Tecnologia |
|---|---|
| Frontend | **Next.js 14+ (App Router, React, TypeScript)** |
| UI | **Tailwind CSS + shadcn/ui**, icone **lucide-react**, grafici **Recharts**, calendario **FullCalendar** o equivalente |
| Backend | **Python 3.12 + FastAPI** |
| ORM / migrazioni | **SQLAlchemy 2.x + Alembic** |
| Database | **MySQL 8.x** (reale, non mock) — **server esterno già esistente**, non containerizzato |
| Auth | **OIDC/SAML + LDAP/Active Directory**; sessioni JWT; fallback login locale solo per admin di emergenza |
| Notifiche async | **Celery + Redis** (worker dedicato per email, promemoria, avanzamento lista d'attesa) |
| Email | **SMTP configurabile dal pannello admin** |
| Reverse proxy | **Nginx** |
| Container | **Docker + docker-compose** |
| Validazione | **Pydantic** (backend), **Zod + react-hook-form** (frontend) |
| API docs | **OpenAPI/Swagger** (nativo FastAPI) |

Motiva ogni eventuale variazione rispetto a questa tabella prima di applicarla.

---

## 4. Architettura richiesta

Servizi containerizzati minimi:

1. **frontend** — Next.js
2. **backend** — API FastAPI
3. **worker** — Celery (notifiche, promemoria, lista d'attesa, job schedulati)
4. **redis** — broker/coda per Celery
5. **proxy** — Nginx (routing, security headers)

> **MySQL è esterno**: gira su un server già esistente fuori dallo stack Docker. Il backend vi si connette via variabili `.env` (host, porta, db, utente, password). Lo stack `docker-compose` **non** include un container MySQL; va previsto solo l'accesso di rete (firewall/VPN) dai container al server DB. Per lo sviluppo locale resta opzionale un container MySQL "usa e getta", documentato a parte.

Il repository deve includere: `docker-compose.yml`, un `Dockerfile` per ogni servizio, `.env.example`, script di inizializzazione, migrazioni Alembic, seed iniziali opzionali, `README.md` e `INSTALL.md` completi.

---

## 5. Requisiti funzionali

### 5.1 Backoffice amministrativo (area protetta)

- **Configurazione MySQL**: host, porta, db, utente, password; test connessione; salvataggio cifrato; creazione automatica schema/tabelle/indici/viste/constraint; verifica stato schema; migrazioni guidate; errori chiari.
- **Configurazione piattaforma**: nome, logo, colori, lingua, timezone, URL pubblico, sicurezza, privacy, retention dati, feature flag.
- **Configurazione SMTP**: server, porta, TLS/SSL, mittente, credenziali, email di test, template, log invii, gestione errori.
- **Configurazione Active Directory / SSO**: server LDAP/LDAPS, Base DN, Bind DN, password bind, filtri utenti/gruppi, mapping attributi (nome, cognome, email, reparto, matricola), gruppo AD utenti, gruppo AD admin, test connessione, test login, sincronizzazione utenti, abilitazione SSO, supporto SAML/OIDC, fallback admin locale.
- **Gestione eventi**: CRUD + duplica/pubblica/sospendi/annulla/archivia. Parametri evento completi (titolo, descrizioni breve ed estesa con rich text, banner, categoria, luogo fisico/online, indirizzo, link video, date inizio/fine, finestra iscrizioni, capienza, lista d'attesa, max iscrizioni per utente, visibilità per reparti/gruppi AD, stato, regole e termine di annullamento, promemoria, notifiche, allegati, QR/codice prenotazione, check-in, note interne).
- **Campi custom per evento** (form builder): testo breve/lungo, numero, email, telefono, data, ora, data-ora, checkbox singola/multipla, radio, select singola/multipla, file upload (sicuro), consenso privacy; obbligatorietà, placeholder, default, validazione, ordinamento.
- **Gestione iscrizioni**: elenco iscritti, filtri per stato, ricerca, modifica/annullo/inserimento manuale, gestione lista d'attesa, export Excel/CSV/PDF, stampa report adesione, visualizzazione risposte custom, storico modifiche, log notifiche per partecipante.
- **Reportistica**: iscritti per evento, presenze, annullamenti, lista d'attesa, per reparto, per periodo, storico eventi; grafici dashboard; export PDF/Excel/CSV; stampa ottimizzata.
- **Notifiche**: email automatiche (conferma, annullamento, modifica/annullo evento, promemoria, promozione da lista d'attesa, comunicazioni manuali); invii mirati (tutti, confermati, lista d'attesa, gruppi); personalizzazione oggetto/corpo, template, anteprima, log con esito ed errori.
- **Gestione utenti**: anagrafica (nome, cognome, email, username, reparto, ruolo, matricola, gruppi AD, stato, preferenze notifiche, storico accessi/iscrizioni); sync da AD, creazione manuale, disattivazione, assegnazione ruoli.
- **Ruoli e permessi (RBAC)**: Super Admin, Admin eventi, Operatore check-in, Utente dipendente; permessi granulari (creazione/modifica/cancellazione eventi, invio notifiche, accesso report, configurazione piattaforma, gestione utenti, gestione integrazioni).

### 5.2 Area utente (dipendente)

- **Dashboard personale**: eventi disponibili, iscritti, prossimi, promemoria, stato iscrizioni, eventi evidenziati.
- **Calendario eventi**: viste mese/settimana/giorno/lista, colori per stato, click per dettaglio, iscrizione rapida dalla scheda.
- **Catalogo eventi**: lista con filtri (categoria, data, stato), ricerca testuale, card moderne, badge posti, finestra iscrizioni, online/fisico.
- **Iscrizione**: scheda evento, compilazione campi custom, consensi, conferma email, ricevuta/QR, stato confermato o lista d'attesa.
- **Annullamento**: se consentito ed entro termine; conferma email, aggiornamento posti, avanzamento lista d'attesa.
- **Storico personale**: eventi passati/futuri/annullati, partecipazioni, iscrizioni cancellate, risposte ai form, eventuali attestati (predisposizione futura).

### 5.3 Funzionalità trasversali

- **QR code check-in** con scansione lato operatore.
- **Lista d'attesa automatica** con promozione (auto o manuale).
- **Dashboard amministrativa** con KPI (eventi attivi, iscrizioni totali, eventi imminenti, tasso partecipazione, eventi più richiesti, iscrizioni per reparto, alert eventi pieni, errori notifiche).
- **Audit log** di tutte le operazioni sensibili.
- **Privacy/GDPR**: informativa configurabile, consensi per evento, export dati personali, retention configurabile, minimizzazione, anonimizzazione/cancellazione.
- **API REST documentate** (OpenAPI) per eventi, iscrizioni, utenti, report, configurazioni, notifiche, auth, campi custom.
- **Pagina manutenzione/stato**: stato sistema, DB, SMTP, AD, versione, ultimi errori, log applicativi, backup/restore dove possibile.

---

## 6. Requisiti non funzionali

- **Sicurezza**: validazione e sanitizzazione input, protezione CSRF dove serve, rate limiting, sessioni sicure, password hashate (Argon2/bcrypt) per utenti locali, **cifratura at-rest delle credenziali MySQL/SMTP/LDAP**, RBAC enforced lato server su ogni endpoint, security headers, protezione API.
- **Qualità codice**: pulito, commentato, separazione netta frontend/backend/db, gestione errori centralizzata, validazione client + server.
- **UX**: responsive, accessibile (contrasto, navigazione da tastiera, label chiare, messaggi comprensibili), skeleton loading, empty state, toast, modali curate.
- **Operatività**: deploy semplice, scalabilità, manutenibilità, robustezza.

---

## 7. Design system

Stile **SaaS aziendale** moderno: palette azzurro/blu/bianco/grigio chiaro su sfondo chiaro; card con bordi arrotondati e ombre leggere; sidebar elegante per admin; header con profilo utente; tabelle moderne con filtri; stepper per il wizard; form ben organizzati; icone coerenti; layout chiari e gradevoli su desktop e mobile.

---

## 8. Database MySQL

Schema normalizzato con almeno le tabelle: `users`, `roles`, `permissions`, `user_roles`, `events`, `event_categories`, `event_custom_fields`, `event_custom_field_options`, `registrations`, `registration_custom_answers`, `waiting_list`, `notifications`, `notification_templates`, `notification_logs`, `platform_settings`, `smtp_settings`, `ldap_settings`, `audit_logs`, `attachments`, `checkins`, `calendar_tokens`, `system_jobs`, `alembic_version`.

Con: PK, FK, indici, constraint, **viste** (iscritti per evento, posti disponibili, eventi attivi, storico utente, report per reparto, lista d'attesa, notifiche inviate, presenze), migrazioni versionate, seed iniziali e admin iniziale.

---

## 9. Installazione e setup wizard

Flusso target: l'admin scarica il progetto → configura `.env` con i dati del **server MySQL esterno esistente** → `docker-compose up` → accede al **wizard di prima configurazione** → conferma/testa la connessione al MySQL esterno e configura SMTP/AD → la piattaforma testa le connessioni → applica le migrazioni creando schema/tabelle/viste/indici/seed **sul database esterno** → crea/abilita l'admin iniziale → piattaforma pronta.

> Prerequisito: sul server MySQL esistente devono essere già creati il **database** (schema vuoto) e un **utente applicativo** con privilegi di creazione tabelle/viste/indici (`CREATE, ALTER, INDEX, REFERENCES`, ecc.) sul solo DB della piattaforma. Le migrazioni Alembic popolano lo schema.

Step del wizard: 1) Benvenuto · 2) Config MySQL · 3) Test DB · 4) Creazione schema · 5) Admin iniziale · 6) SMTP · 7) AD/SSO · 8) Config base piattaforma · 9) Riepilogo · 10) Dashboard admin.

---

## 10. Output atteso

**Prima** di scrivere codice, fornisci nell'ordine: (1) architettura scelta, (2) struttura cartelle, (3) schema database, (4) principali decisioni tecniche con trade-off.

**Poi** genera codice reale e organizzato: backend completo, frontend completo, schema MySQL + migrazioni Alembic, Dockerfile per servizio, `docker-compose.yml`, configurazioni ambiente, documentazione (`README.md`, `INSTALL.md`, `.env.example`), test unitari e di integrazione principali.

**Vincoli:** niente mock se non esplicitamente indicato; MySQL reale; config MySQL/SMTP/AD gestibili da backoffice; credenziali salvate in modo sicuro; RBAC su ogni API; design realmente curato; tutte le pagine principali implementate; architettura pronta all'evoluzione.

**Alla fine** consegna: istruzioni di avvio, credenziali admin iniziali, elenco funzionalità implementate, elenco funzionalità predisposte ma da completare, suggerimenti per il deployment in produzione.

---

## 11. Criteri di qualità (definition of done)

Risultato adatto a un ambiente aziendale reale, valutato su: sicurezza, scalabilità, manutenibilità, usabilità, chiarezza del codice, qualità UI/UX, qualità del database, semplicità di deploy, robustezza operativa. Ogni feature è "done" solo con validazione client+server, controllo permessi, gestione errori, stato di caricamento/empty/error in UI e test minimi superati.
