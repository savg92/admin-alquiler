# Plan — Trackable Build Status

Single source for "what is done and what is next". Normative scope lives in
`PHASE-1.md` / `PHASE-2.md` / `phase-*.md`; this file tracks execution against it.

## Status legend

- `[ ]` pending — not started
- `[/]` in progress — actively being worked (at most one per person; finish or revert it)
- `[x]` done — implemented **and** verified per the Charter Definition of Done
  (requirements, authorization, validation, audit, tests, i18n, migration, observability,
  docs/security review where applicable). A checkbox without verification stays `[/]`.

Rules:

1. Move `[/]` → `[x]` only when the verification for that task is observed (tests green,
   diagnostics clean), never on "code written".
2. Checking `[x]` on an E2E step means it passes in CI, not locally once.
3. If scope changes, edit the phase file first, then add/remove the checkbox here with the
   same wording so the two never drift.

Live report (no manual percentages — computed from these checkboxes):

```text
bash scripts/roadmap-status.sh
```

## Phase 1 — Core Platform

Build order: Stage A (baseline) → Stage B (first slice) → Stage C (money) → Stage D (remainder).
The stage tag on each workstream fixes the sequence; do not start Stage C before the Stage B
E2E gate is green.

### WS-1 — Repository and tooling [Stage A]

- [x] Bun workspace/monorepo with web, api, worker apps
- [x] Shared packages (domain, auth, permissions, database, documents, notifications, events, config, shared)
- [x] TypeScript + lint/format + commit hooks
- [x] Docker Compose (PostgreSQL, Redis, MinIO, API, worker, web, Caddy)
- [x] Environment validation (fail fast on missing secrets/config)
- [x] CI (lint, typecheck, unit, integration)

### WS-12 — Reliability [Stage A]

- [x] Health endpoints (`GET /health` liveness, `GET /ready` with DB/queue/storage checks)
- [x] Structured JSON logs (Pino: timestamp, severity, service, request ID, safe IDs, event, duration, error code)
- [x] Request IDs (`X-Request-Id` generate/propagate across API → worker)
- [x] Queue monitoring (depth, failures, dead-letter visibility)
- [x] Automated encrypted backups
- [ ] Restore drill in a test environment (record date + result)
- [x] Secret management (env-validated, never logged, rotation documented)

### Engineering contracts [Stage A]

- [x] OpenAPI starter (NestJS Swagger code-first; `GET /openapi.json` is the contract)
- [x] `Idempotency-Key` convention on POST (24h window, 409 on key+payload mismatch)
- [x] Prisma Migrate with versioned reviewable SQL
- [x] Locale-parameterized seed (Colombia `es-CO`/`CO`/`COP` ships first)

### WS-2 — Identity and organizations [Stage B]

- [x] Users, organizations, memberships
- [x] Roles + permissions + authorization policies (deny by default, server-side)
- [x] Sessions + password authentication (expiry, rotation)
- [x] Audit events for identity/role changes
- [x] Verified: org isolation tests, unauthorized-access tests, session-expiry tests

### WS-3 — Properties and people [Stage B]

- [x] Properties, units (incl. subtypes: residential, office, parking, storage)
- [x] Guided property setup: step checklist, bulk unit creation, org-default prefill, resumable
- [x] Owners + ownership shares (`PropertyOwnership` with %/dates)
- [x] Tenants + tenancy periods
- [x] Property/unit configuration + photos/records

### WS-4 — Rental [Stage B: core → Stage C: remainder]

- [x] Contracts (documents, dates, terms, status, parties)
- [x] Codeudores + linked rental policy (validity dates, policy-expiry reminders)
- [x] Contract expiry/renewal reminders (90/60/30 days) + renewal workflow
- [ ] Early termination (notice/effective dates, cause, country-pluggable indemnity as charge/credit)
- [ ] Rent schedules + IPC increases (country-pluggable cap; CO DANE auto-fetch + manual correction)
- [x] Recurring charge generation (monthly propose → preview/confirm; idempotent per contract+period)
- [x] Charges (rent, utilities, PH cuotas + fines, adjustments)
- [ ] Utility meter readings → charges (value, date, photo; anomaly flags)
- [x] Payments + receipts/proofs + allocations
- [ ] Deposits (held/deducted/returned; ledger reconciles)
- [ ] Aging report (current, 1–30, 31–60, 61–90, 90+)
- [ ] Late-fee evaluation (configurable rule; Colombia national default)
- [ ] Dunning events (3/7/15/30 days; in-app + email; channel-neutral templates)

### WS-5 — Finance [Stage C]

- [ ] Accounts, categories, financial transactions (exact arithmetic, ISO-4217 per record)
- [x] Bank imports (Bancolombia/Davivienda maps; dedupe key; quarantine on conflict)
- [x] Reconciliation (manual confirm with suggestions; OCR assist-only, human posts)
- [ ] Periods + monthly/yearly statements
- [ ] v1 KPI set: occupancy, delinquency rate, upcoming expirations, maintenance SLA, per-property P&L/EBIT
- [x] Owner settlements (commission rules; monthly statements; ownership-% splits; recorded payouts)

### WS-6 — Documents [Stage D]

- [ ] Document types + templates (language/version metadata)
- [ ] Editor + versioning + attachments
- [ ] Approvals + signatures + lifecycle state machine (Draft → … → Final)
- [ ] Async PDF generation (deterministic, auditable)

### WS-7 — Operations [Stage D]

