-- SQL502: keep the existing retention contract within the production statement budget.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='10s';
select cron.unschedule('kinojo-snapshot-raw-retention-v501');
select cron.schedule('kinojo-snapshot-raw-retention-v501','*/10 * * * *','set statement_timeout=''15s''; select private.kinojo_snapshot_raw_cleanup_v501(false,50);');
commit;
