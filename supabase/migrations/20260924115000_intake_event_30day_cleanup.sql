-- SQL516: retire old intake audit rows after the completed-run detail window.
-- Pending work and failed sheet synchronizations keep their evidence.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='30s';

create function private.kinojo_intake_event_candidates_v516(
  p_after_id bigint default 0,p_limit integer default 50
) returns table(id bigint) language sql stable security definer
set search_path to 'pg_catalog' as $fn$
  select e.id from public.snapshot_intake_events e
  join public.updater_sessions s on s.session_id=e.session_id
  where e.id>coalesce(p_after_id,0)
    and e.created_at<statement_timestamp()-interval '30 days'
    and s.finished_at<statement_timestamp()-interval '30 days'
    and s.status in ('completed','failed','cancelled','expired','error')
    and not exists(select 1 from public.updater_runtime_jobs j
      where j.session_id=e.session_id and coalesce(j.status,'')
        not in ('completed','failed','cancelled','expired','error'))
    and not exists(select 1 from public.lookup_batches b
      where b.session_id=e.session_id and coalesce(b.status,'')
        not in ('completed','failed','cancelled','expired','error'))
    and not exists(select 1 from public.google_list_sheet_sync_queue q
      where q.session_id=e.session_id and q.sync_status not in ('synced','obsolete'))
  order by e.id limit least(50,greatest(1,coalesce(p_limit,50)));
$fn$;

create function private.kinojo_intake_event_cleanup_v516(
  p_dry_run boolean default true,p_limit integer default 50
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog'
set statement_timeout to '15s' set lock_timeout to '500ms' as $fn$
declare v_ids bigint[];v_deleted integer:=0;
begin
  if coalesce(p_dry_run,true) is false and not exists(
    select 1 from private.kinojo_snapshot_retention_control_v512
    where singleton and enabled and backup_waived_at is not null) then
    return jsonb_build_object('ok',false,'code','RETENTION_NOT_ENABLED','deleted',0);
  end if;
  if not pg_try_advisory_xact_lock(501,501) then
    return jsonb_build_object('ok',true,'busy',true,'deleted',0);
  end if;
  begin
    lock table public.snapshot_intake_events in share row exclusive mode nowait;
    lock table public.updater_sessions,public.updater_runtime_jobs,
      public.lookup_batches,public.google_list_sheet_sync_queue
      in share mode nowait;
  exception when lock_not_available then
    return jsonb_build_object('ok',true,'busy',true,'deleted',0);
  end;
  select coalesce(array_agg(c.id),'{}'::bigint[]) into v_ids
  from private.kinojo_intake_event_candidates_v516(0,p_limit) c;
  if coalesce(p_dry_run,true) is false and cardinality(v_ids)>0 then
    delete from public.snapshot_intake_events e where e.id=any(v_ids);
    get diagnostics v_deleted=row_count;
  end if;
  return jsonb_build_object('ok',true,'dryRun',coalesce(p_dry_run,true),
    'candidates',cardinality(v_ids),'deleted',v_deleted,'retentionDays',30);
end;
$fn$;
revoke all on function private.kinojo_intake_event_candidates_v516(bigint,integer),
  private.kinojo_intake_event_cleanup_v516(boolean,integer)
  from public,anon,authenticated,service_role;
commit;
