# Phase 1 — Core Platform Implementation Plan

## Goal

Deliver a complete production-quality platform that is fully useful with AI disabled.

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
- units
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
- rent increases
- charges
- payment records
- receipts
- allocation

## Workstream 5 — Finance

Implement:

- accounts
- categories
- financial transactions
- bank transactions
- reconciliation
- periods
- reports
- property reporting
- monthly/yearly statements
- EBIT where defined by the reporting model

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
- supplier records
- complaints
- claims
- handovers
- insurance
- tax records
- agency expenses
- house rules

## Workstream 8 — Communication

Implement:

- in-app notifications
- email adapter
- communication records
- notification preferences
- templates

## Workstream 9 — Governance

Implement:

- acts/minutes
- decisions
- voting
- ownership-share voting
- approval rules
- owner authorization

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

Implement:

- health endpoints
- structured logs
- request IDs
- queue monitoring
- backups
- restore test
- error handling

## Workstream 13 — Testing

Create:

- unit suite
- integration suite
- E2E suite
- security suite

Critical E2E:

1. sign in
2. create organization
3. create property/unit
4. add owner
5. add tenant
6. create contract
7. create rent/charge
8. record payment
9. generate receipt
10. approve document
11. generate PDF
12. create maintenance request
13. send notification
14. verify audit trail
15. verify tenant isolation

## Phase 1 exit gate

No critical workflow may depend on AI or a proprietary external provider.
