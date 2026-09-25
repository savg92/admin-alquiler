# Contributing

## Principles

Contributions should improve security, correctness, maintainability, usability or documented product value.

## Pull requests

Every PR should explain:

- what changed
- why it changed
- affected areas
- migration requirements
- security implications
- test coverage
- operational implications

## Required checks

At minimum, applicable PR checks include:

- lint
- typecheck
- unit tests
- integration tests
- E2E tests for affected critical flows
- security/dependency checks
- build

## Review expectations

Reviewers should consider:

- authorization
- organization isolation
- data integrity
- financial correctness
- auditability
- error handling
- mobile UX
- accessibility
- i18n
- observability
- backwards compatibility
- dependency risk

## No hidden vendor lock-in

A provider-specific integration should be behind an adapter when it is a replaceable infrastructure or AI dependency.

## Breaking changes

Document breaking API, schema or workflow changes explicitly.

## Documentation

Update relevant docs when behavior, architecture, deployment, security or operational procedures change.
