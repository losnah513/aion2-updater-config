# Private storage maintenance

API1.1 preserves the1.0 backup contract and adds `maintenanceProbe` and `maintain`. SQL553 owns the280MB trigger,270MB target, existing retention calls, active-work gate,90-second lease, finite table cycle and retry state. The549 single control row is reused. A small minute Cron checks pressure and dispatches; regular retention schedules remain unchanged.

The Edge executes the DB plan through a dedicated autocommit connection because VACUUM FULL cannot run inside a transaction/RPC. Reuse the platform's built-in SUPABASE_DB_URL without copying or printing it. Accept only the matching project, normalize transaction-pool URLs to that project's direct endpoint using the same credential, and keep TLS certificate verification enabled. Postgres.js3.4.7 is pinned with integrity in deno.lock and the committed test runtime lockfile.

Authenticate through the service-only553 RPC and existing Vault token before loading the driver or connecting. Disabled/below-threshold/active/duplicate requests open no native connection. Probe only reads session settings. Native work allows at most two fixed tables,45seconds overall,5seconds per server query and300ms lock wait. Use SKIP_LOCKED, the501 advisory lock, verified timeouts and a stable backend PID. Lost lease, cancellation, connection error or skipped rewrite is not completed reclaim. Persist only bounded metadata and sanitized error codes.

Current Master/member/Sanctuary and WEEK/MONTH growth tables are excluded from the physical allowlist. Existing eligible future diagnostics use549; physical rewrite preserves rows. If no reclaimable space remains after a finite cycle, stop, back off and show NO_RECLAIMABLE_SPACE. Never purge protected real data to manufacture a size target. The DB-owner-only fixed1-table CANARY does not pretend pressure crossed280MB. Disable reclaim_enabled and unschedule only553 on rollback, preserving normal retention and backups.

Known facts: native pressure/concurrency/cancellation tests cover standalone utility execution and session limits. Production built-in connection and canary still require operational readback before activation; actual deployment/readiness belongs to DB project LOG42.

## Backup transport contract (API1.0 compatibility)

API 1.0 serves `health` and `backupPage`. The server owns the maintenance Cron token; it is read from Vault only inside the normal server invocation. The export RPC additionally permits only service_role execution. No browser session, member key or anonymous role can export records.

`backupPage` accepts a fixed kind, after/until ID bounds, before timestamp, limit (at most 500) and an ASCII backupRun label. SQL551 chooses the table, age cutoff and canonical JSONL bytes. It returns at most 8MB per page (a single record may be at most 12MB). The Edge only transports these bytes and never decides retention or changes source rows.

The destination is the same project's private `kinojo-db-backups` Storage bucket, with no public policy. Objects are gzip JSONL, named by run, kind, bounds and SHA256. Repeating an identical page reuses the content path. Upload is followed by private download, decompression and source SHA256 verification. Only after verification does the response include metadata and a 600-second signed link; it never includes raw records. Do not place signed links in logs, fixtures, Git or evidence.

Request bodies are limited to 4KB/5s; upstream headers and streamed bodies are limited to 60s/24MB. Failed authentication never reaches Storage. Missing bucket, upload, readback or hash failure stops the operation; no source compaction is attempted. Export errors do not expose upstream details or credentials. There is no automatic mutation retry.

This is a backup prerequisite for SQL549. Enable that lifecycle only after all initial target records have been independently downloaded and restored in an isolated database. Rollback stops the Edge and drops the SQL551 export function, preserving private backups and source rows. No current feature, automatic lookup frequency or growth values are changed by this transport.
