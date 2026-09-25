# Backup and Recovery

Parent: [../SECURITY.md](../SECURITY.md). Operations: [../DEPLOYMENT.md](../DEPLOYMENT.md#backups).

- Automated daily PostgreSQL backups, encrypted, stored off primary host.
- Periodically restore-test DB + object metadata + files + config.
- Documented recovery procedure.

Targets: RPO ≤ 24h, RTO ≤ 4h.
