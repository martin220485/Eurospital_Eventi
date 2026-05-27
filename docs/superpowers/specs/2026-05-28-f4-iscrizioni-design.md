# Design F4 — Iscrizioni

**Fase:** F4 (piano di sviluppo, sezione 5)
**Obiettivo:** Flusso di prenotazione end-to-end lato backend più la gestione amministrativa e l'operatività di check-in. Include: iscrizione a un evento con risposte ai campi custom, enforcement capienza e `max_per_user`, lista d'attesa con promozione, annullamento, codice/QR di prenotazione firmato e check-in operatore. Output: un utente risulta iscritto/in lista d'attesa, l'admin gestisce gli iscritti, l'operatore registra le presenze via QR.
**Prerequisito:** F1 (auth/RBAC), F2 (setup), F3 (eventi con `capacity`, `waitlist_enabled`, `max_per_user`, finestra iscrizioni, campi custom) già in `main`.

---

## 1. Decisioni fissate (brainstorming)

| Ambito | Scelta |
|---|---|
| Scope | Backend iscrizioni + UI admin (gestione iscritti per evento) + UI operatore (check-in). UI self-service dipendente (catalogo, scheda, ricevuta, storico) → **F5**. |
| Stato iniziale | Iscrizione con posto libero → `confirmed`; pieno + `waitlist_enabled` → `waitlisted`; pieno senza waitlist → `409`. `pending` resta nell'enum ma inutilizzato (predisposto per future approvazioni). |
| Promozione waitlist | **Sincrona**: su annullamento di un `confirmed`, se si libera un posto e c'è coda, il primo `waitlisted` (per `waitlist_position`) passa a `confirmed` nella stessa transazione. Più promozione **manuale** da admin. Email di notifica → **F6**. |
| QR / check-in | Token firmato JWT (`type=checkin`, `sub=registration_id`, HS256 con `JWT_SECRET`). QR generato come PNG server-side con `segno` (pure-python, nessuna dipendenza di sistema/Pillow). L'operatore scansiona/incolla il token → verifica firma → `attended`. |
| Capienza | Conteggio iscritti che occupano posto = `confirmed` + `attended`. Lock della riga evento (`SELECT ... FOR UPDATE`) e ricontrollo della capienza nella transazione di iscrizione (anti-race sull'ultimo posto). `max_per_user` enforced. |
| Permessi | Migrazione aggiunge `registrations.read`, `registrations.write`, `checkin.write` e il ruolo `checkin_operator` (con `registrations.read` + `checkin.write`); i tre permessi sono concessi a `super_admin`. |
| Schema lista d'attesa | **Deviazione motivata dal PROMPT**: niente tabella separata `waiting_list`. La lista d'attesa è rappresentata da `registrations.status='waitlisted'` + colonna `waitlist_position`. Motivazione: single source of truth, coerenza con la macchina a stati (`waitlisted→confirmed` è una transizione di stato, non un travaso fra tabelle), nessun rischio di disallineamento fra `registrations` e `waiting_list`. |

---

## 2. Architettura

Pattern invariato: `routers → services → models` (backend), Next App Router (frontend). Nuovo modulo coeso `registrations` che dipende da: `events`/`event_custom_fields` (F3) per capienza/finestra/validazione risposte, `users` (F1), `core/security` (F1) per il token check-in firmato.

### Struttura backend (file aggiunti/modificati in F4)

```
backend/
  app/
    core/
      security.py            # MODIFY: create_checkin_token(reg_id) / decode_checkin_token
    models/
      registration.py        # Registration
      registration_answer.py # RegistrationCustomAnswer
      checkin.py             # Checkin
      __init__.py            # MODIFY: register new models
    schemas/
      registration.py        # RegisterIn, AnswerIn, RegistrationOut, RegistrationListItem, ...
      checkin.py             # CheckinIn, CheckinResult
    services/
      registration_service.py # register/cancel/promote/mark_no_show/list/get + capacity lock
      checkin_service.py       # check_in (verify token, mark attended, audit)
      qr_service.py            # png_for_token (segno)
    api/routers/
      registrations.py        # /api/events/{id}/registrations, /api/registrations/{id}/*, /api/me/registrations
      checkin.py              # /api/checkin
    main.py                  # MODIFY: include registrations + checkin routers
  alembic/versions/
    0006_registrations.py    # 3 tables + permission/role seed
  pyproject.toml             # MODIFY: add segno
```

### Struttura frontend (file aggiunti/modificati in F4)

```
frontend/
  app/admin/
    events/[id]/page.tsx          # MODIFY: add "Iscritti" tab
    checkin/page.tsx              # operator check-in page
    layout.tsx                    # MODIFY: sidebar "Check-in" link
  components/admin/
    registrations-panel.tsx       # iscritti table + filters + actions
    registration-status-badge.tsx
    manual-register-dialog.tsx     # select user + custom answers
    checkin-scanner.tsx           # token input + result
  lib/
    registration-schemas.ts       # zod: manualRegister, checkinToken
```

---

## 3. Modelli dati (migrazione `0006_registrations`)

**`registrations`**:
- `id` PK, `event_id` (FK `events.id`, ON DELETE CASCADE), `user_id` (FK `users.id`)
- `status` (str enum `pending/confirmed/waitlisted/cancelled/attended/no_show`, default `confirmed`)
- `waitlist_position` (int nullable; valorizzato solo per `waitlisted`)
- `registered_by` (FK `users.id` nullable; admin che ha iscritto manualmente, null = auto-iscrizione)
- `cancelled_at` (DateTime nullable), `cancel_reason` (String nullable)
- `created_at`, `updated_at`
- Indici: `(event_id, status)`, `(event_id, user_id)`

**`registration_custom_answers`**:
- `id` PK, `registration_id` (FK `registrations.id`, ON DELETE CASCADE, index), `field_id` (FK `event_custom_fields.id`), `value` (Text nullable)

**`checkins`** (audit del check-in):
- `id` PK, `registration_id` (FK `registrations.id`, ON DELETE CASCADE, index), `checked_in_by` (FK `users.id` nullable), `checked_in_at` (DateTime, default now)

**Seed (idempotente, stile `0002`)**: permessi `registrations.read`, `registrations.write`, `checkin.write`; ruolo `checkin_operator` con `registrations.read` + `checkin.write`; i tre permessi concessi a `super_admin`. `downgrade` rimuove role_permissions, il ruolo, i permessi, poi le tabelle (ordine inverso).

**Unicità logica**: al massimo una iscrizione attiva (status ≠ `cancelled`) per `(event_id, user_id)`, applicata nel service (un constraint parziale non è disponibile in MySQL).

---

## 4. Macchina a stati

```
(register)    → confirmed        posti liberi (occupati = confirmed+attended < capacity, o capacity NULL)
              → waitlisted        pieno e waitlist_enabled (waitlist_position = max+1)
              → 409 CONFLICT      pieno e NON waitlist_enabled
confirmed     → cancelled | attended | no_show
waitlisted    → confirmed (promozione) | cancelled
cancelled / attended / no_show   = terminali
```

- `attended` è impostato **solo** dal check-in.
- `no_show` è impostato dall'admin dopo l'evento (da `confirmed`).
- Annullamento di un `confirmed`: set `cancelled` + `cancelled_at`; se l'evento ha capienza e coda d'attesa, promuove il primo `waitlisted` (minore `waitlist_position`) a `confirmed` e ricompatta le posizioni rimanenti.
- Transizioni non previste → `422`.

---

## 5. API backend (RBAC server-side su ogni endpoint)

**Iscrizione evento** — `/api/events/{event_id}/registrations`:
| Endpoint | Permesso | Azione |
|---|---|---|
| `POST` | self, oppure `registrations.write` se `user_id` ≠ utente corrente | Iscrive. Body: `user_id?`, `answers: [{field_id, value}]`. Pre-condizioni: evento `published`, dentro finestra iscrizioni (se impostata), nessuna iscrizione attiva esistente per l'utente (`409`), `max_per_user` non superato (`409`). Valida i campi custom `required`/opzioni. Capienza con lock riga evento → `confirmed`/`waitlisted`/`409`. |
| `GET` | `registrations.read` | Lista iscritti: filtri `status`, `q` (nome/email/username), paginazione (`page`,`page_size`); ogni item include utente, stato, posizione waitlist, flag check-in. |

**Singola iscrizione** — `/api/registrations/{registration_id}`:
| Endpoint | Permesso | Azione |
|---|---|---|
| `GET` | self o `registrations.read` | Dettaglio: stato, posizione waitlist, risposte custom, riferimento evento. |
| `POST /cancel` | self o `registrations.write` | Annulla se `cancellation_allowed` e (se impostato) entro `cancellation_deadline_at`, altrimenti `422`. Set `cancelled`; promuove waitlist se si libera un posto. |
| `POST /promote` | `registrations.write` | Promozione manuale `waitlisted→confirmed` se c'è capienza, altrimenti `409`. |
| `POST /no-show` | `registrations.write` | `confirmed→no_show`. |
| `GET /qr` | self o `registrations.read` | PNG (image/png) del QR che codifica il token check-in. |
| `GET /token` | self o `registrations.read` | `{token}` check-in firmato (per ricevuta/uso programmatico). |

**Check-in** — `/api/checkin`:
| Endpoint | Permesso | Azione |
|---|---|---|
| `POST` | `checkin.write` | Body `{token}`. Verifica firma + `type=checkin`; carica iscrizione; se `confirmed` → `attended` + record `checkins`. Errori: token invalido `400`; già `attended` `409`; stato non ammesso (es. `cancelled`/`waitlisted`) `422`. Risposta: `{registration_id, user, event_title, status}`. |

**Le mie iscrizioni** — `/api/me/registrations`: `GET` (utente corrente) → elenco delle proprie iscrizioni con stato. Predisposto per F5 e per evitare doppie iscrizioni lato UI.

**Servizi**:
- `registration_service.register(db, *, event_id, user_id, registered_by, answers)` — valida evento/finestra/duplicati/`max_per_user`, blocca la riga evento con `with_for_update()`, ricalcola gli occupanti, assegna `confirmed`/`waitlisted` o solleva errore; persiste le risposte custom (validate).
- `registration_service.cancel/promote/mark_no_show/list/get` + helper interni `_occupied_count`, `_promote_next`, `_validate_answers`.
- `checkin_service.check_in(db, *, token, operator_id)`.
- `qr_service.png_for_token(token) -> bytes` (segno).
- `core/security.create_checkin_token(registration_id)` / `decode_checkin_token(token)`.

---

## 6. UI admin + operatore

**Tab "Iscritti"** nella pagina evento (`app/admin/events/[id]/page.tsx`):
- `registrations-panel.tsx`: tabella (utente, stato con `registration-status-badge`, posizione waitlist, check-in sì/no), filtri (stato, ricerca), azioni per riga: **annulla**, **promuovi** (solo `waitlisted`), **segna no-show** (solo `confirmed`), **vedi risposte** custom, **vedi QR** (`<img src="…/qr">`). Pulsante **iscrivi manualmente** apre `manual-register-dialog.tsx` (seleziona utente + compila risposte custom). React Query + invalidazione; conferma sulle azioni distruttive.

**Pagina Check-in operatore** (`app/admin/checkin/page.tsx` + `checkin-scanner.tsx`):
- Campo per incollare/scansionare il token; `POST /api/checkin`; esito verde (`attended` + nome partecipante + evento) o rosso (errore: già presente / non valido / stato errato). Storico della sessione corrente. Voce di sidebar "Check-in" nel layout admin.
- Scanner camera reale fuori scope F4 (accettato input token; predisposizione scan).

Tutte le viste con stati loading/empty/error. `lib/registration-schemas.ts` (zod) rispecchia i vincoli backend (manual register, token check-in).

---

## 7. Sicurezza

- RBAC verificato server-side su ogni endpoint. Il ruolo `checkin_operator` ha solo `registrations.read` + `checkin.write` (nessuna gestione eventi).
- Token check-in firmato HS256 (riusa `JWT_SECRET`): non forgiabile, `registration_id` non indovinabile; la verifica controlla firma e `type=checkin`.
- Capienza: lock della riga evento + ricontrollo nella transazione → niente overbooking sull'ultimo posto in caso di richieste concorrenti.
- Self-access: senza permessi admin, l'utente può vedere/annullare/ottenere QR solo delle proprie iscrizioni (confronto `user_id`).
- Validazione risposte custom server-side (campi `required`, valori contro le opzioni ammesse).
- Check-in idempotente: secondo scan dello stesso token su iscrizione già `attended` → `409` (no doppio conteggio).

---

## 8. Strategia di test

- **Backend unit (pytest)**: capienza (ultimo posto → `confirmed`; pieno → `waitlisted`; pieno senza waitlist → errore); `max_per_user`; doppia iscrizione attiva (errore); finestra iscrizioni (fuori finestra → errore); evento non `published` → errore; validazione risposte custom (required mancante / opzione non valida → errore); annullamento con promozione waitlist (primo in coda promosso, posizioni ricompattate); transizioni illegali → errore; token check-in (verify ok/ko, tipo errato); idempotenza check-in.
- **Backend integration**: RBAC (`403` operatore su gestione eventi; self vs admin su iscrizioni altrui); `POST` iscrizione → `GET` lista; `cancel` → promozione; `POST /api/checkin` con token valido → `attended`; secondo check-in → `409`; `GET /qr` → `image/png`; `/api/me/registrations`.
- **Frontend (vitest + RTL)**: zod schemas; `registrations-panel` (render righe/badge/filtri, azioni chiamano le mutation giuste); `checkin-scanner` (esito ok/errore con fetch mockato).
- **Criteri accettazione**: ogni endpoint verifica permesso; ogni form valida client+server; ogni vista ha stati loading/empty/error; nessun overbooking.

---

## 9. Fuori scope (rinviato)

- Email (conferma iscrizione/annullamento/promozione/modifica evento) + worker Celery + promemoria → **F6**.
- UI self-service dipendente: catalogo, calendario, scheda evento, iscrizione, ricevuta/QR personale, storico → **F5**.
- Report/export iscritti ed presenze (Excel/CSV/PDF), dashboard KPI → **F7**.
- Scanner camera QR reale (oltre all'inserimento/scansione del token) → miglioria futura.
- Attestati di partecipazione → predisposizione futura (PROMPT §92).
