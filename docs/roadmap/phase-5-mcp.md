# Phase 5 — MCP

## Technologies

- TypeScript
- official MCP SDK
- existing auth/authz
- domain/application services
- audit/event system

Start read-only. Tools have explicit schemas, permissions, scopes, output classification and audit rules.

```mermaid
flowchart LR
  C[MCP client] --> M[MCP server]
  M --> A[AuthZ]
  A --> T[Safe domain tools]
  T --> D[Application/domain]
```

Never expose raw SQL or an unrestricted database tool.

Write tools come only after idempotency, validation and approval controls exist.
