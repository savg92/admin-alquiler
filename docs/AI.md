# AI Architecture and Policy

## Principle

AI is an optional capability, not a foundation of the business system.

The application must remain fully useful when AI is disabled or unavailable.

## Gateway

All AI requests pass through the AI Gateway.

Business features call the gateway; they never import a model SDK. The gateway exposes five
operations, all reachable under `/api/v1/ai` and all permission-guarded (`ai:read` / `ai:write`):

| Operation | Endpoint | Purpose |
|---|---|---|
| `generateText` | `POST /text` | Free text. Returns a `deferred` payload when the client runs the model. |
| `generateStructuredOutput` | `POST /structured` | JSON validated against a supplied schema before use. |
| `generateEmbedding` | `POST /embeddings` | Numeric vector; server-side runtimes only. |
| `analyzeImage` | `POST /vision` | Local image + prompt, schema-validated result. |
| `decide` | `POST /decide` | Typed `choice`/`score`/`none` with calibrated confidence, no free text. |

Supporting endpoints: `GET /status` (configuration without secrets), `GET /modes` (available
runtimes, privacy gates, decision thresholds), `GET /metrics` (safe call metadata), `GET /calibration`
(fitted temperature and ECE per model and question type), `POST /observations` (record a decision
outcome), `POST /complete` (validate a client-executed WebGPU result), and the model registry
(`GET/POST /models`, `POST /models/:id/evaluations`, `POST /models/:id/transitions`).

Every call that reaches an upstream records an audit event and a metrics entry. A call that cannot be
served returns `{ available: false, reason }` rather than failing the request, so a feature can always
fall back to its non-AI path.

## Modes

- Disabled
- WebGPU
- Local
- Hybrid
- External provider

A mode that names a single runtime (`webgpu`, `local`, `provider`) is pinned: if that runtime is
unavailable — or is not permitted by the data class — the call returns the non-AI path rather than
silently using a different runtime. `hybrid` walks the configured priority
(`webgpu → local → provider`) and takes the first runtime that is both available and permitted.

WebGPU additionally requires the client to report support per call (`clientWebgpu: true`); the server
never assumes a browser can run a model.

## Provider abstraction

Capabilities:

- text generation
- structured generation
- embeddings
- image analysis
- typed decisions (`choice`/`score`/`noul` with calibrated confidence — no text generation)

Provider-specific SDKs stay behind adapters. Decision-model adapters share one interface, so a
self-hosted model and a hosted API are swappable without touching business logic.

`AI_DECISION_PROVIDER` selects between them:

- `laya` (default) — self-hosted, multilingual es-CO checkpoint. Data never leaves the deployment.
- `jev` — optional hosted API, wire-compatible, requires explicit configuration and an API key, and
  is never the only configured option.

Both answer the same `DecisionAdapter` interface. The self-hosted adapter sends the question verbatim
because the data never leaves; the hosted adapter redacts personal data first. Business code cannot
tell them apart.

The transport layer classifies upstream failures (`timeout`, `rate-limited`, `unavailable`,
`rejected`, `malformed`), retries timeouts, 429 and 5xx with bounded backoff and `Retry-After`
support, and never retries a 4xx rejection. Failure counts are exposed through `GET /metrics`.

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

The stages are modelled in `packages/ai` as `SAFETY_STAGES`
(`classify → minimize → select → infer → validate → authorize → confirm`). The `confirm` stage is
decided by `requiresHumanConfirmation`, which always stops the pipeline when the decision was
escalated (confidence below threshold), when the data is FINANCIAL, LEGAL, PERSONAL, SENSITIVE or
CONFIDENTIAL, or when the suggestion would drive a consequential action.

`AI_FORBIDDEN_ACTIONS` lists the actions AI may never perform by itself — payments, charges, receipts,
settlements, signatures, contract termination, document approval, permissions, memberships, owner
approvals and assembly votes. A suggestion about one of them is allowed; performing one is not.
`assertResultUsable` throws rather than let an unconfirmed result reach a domain operation.

## Observability

`GET /api/v1/ai/metrics` reports per-call metadata only: feature, runtime, model, provider, privacy
mode, latency distribution, token counts where the runtime reports them, fallback usage, escalation
count and upstream failure classes.

The recorded shape has no prompt, response, document or image field, so sensitive content cannot be
recorded there even by mistake. Anything needed to explain a decision belongs in the audit trail as
an ID, never as content.


## Model evolution

The application should not care whether the active model is LFM2.5-1.2B, LFM2.5-2.6B, LFM2.5-VL-3B or a future model.

Capabilities and model metadata are resolved through the model registry.

The same holds for decision models: the application asks a typed question with a confidence
threshold, and the registry resolves which checkpoint or provider answers. Concrete model picks are
non-normative examples — the normative bar is the capability plus the evaluation gate in Phase 2.

## Future readiness

The design leaves room for:

- RAG
- CLI
- MCP
- controlled actions
- agentic workflows

These are future phases and should not complicate Phase 1 unnecessarily.
