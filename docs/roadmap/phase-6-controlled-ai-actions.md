# Phase 6 — Controlled AI Actions

## Technologies

AI Gateway, RAG, BullMQ, transactional outbox, domain command handlers, idempotency keys, approval workflows, audit trail and feature flags.

```mermaid
flowchart TD
  AI[AI proposal] --> S[Schema validation]
  S --> D[Domain validation]
  D --> A[Authorization]
  A --> H[Human approval]
  H --> C[Command handler]
  C --> O[Outbox]
  O --> J[Job]
  J --> AUD[Audit]
```

AI proposes; deterministic domain code decides whether an action is valid. Consequential financial/legal/security changes require explicit policy and approval.
