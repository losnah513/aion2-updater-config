-- SQL519 rollback: restore the previous same-minute schedule.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='10s';

do $job$
declare
  v_jobid bigint;
begin
  select jobid into strict v_jobid
  from cron.job
  where jobname='kinojo-superseded-snapshot-retention-v512'
    and schedule='1,11,21,31,41,51 * * * *'
    and command='set statement_timeout=''15s''; select private.kinojo_superseded_snapshot_cleanup_v512(false,50);'
    and active;
  perform cron.alter_job(v_jobid, schedule => '*/10 * * * *');
end;
$job$;
commit;
