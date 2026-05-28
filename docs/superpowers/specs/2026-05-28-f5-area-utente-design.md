# Design F5 — Area utente (dipendente)

**Fase:** F5 (piano di sviluppo, sezione 5)
**Obiettivo:** Area dipendente completa: dashboard personale, catalogo eventi con filtri, calendario (mese/settimana/giorno/lista), scheda evento con iscrizione self-service (campi custom + consensi), ricevuta/QR, storico delle proprie iscrizioni con annullamento, profilo con cambio password. Output: un dipendente accede, scopre e si iscrive agli eventi, gestisce le proprie prenotazioni.
**Prerequisito:** F1 (auth/RBAC + cookie session F3), F2 (setup), F3 (eventi + campi custom + visibilità), F4 (iscrizioni: register/cancel/QR/`/me/registrations`) già in `main`.

---

## 1. Decisioni fissate (brainstorming)

| Ambito | Scelta |
|---|---|
| Catalogo | Nuovi endpoint `/api/catalog/*` accessibili a qualsiasi utente autenticato (nessun permesso admin). Mostrano solo eventi `published` con visibilità `all`. Gli eventi `restricted` restano nascosti finché F8 non porta reparti/gruppi AD per il match (nessuna fuga di eventi riservati). |
| Routing login | Migrazione che seed-a un ruolo `employee` (senza permessi). Dopo il login si legge `/api/auth/me`: se l'utente ha **almeno un permesso** → area staff `/admin`; se non ne ha → area dipendente `/app`. I dipendenti portano il ruolo `employee` (zero permessi) e atterrano su `/app`. |
| Calendario | Tutte e quattro le viste: mese, settimana, giorno, lista. Logica date pura e testabile in `lib/calendar-utils.ts`; nessuna libreria calendario pesante. |
| Profilo | Visualizza nome/email/username (read-only; l'anagrafica completa arriva da AD/gestione utenti) + cambio password (endpoint self con verifica della vecchia password). Preferenze notifiche rinviate a F6. |
| Iscrizione | Riusa il self-register F4 (`POST /api/events/{id}/registrations`) con form a campi custom dinamici + consensi; ricevuta/QR via `GET /api/registrations/{id}/qr`; storico via `GET /api/catalog/my-events` (arricchito con dati evento); annullamento via `POST /api/registrations/{id}/cancel` (F4). |

---

## 2. Architettura

Pattern invariato: `routers → services → models` (backend), Next App Router (frontend). Due aggiunte backend isolate (catalogo read-only per utenti, cambio password self) e una nuova area frontend `/app` parallela a `/admin`, che condivide la sessione cookie (F3) e il client `api`.

Il catalogo è un sottosistema di sola lettura sopra il dominio eventi/iscrizioni: non introduce nuove tabelle (eccetto il seed di un ruolo), espone una vista filtrata e sicura degli eventi pubblicati e arricchisce le iscrizioni dell'utente con i dati evento.

### Struttura backend (file aggiunti/modificati in F5)

```
backend/
  app/
    services/
      catalog_service.py     # list_visible_events / get_visible_event / my_events / available_spots
      auth_service.py        # MODIFY: change_password(db, user, old, new)
    schemas/
      catalog.py             # CatalogEventItem / CatalogEventDetail / MyEventItem
      auth.py                # MODIFY: ChangePasswordIn
    api/routers/
      catalog.py             # /api/catalog/events, /events/{id}, /my-events
      auth.py                # MODIFY: POST /api/auth/change-password
    main.py                  # MODIFY: include catalog router
  alembic/versions/
    0007_employee_role.py    # seed role 'employee' (no permissions)
  tests/
    test_migration.py (MODIFY), test_catalog_api.py, test_change_password_api.py
```

### Struttura frontend (file aggiunti/modificati in F5)

```
frontend/
  middleware.ts                      # MODIFY: matcher gates /admin AND /app
  lib/
    admin-api.ts                     # MODIFY: resolveLanding() reads /auth/me, returns "/admin" | "/app"
    catalog-api.ts                   # catalog client (credentials:include)
    catalog-schemas.ts               # zod: register answers, change password
    calendar-utils.ts                # pure date helpers (range, group-by-day)
  app/
    login/page.tsx                   # MODIFY: redirect by role after login
    app/
      layout.tsx                     # user shell (nav + topbar)
      page.tsx                       # dashboard
      catalog/page.tsx               # event catalog
      calendar/page.tsx              # calendar (4 views)
      events/[id]/page.tsx           # event detail + register form
      registrations/page.tsx         # my registrations / history
      profile/page.tsx               # profile + change password
  components/app/
    user-nav.tsx, user-topbar.tsx
    event-card.tsx
    register-form.tsx                # dynamic custom-field inputs + consents
    registration-receipt.tsx        # QR + status
    calendar/{calendar-view,month-grid,week-grid,day-list,agenda-list}.tsx
  __tests__/
    calendar-utils.test.ts, register-form.test.tsx, event-card.test.tsx
```

---

## 3. Backend

### 3.1 Migration `0007_employee_role`

Idempotent seed (stile `0002`): inserisce il ruolo `employee` con descrizione "Dipendente" e **nessun** permesso associato. `downgrade` rimuove eventuali `role_permissions` (nessuno) e il ruolo. Nessuna tabella nuova.

### 3.2 Catalog service + API

`catalog_service`:
- `list_visible_events(db, *, category_id, q, date_from, date_to, page, page_size)` → eventi con `status='published'` **e** visibilità effettiva `all`. La visibilità `all` è determinata così: l'evento non ha righe `event_visibility` con `mode='restricted'` (un evento è "all" se non ha visibilità impostata oppure ha `mode='all'`). Filtri opzionali categoria/ricerca-titolo/range `start_at`. Ordinati per `start_at`.
- `get_visible_event(db, event_id, *, user_id)` → un evento se visibile (published+all), altrimenti `CatalogError`. Calcola `available_spots` e `my_status`.
- `available_spots(db, event)` → `None` se `capacity` è null, altrimenti `capacity - (confirmed+attended)` (mai negativo).
- `registration_open(event)` → `True` se published, dentro finestra (`registration_open_at`/`close_at` se presenti) e (posti disponibili o `waitlist_enabled`).
- `my_events(db, user_id)` → le iscrizioni dell'utente con dati evento (titolo, start_at, status iscrizione, id) per lo storico.

`my_status`: stato dell'iscrizione **attiva** dell'utente per l'evento (`confirmed/waitlisted/pending/attended`) o `None` se non iscritto/annullato.

Router `catalog.py` (tutti richiedono solo `get_current_user`, nessun `require_permission`):
| Endpoint | Azione |
|---|---|
| `GET /api/catalog/events` | lista eventi visibili con filtri + paginazione; ogni item: id, title, short_description, category, mode, start_at, end_at, available_spots, registration_open, my_status |
| `GET /api/catalog/events/{id}` | dettaglio evento visibile (404 se non visibile) + campi custom (per il form) + available_spots + my_status + registration_open |
| `GET /api/catalog/my-events` | le iscrizioni dell'utente corrente arricchite (event_title, event_start_at, registration_id, status) |

> Il dettaglio espone i campi custom dell'evento (label, tipo, required, opzioni) così il form di iscrizione li può rendere. Riusa `custom_field_service.get_fields`/`get_options` (F3).

### 3.3 Cambio password (self)

`auth_service.change_password(db, user, *, old_password, new_password)`: verifica `old_password` con `verify_password` (argon2); se errata → `AuthError`; altrimenti `user.hashed_password = hash_password(new_password)`. Endpoint `POST /api/auth/change-password` (richiede `get_current_user`), body `{old_password, new_password}` (min 8). Vecchia errata → `400`; ok → `204`. Non tocca password di altri utenti.

---

## 4. Frontend area utente (`/app`)

**Sessione/routing**: il middleware estende il gate cookie a `/app` (oltre a `/admin`). Dopo il login, `lib/admin-api.ts` espone `resolveLanding()` che chiama `/api/auth/me` e ritorna `/admin` se `permissions.length > 0`, altrimenti `/app`; la login page reindirizza di conseguenza. Il client `api` (cookie + auto-refresh 401) è condiviso; `catalog-api.ts` lo riusa.

**Shell** (`app/app/layout.tsx`): `user-nav` (Dashboard, Catalogo, Calendario, Le mie iscrizioni, Profilo) + `user-topbar` (nome utente da `/auth/me`, logout). Palette coerente (azzurro/blu).

**Pagine**:
- `app/app/page.tsx` — **Dashboard**: prossime iscrizioni confermate (da `/catalog/my-events`), eventi disponibili in evidenza (primi del catalogo), stato sintetico.
- `app/app/catalog/page.tsx` — **Catalogo**: griglia di `event-card` (titolo, categoria, data, badge `available_spots`/posti esauriti, online/fisico, `my_status` se iscritto, finestra iscrizioni); filtri categoria/ricerca/data (query verso `/api/catalog/events`).
- `app/app/calendar/page.tsx` — **Calendario** (sezione 5).
- `app/app/events/[id]/page.tsx` — **Scheda evento**: dettaglio (descrizione HTML già sanitizzata server-side), `register-form` se `registration_open` e non già iscritto; mostra esito (confirmed/waitlisted) e `registration-receipt` (QR) per iscrizioni confermate.
- `app/app/registrations/page.tsx` — **Le mie iscrizioni / storico**: sezioni Futuri / Passati / Annullati (split per data evento + stato); QR per confermati; bottone Annulla (chiama F4 cancel, gestisce 422 se non consentito).
- `app/app/profile/page.tsx` — **Profilo**: nome/email/username read-only + form cambio password (vecchia/nuova, zod min 8) → `POST /api/auth/change-password`.

**Componenti**:
- `event-card.tsx` — card catalogo con badge posti/stato.
- `register-form.tsx` — genera gli input dai campi custom dell'evento per tipo (`text/textarea/number/email/phone/date/time/datetime/checkbox/checkbox_multi/radio/select/select_multi/file/privacy_consent`); i `privacy_consent` sono checkbox obbligatorie che bloccano il submit se non spuntate; raccoglie `answers: [{field_id, value}]` e chiama `POST /api/events/{id}/registrations`. (Per `file` in F5: input file con nota "caricamento gestito in fase successiva" — il valore inviato è il nome file; l'upload reale di risposte-file è fuori scope F5.)
- `registration-receipt.tsx` — `<img src="/api/registrations/{id}/qr">` + stato + codice.

