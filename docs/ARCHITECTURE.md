# Admin alquiler — Architecture

## 1. Architectural principles

- Modular monolith first.
- Clear domain boundaries.
- Provider-independent adapters.
- Secure defaults.
- Least privilege.
- Server-side authorization.
- Event-driven background work without microservice overhead.
- AI outside the domain core.
- Database as the source of truth.
- Files in private object storage.
- Incremental scalability.

## 2. Application structure

```text
apps/web       → presentation/PWA
apps/api       → HTTP/API/application orchestration
apps/worker    → asynchronous jobs

packages/domain
packages/auth
packages/permissions
packages/database
packages/documents
packages/notifications
packages/events
packages/config
packages/shared
```

Business rules should live in domain/application packages rather than controllers or UI components.

## 3. Data architecture

PostgreSQL is the authoritative transactional database.

Use relational constraints for:

- organization ownership
- property/unit relationships
- tenancy periods
- financial references
- document versions
- approval states

Use JSON only for genuinely variable configuration/metadata, not as a replacement for relational core data.

## 4. Multi-tenancy

The organization is the primary tenant boundary.

Every organization-owned record must have an unambiguous organization relationship either directly or through a controlled parent relationship.

Defense in depth:

- application authorization
- repository/query scoping
- optional selective PostgreSQL RLS for high-risk boundaries

Do not rely on UI hiding for security.

## 5. Event architecture

Use the transactional outbox pattern.

```text
transaction
 ├── domain changes
 └── outbox event

worker consumes outbox
 → job queue
 → side effect
```

This avoids distributed transactions while providing reliable asynchronous work.

## 6. Storage

Storage is abstracted:

```text
FileService
 ├── MinIOAdapter
 ├── S3Adapter
 └── FutureProviderAdapter
```

The application stores metadata and access policies in PostgreSQL and binary content in object storage.

## 7. Document generation

Document generation is asynchronous for heavier work.

```text
Template/data
 → renderer
 → HTML/document
 → Playwright/Chromium
 → PDF
 → object storage
 → DocumentVersion
```

PDF generation must be deterministic and auditable.

## 8. Notifications

```text
Domain event
 → Notification service
 → preference/policy evaluation
 → channel adapter
```

Initial channel: email and in-app notifications.

WhatsApp is deferred: it ships later as a channel adapter behind the same router with no domain
changes. Keep templates channel-neutral and the `WHATSAPP` flag off until the adapter lands.

Country-pluggable rules (multi-country later, Colombia first): rent-increase caps
(`CountryRentCapPolicy`: CO/Ley 820 IPC cap now, other countries later) and late-fee defaults
resolve through the same `system → organization → property → contract` configuration
inheritance. The domain depends on the policy interface, never on DANE or any provider SDK.

## 9. Feature flags

Feature flags support:

- system
- environment
- organization
- property
- user
- rollout percentage
- minimum application version

Examples:

- `AI_ENABLED`
- `AI_WEBGPU_ENABLED`
- `AI_LOCAL_MODELS`
- `AI_EXTERNAL_PROVIDER`
- `VOTING_ENABLED`
- `PROPERTY_HORIZONTAL_ENABLED` — Phase 1 scope (cuotas, assembly acts, Ley 675 quorums), resolved per property
- `OWNER_APPROVAL`
- `OFFLINE_ENABLED`
- `ADVANCED_ACCOUNTING_ENABLED`
- `WHATSAPP` — deferred future channel, stays off in Phase 1
- `RAG_ENABLED`
- `CLI_ENABLED`
- `MCP_ENABLED`

## 10. AI architecture

```text
Business feature
   ↓
AI Gateway
   ↓
Model Router
   ├── WebGPU
   ├── Local server
   └── External provider
```

The gateway exposes stable capabilities rather than model-specific APIs:

- `generateText`
- `generateStructuredOutput`
- `generateEmbedding`
- `analyzeImage`

Model registry metadata:

- model ID/version
- provider
- runtime
- quantization
- capabilities
- context size
- privacy level
- hardware requirements
- lifecycle status

Lifecycle:

`candidate → installed → evaluated → approved → active → deprecated`

Production must not automatically switch to an untested “latest” model.

## 11. AI privacy

Data classes:

- PUBLIC
- INTERNAL
- CONFIDENTIAL
- SENSITIVE
- FINANCIAL
- LEGAL
- PERSONAL

Policies can restrict classes to local execution.

For external AI:

```text
privacy classification
 → minimization/redaction
 → provider request
 → response validation
```

Sensitive prompts/responses should not be logged by default.

## 12. AI safety

AI output is untrusted.

Never allow direct AI mutation of:

- payments
- financial postings
- signatures
- contracts
- permissions
- authentication
- owner approvals

Use:

`AI → schema validation → domain validation → authorization → human confirmation when appropriate → operation`

Documents can contain prompt injection. Extracted text is data, never trusted instructions.

## 13. Phase 2 AI use cases

- draft formal communications
- draft acts/minutes
- summarize documents
- extract structured fields from documents
- classify documents/requests
- assist with complaints and maintenance summaries
- analyze local images/documents with vision models
- generate structured proposals for human review

No RAG, CLI, MCP or autonomous agents are required in Phase 2.

## 14. Future extension points

### RAG
PostgreSQL + pgvector initially, with permission-aware retrieval.

### CLI
A client over the same API/domain services.

### MCP
A separately controlled interface over safe domain tools.

### Controlled AI actions
Approval-gated actions only.

The interfaces should be designed now, but implementations are deferred.

## 15. Scaling strategy

### Stage 1
Single VM, Docker Compose, <10 users.

### Stage 2
Separate DB/storage, 10–100 users or operational need.

### Stage 3
Multiple application instances and managed stateful services.

### Stage 4
HA/distributed infrastructure when justified by measurable workload.

Do not introduce Kubernetes, Kafka, Elasticsearch or a service mesh merely for theoretical future scale.
