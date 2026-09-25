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
│   ├── database/
│   ├── documents/
│   ├── notifications/
│   ├── events/
│   ├── config/
│   └── shared/
├── infrastructure/
├── tests/
└── docs/
```

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

- Versioned API.
- Request validation.
- Consistent error format.
- Request/correlation IDs.
- Rate limiting.
- Authentication middleware.
- Authorization guards/policies.
- Idempotency for suitable write operations.
- OpenAPI documentation.

## 9. Background processing

Use BullMQ for:

- email delivery
- PDF generation
- document processing
- OCR
- image processing
- notifications
- scheduled reminders
- future AI jobs

Jobs must be idempotent or safely retryable where practical.

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
