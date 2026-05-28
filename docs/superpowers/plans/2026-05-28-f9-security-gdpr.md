# Plan F9 — Sicurezza & GDPR

Branch `f9-security-gdpr`. TDD. Spec: [F9 design](../specs/2026-05-28-f9-security-gdpr-design.md).

---

## A — Backend

### A1. Migrazione 0011 (audit_logs + perm users.admin)
- [ ] Test in `test_migration.py`: tabella `audit_logs` + perm `users.admin`.
- [ ] Modello `AuditLog`.
- [ ] `0011_audit_logs.py` create_table + seed perm su super_admin.
- [ ] Verde. Commit `feat(f9): audit_logs + permesso users.admin`.

### A2. `audit_service`
- [ ] Test: `log(db, actor, action, target_type=None, target_id=None, payload=None, ip=None, user_agent=None)` scrive riga; `list(db, ...)` con filtri.
- [ ] `app/services/audit_service.py`.
- [ ] Verde. Commit `feat(f9): audit_service log + list`.

### A3. Hook audit su auth + altri router
- [ ] Test: login success/fail/refresh/logout scrivono audit entry; user anonymize logga; settings update logga.
- [ ] Modifica router `auth.py` per chiamare `audit_service.log` su tutti gli esiti.
- [ ] Modifica `ldap.py` su sync. `notifications.py` PUT template. `users.py` su anonymize.
- [ ] Commit `feat(f9): hook audit_service sui flussi sensibili`.

### A4. Rate limit middleware
- [ ] Test: 11 login falliti → 429 sull'undicesimo; success reset opzionale; Redis down → no errore (fail-open).
- [ ] `core/rate_limit.py` con `check_and_increment(redis, key, max, window)`; middleware applica scope `auth` su `/api/auth/login` e `/api/auth/refresh`.
- [ ] Config `RATE_LIMIT_AUTH_MAX=10`, `RATE_LIMIT_AUTH_WINDOW=900` (15min).
- [ ] Includi in `main.py` con `app.add_middleware`.
- [ ] Verde. Commit `feat(f9): rate limit auth via Redis`.

### A5. Security headers middleware
- [ ] Test: ogni response ha gli header attesi.
- [ ] `core/security_headers.py` ASGI middleware.
- [ ] Includi in `main.py`.
- [ ] Verde. Commit `feat(f9): security headers globali`.

### A6. GDPR export + anonymize
- [ ] Test: `GET /api/me/data-export` 200 con payload completo per utente loggato; anonymize azzera PII e mantiene FK iscrizioni; anonymize logga audit.
- [ ] `gdpr_service.export_for(db, user)`, `gdpr_service.anonymize_user(db, user_id)`.
- [ ] Router `me.py` (con `/data-export`) e `users.py` (con `/anonymize` + `/audit-logs`).
- [ ] Include in `main.py`.
- [ ] Verde. Commit `feat(f9): export utente GDPR + anonimizzazione admin`.

### A7. CLI retention
- [ ] `app/cli.py` aggiunge subcommand `cleanup-audit-logs` che cancella righe più vecchie di `AUDIT_LOG_RETENTION_DAYS`.
- [ ] Test minimo (su DB).
- [ ] Commit `feat(f9): CLI cleanup-audit-logs (retention configurabile)`.

---

## B — Frontend

### B1. Audit log admin
- [ ] `lib/audit-api.ts`, `components/admin/audit-log-table.tsx`, `app/admin/audit/page.tsx`.
- [ ] Sidebar link "Audit log".
- [ ] Build verde. Commit `feat(f9): UI admin audit log`.

### B2. Profile data export
- [ ] `app/app/profile/page.tsx` aggiunge link "Esporta i miei dati" → `/api/me/data-export`.
- [ ] Commit `feat(f9): link export dati nel profilo dipendente`.

### B3. Anonymize utente da admin
- [ ] Nella view utente (TBD: se non c'è una pagina utenti, esporre come azione su lista iscritti `RegistrationsPanel` ⇒ rinviato). Per F9 esporre via endpoint API e referenziarlo da audit log entry; aggiungere a sidebar "Anonimizza utente" form semplice.
- [ ] Componente `components/admin/anonymize-user.tsx` (input user_id + conferma).
- [ ] Commit `feat(f9): form admin per anonimizzare utente`.

---

## C — Docs

- [ ] INSTALL sezione "Sicurezza & GDPR (F9)" con rate limit, headers, audit log, export utente, anonymize, retention.
- [ ] Commit `docs(f9): istruzioni sicurezza e GDPR`.

---

## Self-Review

- §3 API → A6; §4 rate limit → A4; §5 headers → A5; §6 out-of-scope rispettato.
- Reuse Redis F6, perm system F1, settings F2.
- Backwards compat: nessuna rottura di endpoint esistenti, solo header aggiunti.
- Sicurezza: rate limit fail-open documentato; audit non logga password; anonymize preserva audit_logs.
