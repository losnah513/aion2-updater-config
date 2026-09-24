-- SQL514 rollback: stop future compaction; retired raw cannot be reconstructed.
begin read write;
set local lock_timeout='2s';
update private.kinojo_snapshot_retention_control_v512 set enabled=false where singleton;
drop function if exists private.kinojo_snapshot_raw_cleanup_v514(boolean,integer);
drop function if exists private.kinojo_snapshot_raw_candidates_v514(bigint,integer);
-- Keep the summary reader for inspection of already compacted rows.
commit;