Tutte le viste: stati loading/empty/error; React Query per fetch/mutation + invalidazione.

---

## 5. Calendario (4 viste)

`components/app/calendar/`:
- `calendar-view.tsx` — orchestratore: selettore vista (Mese | Settimana | Giorno | Lista) + navigazione periodo (precedente/successivo/oggi); fa un'unica fetch `GET /api/catalog/events?from=<inizio range>&to=<fine range>` per il periodo visibile e passa gli eventi alle sottoviste.
- `month-grid.tsx` — griglia mensile 7×(5–6): celle giorno con gli eventi (etichetta + colore categoria), click evento → `/app/events/{id}`.
- `week-grid.tsx` — 7 colonne (giorni della settimana) con gli eventi del giorno.
- `day-list.tsx` — eventi del singolo giorno selezionato, ordinati per ora.
- `agenda-list.tsx` — lista cronologica raggruppata per data.

`lib/calendar-utils.ts` (logica pura, testata a parte):
- `monthRange(date) → {from, to}` (primo–ultimo giorno della griglia mensile, incluse code settimana).
- `weekRange(date) → {from, to}` (lun–dom).
- `dayRange(date) → {from, to}`.
- `groupByDay(events) → Map<isoDate, Event[]>`.
- Colore categoria derivato dal campo `color` della categoria evento.

