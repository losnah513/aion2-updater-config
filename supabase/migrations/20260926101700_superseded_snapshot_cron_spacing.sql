-- SQL519: prevent the superseded-snapshot cleanup from competing with v501.
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
  where jobname='kinojo-superseded-snapshot-retention-v512'
    and schedule in ('*/10 * * * *','1,11,21,31,41,51 * * * *')
    and command='set statement_timeout=''15s''; select private.kinojo_superseded_snapshot_cleanup_v512(false,50);'
    and active;
  if v_schedule='*/10 * * * *' then
    perform cron.alter_job(v_jobid, schedule => '1,11,21,31,41,51 * * * *');
  end if;
end;
$job$;
commit;
