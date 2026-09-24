-- SQL512 rollback: stop future cleanup. Already deleted source rows require the external encrypted backup for restoration.
begin read write;
set local lock_timeout='2s';
update private.kinojo_snapshot_retention_control_v512 set enabled=false where singleton;
select cron.unschedule('kinojo-superseded-snapshot-retention-v512');
drop function if exists private.kinojo_superseded_snapshot_cleanup_v512(boolean,integer);
drop function if exists private.kinojo_superseded_snapshot_candidates_v512(bigint,integer);
-- Keep retained_diagnosis_v512 and its reader: historic payloads may already depend on the cached result.
commit;
