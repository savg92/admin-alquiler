# Roadmap

Phase hub. `roadmap/*.md` are normative detail; this file only summarizes scope and exit gates.
Timeline visual: [roadmap/roadmap.md](./roadmap/roadmap.md).

| Phase | Objective | Detail | Exit gate |
|---|---|---|---|
| 1 — Core Platform | Complete product with AI disabled | [roadmap/PHASE-1.md](./roadmap/PHASE-1.md) | No critical workflow depends on AI or a proprietary provider |
| 2 — Private/Local AI | Replaceable private AI via gateway | [roadmap/PHASE-2.md](./roadmap/PHASE-2.md) | AI can be enabled/disabled/replaced without changing domain behavior |
| 3 — RAG + Knowledge | Permission-aware retrieval (pgvector first) | [roadmap/phase-3-rag-knowledge.md](./roadmap/phase-3-rag-knowledge.md) | Retrieval evaluated; no permission leakage |
| 4 — CLI | CLI as API client, no duplicated rules | [roadmap/phase-4-cli.md](./roadmap/phase-4-cli.md) | Same auth/authz/audit as web |
| 5 — MCP | Safe read-only-first domain tools | [roadmap/phase-5-mcp.md](./roadmap/phase-5-mcp.md) | Scoped tools, no raw SQL, audited |
| 6 — Controlled AI Actions | Proposal + approval-gated execution | [roadmap/phase-6-controlled-ai-actions.md](./roadmap/phase-6-controlled-ai-actions.md) | Consequential changes require policy + approval |
| 7 — Advanced AI | Bounded agentic workflows | [roadmap/phase-7-advanced-ai.md](./roadmap/phase-7-advanced-ai.md) | Bounded tools, budgets, kill switches, audit |

Phases 1–2 are current focus. Phases 3–7 must not weaken Phase 1 security/authorization boundaries.

Execution tracking: [roadmap/PLAN.md](./roadmap/PLAN.md) — per-phase/workstream/task checkboxes.
Live status: `bash scripts/roadmap-status.sh` (computed from the checkboxes; no manual percentages).

> Scope change rule: edit the phase file, not this table, when scope details change. Keep the one-line objective here in sync.
