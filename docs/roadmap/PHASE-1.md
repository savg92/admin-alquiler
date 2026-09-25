# Phase 1 — Core Platform Implementation Plan

## Goal

Deliver a complete production-quality platform that is fully useful with AI disabled.

## Build order (baseline-first)

Per Charter vertical slices, build in this order:

1. Engineering baseline — WS-1 (repo/tooling) + WS-12 (health, request IDs, structured logs,
   backup/restore drill, secret management) + API contracts (OpenAPI starter, `Idempotency-Key`,
   Prisma migrations, locale-parameterized seed (Colombia ships first)).
2. First vertical slice — auth → org → property → contract → charge → payment → receipt → audit,
   with the WS-13 E2E steps 1–10 green before widening scope.
3. Money workflows — collections/arrears (aging, late-fee rule, dunning), contract/IPC lifecycle,
   bank imports, PH cuotas/acts, dashboards (5 KPIs), self-service portals.
4. Remaining workstreams — documents, operations, governance remainder, PWA/offline, security
   hardening, full test suites.

## Workstream 1 — Repository and tooling

- Create Bun workspace/monorepo.
- Create web, API and worker applications.
- Create shared packages.
- Configure TypeScript.
- Configure linting/formatting.
- Configure commit hooks.
- Configure Docker Compose.
- Add environment validation.
- Add CI.

## Workstream 2 — Identity and organizations

Implement:

- users
- organizations
- memberships
- roles
- permissions
- sessions
- password authentication
- authorization policies
- audit events

Tests:

- login
- session expiry
- organization isolation
- unauthorized resource access
- role changes

## Workstream 3 — Properties and people

Implement:

- properties
- units (incl. subtypes: residential, office, parking, storage)
- guided property setup: step checklist, bulk unit creation, org-default prefill, resumable progress
- owners
- ownership shares
- tenants
- tenancy
- property/unit configuration
- photos/records

## Workstream 4 — Rental

Implement:

- contracts
- rent schedules
- rent increases (country-pluggable cap; CO IPC auto-fetch + manual correction)
- contract expiry/renewal reminders (90/60/30 days)
- early termination (notice/effective dates, cause, country-pluggable indemnity rule)
- codeudores + linked rental policy (validity dates, policy-expiry reminders)
- charges (incl. PH cuotas + fines)
- utility meter readings → charges (anomaly flags)
- payment records
- receipts
- deposits (held/deducted/returned, reconciled)
- allocation
- aging report + late-fee evaluation + dunning events (3/7/15/30 days, email + in-app)

## Workstream 5 — Finance

Implement:

- accounts
- categories
- financial transactions
- bank transactions (Bancolombia/Davivienda CSV maps, dedupe key, quarantine)
- reconciliation (manual confirm with suggestions; OCR assist only)
- periods
- reports
- property reporting
- monthly/yearly statements
- EBIT where defined by the reporting model
- v1 KPI set: occupancy, delinquency rate, upcoming expirations, maintenance SLA, per-property P&L/EBIT
- owner settlements: commission rules, monthly statements (collected − commission − deductions =
  net payout split by ownership %), recorded payouts with transfer refs; statement → receipt traceability

Use exact money arithmetic.

## Workstream 6 — Documents

Implement:

- document types
- templates
- editor
- versions
- attachments
- approvals
- signatures
- PDF generation
- lifecycle state machine

## Workstream 7 — Operations

Implement:

- maintenance requests
- work orders
- supplier directory (service providers + stores/places, no accounts)
- purchase-place tracking per property (materials/services, receipt, optional work-order link)
- tax records + country-pack deadline reminders (record + receipt attach; no filing)
- complaints
- claims
- handovers
- insurance
- agency expenses
- house rules

## Workstream 8 — Communication

Implement:

- in-app notifications
- email adapter (Phase 1 channels are email + in-app; WhatsApp deferred)
- communication records
- notification preferences
- templates (channel-neutral dunning/renewal templates reusable later)

## Workstream 9 — Governance

Implement:

- acts/minutes (incl. PH assembly acts with attendance/quorum/proxies, only on PH-enabled properties)
- decisions
- voting
- ownership-share voting (ordinary 50%+1 present, qualified 70% total per Ley 675)
- approval rules
- owner authorization
- PH cuotas (ordinary/extraordinary) linked to charges, only on PH-enabled properties

## Workstream 10 — PWA/offline

Implement:

- responsive mobile-first UI
- installability
- service worker
- safe caching
- offline queue foundation
- sync conflict strategy
- camera/photo upload workflows

## Workstream 11 — Security

Implement:

- secure authentication
- authorization policies
- tenant isolation
- rate limiting
- upload validation
- secure headers
- CSRF/XSS protections as applicable
- SSRF protections
- audit trail
- secret management

## Workstream 12 — Reliability

Implement (minimal baseline now; Prometheus/Grafana/Loki and OpenTelemetry deferred until
operational value justifies them):

- health endpoints (`GET /health`, `GET /ready`: DB, Redis/queue depth, storage)
- structured logs (Pino JSON: timestamp, severity, service, request ID, safe org/actor IDs,
  event, duration, stable error code; no sensitive payloads)
- request IDs (`X-Request-Id` generate/propagate)
- queue monitoring
- backups (automated, encrypted) + restore test (periodic test-environment drill)
- error handling
- secret management (env-validated, never logged; documented rotation path)

## Workstream 13 — Testing

Create:

- unit suite
- integration suite
- E2E suite
- security suite

Critical E2E:

1. sign in
2. create organization
3. create property/units (guided setup incl. bulk units)
4. add owner
5. add tenant
6. create contract
7. create rent/charge
8. record payment
9. generate receipt
10. generate owner settlement
11. approve document
12. generate PDF
13. create maintenance request
14. send notification
15. verify audit trail
16. verify tenant isolation

## Phase 1 exit gate

No critical workflow may depend on AI or a proprietary external provider.
