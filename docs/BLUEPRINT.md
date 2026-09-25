# Admin alquiler — System Blueprint

## 1. Vision

Admin alquiler provides a unified system for managing rental properties and related administrative, financial, documentary and communication workflows.

The initial market is Colombia, with COP as the first currency and Spanish (`es-CO`) as the initial language. The architecture must not encode Colombia-specific assumptions into the core domain where configurable behavior is possible.

## 2. Actors

- Super admin
- Organization administrator
- Property administrator
- Owner administrator
- Owner view-only
- Tenant
- Additional organization-defined roles

Suppliers are recorded as contacts/vendors but do not receive application accounts in the initial design.

## 3. Resource hierarchy

```text
System
└── Organization
    ├── Users / Roles
    ├── Properties
    │   ├── Units
    │   ├── Owners
    │   ├── Tenants
    │   ├── Contracts
    │   ├── Documents
    │   ├── Financial records
    │   └── Workflows
    └── Organization configuration
```

Configuration precedence:

```text
System → Organization → Property → Unit → User
```

Each setting can support inherited defaults, explicit overrides and explicit disablement.

## 4. Core domains

### Identity and access
Organizations, users, roles, permissions, sessions, authentication, authorization and audit.

### Property management
Properties, units, ownership, occupancy, contacts, photos, records and configuration.

### Rental management
Tenancies, contracts, rent, increases, charges, receipts, handovers and house rules.

### Financial management
Accounts, categories, charges, payments, allocations, transactions, bank imports, reconciliation and reporting.

### Maintenance
Requests, work orders, suppliers, costs, evidence and status history.

### Documents
Templates, documents, versions, attachments, approvals, signatures, PDFs and document lifecycle.

### Communications
Formal email, internal communication records, notifications and future channel adapters.
Phase 1 is email + in-app; WhatsApp is a deferred adapter. Dunning/renewal templates are
channel-neutral.

### Governance
Acts/minutes, decisions, voting, ownership shares, approvals and authorization workflows.
Phase 1 includes propiedad horizontal, gated per property by `PROPERTY_HORIZONTAL_ENABLED`:
cuotas de administración (ordinary/extraordinary) as charges, assembly acts with attendance/quorum/proxies, ordinary quorum 50%+1 of coefficients
present, qualified quorum 70% of total coefficients. Properties without the flag see none of this.

### Self-service (same PWA)
Tenant slice: contract/charges/receipts view, payment-proof + photo upload, request tracking.
Owner view-only slice: per-property P&L/EBIT, occupancy, delinquency. Server-side authorization
and audit apply unchanged.

## 5. Multi-owner rules

A property can have multiple owners through `PropertyOwnership`.

Ownership may include:

- owner identity
- ownership percentage/share
- voting weight
- effective dates
- administrator authorization
- visibility configuration

Approval policy is configurable. A workflow can require one owner, a quorum, a percentage of ownership, or all required owners.

## 6. Financial model

Money must use integer minor units or exact decimal arithmetic.

Core records:

- Account
- Category
- Charge
- Payment
- Allocation
- FinancialTransaction
- BankTransaction
- Reconciliation
- TaxRecord
- FinancialPeriod

The system records payments and reconciliations. It does not require a payment processor.

Historical financial records should use adjustments/reversals instead of silently rewriting important posted history.

## 7. Document model

Document lifecycle:

```text
Draft
  ↓
Review
  ↓
Approval
  ↓
Approved
  ↓
Signed
  ↓
Final
```

Documents support:

- templates
- versioning
- attachments
- generated PDFs
- approvals
- signatures
- metadata
- access control
- audit events

Document types are configurable. Examples include acts, rent increases, handovers, complaints, claims, contracts, tax records and communications.

## 8. Event model

Use domain events and an outbox pattern:

```text
Domain operation
   ↓
Transaction + Outbox event
   ↓
BullMQ
   ↓
Worker
   ↓
Notification / PDF / email / indexing / integration
```

Do not introduce Kafka or microservices until workload and operational requirements justify them.

## 9. AI boundary

```text
Application
   ↓
AI Gateway
   ↓
Model Router
   ├── WebGPU
   ├── Local server
   └── External provider
```

AI can draft, summarize, extract and classify, but cannot directly mutate critical domain state.

AI output must pass:

```text
AI output
→ schema validation
→ domain validation
→ authorization
→ optional human confirmation
→ domain operation
```

## 10. Non-functional goals

- Secure by default.
- Mobile-first.
- Accessible.
- Observable.
- Testable.
- Provider-independent.
- Cost-aware.
- Incrementally scalable.
- Offline-capable where practical.
- Internationalization-ready.
