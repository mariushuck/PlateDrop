#!/bin/sh
# Sichert Datenbank und Beweisfotos und räumt alte Sicherungen weg.
#
# Läuft in einem postgres:18-alpine-Container (siehe den `backup`-Service in
# docker-compose.prod.yml), damit pg_dump zur Serverversion passt.
#
#   docker compose -f docker-compose.yml -f docker-compose.prod.yml \
#     --profile backup run --rm backup
#
# Erwartete Umgebung:
#   DATABASE_ADMIN_URL      Verbindung als Owner
#   BACKUP_DIR              Zielverzeichnis (Default /backups)
#   PROOFS_DIR              Quelle der Beweisfotos (Default /data/proofs)
#   BACKUP_RETENTION_DAYS   Aufbewahrung in Tagen (Default 14)
#
# Die Beweisfotos sind personenbezogen: BACKUP_DIR verschlüsselt lagern.
set -euo pipefail

: "${DATABASE_ADMIN_URL:?DATABASE_ADMIN_URL ist nicht gesetzt}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
PROOFS_DIR="${PROOFS_DIR:-/data/proofs}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%F)"

mkdir -p "$BACKUP_DIR"

echo "Sichere Datenbank ..."
# Erst in eine Temp-Datei: scheitert pg_dump, bleibt keine halbe Sicherung
# liegen, die nach einer guten aussieht.
TMP="$BACKUP_DIR/platedrop-$STAMP.sql.gz.tmp"
trap 'rm -f "$TMP"' EXIT
pg_dump --clean --if-exists --no-owner "$DATABASE_ADMIN_URL" | gzip > "$TMP"
mv "$TMP" "$BACKUP_DIR/platedrop-$STAMP.sql.gz"
echo "  -> $BACKUP_DIR/platedrop-$STAMP.sql.gz"

echo "Sichere Beweisfotos ..."
if [ -d "$PROOFS_DIR" ]; then
  tar -czf "$BACKUP_DIR/proofs-$STAMP.tar.gz" -C "$PROOFS_DIR" .
  echo "  -> $BACKUP_DIR/proofs-$STAMP.tar.gz"
else
  echo "  PROOFS_DIR ($PROOFS_DIR) fehlt – übersprungen"
fi

echo "Entferne Sicherungen älter als $RETENTION_DAYS Tage ..."
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'platedrop-*.sql.gz' -o -name 'proofs-*.tar.gz' \) \
  -mtime "+$RETENTION_DAYS" -print -delete

echo "Fertig."
