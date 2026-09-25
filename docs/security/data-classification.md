# Data Classification

Parent: [../SECURITY.md](../SECURITY.md). AI enforcement: [ai-security.md](./ai-security.md).

Classes: PUBLIC, INTERNAL, CONFIDENTIAL, SENSITIVE, FINANCIAL, LEGAL, PERSONAL.

Rules:

- TLS in transit; encryption at rest where infra supports it.
- Secrets outside source control; minimize sensitive data in logs.
- Private object storage; access-controlled downloads.
- External AI only for classes explicitly allowed by organization policy; see [privacy-and-retention.md](./privacy-and-retention.md).
