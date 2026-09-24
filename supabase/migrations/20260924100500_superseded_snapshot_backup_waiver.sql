-- SQL513: user waived backup for superseded snapshot cleanup on 2026-09-24.
-- Installation remains disabled until the guarded production canary is checked.
begin read write;
set local lock_timeout='2s';
alter table private.kinojo_snapshot_retention_control_v512
  add column backup_waived_at timestamptz;
update private.kinojo_snapshot_retention_control_v512
  set backup_waived_at=now()
  where singleton and enabled=false and backup_verified_at is null;

create or replace function private.kinojo_superseded_snapshot_cleanup_v512(
  p_dry_run boolean default true, p_limit integer default 50
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog'
set statement_timeout to '15s' set lock_timeout to '500ms' as $fn$
declare v_ids bigint[]; v_count integer:=0; v_cached integer:=0; v_id bigint; v_n integer;
begin
  if coalesce(p_dry_run,true) is false and not exists(
    select 1 from private.kinojo_snapshot_retention_control_v512
    where singleton and enabled
      and (backup_verified_at is not null or backup_waived_at is not null)) then
    return jsonb_build_object('ok',false,'code','RETENTION_NOT_ENABLED','deleted',0);
  end if;
  if not pg_try_advisory_xact_lock(501,501) then
    return jsonb_build_object('ok',true,'busy',true,'deleted',0);
  end if;
  begin
    lock table public.lookup_snapshots in share row exclusive mode nowait;
    lock table public.character_master,public.character_skill_current_state,
      public.character_stat_sources,private.character_snapshot_requests,
      public.updater_sessions,public.updater_runtime_jobs,public.lookup_batches,
      public.lookup_session_targets,public.extension_character_payloads,
      public.ranking_entries,public.google_list_sheet_sync_queue in share mode nowait;
  exception when lock_not_available then
    return jsonb_build_object('ok',true,'busy',true,'deleted',0);
  end;
  select coalesce(array_agg(c.id),'{}'::bigint[]) into v_ids
  from private.kinojo_superseded_snapshot_candidates_v512(0,p_limit) c;
  if coalesce(p_dry_run,true) is false and cardinality(v_ids)>0 then
    foreach v_id in array v_ids loop
      update public.extension_character_payloads p
      set retained_diagnosis_v512=coalesce(p.retained_diagnosis_v512,
            private.kinojo_payload_diagnosis_summary_v512(p.id)),
          source_snapshot_id=case when p.source_snapshot_id=v_id then null
            else p.source_snapshot_id end
      from public.lookup_snapshots s
      where s.id=v_id and p.master_sync_status='synced'
        and (p.source_snapshot_id=v_id or (p.source_snapshot_id is null
          and p.session_id=s.session_id
          and coalesce(p.server_id,2002)=coalesce(s.server_id,2002)
          and public.kinojo_normalize_character_name(p.character_name)
            =public.kinojo_normalize_character_name(s.character_name)))
        and (p.source_snapshot_id=v_id or p.retained_diagnosis_v512 is null);
      get diagnostics v_n=row_count; v_cached:=v_cached+v_n;
      delete from public.lookup_snapshots s where s.id=v_id;
      get diagnostics v_n=row_count; v_count:=v_count+v_n;
    end loop;
  end if;
  return jsonb_build_object('ok',true,'dryRun',coalesce(p_dry_run,true),
    'candidates',cardinality(v_ids),'deleted',v_count,'cachedPayloads',v_cached,
    'policy','superseded-by-success-and-unreferenced');
end;
$fn$;
commit;
