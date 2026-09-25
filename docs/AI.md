# AI Architecture and Policy

## Principle

AI is an optional capability, not a foundation of the business system.

The application must remain fully useful when AI is disabled or unavailable.

## Gateway

All AI requests pass through the AI Gateway.

## Modes

- Disabled
- WebGPU
- Local
- Hybrid
- External provider

## Provider abstraction

Capabilities:

- text generation
- structured generation
- embeddings
- image analysis

Provider-specific SDKs stay behind adapters.

## Model lifecycle

```text
candidate
  ↓
installed
  ↓
evaluated
  ↓
approved
  ↓
active
  ↓
deprecated
```

Never automatically deploy a newly released model to production without evaluation.

## Privacy

Classify data before inference.

Sensitive categories can be local-only.

External provider use requires:

- explicit configuration
- policy permission
- minimization
- redaction where appropriate
- secure transport
- safe logging

## Safety

AI cannot directly execute consequential business actions.

Required flow:

```text
AI
 ↓
schema validation
 ↓
business validation
 ↓
authorization
 ↓
human confirmation if required
 ↓
domain operation
```

## Model evolution

The application should not care whether the active model is LFM2.5-1.2B, LFM2.5-2.6B, LFM2.5-VL-3B or a future model.

Capabilities and model metadata are resolved through the model registry.

## Future readiness

The design leaves room for:

- RAG
- CLI
- MCP
- controlled actions
- agentic workflows

These are future phases and should not complicate Phase 1 unnecessarily.
