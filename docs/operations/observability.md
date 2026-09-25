# Observability

Use structured logs with timestamp, severity, service, correlation/request ID, organization/actor IDs only where safe, event, duration and stable error code.

Never log sensitive payloads by default.

Track request latency/errors, DB health, queue depth/failures, worker failures, disk/storage capacity, backups, email delivery and authentication failures.

Start simple; add Prometheus/Grafana/Loki and OpenTelemetry when operational value justifies them.
