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
Units carry a subtype (residential, office, parking, storage, other) since parqueaderos and cuartos
útiles bill and meter differently from living space; subtype is configurable per organization.

### FR-004 Ownership
A property can have one or multiple owners with configurable ownership shares.

### FR-005 Tenancy
The system must manage tenants, occupancy and tenancy periods.

### FR-006 Contracts
Contracts must support documents, dates, terms, status and associated parties.
Contract lifecycle is a Phase 1 scheduler: expiration/renewal reminders at 90/60/30 days before end date,
renewal workflow (renew / terminate / continue month-to-month where legally allowed), and rent-increase
proposals. Rent-increase caps are country-pluggable: Colombia/Ley 820 Art. 20 caps the annual increase at
IPC (DANE) — auto-fetched with manual admin correction and audit — while other countries plug a different
cap rule without changing core contract logic.
Each contract may record codeudores (co-signers: contact, ID, supporting documents) and link the
rental insurance policy covering it (see FR-022) with validity dates — required-field policy is
configurable per organization, since codeudor/póliza practice varies by market.
Early termination is recorded with notice date, effective date, cause and indemnity — the indemnity
rule is country-pluggable (CO: Ley 820 preaviso/indemnity treatment) and the resulting adjustment
posts as a charge or credit, never as a silent edit of history.

### FR-007 Rent
The system must record rent amounts, schedules, increases and history.
Each increase records basis (IPC value, source, date), applied cap rule and resulting amount.

### FR-008 Charges
The system must record rent, utilities and other applicable charges.
Recurring charges are generated, not hand-typed: each month the system proposes rent, PH cuotas and
contracted utility charges from active contracts/schedules for admin preview and confirm; generation
is idempotent per (contract, period) so re-runs never duplicate.
Property-horizontal administration fees (cuotas de administración, Ley 675) are first-class charges:
ordinary/extraordinary, per unit/coefficient, with due dates and assembly-act reference. Convivencia
fines (multas) are charges too, linked to the assembly-act or house-rule reference that imposed them.
Cuotas and fines apply only on properties where `PROPERTY_HORIZONTAL_ENABLED` resolves enabled
(property-scoped); other properties never see these workflows.

### FR-009 Payments
The system must record payments, receipts/proofs and allocations. No payment processing is required.
Collections/arrears is a Phase 1 workflow: aging report (current, 1–30, 31–60, 61–90, 90+ days),
configurable late-fee rule with a Colombia national default (moratory interest per contract terms,
bounded by the usury cap; per-organization/contract override of rate type, grace days and base),
and a dunning schedule (default 3/7/15/30 days overdue) via in-app + email. Proof-to-payment matching
is manual with system suggestions (amount/date/reference proximity); matches and write-offs are audited.
Security deposits are tracked per contract: amount held at start, deductions applied at handover with
evidence references, and returned balance — the deposit ledger must always reconcile (held =
deducted + returned + outstanding).

### FR-010 Utilities
Water, electricity, gas and other configurable services can be tracked, whether paid directly or internally.
Where submeters exist, readings are captured per unit (value, date, optional photo) and generate the
corresponding utility charges; anomalous readings (negative consumption, spikes beyond tolerance) are
flagged for review instead of billing silently.

### FR-011 Accounting
The system must provide accounting foundations and monthly/yearly reporting, including property-level metrics and EBIT where applicable.
The v1 KPI set is fixed: occupancy rate, delinquency rate, upcoming expirations (90/60/30), maintenance SLA
(time to acknowledge/resolve), and per-property P&L/EBIT. Owner view-only users see the P&L/EBIT slice only.

### FR-012 Bank reconciliation
Bank transactions can be imported/recorded and reconciled with internal transactions.
v1 import formats: Bancolombia CSV and Davivienda CSV (documented column maps, UTF-8/comma-first with
delimiter sniffing). Bank maps are country-pluggable: a new country/bank adds a column map without
changing matching logic. Duplicate detection key is (bank + account + date + amount + reference); re-imports
are idempotent and quarantined on conflict. OCR of receipts is background-assisted only; extracted fields
never post automatically — a human confirms the payment match.

