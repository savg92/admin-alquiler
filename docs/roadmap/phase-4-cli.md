# Phase 4 — CLI

## Technologies

- TypeScript
- Bun
- CLI framework such as Commander
- OpenAPI-generated client where useful
- existing authentication and authorization

The CLI is another client over the API/domain; it contains no duplicate business rules.

Potential commands cover properties, units, documents, reports, exports, diagnostics and health.

Support human-readable, JSON and CSV output where appropriate.

Authentication, scoped permissions and audit apply exactly as they do to web users.
