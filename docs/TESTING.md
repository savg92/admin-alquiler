# Testing Strategy

## Testing pyramid

```text
        E2E
       /   \
  Integration
     /     \
     Unit + Security
```

## Unit tests

Cover:

- domain rules
- permission policies
- ownership calculations
- rent increases
- charges
- allocations
- financial calculations
- voting rules
- document state transitions
- configuration inheritance

## Integration tests

Cover:

- repositories
- PostgreSQL constraints
- organization scoping
- API modules
- storage
- queues
- notification adapters

## E2E tests

Critical journeys:

- authentication
- organization creation
- property/unit setup
- owner/tenant setup
- contract creation
- rent/charge/payment
- receipt
- document approval
- PDF generation
- maintenance
- complaints/claims
- communication
- voting
- audit
- offline synchronization

## Security tests

- broken access control
- cross-tenant access
- role escalation
- IDOR
- malicious uploads
- session abuse
- rate limiting
- injection
- SSRF
- sensitive-data leakage

## Database-backed tests

Tests that touch a real PostgreSQL (`apps/api/test/*-db.test.ts`) probe for a reachable database at
module load and skip themselves when there is none, so `bun test` stays useful without infrastructure.
CI supplies a PostgreSQL service, so these tests are the ones that actually verify repositories,
constraints and migrations — a green local run does not mean they passed.

Rules for these tests:

- **They must be idempotent.** CI and developer machines keep the same database between runs, so a
  test that counts rows, registers a unique key or reads a "does this already exist" path must
  delete its own rows first. A test that only passes on a pristine database is a broken test.
- **They must not rely on another test's leftovers**, and must not depend on execution order. CI runs
  `apps/api/test` and `apps/api/e2e` in one process against one database.
- **Assert the real actor.** Audit rows are foreign-keyed to a real user, so a test that calls a
  service directly must resolve a real actor id rather than passing a placeholder.
- **Exercise the write path.** A create call that short-circuits on existing data can make a broken
  test look green. Assert `created === true` where the call is expected to create.

Run them against a real database before claiming a repository or migration works:

```bash
docker run -d --name aa-verify-pg -e POSTGRES_DB=admin_alquiler_verify \
  -e POSTGRES_USER=admin_alquiler -e POSTGRES_PASSWORD=verify-pass-123 \
  -p 5433:5432 postgres:16-alpine
cd packages/database
DATABASE_URL="postgresql://admin_alquiler:verify-pass-123@localhost:5433/admin_alquiler_verify" \
  bunx prisma migrate deploy
SEED_LOCALE=es-CO DATABASE_URL="postgresql://admin_alquiler:verify-pass-123@localhost:5433/admin_alquiler_verify" \
  bun run src/seed.ts
cd ../.. && DATABASE_URL="postgresql://admin_alquiler:verify-pass-123@localhost:5433/admin_alquiler_verify" \
  SEED_LOCALE=es-CO bun test apps/api/test apps/api/e2e
```

`compose.yaml` intentionally publishes no host ports (Caddy is the only ingress), so reach a
verification database on its own published port rather than through the compose network.

## AI tests

Phase 2 adds:

- provider selection
- privacy policy enforcement
- WebGPU detection
- fallback
- structured output validation
- prompt injection resistance
- model registry behavior
- model deprecation
- no-AI behavior

## CI

Fast PR:

- lint
- typecheck
- unit
- critical integration

Full validation:

- integration
- E2E
- security
- build
- container scan

Nightly:

- extended E2E
- dependency audit
- backup restore verification
- AI evaluation suite
