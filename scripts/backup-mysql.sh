#!/usr/bin/env bash
# Eurospital Eventi — backup MySQL (mysqldump) + redis snapshot opzionale.
# Uso: ./scripts/backup-mysql.sh [destination_dir]
# Variabili lette (da .env o ambiente): MYSQL_HOST, MYSQL_PORT, MYSQL_USER,
# MYSQL_PASSWORD, MYSQL_DB. Esce 1 se manca qualcosa.

set -euo pipefail

DEST="${1:-./backups}"
TS=$(date -u +%Y%m%d-%H%M%S)
mkdir -p "$DEST"

: "${MYSQL_HOST:?MYSQL_HOST mancante}"
: "${MYSQL_USER:?MYSQL_USER mancante}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD mancante}"
: "${MYSQL_DB:?MYSQL_DB mancante}"
PORT="${MYSQL_PORT:-3306}"

OUT="$DEST/eventi-${TS}.sql.gz"

echo "Dump MySQL ${MYSQL_HOST}:${PORT}/${MYSQL_DB} -> $OUT"
mysqldump \
  --host="$MYSQL_HOST" --port="$PORT" \
  --user="$MYSQL_USER" --password="$MYSQL_PASSWORD" \
  --single-transaction --quick --lock-tables=false \
  --routines --triggers --events \
  "$MYSQL_DB" | gzip -c > "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
echo "OK: $OUT ($SIZE)"

# Retention: tieni gli ultimi 14 file (un dump al giorno = 2 settimane).
ls -1t "$DEST"/eventi-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -v
