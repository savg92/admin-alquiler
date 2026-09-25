# Admin alquiler — Project Charter

## Purpose

Build a production-quality property and rental administration platform that is secure, agile, cost-effective and extensible.

## Initial scope

The first release targets small organizations and property administrators in Colombia. The system starts with fewer than ten expected users and must remain simple to operate.

## Success criteria

The project succeeds when Phase 1 can operate without AI and provide:

- secure authentication
- multi-organization isolation
- configurable roles and permissions
- property/unit/owner/tenant management
- contracts and rent
- charges and payment records
- financial transactions and reporting foundations
- documents and PDF generation
- maintenance
- complaints and claims
- communications and notifications
- audit history
- mobile PWA
- offline foundations
- feature flags
- background jobs
- automated tests
- CI/CD
- backups and verified restore

Phase 2 succeeds when AI can be enabled without changing core business logic and supports private/local execution.

## Constraints

- Prefer open-source and free technologies.
- Avoid mandatory proprietary SaaS dependencies.
- Start with a single-server deployment where appropriate.
- Avoid premature microservices and infrastructure complexity.
- AI must remain optional.
- Suppliers do not receive accounts initially.
- Payments are recorded, not processed.
- Taxes are recorded/documented in v1 rather than electronically filed.

## Agile strategy

Use vertical slices rather than large horizontal layers.

Each slice should include:

- domain behavior
- API
- UI
- authorization
- validation
- audit
- tests
- error handling
- documentation
- observability
- migration where needed

## Git strategy

```text
main
 ├── feature/*
 ├── fix/*
 ├── chore/*
 ├── docs/*
 └── spike/*
```

`main` remains deployable and protected. Branches are short-lived and merged through pull requests.

Conventional commits are recommended.

## Definition of Done

A feature is complete only when applicable requirements, authorization, validation, auditability, unit/integration/E2E tests, accessibility, mobile behavior, i18n, migrations, observability and security concerns are addressed.

## Current phases

### Phase 1
Core Platform.

### Phase 2
Private/Local AI.

Future phases are intentionally deferred: RAG, CLI, MCP, controlled AI actions and advanced agentic workflows.
