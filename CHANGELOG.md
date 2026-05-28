# Changelog

Tutte le modifiche significative al progetto.

## [1.0.0-rc1] — 2026-05-28 (Release Candidate)

Prima release candidate. Tutte le fasi F0-F10 mergiate su `main`.

### F10 — Release candidate
- Healthcheck dettagliato `/api/health/detailed` (verifica DB + Redis).
- Script `scripts/backup-mysql.sh` + `restore-mysql.sh` (dump giornaliero con retention 14, restore con conferma).
- README riscritto (quickstart, stack, funzionalità per fase, operatività).
- INSTALL: aggiunta sezione completa deploy produzione (prerequisiti server, configurazione `.env`, backup/restore, manutenzione, monitoraggio, smoke test).
- Fix 3 test pre-esistenti su `setup_service` via fixture autouse che override `database_url` per la sessione di test.

### F9 — Sicurezza & GDPR
- Rate limit sliding-window Redis su `/api/auth/{login,refresh}` (10/15min).
- Security headers globali (CSP strict, X-Frame-Options, Referrer-Policy, Permissions-Policy).
- Audit log persistente (`audit_logs`) con hook su login/refresh/logout/anonymize.
- GDPR self-service export (`GET /api/me/data-export`) + admin anonymize (`POST /api/admin/users/{id}/anonymize`).
- CLI `cleanup-audit-logs` per retention configurabile (`AUDIT_LOG_RETENTION_DAYS=730`).
- UI `/admin/audit` con tabella log + form anonymize + link export su profilo dipendente.

### F8 — Integrazione AD/LDAP
- Bind login + sync utenti automatico (mapping AD `sAMAccountName/mail/displayName/department/memberOf`).
- Role mapping: `admins_group` → `super_admin`, `users_group` → `employee`.
- Visibilità eventi ristretti per `ldap_groups`/`department` matchanti.
- API admin `/api/admin/ldap/*` (settings, preview, sync user, sync all).
- UI `/admin/settings/ldap` (LdapConfigForm + SyncPanel).

### F7 — Report & dashboard
- KPI globali (eventi, iscrizioni per stato, attendance rate, top events, registrazioni per mese).
- Report singolo evento (counts + custom fields summary).
- Export CSV (UTF-8 BOM, Excel-friendly).
- Dashboard `/admin` con KpiCard + BarChart SVG + filtri periodo.
- Tab "Report" su `/admin/events/[id]`.

### F6 — Notifiche email
- Worker Celery + Redis broker.
- Template Jinja sandbox + 4 default (`registration_{confirmed,waitlisted,cancelled,promoted}`).
- Enqueue automatico su register/cancel/promote.
- Retry exp backoff 3x su SMTP error.
- UI admin `/admin/notifications` (editor + log + resend).

### F5 — Area dipendente
- Catalogo eventi, calendario (mese/sett/giorno/lista), profilo + change password.
- Iscrizione self-service con campi custom dinamici + ricevuta QR.
- Ruolo `employee` + middleware routing `/app` vs `/admin`.

### F4 — Iscrizioni & check-in
- Capienza + lista d'attesa con promozione automatica.
- Check-in via QR token firmato.
- Ruolo `checkin_operator`.

### F3 — Dominio eventi
- Eventi + categorie + campi custom + allegati + visibilità (all/restricted).
- CRUD admin + publish workflow.

### F2 — Setup wizard
- Wizard 10-step `/setup` (test connessione MySQL/SMTP/AD, settings cifrate Fernet).

### F1 — Foundations
- SQLAlchemy 2 + Alembic, Argon2id, JWT HS256 + refresh token revocabili in DB.
- RBAC (`require_permission`), bootstrap admin via CLI.

### F0 — Scaffolding
- Monorepo Next.js 15 + FastAPI + nginx + docker-compose.
- CI GitHub Actions (lint + test backend + frontend).
