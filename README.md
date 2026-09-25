# Admin alquiler

Secure, mobile-first, multi-organization property and rental administration platform.
Initial focus: Colombia, COP, `es-CO`. Provider-independent by design; AI is optional.

## Docs

Start at [docs/INDEX.md](./docs/INDEX.md):

- [Product + vision](./docs/README.md) · [Charter](./docs/PROJECT_CHARTER.md) · [Blueprint](./docs/BLUEPRINT.md)
- [PRD](./docs/PRD.md) · [SRS](./docs/SRS.md) · [Architecture](./docs/ARCHITECTURE.md)
- [Development](./docs/DEVELOPMENT.md) · [Testing](./docs/TESTING.md) · [Deployment](./docs/DEPLOYMENT.md)
- [Security](./docs/SECURITY.md) · [Roadmap](./docs/ROADMAP.md) · [Glossary](./docs/GLOSSARY.md)

Repository layout intent: see [PROJECT.md](./PROJECT.md).

## Quickstart (intended)

```bash
git clone <repository>
cd admin-alquiler
bun install
docker compose up -d
bun run dev
```

Details: [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md).

## Principles

Secure by default · domain independent of vendors · money with exact arithmetic ·
server-side authorization · auditable actions · private-by-default storage.
Full list: [docs/README.md](./docs/README.md#core-principles).

## Phases

1. Core Platform (no AI dependency) — [roadmap/PHASE-1.md](./docs/roadmap/PHASE-1.md)
2. Private/Local AI — [roadmap/PHASE-2.md](./docs/roadmap/PHASE-2.md)
3–7. RAG, CLI, MCP, controlled actions, advanced AI (deferred) — [docs/ROADMAP.md](./docs/ROADMAP.md)
