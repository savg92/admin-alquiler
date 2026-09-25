# Admin alquiler — Product Requirements Document

## 1. Product

Admin alquiler is a multi-organization rental and property administration application.

## 2. Users

The platform supports:

- Super admins
- Organization administrators
- Property administrators
- Owner administrators
- Owner view-only users
- Tenants
- Future configurable roles

Users may be granted organization, property or unit-specific visibility.

## 3. Functional requirements

### FR-001 Authentication
Users must authenticate securely and sessions must be protected.

### FR-002 Organizations
Users must belong to one or more organizations subject to configured access.

### FR-003 Properties and units
Administrators must create and manage properties and units, including photos and records.

### FR-004 Ownership
A property can have one or multiple owners with configurable ownership shares.

### FR-005 Tenancy
The system must manage tenants, occupancy and tenancy periods.

### FR-006 Contracts
Contracts must support documents, dates, terms, status and associated parties.

### FR-007 Rent
The system must record rent amounts, schedules, increases and history.

### FR-008 Charges
The system must record rent, utilities and other applicable charges.

### FR-009 Payments
The system must record payments, receipts/proofs and allocations. No payment processing is required.

### FR-010 Utilities
Water, electricity, gas and other configurable services can be tracked, whether paid directly or internally.

### FR-011 Accounting
The system must provide accounting foundations and monthly/yearly reporting, including property-level metrics and EBIT where applicable.

### FR-012 Bank reconciliation
Bank transactions can be imported/recorded and reconciled with internal transactions.

### FR-013 Taxes
Tax obligations and supporting documents can be recorded. Electronic filing is outside v1.

### FR-014 Maintenance
Users can create requests, work orders, evidence, costs and status histories.

### FR-015 Complaints and claims
The system must manage complaints and claims as configurable workflows.

### FR-016 Handovers
Property/unit handover and delivery records must support evidence and document generation.

### FR-017 Documents
Users can create, edit, version, approve, sign and generate PDFs for documents.

### FR-018 Communications
Formal email communications must be supported, with communication history and notifications.

### FR-019 Voting
Organizations can configure votes by ownership shares or other decision rules.

### FR-020 Approvals
Owners and administrators can approve proposals. Multi-owner approval can require all owners or a configurable rule.

### FR-021 House rules
Contracts, conduct regulations and property-specific rules can be stored and versioned.

### FR-022 Insurance
Rental/property insurance records and documents can be tracked.

### FR-023 Agency expenses
Real-estate agency expenses can be recorded and reported.

### FR-024 Feature flags
Capabilities can be enabled or disabled at system, organization, property and user scope.

### FR-025 PWA
The application must be mobile-first, installable and usable on modern mobile browsers.

### FR-026 Offline
Selected workflows must support offline caching/queueing and later synchronization.

### FR-027 AI
AI is optional and must support private/local and provider-based execution through an abstraction layer.

## 4. Non-functional requirements

- Tenant isolation.
- Deny-by-default authorization.
- Secure file handling.
- Auditability.
- Accessibility.
- Spanish and English.
- COP initially, future currencies.
- Reliable backups.
- Automated testing.
- Observability.
- Graceful degradation when optional services fail.

## 5. Out of scope for Phase 1

- Payment processing.
- Electronic tax filing.
- Supplier accounts.
- RAG.
- CLI.
- MCP.
- Autonomous agents.
- Mandatory third-party AI.

## 6. Acceptance principles

A requirement is not accepted merely because it works on the happy path. Authorization, validation, failure modes, auditability and test coverage must be considered.
