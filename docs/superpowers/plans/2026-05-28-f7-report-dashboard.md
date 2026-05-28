# Plan F7 — Report & dashboard

Branch `f7-report-dashboard`. TDD step-by-step. Spec: [F7 design](../specs/2026-05-28-f7-report-dashboard-design.md).

---

## A — Backend

### A1. Migrazione 0009 (permesso `reports.read`)
- [ ] Test fallisce in `tests/test_migration.py` (assert `reports.read` su super_admin).
- [ ] Crea `0009_reports_permission.py` (down `0008_notifications`): insert permesso + link a `super_admin`.
- [ ] Test verde. Commit `feat(f7): permesso reports.read`.

### A2. `report_service` (KPI + event_report)
- [ ] Test `test_report_service.py` con seed event/reg variabili: kpis, event_report, attendance_rate edge.
- [ ] `app/services/report_service.py` con:
  - `kpis(db, *, date_from=None, date_to=None) -> dict`
  - `event_report(db, event_id) -> dict`
  - `registrations_csv_rows(db, *, event_id=None, date_from=None, date_to=None) -> Iterator[list[str]]`
- [ ] Test verde. Commit `feat(f7): report_service KPI + report evento + iteratore CSV`.

### A3. Schemas
- [ ] `app/schemas/reports.py`: `KpiOut`, `EventReportOut`, `CountsOut`, `MonthBucket`, `TopEventItem`, `CustomFieldSummary`.

### A4. Router `reports`
- [ ] Test `test_reports_api.py`: 403 senza perm; 200; shape KPI; CSV header+righe; date filter.
- [ ] `app/api/routers/reports.py` con `kpis`, `event_report`, `event_registrations_csv`, `registrations_csv` (tutti dietro `require_permission('reports.read')`).
- [ ] Streaming CSV: `StreamingResponse(generator(), media_type='text/csv; charset=utf-8')` con `Content-Disposition`.
- [ ] Include in `main.py`.
- [ ] Test verde. Commit `feat(f7): API admin /reports/* + export CSV`.

---

## B — Frontend

### B1. Client API
- [ ] `frontend/lib/reports-api.ts`: `getKpis(from?, to?)`, `getEventReport(id)`, URL builder per CSV (download diretto via `<a href>`).

### B2. Componenti riusabili
- [ ] `components/admin/kpi-card.tsx` (label, value, hint).
- [ ] `components/admin/bar-chart.tsx` (SVG puro, dataset `[{label, value}]`).
- [ ] Test `kpi-card.test.tsx`, `bar-chart.test.tsx`.

### B3. Dashboard `/admin`
- [ ] Modifica `app/admin/page.tsx` per fetch lato server dei KPI + render 4 cards + bar chart `registrations_by_month` + lista top events.
- [ ] Filtro periodo via querystring (`?from=&to=`); link "ultimo mese / 3 mesi / anno / tutto".

### B4. Report evento
- [ ] `components/admin/event-report-panel.tsx`: fetch `getEventReport(id)` lato client, render counts + attendance_rate + custom_fields_summary tabellare + pulsante "Esporta CSV" (link a `/api/admin/reports/events/{id}/registrations.csv`).
- [ ] Aggancia il pannello nella pagina evento `/admin/events/[id]` (nuovo tab "Report" o sezione dedicata).
- [ ] Build + test verdi. Commit `feat(f7): UI dashboard KPI + report evento + export CSV`.

---

## C — Docs

- [ ] Aggiorna `INSTALL.md` con sezione "Report & dashboard (F7)":
  - `/admin` mostra dashboard KPI con filtri periodo.
  - Tab "Report" nella scheda evento `/admin/events/[id]`.
  - Pulsante "Esporta CSV" su scheda evento o `/admin/reports/registrations.csv?event_id=...`.
  - Permesso `reports.read` richiesto.
- Commit `docs(f7): istruzioni dashboard e report`.

---

## Self-Review

- Coverage spec: §3 contratti API → A4; §4 sicurezza → require_permission + date validation; §5 test → tutti.
- Reuse: niente nuove tabelle, niente nuove tabelle modelli; query aggregate su Registration/Event esistenti.
- Out-of-scope rispettato: niente PDF/Excel/dept.
- Performance: dataset previsto piccolo, no cache. Easy to add later.
