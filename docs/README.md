# Admin alquiler

Admin alquiler is a secure, mobile-first, multi-organization property and rental administration platform, initially focused on Colombia and COP, with a provider-independent architecture designed for future countries, currencies, languages and AI runtimes.

## Product goals

- Manage organizations, properties, units, owners, tenants and administrators.
- Support configurable roles, permissions and resource scopes.
- Manage rentals, contracts, rent increases, charges, payments and financial transactions.
- Track utilities, maintenance, repairs, complaints, claims and property handovers.
- Manage documents, templates, approvals, signatures, acts/minutes and communications.
- Provide monthly/yearly financial reporting and accounting foundations.
- Support configurable voting and owner approval workflows.
- Deliver a mobile-first PWA with offline foundations.
- Prefer open-source, free and provider-independent technologies.
- Keep AI optional and never make AI a prerequisite for core business operations.
- Evolve from a simple single-server deployment to larger infrastructure without rewriting the domain.

## Core principles

1. Secure by default.
2. Simple until complexity is justified.
3. Domain logic stays independent of vendors.
4. External providers are adapters, not foundations.
5. AI is optional, replaceable and untrusted.
6. Money is never represented with floating-point arithmetic.
7. Authorization is enforced server-side.
8. Important actions are auditable.
9. Data and files are private by default.
10. Every feature should be testable and deployable independently.

## Technology baseline

- Frontend: React + Vite SPA, TypeScript, PWA (TanStack Router + Query; static build served by Caddy — no SSR, no server runtime).
- Backend: NestJS, TypeScript.
- Runtime/package manager: Bun where appropriate.
- Database: PostgreSQL.
- ORM/data access: Prisma or equivalent provider-independent layer.
- Jobs: Redis + BullMQ.
- Object storage: MinIO / S3-compatible.
- Reverse proxy/TLS: Caddy.
- PDF rendering: Playwright/Chromium.
- OCR: Tesseract.
- Image processing: Sharp.
- Observability: structured logs, Prometheus/Grafana/Loki as needed.
- CI/CD: GitHub Actions.
- Containers: Docker / Docker Compose.
- AI: WebGPU, local inference and external-provider adapters, including LFM2.5-family models.

## Deployment profiles

- Local development: Docker Compose.
- Small production: Cloudflare + one Linux VPS/Oracle Always Free-style VM.
- Growth: separate database/storage and multiple application instances.
- Larger deployments: managed infrastructure where operational value justifies cost.

## Future phases

1. Phase 1 — Core Platform
2. Phase 2 — Private/Local AI
3. Phase 3 — RAG + Knowledge Layer
4. Phase 4 — CLI
5. Phase 5 — MCP
6. Phase 6 — Controlled AI Actions
7. Phase 7 — Advanced AI/agentic workflows

Phase 1 and Phase 2 are the current implementation focus.
