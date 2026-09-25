# Phase 2 — Private/Local AI Implementation Plan

## Goal

Add practical AI while keeping the product private, provider-independent and safe.

## 1. AI Gateway

Create a stable internal API:

- `generateText`
- `generateStructuredOutput`
- `generateEmbedding`
- `analyzeImage`

Business features call the gateway, never model SDKs directly.

## 2. Execution modes

Support:

- `disabled`
- `webgpu`
- `local`
- `hybrid`
- `provider`

Priority/fallback must be configurable.

Example:

```text
WebGPU
 ↓ unavailable
Local server
 ↓ unavailable
Configured provider
 ↓ unavailable
Graceful non-AI path
```

## 3. WebGPU

Implement:

- capability detection
- model availability check
- memory/resource checks
- download/cache management
- interrupted-download recovery
- initialization failure handling
- mobile/desktop tests
- fallback behavior

## 4. Local inference

Provide a local-server adapter that can host supported LFM2.5-family models.

Model candidates:

- LFM2.5-1.2B
- LFM2.5-1.2B-Thinking where useful
- LFM2.5-2.6B
- LFM2.5-VL-3B

Do not hard-code the application to one model.

## 5. External provider

Implement a provider adapter with:

- explicit configuration
- privacy policy checks
- redaction/minimization
- timeout
- retry policy
- quota/error handling
- observability

External AI must be disabled for data classes prohibited by organization policy.

## 6. Model registry

Store:

- ID
- version
- provider
- runtime
- quantization
- capabilities
- context size
- language support
- privacy level
- hardware requirements
- lifecycle status
- evaluation score metadata

Lifecycle:

`candidate → installed → evaluated → approved → active → deprecated`

## 7. AI feature flags

Initial flags:

- `AI_ENABLED`
- `AI_WEBGPU_ENABLED`
- `AI_LOCAL_MODELS`
- `AI_EXTERNAL_PROVIDER`

Future flags:

- `RAG_ENABLED`
- `CLI_ENABLED`
- `MCP_ENABLED`

## 8. Privacy policy engine

Classify input data:

- PUBLIC
- INTERNAL
- CONFIDENTIAL
- SENSITIVE
- FINANCIAL
- LEGAL
- PERSONAL

Policy example:

```text
FINANCIAL + LEGAL + PERSONAL
→ local only

INTERNAL
→ local preferred

PUBLIC
→ provider allowed if configured
```

The actual organization policy is configurable.

## 9. AI safety pipeline

```text
request
 → privacy classification
 → minimization/redaction
 → provider selection
 → inference
 → schema validation
 → business validation
 → authorization
 → human confirmation if required
 → use result
```

AI never directly writes business records.

## 10. Initial AI features

### Document drafting
Generate first drafts from structured inputs.

### Communication assistance
Draft formal Spanish/English messages.

### Summarization
Summarize documents, maintenance histories and communications.

### Extraction
Extract structured fields from contracts, receipts and supporting documents.

### Classification
Classify documents, complaints and requests.

### Vision
Analyze local images/documents using compatible vision models.

## 11. Evaluation suite

Evaluate:

- Spanish quality
- English quality
- structured extraction
- contract/document handling
- classification
- summarization
- hallucination rate
- refusal/safety behavior
- latency
- memory usage
- WebGPU availability
- fallback correctness

Keep representative anonymized test fixtures.

## 12. Observability

Record safe metadata:

- feature
- model
- provider
- runtime
- latency
- token counts where available
- fallback
- success/failure
- privacy mode

Do not store sensitive prompts/responses by default.

## Phase 2 exit gate

AI can be switched off without breaking core functionality, models can change without business-logic rewrites, sensitive data can remain local, and every AI-generated structured result is validated before use.
