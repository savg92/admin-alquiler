# Feature Flags

## Purpose

Feature flags allow controlled rollout without branching business logic or requiring immediate deployment of every capability.

## Scope hierarchy

```text
System
 → Environment
 → Organization
 → Property
 → User
```

Resolution should be deterministic and documented.

## Flag model

A flag can include:

- key
- enabled
- environment
- organization ID
- property ID
- user ID
- rollout percentage
- minimum application version
- metadata
- created/updated timestamps

## Initial flags

| Flag | Purpose |
|---|---|
| `AI_ENABLED` | Master AI switch |
| `AI_WEBGPU_ENABLED` | Browser WebGPU inference |
| `AI_LOCAL_MODELS` | Local server inference |
| `AI_EXTERNAL_PROVIDER` | External AI provider |
| `VOTING_ENABLED` | Voting workflows |
| `PROPERTY_HORIZONTAL_ENABLED` | Phase 1: cuotas, assembly acts, Ley 675 quorums — resolves per property (System → Environment → Organization → Property); explicit disable at property overrides an inherited enable; non-PH properties hide these workflows |
| `OWNER_APPROVAL` | Owner approval workflows |
| `OFFLINE_ENABLED` | Offline functionality |
| `ADVANCED_ACCOUNTING_ENABLED` | Advanced financial features |
| `WHATSAPP` | Deferred future channel (stays off in Phase 1) |
| `RAG_ENABLED` | Future knowledge retrieval |
| `CLI_ENABLED` | Future CLI |
| `MCP_ENABLED` | Future MCP |

## Rules

- Default to off for unfinished/high-risk features.
- Never use flags as an authorization substitute.
- Authorization must still be enforced.
- Remove stale flags after rollout.
- Document risky flag dependencies.
- Test both enabled and disabled states for critical features.

## Rollout

Prefer:

1. developer
2. staging
3. internal organization
4. small percentage
5. broader rollout
6. default enabled
7. flag removal

## Kill switches

Critical optional capabilities such as external AI must have an immediate operational disable path.
