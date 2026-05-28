# Design F7 — Report & dashboard

**Fase:** F7 (piano di sviluppo, sezione 5)
**Obiettivo:** dashboard admin con KPI sintetici (eventi totali, prossimi, iscrizioni totali, tasso partecipazione), report per singolo evento (iscritti, stato, presenze, no-show, breakdown campi custom), grafici (iscrizioni nel tempo, distribuzione status), export CSV (iscritti per evento + registro globale). Output: admin apre `/admin` e vede a colpo d'occhio lo stato della piattaforma; apre la scheda evento e scarica un CSV con tutti gli iscritti.
**Prerequisito:** F3 (eventi+campi custom), F4 (registrations+checkin), F5 (catalog), F6 (notifiche) tutti in `main`.

---

## 1. Decisioni fissate (brainstorming)

| Ambito | Scelta |
|---|---|
| Scope MVP | **KPI globali** + **report singolo evento** + **export CSV** iscritti per evento. Export PDF rinviato a F10 (report pubblicabile); export Excel (`openpyxl`) rinviato a F7-stretch. Report "per reparto" rinviato a F8 (richiede AD). Report "per periodo" implementato come filtro `from`/`to` su KPI. |
| Permesso | Nuovo permesso `reports.read` (seed via migrazione, su `super_admin`). Tutti gli endpoint dietro `require_permission('reports.read')`. |
| Endpoint backend | `GET /api/admin/reports/kpis?from=&to=` → contatori globali. `GET /api/admin/reports/events/{id}` → report dettagliato evento. `GET /api/admin/reports/events/{id}/registrations.csv` → stream CSV. `GET /api/admin/reports/registrations.csv?event_id?&from?&to?` → CSV globale filtrato. |
| KPI calcolati | `events_total`, `events_published`, `events_upcoming` (start_at>now), `events_past`, `registrations_total`, `registrations_confirmed`, `registrations_cancelled`, `registrations_waitlisted`, `attendance_rate` (= attended / (confirmed+attended+no_show)), `registrations_by_month` (ultimi 12 mesi → `[{month: "2026-01", count: N}]`), `top_events` (top 5 per iscrizioni confermate, ultimi 90gg). |
| Report singolo evento | `event` (campi base), `counts` (`confirmed`, `waitlisted`, `cancelled`, `attended`, `no_show`), `attendance_rate`, `custom_fields_summary` (per ogni campo custom: count per option per i campi `select`/`multiselect`, distribuzione valori per `text` rinviata). |
| Aggregazione | Query SQL aggregate dirette (no view materialized): `SELECT status, COUNT(*) GROUP BY status` ecc. Indici esistenti `(event_id, status)` da F4 bastano. Per `registrations_by_month` raggruppa per `DATE_FORMAT(created_at, '%Y-%m')`. |
| Export CSV | Streaming con `fastapi.responses.StreamingResponse` + `csv.writer` su `io.StringIO`. Colonne: `id`, `event_id`, `event_title`, `user_email`, `username`, `full_name`, `status`, `waitlist_position`, `created_at`, `cancelled_at`, `cancel_reason`, `custom_answers` (JSON inline). Encoding UTF-8 BOM per Excel compatibility. |
| Frontend dashboard | `/admin` dashboard ridisegnata: 4 cards KPI in alto (eventi, iscrizioni, partecipazione, top evento), grafico bar `registrations_by_month` (componente puro SVG, no libreria), lista top events. Filtro periodo (date range) via querystring. |
| Frontend report evento | Aggiunto tab "Report" nella pagina evento `/admin/events/[id]`. Cards: totale iscritti per status, attendance rate, pulsante "Esporta CSV". Custom fields summary tabellare. |
| Charts | Nessuna libreria esterna; bar chart custom inline SVG (Tailwind+SVG paths). Mantiene bundle frontend leggero. |
| Performance | Query KPI single trip per endpoint. Cache rinviata: dataset attuale piccolo (decine di eventi, centinaia di iscrizioni); ricalcolo a ogni richiesta è fine. |

---

## 2. Architettura

```
[GET /admin/reports/*]  (admin client) → router reports → report_service (SQL aggregate) → JSON
[GET /admin/reports/...csv]                        → router reports → CSV streaming
```

Niente nuove tabelle. Niente migrazioni di schema. Solo seed permesso.

