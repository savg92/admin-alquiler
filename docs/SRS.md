# Admin alquiler — Software Requirements Specification

## 1. System architecture

```text
Web/PWA
   ↓
Next.js
   ↓
NestJS API
   ↓
Domain / Application Services
   ↓
PostgreSQL

Background:
API → Outbox → Redis/BullMQ → Worker

Files:
API → Storage abstraction → MinIO/S3-compatible

AI:
API → AI Gateway → WebGPU / Local / Provider
```

## 2. Repository

```text
admin-alquiler/
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
├── packages/
│   ├── domain/
│   ├── auth/
│   ├── permissions/
│   ├── database/        # Prisma schema + versioned migrations, locale-parameterized seed
│   ├── documents/
│   ├── notifications/
│   ├── events/
│   ├── config/
│   └── shared/
├── infrastructure/
├── tests/
└── docs/
```

Database changes use Prisma Migrate with versioned, reviewable SQL. Seed data is parameterized by
locale (`language/country/currency/timezone`); the Colombia seed (`es-CO`/`CO`/`COP`/
`America/Bogota`) ships first and additional country seeds plug in without schema changes. Each seed
covers a minimal onboarding dataset (organization, roles, property/unit, owners, tenant, contract,
charges, payment, admin fee) for local/dev use.

## 3. Core entities

- Organization
- User
- Role
- Permission
- Property
- Unit
- Owner
- Tenant
- PropertyOwnership
- Tenancy
- Contract
- Rent
- Charge
- Payment
- Allocation
- FinancialTransaction
- Account
- Category
- BankTransaction
- Reconciliation
- Document
- DocumentVersion
- DocumentTemplate
- MaintenanceRequest
- MaintenanceWorkOrder
- Complaint
- Claim
- Communication
- Notification
- Approval
- Signature
- AuditEvent
- LateFeeRule (country default + org/contract override: rate type, rate, grace days, base)
- DunningEvent (charge, stage 3/7/15/30, channel, delivery state)
- RentIncreaseIndex (country, period, value, source index-provider/manual, fetched/corrected by/at)
- AdminFee (ordinary/extraordinary, coefficient base, due date, assembly-act ref; only on PH-enabled properties)
- AssemblyAct (attendance, quorum computation, decisions, proxies; only on PH-enabled properties)
- Supplier (org-scoped directory, no login: name, category service/store, contact, optional tax ID/address, notes)
- Purchase (property required, unit optional: supplier link or free-text place, description, amount + currency,
  date, receipt ref, optional work-order/expense link, recorded by/at)
- CommissionRule (org/property/contract scope: percentage and/or fixed fee)
- Settlement (period, property: collected, commission, deductions, net payout split per owner by
  ownership %, one line per owner, statement ref, payout transfer ref/date; payouts recorded,
  never processed)
- Deposit (contract: held, deducted with evidence refs, returned; must reconcile)
- Codeudor (contract: contact, ID, supporting documents)
- MeterReading (unit, utility, value, date, optional photo ref; feeds charge generation)
- ContractTermination (contract, notice/effective dates, cause, indemnity as charge/credit ref)

## 4. Authorization

Authorization decisions must consider:

1. authenticated identity
2. organization membership
3. role permissions
4. resource scope
5. property/unit visibility
6. workflow state
7. ownership/approval rules

All sensitive authorization checks occur on the server.

## 5. Configuration inheritance

Settings follow:

`System → Organization → Property → Unit → User`

Resolution order:

1. explicit user value
2. explicit unit value
3. explicit property value
4. explicit organization value
5. system default

An explicit disable must override an inherited enable.

## 6. Financial requirements

Money uses exact arithmetic.

Every money record carries an ISO-4217 currency code. The organization sets a default currency
(`COP` first); mixing currencies in one organization is stored correctly but never auto-converted —
currency conversion is out of v1 scope and multi-currency reporting is deferred.

Transactions must support:

- immutable identifiers
- timestamps
- source
- account
- category
- amount
- currency
- property/unit relation
- references
- audit information

Corrections use reversals/adjustments where financial history is already posted.

Collections rules:

- aging buckets: current, 1–30, 31–60, 61–90, 90+ days overdue, computed per charge from due date.
- late-fee evaluation is country-pluggable with a Colombia default; inputs (rate, grace days, base)
  resolve `contract override → organization default → country default`.
- bank-import dedupe key: (bank + account + date + amount + reference); re-import is idempotent.
- proof-to-payment matching is suggestive only; posting a match or write-off requires a human
  confirmation and writes an audit event.
- owner payouts follow the same recorded-not-processed rule as tenant payments: the system records
  transfer references and dates, it never moves money.

## 7. Files

Files are untrusted input.

Required controls:

- size limits
- MIME/type validation
- safe generated names
- metadata validation
- malware scanning where available
- private object storage
- authorization before download
- no public object URLs by default

## 8. API requirements

- Versioned API (`/api/v1`).
- Request validation.
- Consistent error format (`{ error: { code, message, details? }, requestId }`).
- Request/correlation IDs (`X-Request-Id` generated if absent, propagated to logs/jobs).
- Rate limiting.
- Authentication middleware.
- Authorization guards/policies.
- Idempotency for suitable write operations: clients send `Idempotency-Key` on POST
  (payments, charges, bank imports, matches); same key + same payload within 24h returns the
  original result; same key + different payload returns 409; keys are scoped per organization + user.
- OpenAPI documentation: NestJS Swagger code-first is the starter; `GET /openapi.json` is the
  contract source of truth and breaking changes require a version bump + migration note.

## 9. Background processing

Use BullMQ for:

- email delivery
- PDF generation
- document processing
- OCR (receipt assist; fields stay unconfirmed until human review)
- image processing
- notifications
- scheduled reminders (contract 90/60/30-day expiry, dunning 3/7/15/30-day, policy expiry,
  country-pack tax deadlines)
- rent-index fetch (country-pluggable provider; CO ships DANE; manual correction path)
- bank CSV imports (Bancolombia/Davivienda maps, dedupe, quarantine)
- recurring charge generation (monthly propose → preview/confirm; idempotent per contract+period)
- future AI jobs

Jobs must be idempotent or safely retryable where practical. Schedulers own no domain math;
they emit due events and domain services compute amounts/fees.

## 10. Testing

Required layers:

- Unit
- Integration
- E2E
- Security

Critical E2E flows include authentication, tenant isolation, property management, rent/charges/payments, document approval, owner approval and offline synchronization.

## 11. Deployment

Initial production can use:

- Cloudflare
- Linux VM/VPS
- Docker Compose
- Caddy
- PostgreSQL
- Redis
- MinIO
- API
- worker
- web

The architecture must support moving stateful services to managed infrastructure later.

## 12. Reliability

Initial targets:

- RPO ≤ 24 hours.
- RTO ≤ 4 hours.

Backups must be automated, encrypted and periodically restored in a test environment.
