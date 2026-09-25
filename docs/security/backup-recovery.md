# Backup and Recovery

Parent: [../SECURITY.md](../SECURITY.md). Operations: [../DEPLOYMENT.md](../DEPLOYMENT.md#backups).

- Automated daily PostgreSQL backups, encrypted, stored off primary host.
- Periodically restore-test DB + object metadata + files + config.
- Documented recovery procedure.

Targets: RPO ≤ 24h, RTO ≤ 4h.

## Tooling

- `bash scripts/backup.sh` — `pg_dump` → gzip → OpenSSL AES-256-CBC
  (PBKDF2), key from `BACKUP_ENCRYPTION_KEY`. Requires `DATABASE_URL`.
- `bash scripts/restore-drill.sh <file>` — decrypts and restores into an
  **empty test database** (`TEST_DATABASE_URL`), with a production guard
  that refuses when it equals `DATABASE_URL`.

## Secret management and rotation

- Secrets are env-injected at runtime, validated fail-fast by
  `packages/config/src/env.ts`, and never logged (Pino `redact` list in
  `apps/api/src/logger.ts` covers `DATABASE_URL`, `JWT_SECRET`,
  `MINIO_ROOT_PASSWORD`, `POSTGRES_PASSWORD`, tokens, cookies).
- Rotation path: set the new value in the environment/secret store,
  rolling-restart `api` + `worker`, verify `GET /ready`, then revoke the
  old value. `JWT_SECRET` rotation invalidates existing sessions by
  design — announce it first.
- `BACKUP_ENCRYPTION_KEY` rotation: re-encrypt the latest backup with the
  new key, verify a restore drill, then destroy old-key copies.

## Restore drill log

| Date | Environment | Backup file | Result |
|---|---|---|---|
| — | — | — | Not yet run (first drill due with the first staging deploy) |
