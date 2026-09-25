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
docker compose up -d
bun run dev
```

Python tools, where required:

```bash
uv sync
uv run <command>
```

## Recommended commands

```bash
bun run dev
bun run lint
bun run typecheck
bun test
bun run test:e2e
bun run check
```

The exact scripts should be defined in the repository package configuration.

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