### FR-013 Taxes
Tax obligations and supporting documents can be recorded. Electronic filing is outside v1.
Deadline reminders are in scope and reuse the scheduler pattern: country-pack calendars (CO ships
predial/valorización deadlines) emit reminders, owners/admins attach the filed receipt, and nothing
is ever filed with a tax authority by the system.

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
Email + in-app are the Phase 1 channels. WhatsApp is explicitly deferred to a later phase as a channel
adapter behind the notification router (no domain-logic change when added); dunning templates are written
channel-neutral so they can be reused.

### FR-019 Voting
Organizations can configure votes by ownership shares or other decision rules.
Propiedad horizontal (Ley 675) is in Phase 1 scope and is property-configurable: assembly acts/minutes
with attendance list, ordinary decisions at 50%+1 of coefficients present, qualified decisions (e.g.
extraordinary fees, statute changes) at 70% of total coefficients, quorum computation recorded per act,
and proxy support — all gated by `PROPERTY_HORIZONTAL_ENABLED` resolving enabled on that property.

### FR-020 Approvals
Owners and administrators can approve proposals. Multi-owner approval can require all owners or a configurable rule.

### FR-021 House rules
Contracts, conduct regulations and property-specific rules can be stored and versioned.

### FR-022 Insurance
Rental/property insurance records and documents can be tracked.
A rental policy (póliza de arrendamiento) links to the contract(s) it covers, with insurer, policy
number and validity dates; expiry/renewal follows the same 90/60/30-day reminder pattern as contracts.

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

### FR-028 Self-service portals (same PWA, role-guarded)
No separate portal apps in v1. Tenants can view their contract/charges/receipts, upload payment proof
and maintenance photos, and track request status. Owner view-only users see per-property profitability
(P&L/EBIT, occupancy, delinquency) with no mutation rights. All portal actions reuse server-side
authorization, audit and offline queue foundations.

### FR-029 Suppliers and purchase-place tracking
Phase 1 includes an organization-scoped supplier directory covering both service providers
(plumber, electrician, …) and stores/places (ferretería, …): name, category, contact, optional
tax ID (NIT in Colombia)/address, notes. Suppliers receive no accounts. Purchases of materials/services are recorded
per property (unit optional): supplier link or free-text place, description, amount and currency, date,
receipt attachment, optional link to a work order or expense. This answers "where was stuff for
this property bought" without building procurement or inventory, which stay out of scope.

### FR-030 Owner settlements
Phase 1 closes the money loop: each property/contract carries a commission rule (percentage and/or
fixed fee, configurable per organization/property), and the system produces a monthly owner
settlement statement — rent collected in, commission, maintenance, fees and adjustments out, net
payout due. On multi-owner properties the net payout splits by `PropertyOwnership` percentage, with
one statement line per owner so each owner sees exactly their share. Payouts are recorded (transfer reference, date), never processed: money movement stays
outside the system per the Charter, exactly like tenant payments. Settlement lines link to their
source charges/payments so any owner can trace statement → receipt.

### FR-031 Guided property setup
Adding a property must be a guided, resumable flow — not a dozen disconnected screens. One checklist
per property walks the admin through: details → units (with bulk creation, e.g. "12 apartments,
auto-numbered 101–112", plus subtypes) → owners + shares → PH settings where the flag applies →
tenants → contract → rent schedule → first charges. Each step validates and saves progressively
(no fragile draft state); organization defaults (currency, commission, late-fee rule, PH flag) prefill
so the common case is confirm-and-continue. A property shows "setup incomplete" with its pending steps
until the checklist is done, and every step writes the usual audit events.

## 4. Non-functional requirements

- Tenant isolation.
- Deny-by-default authorization.
- Secure file handling.
- Auditability.
- Accessibility.
- i18n/l10n from day one: no hard-coded user-facing strings, dates, numbers or currency symbols —
  all via translation keys and locale-aware formatting (`es-CO` ships first, `en` second; see
  `architecture/i18n-l10n.md`). Language, country, currency and timezone are separate,
  per-organization settings.
- Money records always carry an ISO-4217 currency code; the org default is COP initially and new
  currencies plug in without schema changes. No currency conversion in v1.
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
