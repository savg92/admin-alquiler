# Admin alquiler Documentation

Single entry point for all docs. Paths below are relative to `docs/`.

## Read first

1. [README.md](./README.md) — product goals and principles
2. [PROJECT_CHARTER.md](./PROJECT_CHARTER.md) — scope, success criteria, Definition of Done
3. [BLUEPRINT.md](./BLUEPRINT.md) — actors, resource hierarchy, core domains
4. [PRD.md](./PRD.md) — functional requirements (FR-001…FR-027)
5. [SRS.md](./SRS.md) — system, entities, API, reliability targets
6. [ARCHITECTURE.md](./ARCHITECTURE.md) — modular monolith, multi-tenancy, events, AI boundary
7. [SECURITY.md](./SECURITY.md) — threat model summary and controls
8. [ROADMAP.md](./ROADMAP.md) — phase overview, links to detailed plans

## Map

### Product

- [README.md](./README.md)
- [PROJECT_CHARTER.md](./PROJECT_CHARTER.md)
- [BLUEPRINT.md](./BLUEPRINT.md)
- [PRD.md](./PRD.md)
- [SRS.md](./SRS.md)

### Architecture

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [architecture/documents.md](./architecture/documents.md)
- [architecture/notifications.md](./architecture/notifications.md)
- [architecture/offline-sync.md](./architecture/offline-sync.md)
- [architecture/i18n-l10n.md](./architecture/i18n-l10n.md)
- [AI.md](./AI.md)
- [FEATURE-FLAGS.md](./FEATURE-FLAGS.md)

### Engineering

- [DEVELOPMENT.md](./DEVELOPMENT.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [GIT-WORKFLOW.md](./GIT-WORKFLOW.md)
- [TESTING.md](./TESTING.md)
- [DEPLOYMENT.md](./DEPLOYMENT.md)

### Security

- [SECURITY.md](./SECURITY.md)
- [security/threat-model.md](./security/threat-model.md)
- [security/authentication.md](./security/authentication.md)
- [security/authorization.md](./security/authorization.md)
- [security/data-classification.md](./security/data-classification.md)
- [security/file-security.md](./security/file-security.md)
- [security/ai-security.md](./security/ai-security.md)
- [security/privacy-and-retention.md](./security/privacy-and-retention.md)
- [security/backup-recovery.md](./security/backup-recovery.md)
- [security/incident-response.md](./security/incident-response.md)

### Operations

- [operations/observability.md](./operations/observability.md)
- [DEPLOYMENT.md](./DEPLOYMENT.md) — profiles, rollback, backups

### Roadmap

- [ROADMAP.md](./ROADMAP.md) — summary hub (single source for phase scope)
- [roadmap/PLAN.md](./roadmap/PLAN.md) — trackable build status (checkboxes + `scripts/roadmap-status.sh`)
- [roadmap/roadmap.md](./roadmap/roadmap.md) — timeline visual
- [roadmap/PHASE-1.md](./roadmap/PHASE-1.md) — Core Platform workstreams
- [roadmap/PHASE-2.md](./roadmap/PHASE-2.md) — Private/Local AI plan
- [roadmap/phase-3-rag-knowledge.md](./roadmap/phase-3-rag-knowledge.md)
- [roadmap/phase-4-cli.md](./roadmap/phase-4-cli.md)
- [roadmap/phase-5-mcp.md](./roadmap/phase-5-mcp.md)
- [roadmap/phase-6-controlled-ai-actions.md](./roadmap/phase-6-controlled-ai-actions.md)
- [roadmap/phase-7-advanced-ai.md](./roadmap/phase-7-advanced-ai.md)

### Reference

- [GLOSSARY.md](./GLOSSARY.md) — ubiquitous language (Organization, PropertyOwnership, Allocation…)

## Conventions

- `ROADMAP.md` is the phase-scope hub; `roadmap/PHASE-*.md` hold implementation detail. Do not duplicate phase scope in both.
- `SECURITY.md` is the summary; `security/*.md` hold normative detail.
- `ARCHITECTURE.md` states principles; `architecture/*.md` hold topic detail.
- Keep code examples as `text` diagrams unless Mermaid is needed; Mermaid lives in topic files.
- See [CONTRIBUTING.md](./CONTRIBUTING.md) for doc-update expectations on behavior changes.
