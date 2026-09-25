# Authorization

Parent: [../SECURITY.md](../SECURITY.md). Model detail: [../SRS.md](../SRS.md#4-authorization).

Deny by default. Every sensitive request verifies identity, organization,
role/permission, resource scope, and ownership/workflow rules — server-side only.

Defense in depth: application checks + repository/query scoping + selective PostgreSQL RLS
for high-risk boundaries (see [../ARCHITECTURE.md](../ARCHITECTURE.md#4-multi-tenancy)).
