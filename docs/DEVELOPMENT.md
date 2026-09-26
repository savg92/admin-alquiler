# Development Guide

## Prerequisites

Recommended:

- Git
- Docker
- Bun
- Node compatibility only where a dependency requires it
- uv for Python tooling
- a modern Chromium-based browser for PWA/E2E work

## Setup

```bash
git clone <repository>
cd admin-alquiler
bun install
cp .env.example .env
```

`compose.yaml` refuses to start without secrets, and nothing has a working default, so the `.env`
step is required. Database schema and the Colombian demo dataset:

```bash
bun run --filter '@admin-alquiler/database' db:generate
bun run --filter '@admin-alquiler/database' db:migrate
SEED_LOCALE=es-CO bun run --filter '@admin-alquiler/database' db:seed
```

The application images in `compose.yaml` do not currently build (see the README), so run the apps on
the host and use Compose for infrastructure only:

```bash
bun run dev
```

Python tools, where required:

```bash
uv sync
uv run <command>
```

## Recommended commands

```bash
bun run check            # lint + typecheck + all tests
bun run lint
bun run typecheck
bun test
bun run test:unit
bun run test:integration # needs a reachable database
bun run test:e2e
bun run test:security
```

Database-backed tests skip themselves when no database is reachable, so a green `bun test` without
infrastructure does not mean those tests ran.

## Branching

```text
main
 ├── feature/*
 ├── fix/*
 ├── chore/*
 ├── docs/*
 └── spike/*
```

Keep branches short-lived. Rebase/update before merge when appropriate.

## Commits

Use Conventional Commits where practical:

- `feat:`
- `fix:`
- `docs:`
- `refactor:`
- `test:`
- `chore:`
- `perf:`
- `security:`

## Coding principles

- Prefer simple code.
- Keep domain logic independent from frameworks.
- Validate at boundaries.
- Never trust client authorization.
- Prefer explicit types.
- Avoid premature abstractions.
- Keep functions and modules cohesive.
- Do not duplicate business rules between web and API.
- Use feature flags for incomplete capabilities.

## Testing

### Unit

Domain rules, policies, calculations and pure functions.

### Integration

Database, repositories, API modules, storage and jobs.

### E2E

Real user workflows through the PWA/API.

### Security

Authorization, isolation, uploads, authentication and abuse scenarios.

## Definition of Done

A change should include applicable:

- requirements
- authorization
- validation
- audit events
- unit tests
- integration tests
- E2E tests
- mobile behavior
- accessibility
- i18n
- migration
- observability
- documentation
- security review

## Database changes

Use migrations.

Never depend on manually edited production databases.

Test both migration application and relevant rollback/recovery procedures.

## AI development

AI features must work with AI disabled.

Use the AI Gateway. Do not import a model/provider SDK into domain business logic.

AI responses must be treated as untrusted data and validated before use.
