-- SQL520 rollback stops future deletion; already removed execution logs are not restored.
begin read write;
set local lock_timeout='2s';
select cron.unschedule('kinojo-cron-run-history-retention-v520');
drop function if exists private.kinojo_cron_run_history_cleanup_v520(boolean,integer);
commit;
