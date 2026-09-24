-- SQL514: retain target/status rows while retiring superseded official raw after 7 days.
-- Current Master, skill, stat, request and latest official sources stay intact.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='30s';

create function private.kinojo_snapshot_raw_summary_v514(p_raw jsonb)
returns jsonb language sql immutable security definer set search_path to 'pg_catalog' as $fn$
  select jsonb_strip_nulls(jsonb_build_object(
    'retainedSummaryVersion',514,
    'characterName',private.kinojo_json_find_text_v321(p_raw,array['characterName','character_name','officialName','official_name']),
    'serverId',private.kinojo_json_find_text_v321(p_raw,array['serverId','server_id']),
    'className',private.kinojo_json_find_text_v321(p_raw,array['className','class_name']),
    'charKey',private.kinojo_json_find_text_v321(p_raw,array['charKey','char_key']),
    'combatPower',private.kinojo_json_find_text_v321(p_raw,array['combatPower','combat_power','pveCombatPower','pve_combat_power','pvpCombatPower','pvp_combat_power']),
    'itemLevel',private.kinojo_json_find_text_v321(p_raw,array['itemLevel','item_level','pveItemLevel','pve_item_level','pvpItemLevel','pvp_item_level']),
    'pveCombatPower',private.kinojo_json_find_text_v321(p_raw,array['pveCombatPower','pve_combat_power']),
    'pvpCombatPower',private.kinojo_json_find_text_v321(p_raw,array['pvpCombatPower','pvp_combat_power']),
    'pveItemLevel',private.kinojo_json_find_text_v321(p_raw,array['pveItemLevel','pve_item_level']),
    'pvpItemLevel',private.kinojo_json_find_text_v321(p_raw,array['pvpItemLevel','pvp_item_level'])
  ));
$fn$;

create function private.kinojo_snapshot_raw_candidates_v514(
  p_after_id bigint default 0,p_limit integer default 50
) returns table(id bigint) language sql stable security definer
set search_path to 'pg_catalog' as $fn$
  select s.id from public.lookup_snapshots s
  join public.updater_sessions u on u.session_id=s.session_id
  where s.id>coalesce(p_after_id,0)
    and s.created_at<statement_timestamp()-interval '7 days'
    and s.status='OK'
    and s.raw_payload is not null
    and s.raw_payload->>'retainedSummaryVersion' is distinct from '514'
    and u.status in ('completed','failed','cancelled','expired','error')
    and u.finished_at is not null
    and exists(select 1 from public.lookup_snapshots newer
      where newer.server_id=s.server_id and newer.character_name=s.character_name
        and (newer.created_at,newer.id)>(s.created_at,s.id))
    and not exists(select 1 from public.character_master m
      where m.latest_snapshot_uid=s.snapshot_uid or m.legion_source_snapshot_id=s.id)
    and not exists(select 1 from public.character_skill_current_state c where c.snapshot_id=s.id)
    and not exists(select 1 from public.character_stat_sources c where c.snapshot_id=s.id)
    and not exists(select 1 from private.character_snapshot_requests r where r.snapshot_id=s.id)
    and not exists(select 1 from public.extension_character_payloads p where p.source_snapshot_id=s.id
      and (p.master_sync_status is distinct from 'synced'
        or exists(select 1 from public.character_master m
          where p.id in(m.latest_payload_id,m.latest_pve_payload_id,m.latest_pvp_payload_id))
        or exists(select 1 from public.character_stat_sources c where c.payload_id=p.id)
        or exists(select 1 from public.ranking_entries r where r.latest_payload_id=p.id)))
    and not exists(select 1 from public.extension_character_payloads p
      where p.session_id=s.session_id and p.source_snapshot_id is null
        and p.master_sync_status is distinct from 'synced')
    and not exists(select 1 from public.updater_runtime_jobs j where j.session_id=s.session_id
      and coalesce(j.status,'') not in ('completed','failed','cancelled','expired','error'))
    and not exists(select 1 from public.lookup_batches b where b.session_id=s.session_id
      and coalesce(b.status,'') not in ('completed','failed','cancelled','expired','error'))
    and not exists(select 1 from public.google_list_sheet_sync_queue q
      where q.session_id=s.session_id and q.sync_status not in ('synced','obsolete'))
  order by s.id limit least(50,greatest(1,coalesce(p_limit,50)));
$fn$;

create function private.kinojo_snapshot_raw_cleanup_v514(
  p_dry_run boolean default true,p_limit integer default 50
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog'
set statement_timeout to '15s' set lock_timeout to '500ms' as $fn$
declare v_ids bigint[];v_cached integer:=0;v_compacted integer:=0;v_id bigint;v_n integer;
begin
  if coalesce(p_dry_run,true) is false and not exists(
    select 1 from private.kinojo_snapshot_retention_control_v512
    where singleton and enabled and backup_waived_at is not null) then
    return jsonb_build_object('ok',false,'code','RETENTION_NOT_ENABLED','compacted',0);
  end if;
  if not pg_try_advisory_xact_lock(501,501) then
    return jsonb_build_object('ok',true,'busy',true,'compacted',0);
  end if;
  begin
    lock table public.lookup_snapshots in share row exclusive mode nowait;
    lock table public.character_master,public.character_skill_current_state,
      public.character_stat_sources,private.character_snapshot_requests,
      public.updater_sessions,public.updater_runtime_jobs,public.lookup_batches,
      public.extension_character_payloads,public.ranking_entries,
      public.google_list_sheet_sync_queue in share mode nowait;
  exception when lock_not_available then
    return jsonb_build_object('ok',true,'busy',true,'compacted',0);
  end;
  select coalesce(array_agg(c.id),'{}'::bigint[]) into v_ids
  from private.kinojo_snapshot_raw_candidates_v514(0,p_limit) c;
  if coalesce(p_dry_run,true) is false then
    foreach v_id in array v_ids loop
      update public.extension_character_payloads p
      set retained_diagnosis_v512=private.kinojo_payload_diagnosis_summary_v512(p.id)
      from public.lookup_snapshots s
      where s.id=v_id and p.master_sync_status='synced'
        and p.retained_diagnosis_v512 is null
        and (p.source_snapshot_id=v_id or (p.source_snapshot_id is null
          and p.session_id=s.session_id
          and coalesce(p.server_id,2002)=coalesce(s.server_id,2002)
          and public.kinojo_normalize_character_name(p.character_name)
            =public.kinojo_normalize_character_name(s.character_name)));
      get diagnostics v_n=row_count;v_cached:=v_cached+v_n;
      update public.lookup_snapshots s
      set raw_payload=private.kinojo_snapshot_raw_summary_v514(s.raw_payload)
      where s.id=v_id;
      get diagnostics v_n=row_count;v_compacted:=v_compacted+v_n;
    end loop;
  end if;
  return jsonb_build_object('ok',true,'dryRun',coalesce(p_dry_run,true),
    'candidates',cardinality(v_ids),'compacted',v_compacted,'cachedPayloads',v_cached,
    'retentionDays',7);
end;
$fn$;
revoke all on function private.kinojo_snapshot_raw_summary_v514(jsonb),
  private.kinojo_snapshot_raw_candidates_v514(bigint,integer),
  private.kinojo_snapshot_raw_cleanup_v514(boolean,integer)
  from public,anon,authenticated,service_role;
commit;
