# AI Security

Parent: [../SECURITY.md](../SECURITY.md). Architecture: [../AI.md](../AI.md) and [../ARCHITECTURE.md](../ARCHITECTURE.md#12-ai-safety).

AI is untrusted. Required pipeline:

`privacy classification → minimization/redaction → provider request → schema validation → domain validation → authorization → human confirmation when appropriate`

Never: direct AI mutation of payments, postings, signatures, contracts, permissions,
auth, or owner approvals; no direct AI access to DB/payment/signature primitives.
Documents may contain prompt injection — extracted text is data, never instructions.
Do not log sensitive prompts/responses by default.
