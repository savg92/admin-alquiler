# Admin alquiler

Secure, mobile-first, multi-organization property and rental administration platform.
Initial focus: Colombia, COP, `es-CO`. Provider-independent by design; AI is optional.

## Status

| Phase | Scope                                          | State    |
| ----- | ---------------------------------------------- | -------- |
| 1     | Core Platform — no AI dependency               | complete |
| 2     | Private/Local AI                               | complete |
| 3–7   | RAG, CLI, MCP, controlled actions, advanced AI | deferred |

Live progress is computed from the checkboxes in [docs/roadmap/PLAN.md](./docs/roadmap/PLAN.md):

```bash
bash scripts/roadmap-status.sh
```

## Quickstart

Prerequisites: [Bun](https://bun.sh) ≥ 1.2, Docker, and a PostgreSQL 16 instance reachable from
your host.

```bash
git clone <repository>
cd admin-alquiler
bun install
cp .env.example .env          # required: nothing has a default for secrets
```

Create the database schema and the Colombian demo dataset:

```bash
bun run --filter '@admin-alquiler/database' db:generate
bun run --filter '@admin-alquiler/database' db:migrate
SEED_LOCALE=es-CO bun run --filter '@admin-alquiler/database' db:seed
```

Start the applications:

```bash
bun run dev        # api + web + worker
```

The API listens on `API_PORT` (default 3001). Verify it:

```bash
curl localhost:3001/health          # {"status":"ok"}
curl localhost:3001/ready           # per-dependency status
```

`GET /ready` reports `degraded` — rather than failing — when Redis or object storage is unreachable,
so the API stays inspectable during local development.

Sign in with the seeded administrator:

```bash
curl -X POST localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@ejemplo.co","password":"change-me"}'
```

Details: [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md).

### Docker Compose

`compose.yaml` defines PostgreSQL, Redis, MinIO, API, worker, web and Caddy, and Caddy is the only
published ingress (`:8080` HTTP, `:8443` HTTPS). Two things to know before relying on it:

- **Secrets are required.** Compose refuses to start without `POSTGRES_PASSWORD`, `DATABASE_URL`,
  `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`; `cp .env.example .env` supplies placeholders.
- **The application images do not build yet.** All three Dockerfiles copy a `biome.json` that is not
  in the repository, so `docker compose build` fails. Until that is fixed, run the apps on the host
  as above and use Compose for infrastructure only.

Compose also does not publish the PostgreSQL port, so a host-run app cannot reach the Compose
database. Either run your own PostgreSQL, or publish the port before `docker compose up -d`.

## Commands

```bash
bun run check            # lint + typecheck + all tests (the pre-commit gate)
bun run lint             # eslint + prettier --check
bun run typecheck        # tsc --noEmit
bun test                 # every suite
bun run test:unit        # pure domain rules, no I/O
bun run test:integration # repositories, constraints, API modules (needs a database)
bun run test:e2e         # critical journeys
bun run test:security    # authorization, isolation, uploads, auth abuse
```

Tests that need PostgreSQL skip themselves when no database is reachable, so `bun test` stays useful
without infrastructure. That also means a green local run does **not** mean the database-backed tests
passed — run them against a real database before trusting a change. See
[docs/TESTING.md](./docs/TESTING.md).

## Configuration

All configuration is environment-based and validated at startup; missing secrets fail fast rather
than defaulting to something weak. `.env.example` is the full list.

### AI (optional, off by default)

The platform is fully usable with AI disabled. Nothing in the core domain requires a model, a
provider or a network call.

| Variable               | Default                 | Purpose                                                            |
| ---------------------- | ----------------------- | ------------------------------------------------------------------ |
| `AI_ENABLED`           | `false`                 | Master switch. When off, every AI call returns a non-AI path.      |
| `AI_WEBGPU_ENABLED`    | `false`                 | Allow browser WebGPU inference (clients must also report support). |
| `AI_LOCAL_MODELS`      | empty                   | Comma-separated local model ids, most preferred first.             |
| `AI_LOCAL_BASE_URL`    | `http://localhost:8080` | Local inference server.                                            |
| `AI_EXTERNAL_PROVIDER` | empty                   | External provider name. Empty means never contacted.               |
| `AI_PROVIDER_BASE_URL` | empty                   | External provider endpoint.                                        |
| `AI_PROVIDER_API_KEY`  | empty                   | External provider credential. Never logged.                        |
| `AI_TIMEOUT_MS`        | `15000`                 | Upstream timeout.                                                  |
| `AI_MAX_RETRIES`       | `2`                     | Bounded retries for timeouts, 429 and 5xx.                         |
| `AI_DECISION_PROVIDER` | `laya`                  | `laya` (self-hosted) or `jev` (optional hosted).                   |
| `AI_DECISION_BASE_URL` | `http://localhost:8090` | Decision model endpoint.                                           |
| `AI_DECISION_MODEL`    | `laya`                  | Decision checkpoint.                                               |
| `AI_DECISION_API_KEY`  | empty                   | Credential for a hosted decision provider.                         |

Data classes drive the privacy policy: `PUBLIC` may use a configured provider, `INTERNAL` prefers
local, and `FINANCIAL`/`LEGAL`/`PERSONAL`/`SENSITIVE`/`CONFIDENTIAL` never leave the deployment. See
[docs/AI.md](./docs/AI.md) and [docs/security/ai-security.md](./docs/security/ai-security.md).

## Principles

Secure by default · domain independent of vendors · money with exact arithmetic ·
server-side authorization · auditable actions · private-by-default storage ·
AI optional, replaceable and untrusted.
Full list: [docs/README.md](./docs/README.md#core-principles).

## Docs

Start at [docs/INDEX.md](./docs/INDEX.md):

- [Product + vision](./docs/README.md) · [Charter](./docs/PROJECT_CHARTER.md) · [Blueprint](./docs/BLUEPRINT.md)
- [PRD](./docs/PRD.md) · [SRS](./docs/SRS.md) · [Architecture](./docs/ARCHITECTURE.md)
- [AI](./docs/AI.md) · [Security](./docs/SECURITY.md) · [Testing](./docs/TESTING.md)
- [Development](./docs/DEVELOPMENT.md) · [Deployment](./docs/DEPLOYMENT.md) · [Glossary](./docs/GLOSSARY.md)
- [Roadmap](./docs/ROADMAP.md) · build status in [roadmap/PLAN.md](./docs/roadmap/PLAN.md)

Repository layout intent: see [PROJECT.md](./PROJECT.md).

## Phases

1. Core Platform (no AI dependency) — [roadmap/PHASE-1.md](./docs/roadmap/PHASE-1.md) — **complete**
2. Private/Local AI — [roadmap/PHASE-2.md](./docs/roadmap/PHASE-2.md) — **complete**
   3–7. RAG, CLI, MCP, controlled actions, advanced AI (deferred) — [docs/ROADMAP.md](./docs/ROADMAP.md)