### Struttura backend (file aggiunti/modificati in F7)

```
backend/
  app/
    services/
      report_service.py        # kpis(db, from?, to?) / event_report(db, event_id) / csv_writers
    schemas/
      reports.py               # KpiOut, EventReportOut, CountsOut, MonthBucket, TopEventItem, CustomFieldSummary
    api/routers/
      reports.py               # /api/admin/reports/*
    main.py                    # MODIFY: include router
  alembic/versions/
    0009_reports_permission.py # seed permission reports.read
  tests/
    test_report_service.py
    test_reports_api.py
    test_migration.py          # MODIFY: assert reports.read seeded
```

### Struttura frontend

```
frontend/
  app/admin/
    page.tsx                   # MODIFY: dashboard KPI
  components/admin/
    kpi-card.tsx
    bar-chart.tsx
    event-report-panel.tsx     # used in /admin/events/[id]
  lib/reports-api.ts
  __tests__/
    bar-chart.test.tsx
    kpi-card.test.tsx
```

---

## 3. Contratti API

### `GET /api/admin/reports/kpis?from=YYYY-MM-DD&to=YYYY-MM-DD`
`from`/`to` opzionali (filtrano sui `created_at` delle registrations e `start_at` degli events).

```json
{
  "events_total": 42,
  "events_published": 28,
  "events_upcoming": 9,
  "events_past": 19,
  "registrations_total": 312,
  "registrations_confirmed": 245,
  "registrations_cancelled": 30,
  "registrations_waitlisted": 12,
  "registrations_attended": 198,
  "registrations_no_show": 25,
  "attendance_rate": 0.794,
  "registrations_by_month": [
    {"month": "2025-09", "count": 12},
    {"month": "2025-10", "count": 25}
  ],
  "top_events": [
    {"event_id": 7, "title": "Workshop sicurezza", "confirmed": 48},
    ...
  ]
}
```

### `GET /api/admin/reports/events/{id}`

```json
{
  "event": {"id": 7, "title": "...", "start_at": "...", "end_at": "...", "capacity": 50, "status": "published"},
  "counts": {"confirmed": 38, "waitlisted": 4, "cancelled": 6, "attended": 32, "no_show": 6, "pending": 0},
  "attendance_rate": 0.842,
  "custom_fields_summary": [
    {"field_id": 12, "label": "Pasti", "type": "select",
     "options": [{"value": "vegetariano", "count": 8}, {"value": "standard", "count": 30}]}
  ]
}
```

### `GET /api/admin/reports/events/{id}/registrations.csv`
Header: `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="event-{id}-registrations.csv"`.

### `GET /api/admin/reports/registrations.csv?event_id?&from?&to?`
Stesso formato CSV; filtri opzionali.

---

## 4. Sicurezza

- `require_permission("reports.read")` su tutti gli endpoint.
- CSV: nessun secret in colonne; `cancel_reason` testo libero quotato correttamente (csv.writer).
- Date input validate (`YYYY-MM-DD`) per evitare SQL injection nei filtri (parametri SQLAlchemy comunque safe).
- Filtri `from`/`to`: se mancanti → no filter; se invalidi → 422.

---

## 5. Test (obiettivi)

- `test_report_service`: kpi su DB seeded con event/reg variabili → conteggi corretti; attendance_rate edge cases (denominator=0 → 0.0); registrations_by_month finestra ultimi 12 mesi; top_events ordine corretto; event_report counts/custom_fields_summary.
- `test_reports_api`: 403 senza permesso; 200 con permesso; date filter shape; CSV ha header + righe attese; CSV streaming non blocca.
- `test_migration`: `reports.read` seeded su super_admin.
- Frontend: `kpi-card` render, `bar-chart` render con dataset (label + altezze proporzionali).

---

## 6. Out-of-scope F7 (rinviati)

- Report per reparto/gruppo AD (richiede F8).
- Export PDF (richiede generator: rinviato a F10 / make-pdf).
- Export Excel `.xlsx` (richiede `openpyxl`; CSV con BOM apre fine in Excel).
- Drill-down su singolo iscritto (già coperto da scheda iscrizione F4).
- Salvataggio report schedulati / invio email periodico (richiede beat F6-stretch).
- Cache risultati KPI.
