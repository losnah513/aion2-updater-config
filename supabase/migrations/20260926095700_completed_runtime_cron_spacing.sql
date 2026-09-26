-- SQL518: give the 30-day completed-runtime cleanup its own minute.
-- The previous 20:50 UTC start collides with the ten-minute snapshot cleanup.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='10s';

do $job$
declare
  v_jobid bigint;
  v_schedule text;
begin
  select jobid,schedule into strict v_jobid,v_schedule
  from cron.job
  where jobname='kinojo-completed-runtime-retention-v511'
    and schedule in ('50 20 * * *','53 20 * * *')
    and command='set statement_timeout=''15s''; select private.kinojo_completed_runtime_cleanup_v511(false,5);'
    and active;
  if v_schedule='50 20 * * *' then
    perform cron.alter_job(v_jobid, schedule => '53 20 * * *');
  end if;
end;
$job$;
commit;
