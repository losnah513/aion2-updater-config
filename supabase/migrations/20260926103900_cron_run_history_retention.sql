-- SQL520: retain seven days of completed pg_cron execution details.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='15s';

create function private.kinojo_cron_run_history_cleanup_v520(
  p_dry_run boolean default true,
  p_limit integer default 2000
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog'
  set statement_timeout to '10s' set lock_timeout to '500ms' as $fn$
declare
  v_cutoff timestamptz := statement_timestamp()-interval '7 days';
  v_limit integer := least(2000,greatest(1,coalesce(p_limit,2000)));
  v_count integer;
begin
  if not pg_try_advisory_xact_lock(520,520) then
    return jsonb_build_object('ok',true,'busy',true,'deleted',0);
  end if;
  if coalesce(p_dry_run,true) then
    select count(*) into v_count from (
      select runid from cron.job_run_details
      where end_time<v_cutoff order by runid limit v_limit
    ) eligible;
    return jsonb_build_object('ok',true,'dryRun',true,'candidates',v_count,
      'deleted',0,'retentionDays',7);
  end if;
  with eligible as (
    select runid from cron.job_run_details
    where end_time<v_cutoff order by runid limit v_limit
    for update skip locked
  )
  delete from cron.job_run_details d using eligible e where d.runid=e.runid;
  get diagnostics v_count=row_count;
  return jsonb_build_object('ok',true,'dryRun',false,'deleted',v_count,
    'retentionDays',7);
end;
$fn$;
revoke all on function private.kinojo_cron_run_history_cleanup_v520(boolean,integer)
  from public,anon,authenticated,service_role;

select cron.schedule('kinojo-cron-run-history-retention-v520','58 20 * * *',
  'set statement_timeout=''10s''; select private.kinojo_cron_run_history_cleanup_v520(false,2000);');
commit;