---

## 6. Sicurezza

- Endpoint catalogo: richiedono utente autenticato (cookie) ma **nessun** permesso admin; restituiscono esclusivamente eventi `published` con visibilità `all` → nessuna esposizione di bozze o eventi riservati.
- Iscrizione/annullamento riusano i servizi F4 (capienza con lock riga evento, self-access, validazione risposte).
- Cambio password self: verifica argon2 della vecchia password prima dell'aggiornamento; impossibile cambiare la password di altri (opera solo su `get_current_user`).
- Middleware: estende il gate cookie a `/app`; l'autorizzazione reale resta server-side. Un dipendente che forzasse un URL `/admin` riceverebbe `403` dalle API (nessun dato).
- HTML descrizioni già sanitizzato lato server in F3 (reso senza ulteriore esecuzione).

---

## 7. Strategia di test

- **Backend**: `list_visible_events` nasconde non-published e restricted, mostra solo all; `available_spots` corretto (pieno → 0, illimitato → null); `my_status` riflette l'iscrizione attiva; `get_visible_event` 404 su evento non visibile; `/catalog/my-events` arricchito; catalogo accessibile a utente senza permessi (no 403); change-password (vecchia errata → 400, ok → 204 e login con la nuova funziona, vecchia non più).
- **Frontend (vitest)**: `calendar-utils` (monthRange/weekRange/dayRange, groupByDay); `register-form` (render per tipo campo, consenso obbligatorio blocca submit, payload answers corretto); `event-card` (badge posti/stato).
- **e2e (curl)**: crea utente con ruolo `employee`, login → permessi vuoti (landing `/app`); `GET /api/catalog/events` mostra solo published-all; iscrizione self → confirmed; `/catalog/my-events` mostra l'iscrizione; change-password e re-login con la nuova.
- **Criteri accettazione**: catalogo non espone bozze/riservati; ogni pagina ha stati loading/empty/error; iscrizione end-to-end senza email funziona; cambio password sicuro.

---

## 8. Fuori scope (rinviato)

- Email di conferma/annullamento/promemoria + worker → **F6** (il flusso F5 funziona senza email).
- Enforcement visibilità per reparto/gruppo + sincronizzazione AD → **F8** (in F5 solo `all`).
- Upload reale dei campi-risposta di tipo `file` → fase successiva (in F5 il campo `file` è predisposto ma non carica).
- Reportistica/export, attestati di partecipazione → **F7**/futuro.
- Anagrafica completa dipendente (reparto, matricola, preferenze notifiche) e gestione utenti admin → fase utenti / **F8**.
