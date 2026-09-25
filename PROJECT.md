# Admin alquiler — Repository Blueprint

Expected repository:

```text
apps/
  web/
  api/
  worker/
packages/
  domain/
  auth/
  permissions/
  database/
  documents/
  notifications/
  events/
  config/
  shared/
infrastructure/
  docker/
  compose/
  deployment/
tests/
  unit/
  integration/
  e2e/
  security/
docs/
.github/workflows/
```

Use Bun for the TypeScript workspace. Use uv only for Python components that genuinely need it.

Do not scaffold future RAG/CLI/MCP applications before their phases. Keep extension points, not speculative implementations.
