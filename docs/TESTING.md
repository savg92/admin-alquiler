# Testing Strategy

## Testing pyramid

```text
        E2E
       /   \
  Integration
     /     \
     Unit + Security
```

## Unit tests

Cover:

- domain rules
- permission policies
- ownership calculations
- rent increases
- charges
- allocations
- financial calculations
- voting rules
- document state transitions
- configuration inheritance

## Integration tests

Cover:

- repositories
- PostgreSQL constraints
- organization scoping
- API modules
- storage
- queues
- notification adapters

## E2E tests

Critical journeys:

- authentication
- organization creation
- property/unit setup
- owner/tenant setup
- contract creation
- rent/charge/payment
- receipt
- document approval
- PDF generation
- maintenance
- complaints/claims
- communication
- voting
- audit
- offline synchronization

## Security tests

- broken access control
- cross-tenant access
- role escalation
- IDOR
- malicious uploads
- session abuse
- rate limiting
- injection
- SSRF
- sensitive-data leakage

## AI tests

Phase 2 adds:

- provider selection
- privacy policy enforcement
- WebGPU detection
- fallback
- structured output validation
- prompt injection resistance
- model registry behavior
- model deprecation
- no-AI behavior

## CI

Fast PR:

- lint
- typecheck
- unit
- critical integration

Full validation:

- integration
- E2E
- security
- build
- container scan

Nightly:

- extended E2E
- dependency audit
- backup restore verification
- AI evaluation suite
