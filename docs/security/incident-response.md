# Incident Response

Parent: [../SECURITY.md](../SECURITY.md).

Minimal Phase 1 procedure:

1. Contain: revoke sessions/keys, disable affected integration or flag (e.g. `AI_EXTERNAL_PROVIDER`).
2. Preserve: freeze logs, backup state, record timeline and affected organizations.
3. Eradicate + recover: forward-fix via PR, restore from verified backup if needed, rotate secrets.
4. Review: root cause, tenant-impact assessment, follow-up tests.

Keep provider-specific runbooks out of the domain; link them from [../operations/observability.md](../operations/observability.md) as they emerge.
