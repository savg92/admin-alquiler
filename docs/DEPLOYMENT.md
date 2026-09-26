# Deployment

## Deployment philosophy

Start with the simplest secure deployment that supports the current workload. Scale only when measurable requirements justify additional infrastructure.

## Profile A — Local

Docker Compose:

- web
- api
- worker
- PostgreSQL
- Redis
- MinIO
- Caddy if HTTPS is needed locally

## Profile B — Small production

Recommended pattern:

```text
Internet
   ↓
Cloudflare
   ↓
Caddy / HTTPS
   ↓
Web + API + Worker
   ↓
PostgreSQL / Redis / MinIO
```

A single Linux VM/VPS is sufficient for the initial small-user workload.

## Profile C — Growth

Separate:

- application instances
- PostgreSQL
- Redis
- object storage

Use managed services only where their operational value exceeds the cost and lock-in.

## Infrastructure principles

- Dockerized services.
- Environment-specific configuration.
- Secrets injected at runtime.
- No secrets committed to Git.
- Automated migrations.
- Automated backups.
- Restore verification.
- Health checks.
- Structured logs.
- Metrics.

## Restore drill log

Each drill restores an encrypted backup into an empty test database via
`scripts/restore-drill.sh` (never production) and records date + result here.

`DATABASE_URL` is optional for the drill and is only used by the production guard; when it is set the
drill refuses to run against it.

| Date (UTC) | Backup | Result |
|---|---|---|
| 2026-09-26 | `admin-alquiler-20260926T050627Z.sql.gz.enc` (ephemeral drill container, postgres:16) | OK — migrations 0001–0004 applied, 60 public tables restored, seeded `Organization(drill-co/COP)` round-tripped, smoke query green |
| 2026-09-26 | `admin-alquiler-20260926T063017Z.sql.gz.enc` (ephemeral drill container, postgres:16) | OK — migrations 0001–0005 applied, 62 public tables restored (includes `AIModel`, `AIDecisionObservation`), 6 organizations / 2 AI models / 1 settlement / 24 audit events round-tripped. Also verified: artifact is encrypted (`openssl enc` salted), production guard refuses when `TEST_DATABASE_URL` equals `DATABASE_URL`, and a wrong key fails to decrypt. First attempt exposed a bug in `scripts/restore-drill.sh` (see below) |

## Cloudflare

Cloudflare can provide DNS, TLS/CDN and frontend hosting where appropriate.

The core backend must not depend on Cloudflare-specific APIs.

## Oracle/free-tier style VM

An Always Free or equivalent VM can be used for early environments where available and appropriate. Free-tier terms and capacity can change, so deployment should not encode those assumptions.

## Object storage

MinIO is the default self-hosted S3-compatible storage.

The storage abstraction should allow migration to another S3-compatible or managed provider.

## Deployment flow

```text
PR
 ↓
CI
 ├── lint
 ├── typecheck
 ├── unit
 ├── integration
 ├── E2E
 ├── security
 └── build
 ↓
main
 ↓
staging
 ↓
production
```

## Rollback

Every production deployment must have a documented rollback strategy.

Database migrations must be designed so application rollback is possible or a forward-fix procedure is documented.

## Backups

Daily automated PostgreSQL backups, encrypted and stored outside the primary host.

Periodically test restoring:

- database
- object metadata
- required files
- application configuration

## Monitoring

At minimum:

- service health
- database connectivity
- queue health
- disk space
- backup status
- application error rate

Prometheus/Grafana/Loki can be introduced as operational complexity grows.
