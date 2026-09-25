# Glossary — Ubiquitous Language

Source docs: [BLUEPRINT.md](./BLUEPRINT.md), [SRS.md](./SRS.md), [PRD.md](./PRD.md).

| Term | Meaning |
|---|---|
| Organization | Primary tenant boundary; owns properties, users, config |
| Property / Unit | Property contains units; units are leasable subdivisions |
| PropertyOwnership | Owner share in a property: percentage, voting weight, dates, visibility |
| Tenancy | Occupancy period linking tenant to property/unit |
| Contract | Terms, dates, parties, status for a tenancy |
| Charge / Payment / Allocation | Charge owed; payment received with proof; allocation links payment to charges |
| FinancialTransaction | Immutable ledger entry; corrected via reversal/adjustment, never silent rewrite |
| Reconciliation | Matching BankTransaction to internal transactions |
| Document / Version / Template | Versioned lifecycle Draft→Review→Approval→Approved→Signed→Final→Archived |
| Approval / Signature | Workflow authorization vs. recorded sign-off (internal vs. legally qualified) |
| Act/Minute | Governance record of decisions and votes |
| AuditEvent | Immutable record of important actions |
| Outbox | Transactional event table drained by worker via BullMQ |
| AI Gateway | Stable capability API (`generateText`, `generateStructuredOutput`, `generateEmbedding`, `analyzeImage`) |
| Feature flag | Scoped switch: system→environment→organization→property→user |

Rules: money in integer minor units / exact decimal, never float; config inherits
System→Organization→Property→Unit→User with explicit disable winning.
