#!/usr/bin/env bash
# Eurospital Eventi — restore MySQL da dump gzippato creato da backup-mysql.sh.
# Uso: ./scripts/restore-mysql.sh path/to/eventi-YYYYMMDD-HHMMSS.sql.gz
# ATTENZIONE: sovrascrive il database di destinazione.

set -euo pipefail

SRC="${1:?path al dump .sql.gz mancante}"
[ -f "$SRC" ] || { echo "File non trovato: $SRC" >&2; exit 1; }

: "${MYSQL_HOST:?MYSQL_HOST mancante}"
: "${MYSQL_USER:?MYSQL_USER mancante}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD mancante}"
: "${MYSQL_DB:?MYSQL_DB mancante}"
PORT="${MYSQL_PORT:-3306}"

echo "Restore ${SRC} -> ${MYSQL_HOST}:${PORT}/${MYSQL_DB}"
read -r -p "Confermi la sovrascrittura? [y/N] " yn
[[ "$yn" =~ ^[Yy]$ ]] || { echo "Annullato."; exit 0; }

gunzip -c "$SRC" | mysql \
  --host="$MYSQL_HOST" --port="$PORT" \
  --user="$MYSQL_USER" --password="$MYSQL_PASSWORD" \
  "$MYSQL_DB"

echo "Restore completato. Esegui le migrazioni Alembic se necessario."
