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
