#!/usr/bin/env bash
# Automated encrypted PostgreSQL backup (WS-12).
# Usage: BACKUP_ENCRYPTION_KEY=<key> DATABASE_URL=<url> bash scripts/backup.sh
# Output: $BACKUP_DIR/admin-alquiler-<timestamp>.sql.gz.enc
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required (store outside the repo/host)}"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/admin-alquiler-$STAMP.sql.gz.enc"

pg_dump "$DATABASE_URL" \
  | gzip -c \
  | openssl enc -aes-256-cbc -pbkdf2 -pass "env:BACKUP_ENCRYPTION_KEY" -out "$OUT"

echo "backup written: $OUT"
ls -la "$OUT"
