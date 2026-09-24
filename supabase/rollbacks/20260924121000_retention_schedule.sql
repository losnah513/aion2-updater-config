-- SQL517 rollback stops these jobs and the earlier gated superseded-snapshot job.
begin read write;
set local lock_timeout='2s';
update private.kinojo_snapshot_retention_control_v512 set enabled=false where singleton;
select cron.unschedule('kinojo-snapshot-seven-day-summary-v514');
select cron.unschedule('kinojo-payload-post-detail-cleanup-v515');
select cron.unschedule('kinojo-intake-post-detail-cleanup-v516');
commit;
