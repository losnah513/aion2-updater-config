# Private storage maintenance transport

API 1.0 serves `health` and `backupPage`. The server owns the maintenance Cron token; it is read from Vault only inside the normal server invocation. The export RPC additionally permits only service_role execution. No browser session, member key or anonymous role can export records.

`backupPage` accepts a fixed kind, after/until ID bounds, before timestamp, limit (at most 500) and an ASCII backupRun label. SQL551 chooses the table, age cutoff and canonical JSONL bytes. It returns at most 8MB per page (a single record may be at most 12MB). The Edge only transports these bytes and never decides retention or changes source rows.

The destination is the same project's private `kinojo-db-backups` Storage bucket, with no public policy. Objects are gzip JSONL, named by run, kind, bounds and SHA256. Repeating an identical page reuses the content path. Upload is followed by private download, decompression and source SHA256 verification. Only after verification does the response include metadata and a 600-second signed link; it never includes raw records. Do not place signed links in logs, fixtures, Git or evidence.

Request bodies are limited to 4KB/5s; upstream headers and streamed bodies are limited to 60s/24MB. Failed authentication never reaches Storage. Missing bucket, upload, readback or hash failure stops the operation; no source compaction is attempted. Export errors do not expose upstream details or credentials. There is no automatic mutation retry.

This is a backup prerequisite for SQL549. Enable that lifecycle only after all initial target records have been independently downloaded and restored in an isolated database. Rollback stops the Edge and drops the SQL551 export function, preserving private backups and source rows. No current feature, automatic lookup frequency or growth values are changed by this transport.
