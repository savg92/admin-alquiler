# Authentication

Parent: [../SECURITY.md](../SECURITY.md).

- Strong password hashing, secure session management, secure cookies where applicable.
- Rate limiting, account-recovery protections, MFA-ready architecture.
- Passkey/WebAuthn deferred, must not require rework of session model.

Test: login, expiry, abuse, rate limits — see [../TESTING.md](../TESTING.md#security-tests).
