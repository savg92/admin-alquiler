# Threat Model

Summary parent: [../SECURITY.md](../SECURITY.md).

## In scope

Tenant data, financial records, contracts, documents, communications, credentials, backups.

## Key threats

Broken access control, cross-organization access, session compromise, credential attacks,
malicious uploads, injection (SQL/XSS/CSRF/SSRF), leaked secrets, insecure storage,
financial tampering, AI misuse, prompt injection via documents, dependency compromise, backup exposure.

## Boundaries

- Organization is the primary tenant boundary.
- Do not rely on UI hiding; enforce server-side.
- AI is untrusted; see [ai-security.md](./ai-security.md).
- Files are hostile input; see [file-security.md](./file-security.md).
