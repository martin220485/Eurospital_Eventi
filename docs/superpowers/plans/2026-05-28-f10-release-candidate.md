# Plan F10 — Release Candidate

Branch `f10-release`. Tutti commit già fatti nell'ordine sotto.

- [x] Fix conftest `_override_database_url` (autouse session) → 3 test pre-esistenti verdi.
- [x] `/api/health/detailed` + test.
- [x] `scripts/backup-mysql.sh` + `scripts/restore-mysql.sh`.
- [x] README riscritto (quickstart, stack, F0-F9 summary, operatività).
- [x] INSTALL sezione "Deploy produzione".
- [x] `VERSION=1.0.0-rc1` + `CHANGELOG.md`.

## Risultato

- Backend full suite: **205/205 verdi** (era 201/204 con 3 pre-esistenti).
- Frontend: 29/29 (invariato).
- Build: backend + frontend OK.
- Repo pronto per tag `v1.0.0-rc1`.