- [ ] Maintenance requests + work orders (evidence, costs, status history)
- [ ] Supplier directory (providers + stores; no accounts) + purchase-place tracking per property
- [ ] Complaints + claims (configurable workflows)
- [ ] Handovers (evidence + document generation; deposit deductions link here)
- [ ] Insurance records (+ contract policy links from WS-4)
- [ ] Tax records + country-pack deadline reminders (record-only, no filing)
- [ ] Agency expenses + house rules (versioned)

### WS-8 — Communication [Stage C]

- [ ] In-app notifications + preferences
- [ ] Email adapter (async, retryable; delivery state separate from communication record)
- [ ] Communication records (sender, recipients, subject, body, locale, timestamps, related records)
- [ ] Channel-neutral dunning/renewal templates (WhatsApp deferred to later phase)

### WS-9 — Governance [Stage D]

- [ ] Acts/minutes + decisions + voting (ownership-share weighted)
- [ ] PH assembly acts (attendance, quorum computation, proxies; 50%+1 ordinary, 70% qualified)
- [ ] Approval rules + owner authorization (configurable: one/quorum/percentage/all)
- [ ] PH cuotas linked to charges (property-flag gated)

### WS-10 — PWA/offline [Stage D]

- [ ] Mobile-first responsive UI + installability
- [ ] Service worker with safe caching
- [ ] Offline queue foundation + sync conflict strategy
- [ ] Camera/photo upload workflows (proofs, meters, maintenance, properties)
- [ ] Self-service portals (same PWA, role-guarded: tenant upload/track; owner view-only P&L)

### WS-11 — Security [Stage D, hardening pass over all]

- [ ] Rate limiting + secure headers + CSRF/XSS/SSRF protections
- [ ] Upload validation (size, MIME, safe names, private storage, authz before download)
- [ ] Tenant isolation verified (tests, not UI hiding)
- [ ] Security test suite (authz, isolation, uploads, auth abuse)

### WS-13 — Testing [continuous; gates each stage]

- [ ] Unit suite (domain rules, policies, money math)
- [ ] Integration suite (DB, repos, API modules, storage, jobs)
- [ ] E2E suite — each step green in CI:
- [x] — sign in
- [x] — create organization
- [x] — guided property/units setup (incl. bulk units)
- [x] — add owner
- [x] — add tenant
- [x] — create contract
- [x] — generate monthly charges
- [x] — record payment
- [x] — generate receipt
- [x] — generate owner settlement
- [ ] — approve document
- [ ] — generate PDF
- [ ] — create maintenance request
- [ ] — send notification
- [ ] — verify audit trail
- [ ] — verify tenant isolation
- [ ] Security suite (see WS-11)

### Phase 1 exit gate

- [ ] No critical workflow depends on AI or a proprietary external provider

## Phase 2 — Private/Local AI

### Gateway + modes (§1–§2)

- [ ] Stable gateway API: `generateText`, `generateStructuredOutput`, `generateEmbedding`, `analyzeImage`, `decide`
- [ ] Execution modes (disabled/webgpu/local/hybrid/provider) with configurable priority + fallback
- [ ] Graceful non-AI path verified for every AI-assisted feature

### Local + provider (§3–§5)

- [ ] WebGPU (capability/memory checks, download cache + recovery, mobile/desktop tests)
- [ ] Local inference adapter (LFM2.5 candidates; no hard-coded model)
- [ ] Self-hosted decision default: Laya (multilingual checkpoint; fine-tuned, see evaluation)
- [ ] Optional hosted decision adapter: Jev (same `decide` interface; explicit config; never the only option)
- [ ] Provider adapter (explicit config, redaction/minimization, timeouts, retries, quotas, observability)

### Registry, flags, privacy, safety (§6–§9)

- [ ] Model registry (metadata + lifecycle; no auto-deploy of new models)
- [ ] AI flags (`AI_ENABLED`, `AI_WEBGPU_ENABLED`, `AI_LOCAL_MODELS`, `AI_EXTERNAL_PROVIDER`)
- [ ] Privacy policy engine (data classes; FINANCIAL/LEGAL/PERSONAL local-only by default)
- [ ] Safety pipeline on every call (classify → minimize → select → infer → validate → authorize → confirm)

### Features + evaluation (§10–§12)

- [ ] Drafting, communication assistance, summarization, extraction, classification, vision
- [ ] `decide` triage (complaints/maintenance, proof-match suggestions, dunning stages; human confirms postings)
- [ ] Evaluation suite (es-CO + en quality, extraction, classification, hallucination, latency, memory, fallback)
- [ ] Decision calibration gate (fine-tune on own data; fit temperatures; log confidence vs outcomes; own thresholds)
- [ ] AI observability (safe metadata only; no sensitive prompts/responses by default)

### Phase 2 exit gate

- [ ] AI off breaks nothing; models swap without logic rewrites; sensitive data stays local; all AI-structured results validated

## Phase 3 — RAG + Knowledge (deferred)

- [ ] Kickoff evaluation: LangChain suite vs hand-rolled pgvector (adoption bar in phase file)
- [ ] Permission-aware retrieval with zero-leakage evaluation
- [ ] (Rest per `phase-3-rag-knowledge.md` at kickoff — do not pre-build)

## Phase 4 — CLI (deferred)

- [ ] CLI as API client (same auth/authz/audit as web; no duplicated rules)

## Phase 5 — MCP (deferred)

- [ ] Scoped read-only-first domain tools (no raw SQL; audited)

## Phase 6 — Controlled AI Actions (deferred)

- [ ] Proposal + approval-gated execution for consequential changes

## Phase 7 — Advanced AI (deferred)

- [ ] Bounded agentic workflows (budgets, kill switches, audit)
