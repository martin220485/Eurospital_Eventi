# Design F10 — QA & docs & deploy (Release Candidate)

**Fase:** F10 (piano di sviluppo, sezione 5)
**Obiettivo:** chiudere il lavoro di F0-F9 portando il prodotto in stato release candidate: tutti i test verdi, documentazione operativa completa (deploy produzione, backup/restore, monitoraggio, smoke test), health endpoint dettagliato, VERSION + CHANGELOG.

## Scope MVP
- Fix dei 3 test pre-esistenti rotti su `setup_service`.
- Endpoint `/api/health/detailed` con check DB + Redis.
- Script bash `backup-mysql.sh` (dump giornaliero, retention 14) + `restore-mysql.sh`.
- README riscritto con quickstart + funzionalità.
- INSTALL: sezione "Deploy produzione" (prerequisiti, env, backup, monitoring, smoke test).
- `VERSION` + `CHANGELOG.md` con storia per fase.

## Out-of-scope (rinviati a post-RC)
- Suite E2E Playwright completa (esistono già unit + integration robusti; E2E può seguire in patch).
- Backup automatico di Redis (broker è effimero, dati persistenti sono in MySQL).
- Pipeline CD (deploy automatico) — manuale per release iniziale.
- DR runbook esteso.
- Penetration test report.
- Tag git annotato + GitHub Release (operatività esterna a questa fase).
