-- SQL515: retire unreferenced payloads older than seven days only after the
-- completed-run admin detail window (30 days) has also ended.
-- Weekly/monthly numeric rollups and current/history sources remain separate.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='30s';

create function private.kinojo_payload_seven_day_candidates_v515(
  p_after_id bigint default 0,p_limit integer default 50
) returns table(id bigint) language sql stable security definer
set search_path to 'pg_catalog' as $fn$
  with latest as materialized (
    -- Keep the same latest-per-identity ordering as the reprocess RPC.
    select distinct on (coalesce(e.server_id,2002),
      public.kinojo_normalize_character_name(e.character_name)) e.id
    from public.extension_character_payloads e
    order by coalesce(e.server_id,2002),
      public.kinojo_normalize_character_name(e.character_name),e.received_at desc,e.id desc
  ), protected as materialized (
    select latest_payload_id id from public.character_master
    union select latest_pve_payload_id from public.character_master
    union select latest_pvp_payload_id from public.character_master
    union select payload_id from public.character_stat_sources
    union select latest_payload_id from public.ranking_entries
    union select payload_id from public.lookup_session_targets
    union select source_payload_id from public.character_history
    union select id from latest
  )
  select p.id from public.extension_character_payloads p
  join public.updater_sessions s on s.session_id=p.session_id
  where p.id>coalesce(p_after_id,0)
    and p.received_at<statement_timestamp()-interval '7 days'
    and p.master_sync_status='synced'
    and p.growth_review_status='reviewed'
    and s.status in ('completed','failed','cancelled','expired','error')
    and s.finished_at is not null
    and s.finished_at<statement_timestamp()-interval '30 days'
    and not exists(select 1 from protected x where x.id=p.id)
    and not exists(select 1 from public.character_master m
      where m.legion_source_snapshot_id=p.source_snapshot_id
        or exists(select 1 from public.lookup_snapshots sn
          where sn.id=p.source_snapshot_id and sn.snapshot_uid=m.latest_snapshot_uid))
    and not exists(select 1 from public.character_skill_current_state c
      where c.snapshot_id=p.source_snapshot_id)
    and not exists(select 1 from public.character_stat_sources c
      where c.snapshot_id=p.source_snapshot_id)
    and not exists(select 1 from private.character_snapshot_requests r
      where r.snapshot_id=p.source_snapshot_id)
    and not exists(select 1 from public.lookup_session_targets t
      where t.session_id=p.session_id and t.lookup_order=p.lookup_order
        and t.target_status is distinct from 'lookup_done')
    and not exists(select 1 from public.updater_runtime_jobs j
      where j.session_id=p.session_id and coalesce(j.status,'')
        not in ('completed','failed','cancelled','expired','error'))
    and not exists(select 1 from public.lookup_batches b
      where b.session_id=p.session_id and coalesce(b.status,'')
        not in ('completed','failed','cancelled','expired','error'))
    and not exists(select 1 from public.google_list_sheet_sync_queue q
      where q.session_id=p.session_id and q.sync_status not in ('synced','obsolete'))
  order by p.id limit least(50,greatest(1,coalesce(p_limit,50)));
$fn$;

create function private.kinojo_payload_seven_day_cleanup_v515(
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
    lock table public.extension_character_payloads in share row exclusive mode nowait;
    lock table public.character_master,public.character_skill_current_state,
      public.character_stat_sources,private.character_snapshot_requests,
      public.lookup_snapshots,public.ranking_entries,public.character_history,
      public.lookup_session_targets,public.updater_sessions,
      public.updater_runtime_jobs,public.lookup_batches,
      public.google_list_sheet_sync_queue in share mode nowait;
  exception when lock_not_available then
    return jsonb_build_object('ok',true,'busy',true,'deleted',0);
  end;
  select coalesce(array_agg(c.id),'{}'::bigint[]) into v_ids
  from private.kinojo_payload_seven_day_candidates_v515(0,p_limit) c;
  if coalesce(p_dry_run,true) is false and cardinality(v_ids)>0 then
    delete from public.extension_character_payloads p where p.id=any(v_ids);
    get diagnostics v_deleted=row_count;
  end if;
  return jsonb_build_object('ok',true,'dryRun',coalesce(p_dry_run,true),
    'candidates',cardinality(v_ids),'deleted',v_deleted,'retentionDays',7);
end;
$fn$;
revoke all on function private.kinojo_payload_seven_day_candidates_v515(bigint,integer),
  private.kinojo_payload_seven_day_cleanup_v515(boolean,integer)
  from public,anon,authenticated,service_role;
commit;
