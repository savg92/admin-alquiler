# Admin alquiler — Security

## Security objectives

Protect tenant data, financial records, contracts, documents, communications and authentication credentials while keeping the system practical to operate.

## Threat model

Important threats include:

- broken access control
- cross-organization data access
- compromised sessions
- credential attacks
- malicious file uploads
- SQL injection
- XSS
- CSRF where applicable
- SSRF
- leaked secrets
- insecure object storage
- financial record tampering
- malicious or misleading AI output
- prompt injection in uploaded documents
- dependency compromise
- backup exposure

## Authentication

- Strong password hashing.
- Secure session management.
- Secure cookies where applicable.
- Rate limiting.
- Account recovery protections.
- MFA-ready architecture.
- Passkey/WebAuthn can be added later.

## Authorization

Use deny-by-default policies.

Every sensitive request must verify:

- identity
- organization
- role/permission
- resource scope
- ownership/workflow rules

Authorization must not depend on frontend behavior.

## Data protection

- TLS in transit.
- Encryption at rest where infrastructure supports it.
- Secrets outside source control.
- Minimize sensitive data in logs.
- Encrypted backups.
- Private object storage.
- Access-controlled downloads.

## File security

Treat every upload as hostile.

- validate content type
- validate extension independently
- limit size
- generate safe filenames
- scan when possible
- avoid executing uploaded content
- store privately
- authorize every download
- record metadata and audit events

## Financial integrity

Posted financial history must not be silently rewritten.

Use:

- immutable identifiers
- audit records
- adjustments
- reversals
- reconciliation history

Use exact monetary arithmetic.

## AI security

AI is untrusted.

Controls:

- privacy classification
- local-only policies for sensitive data
- redaction/minimization before external inference
- schema validation
- domain validation
- authorization
- human confirmation for consequential actions
- no direct AI access to database mutation primitives
- no direct AI access to payment/signature/permission primitives
- prompt-injection-resistant document processing

## Dependency and supply-chain security

- Lock dependencies.
- Review major upgrades.
- Run dependency audits.
- Scan container images.
- Keep secrets out of CI logs.
- Use minimal runtime images.
- Pin important build inputs where practical.

## Backups and recovery

- Automated daily backups.
- Encrypted backup storage.
- Off-machine backup copy.
- Restore verification.
- Documented recovery procedure.

Initial targets:

- RPO ≤ 24h
- RTO ≤ 4h

## Security testing

CI should include appropriate:

- dependency audit
- static analysis
- API authorization tests
- tenant-isolation tests
- upload tests
- authentication tests
- E2E security scenarios
- container/image scanning

## Security documentation

Maintain:

- `docs/security/threat-model.md`
- `docs/security/authentication.md`
- `docs/security/authorization.md`
- `docs/security/data-classification.md`
- `docs/security/file-security.md`
- `docs/security/ai-security.md`
- `docs/security/backup-recovery.md`
- `docs/security/incident-response.md`
