# Design F9 — Sicurezza & GDPR

**Fase:** F9 (piano di sviluppo, sezione 5)
**Obiettivo:** rate limit su auth, security headers globali, audit log persistente per azioni sensibili, export self-service dati utente (Art. 15 GDPR), anonimizzazione utente da admin (Art. 17 GDPR), retention configurabile. Output: piattaforma hardened contro brute-force + tracking azioni admin + utente può scaricare i propri dati + admin può rimuovere PII su richiesta.
**Prerequisito:** F1-F8 in `main`.

---

## 1. Decisioni fissate

| Ambito | Scelta |
|---|---|
| Rate limit | In-process counter su Redis (riusa F6) con sliding window. Applicato a `/api/auth/login`, `/api/auth/refresh`, `/api/setup/*`. Limite default 10 tentativi/15 min per IP+username; bypass via header `X-Forwarded-For` rispettato (nginx imposta). Fallisce → 429 + retry-after. Se Redis down → fail-open (log warning). |
| Security headers | Middleware FastAPI custom: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), microphone=(), camera=()`, `Content-Security-Policy` (default-src 'self'; allow inline styles for SVG charts; img-src self data:). HSTS gestito a livello NPM upstream (TLS lì). |
| Audit log | Tabella `audit_logs(id, actor_id, action, target_type, target_id, ip, user_agent, payload JSON, created_at)`. Service `audit_service.log(db, *, actor, action, target_type, target_id, payload)`. Eventi auditati: login success/fail, logout, refresh, user create/delete/anonymize, role assign/remove, event publish/cancel, registration cancel (admin), ldap sync, settings change (smtp/ldap), notification template update. |
| GDPR export self | `GET /api/me/data-export` → JSON con `user` (campi PII), `registrations` (con event title + answers), `notification_logs` (last 100), `audit_logs` dove actor_id = user. Filename `data-export-{user_id}-{date}.json`. |
| GDPR anonymize | `POST /api/admin/users/{id}/anonymize` perm `users.admin`. Mantiene `id` + `audit_logs` (referenzialità), sostituisce email/username/full_name/department con placeholder `deleted-user-{id}@example.invalid` / `deleted-{id}` / `null`, azzera `hashed_password`, `ldap_dn`, `ldap_groups`, `is_active=False`. Iscrizioni preservate ma con utente anonimizzato. Audit log entry `user.anonymize`. |
| Permesso `users.admin` | Nuovo permesso (seed migrazione) su super_admin. Usato anche per future operazioni di gestione utenti. |
| Retention | Variabile env `AUDIT_LOG_RETENTION_DAYS` (default 730 = 2 anni). Comando CLI `python -m app.cli cleanup-audit-logs` per cron. Niente beat job (F6 stretch). |
| Consensi | Documentazione: già presente sui form F4 (`consent_*` campi custom). Aggiunta sezione INSTALL. |
| Test | Audit log scrittura su login/anonymize; rate limit blocca dopo N; security headers presenti su risposte; export ritorna JSON utente; anonymize azzera PII e logga; suite full backend rimane verde. |

---

## 2. Architettura

```
[middleware]
  ├── SecurityHeadersMiddleware   (aggiunge headers a ogni response)
  └── RateLimitMiddleware(scope)  (su /api/auth/*, /api/setup/*)
       └── Redis counter (sliding window 15 min)
[service]
  ├── audit_service.log(db, actor=..., action=..., ...)
  └── gdpr_service.export_for(db, user) / anonymize_user(db, user_id)
[router]
  ├── auth.py: chiamate a audit_service su login/refresh/logout
  ├── me.py: GET /api/me/data-export
  ├── users.py (nuovo): POST /api/admin/users/{id}/anonymize, GET /api/admin/audit-logs
```

### Struttura backend

```
backend/
  app/
    core/
      security_headers.py
      rate_limit.py
    services/
      audit_service.py
      gdpr_service.py
    schemas/
      audit.py
      gdpr.py
    api/routers/
      users.py        # anonymize + audit-logs list
      me.py           # data-export
      auth.py         # MODIFY: audit calls + rate limit applied
    main.py           # MODIFY: install middlewares + new routers
    cli.py            # MODIFY: cleanup-audit-logs
    core/config.py    # MODIFY: AUDIT_LOG_RETENTION_DAYS, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW
  models/
    audit_log.py      # new
  alembic/versions/
    0011_audit_logs.py
  tests/
    test_audit_service.py
    test_rate_limit.py
    test_security_headers.py
    test_gdpr_api.py
    test_migration.py # MODIFY
```

### Frontend

```
frontend/
  app/admin/audit/
    page.tsx           # log table
  app/app/profile/
    page.tsx           # MODIFY: link "Esporta i miei dati"
  components/admin/
    audit-log-table.tsx
  lib/audit-api.ts
```

---

## 3. API

### `GET /api/me/data-export`
Auth required, no permesso. → `application/json` allegato.

### `POST /api/admin/users/{id}/anonymize` (perm `users.admin`)
→ `{ ok: true, user_id, anonymized_at }`.

### `GET /api/admin/audit-logs?actor_id?&action?&from?&to?&limit?&offset?` (perm `users.admin`)
→ `{ items, total }`.

---

## 4. Rate limit

Sliding window via Redis ZSET key `rl:{scope}:{ip}:{identifier}`:
- ZADD score=timestamp_ms member=uuid
- ZREMRANGEBYSCORE < now-window
- ZCARD > max → 429

Su login: `identifier = body.identifier` (lowercased). Su refresh: `identifier = ip`. Su setup: `identifier = path`.

Redis offline → log warning, allow request (fail-open). Comportamento documentato.

---

## 5. Security headers

Middleware ASGI:

```python
async def dispatch(req, call_next):
    res = await call_next(req)
    res.headers["X-Content-Type-Options"] = "nosniff"
    res.headers["X-Frame-Options"] = "DENY"
    res.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    res.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    res.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
        "script-src 'self'; frame-ancestors 'none'"
    )
    return res
```

CSP `unsafe-inline` su style necessario per shadcn/Tailwind; script-src strict.

---

## 6. Out-of-scope F9 (rinviati)

- DPIA documentation.
- IP allow/deny lists.
- Anti-CSRF token (cookie httpOnly + SameSite=Lax già coprono i flussi web).
- Penetration test reportistica.
- Privacy by design walkthrough per ogni feature (rinviato a F10 QA & docs).
- Beat job retention (manuale via cron F10).
- Notifiche email per export ready (export è sincrono, JSON piccolo).
