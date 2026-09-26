#!/usr/bin/env bash
# Restore drill: decrypt a backup and restore into an EMPTY test database,
# then run a smoke query. Never run against production (WS-12).
# Usage: BACKUP_ENCRYPTION_KEY=<key> TEST_DATABASE_URL=<url> bash scripts/restore-drill.sh <backup-file>
set -euo pipefail

BACKUP_FILE="${1:?usage: restore-drill.sh <backup-file>}"
: "${TEST_DATABASE_URL:?TEST_DATABASE_URL is required (must be an empty test database)}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"

if [ "$TEST_DATABASE_URL" = "${DATABASE_URL:-}" ]; then
  echo "REFUSING: TEST_DATABASE_URL equals DATABASE_URL (production guard)" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

openssl enc -d -aes-256-cbc -pbkdf2 -pass "env:BACKUP_ENCRYPTION_KEY" \
  -in "$BACKUP_FILE" -out "$TMP/restore.sql.gz"
gzip -d "$TMP/restore.sql.gz"

psql "$TEST_DATABASE_URL" -f "$TMP/restore.sql" -q
psql "$TEST_DATABASE_URL" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"

echo "restore drill OK: $BACKUP_FILE -> test database"
