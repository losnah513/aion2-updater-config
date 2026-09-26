-- SQL518 rollback: restore the previous 20:50 UTC schedule.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='10s';

do $job$
declare
  v_jobid bigint;
begin
  select jobid into strict v_jobid
  from cron.job
  where jobname='kinojo-completed-runtime-retention-v511'
    and schedule='53 20 * * *'
    and command='set statement_timeout=''15s''; select private.kinojo_completed_runtime_cleanup_v511(false,5);'
    and active;
  perform cron.alter_job(v_jobid, schedule => '50 20 * * *');
end;
$job$;
commit;
