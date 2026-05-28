# Design F8 — Integrazione AD/LDAP

**Fase:** F8 (piano di sviluppo, sezione 5)
**Obiettivo:** login AD/LDAP per dipendenti (bind con credenziali AD), sync attributi (username/email/full_name/department), mapping gruppi AD → ruoli locali, sync utenti su login + comando admin, e applicazione visibilità eventi ristretti (F3) usando i gruppi AD dell'utente. Output: un dipendente con account AD si logga con le sue credenziali aziendali sulla `/login`, è creato/aggiornato automaticamente come `auth_source='ldap'`, vede gli eventi destinati ai suoi gruppi/reparti.
**Prerequisito:** F1 (auth/RBAC), F2 (`ldap_settings` cifrate, test connessione AD nel wizard), F3 (event_visibility con gruppi), F5 (catalog), F7 (KPI) tutti su `main`.

---

## 1. Decisioni fissate (brainstorming)

| Ambito | Scelta |
|---|---|
| Protocollo | **LDAP/LDAPS** via `ldap3` (già in deps). **OIDC/SAML rinviati** a F8-stretch (richiedono provider esterno + redirect dance). |
| Bind login | `auth_service.login()` modificato: se `ldap_settings.sso_enabled=True` e l'utente non è solo locale (`auth_source != 'local'`), prova prima LDAP bind con `{username}@domain` o filtro configurabile; fallback locale per `auth_source='local'` (admin di emergenza). |
| Sync auto | Al primo login LDAP riuscito: crea utente locale con `auth_source='ldap'`, popola da attributi mappati, assegna ruoli da `users_group`/`admins_group`. Su login successivi: aggiorna `full_name`, `email`, `department`, `ldap_groups`. |
| Mapping attr | Default Active Directory: `{username: sAMAccountName, email: mail, full_name: displayName, department: department, groups: memberOf}`. Override via `ldap_settings.attr_mapping` (JSON). |
| Gruppi → ruoli | `admins_group` (CN) → `super_admin` locale; `users_group` (CN) → `employee` locale. Tutti gli altri CN restano in `users.ldap_groups` (JSON list) per visibility. Mapping personalizzato rinviato. |
| Tabelle | Migrazione 0010 aggiunge a `users`: `auth_source VARCHAR(16) DEFAULT 'local'`, `ldap_dn VARCHAR(512) NULLABLE`, `department VARCHAR(255) NULLABLE`, `ldap_groups JSON`. Nuovo permesso `users.ldap_sync` su super_admin. |
| Visibility | `catalog_service.list_visible_events` modificato: utenti con `auth_source='ldap'` vedono anche eventi con `event_visibility.mode='restricted'` quando uno dei loro `ldap_groups`/`department` matcha un record di `event_visibility` per quell'evento. Per utenti locali (admin/test) visibilità ristretta resta nascosta (come F5). |
| API admin | `POST /api/admin/ldap/sync-user/{username}` → forza sync di un utente. `POST /api/admin/ldap/sync-all` → sync di tutti gli utenti del `users_group`. `GET /api/admin/ldap/preview?username=...` → mostra attributi mappati senza scrivere. Tutti dietro `require_permission('users.ldap_sync')`. |
| Test bind | Endpoint setup `POST /api/setup/ad/test` (F2 esistente) basta. Niente nuovo endpoint runtime. |
| Frontend | Pagina `/admin/settings/ldap` (sostituisce TODO di F2): toggle `sso_enabled`, attr_mapping JSON, users_group / admins_group, pulsante "Sync ora", pulsante "Anteprima utente". Form già abbozzato nel wizard F2 — riutilizzare. |
| Sicurezza | Bind credentials cifrate Fernet (già F2). Niente cache password utente in chiaro. LDAP timeout 10s. TLS forzato se `ldaps://` o `start_tls`. |

---

## 2. Architettura

```
[login] → auth_service.login()
            ├── if sso_enabled and auth_source!=local: try ldap_service.bind_user(username,pw)
            │     └── ok → ldap_service.sync_user(username, attrs) → returns User
            │     └── fail → fallback to local password check (only if user is local)
            └── else: local password
[admin] → POST /admin/ldap/sync-all → ldap_service.sync_users_in_group(users_group)
```

### Struttura backend

