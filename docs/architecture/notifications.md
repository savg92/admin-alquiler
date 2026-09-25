# Notifications and Communications

Phase 1 channels:

- in-app
- formal email

Future channels are adapters, not domain dependencies.

```mermaid
flowchart TD
  EVENT[Domain event] --> POLICY[Notification policy]
  POLICY --> PREF[User preferences]
  POLICY --> TEMPLATE[Localized template]
  TEMPLATE --> ROUTER[Channel router]
  ROUTER --> APP[In-app]
  ROUTER --> EMAIL[Email]
  ROUTER --> FUTURE[Future channels]
```

Formal communication records sender, recipients, subject, body, attachments, locale, timestamp, delivery state and related property/unit/workflow.

Email is asynchronous and retryable. Record the communication independently from provider delivery state.
