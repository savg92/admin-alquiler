# Observability

Minimal baseline (Phase 1 now; Prometheus/Grafana/Loki and OpenTelemetry deferred):

- Pino JSON logs with timestamp, severity, service, correlation/request ID (`X-Request-Id`,
  generated if absent), organization/actor IDs only where safe, event, duration and stable error code.
- `GET /health` (liveness) and `GET /ready` (DB, Redis/queue depth, storage checks).
- Queue depth/failure and worker-failure tracking via the worker + `/ready`.

Never log sensitive payloads by default.

Track request latency/errors, DB health, queue depth/failures, worker failures, disk/storage capacity, backups, email delivery and authentication failures.

Start simple; add Prometheus/Grafana/Loki and OpenTelemetry when operational value justifies them.