```
backend/
  app/
    services/
      ldap_service.py            # bind, search, attribute mapping, sync
      auth_service.py            # MODIFY: try LDAP first
      catalog_service.py         # MODIFY: restricted events visible if ldap_groups/department match
      settings_service.py        # already exposes ldap getters
    schemas/
      ldap.py                    # LdapSyncResult, LdapPreviewOut
    api/routers/
      ldap.py                    # /api/admin/ldap/*
      auth.py                    # no change (auth_service is the gate)
    main.py                      # MODIFY: include router
  models/
    user.py                      # MODIFY: auth_source, ldap_dn, department, ldap_groups
  alembic/versions/
    0010_ldap_users.py           # ALTER users + seed perm
  tests/
    test_ldap_service.py         # ldap3 MOCK_SYNC backend
    test_ldap_login.py           # auth_service login path
    test_catalog_visibility_ldap.py  # restricted events shown to matching ldap users
    test_ldap_api.py
    test_migration.py            # MODIFY: assert columns + perm
```

### Struttura frontend

```
frontend/
  app/admin/settings/ldap/
    page.tsx                     # config + sync UI
  components/admin/ldap/
    ldap-config-form.tsx
    sync-panel.tsx
  lib/ldap-api.ts
  __tests__/
    ldap-config-form.test.tsx
```

---

## 3. Contratti API

### `GET /api/admin/ldap/settings`
→ stato corrente (senza password): `{ sso_enabled, server_uri, base_dn, bind_dn, user_filter, group_filter, attr_mapping, users_group, admins_group, has_bind_password }`.

### `PUT /api/admin/ldap/settings`
Body: gli stessi campi + opzionale `bind_password` (string, se presente cifra e salva). → `200`.

### `POST /api/admin/ldap/test-connection`
→ `{ ok, message }`.

### `GET /api/admin/ldap/preview?username=...`
→ `{ attrs: {username, email, full_name, department}, groups: [...], dn, mapped_roles: [...] }`.

### `POST /api/admin/ldap/sync-user/{username}`
→ `{ ok, action: "created"|"updated", user_id }`.

### `POST /api/admin/ldap/sync-all`
→ `{ ok, created: N, updated: N, errors: N }`.

---

## 4. Login flow (auth_service)

```python
def login(db, identifier, password):
    user = users.find_by_username_or_email(identifier)
    settings = settings_service.get_ldap(db)
    if settings.sso_enabled and (user is None or user.auth_source == "ldap"):
        bind_ok = ldap_service.bind_user(db, identifier, password)
        if bind_ok:
            user = ldap_service.sync_user(db, identifier)
            return user
        # if user is None or ldap-only → fail
        if user is None or user.auth_source != "local":
            raise AuthError("invalid credentials")
    # local fallback (only when sso disabled or user is local)
    if user is None or not user.hashed_password or not verify_password(password, user.hashed_password):
        raise AuthError("invalid credentials")
    return user
```

---

## 5. Catalog visibility con AD

```python
def list_visible_events(db, user):
    base = select(Event).where(Event.status == "published")
    if user.auth_source == "ldap":
        # show all unrestricted + restricted where user matches
        groups = (user.ldap_groups or []) + ([user.department] if user.department else [])
        # subquery: restricted event_ids where match
        match = select(EventVisibility.event_id).where(
            EventVisibility.mode == "restricted",
            EventVisibility.group_value.in_(groups),
        )
        # restricted events without matching group → hide
        hidden = select(EventVisibility.event_id).where(
            EventVisibility.mode == "restricted"
        ).except_(match)
        base = base.where(Event.id.notin_(hidden))
    else:
        # legacy F5: hide all restricted
        restricted = select(EventVisibility.event_id).where(
            EventVisibility.mode == "restricted"
        )
        base = base.where(Event.id.notin_(restricted))
    return base
```

Conserva semantica F5 per utenti locali, attiva visibilità mirata per utenti AD.

---

## 6. Test

- `test_migration`: colonne `auth_source`/`ldap_dn`/`department`/`ldap_groups`, perm `users.ldap_sync` su super_admin.
- `test_ldap_service`: usa `ldap3.MOCK_SYNC` backend per simulare AD. Caso: bind ok, bind fail, search user + groups, mapping default + custom, sync create + update, role assignment da gruppi.
- `test_ldap_login`: con `sso_enabled=True`, login LDAP riuscito crea user; login LDAP fallito → 401; user locale (admin) può sempre loggarsi col fallback.
- `test_catalog_visibility_ldap`: utente LDAP con gruppo "IT" vede evento ristretto a "IT"; utente "HR" non lo vede; utente locale non vede mai ristretti.
- `test_ldap_api`: preview/sync/test endpoints richiedono `users.ldap_sync` (403 senza); sync-all ritorna contatori.

---

## 7. Out-of-scope F8 (rinviati)

- OIDC + SAML.
- Sync schedulato (richiede beat F6-stretch).
- Custom mapping gruppo→ruolo dal backoffice (oltre ai due slot `users_group`/`admins_group`).
- Foto utente da `thumbnailPhoto`.
- LDAP-only password change (rinviato, gestione password resta AD-side).
