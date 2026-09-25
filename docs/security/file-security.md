# File Security

Parent: [../SECURITY.md](../SECURITY.md).

Treat every upload as hostile: validate content type + extension independently,
limit size, generate safe filenames, scan when possible, never execute uploads,
store privately, authorize every download, record metadata + audit events.

Binaries in MinIO/S3-compatible storage; metadata/policy in PostgreSQL.
