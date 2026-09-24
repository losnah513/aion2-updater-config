-- SQL512: compact superseded snapshot sources while preserving current sources.
-- The first production cleanup is gated until its encrypted backup is verified.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='30s';

create table private.kinojo_snapshot_retention_control_v512(
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  backup_verified_at timestamptz
);
insert into private.kinojo_snapshot_retention_control_v512(singleton) values(true);
revoke all on private.kinojo_snapshot_retention_control_v512
  from public,anon,authenticated,service_role;

alter table public.extension_character_payloads
  add column retained_diagnosis_v512 jsonb;

create function private.kinojo_payload_diagnosis_summary_v512(p_payload_id bigint)
returns jsonb language sql stable security definer set search_path to 'pg_catalog' as $fn$
 select case when d.value is null then null else
   (d.value-'gearEvidence') || jsonb_build_object('gearEvidence',
     private.kinojo_payload_evidence_v509(d.value->'gearEvidence')) end
 from (select public.kinojo_payload_gear_diagnosis(p_payload_id) value) d;
$fn$;
revoke all on function private.kinojo_payload_diagnosis_summary_v512(bigint)
 from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.kinojo_payload_gear_diagnosis(p_payload_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payload public.extension_character_payloads%rowtype;
  v_snapshot public.lookup_snapshots%rowtype;
  v_parser_text text;
  v_stats jsonb;
  v_declared text;
  v_snapshot_found boolean := false;
begin
  select * into v_payload
    from public.extension_character_payloads
   where id = p_payload_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'PAYLOAD_NOT_FOUND', 'payloadId', p_payload_id);
  end if;

  if v_payload.retained_diagnosis_v512 is not null then
    return v_payload.retained_diagnosis_v512;
  end if;

  if v_payload.source_snapshot_id is not null then
    select * into v_snapshot
      from public.lookup_snapshots
     where id = v_payload.source_snapshot_id;
    v_snapshot_found := found;
  end if;

  if not v_snapshot_found then
    select * into v_snapshot
      from public.lookup_snapshots s
     where s.session_id = v_payload.session_id
       and coalesce(s.server_id, 2002) = coalesce(v_payload.server_id, 2002)
       and public.kinojo_normalize_character_name(s.character_name)
           = public.kinojo_normalize_character_name(v_payload.character_name)
     order by abs(extract(epoch from (s.created_at - v_payload.received_at))) asc, s.id desc
     limit 1;
    v_snapshot_found := found;
  end if;

  v_declared := case
    when v_payload.pvp_item_level is not null and v_payload.pvp_combat_power is not null
     and v_payload.pve_item_level is null and v_payload.pve_combat_power is null then 'PVP'
    when v_payload.pve_item_level is not null and v_payload.pve_combat_power is not null
     and v_payload.pvp_item_level is null and v_payload.pvp_combat_power is null then 'PVE'
    else coalesce(nullif(upper(trim(v_payload.gear_type)), ''), 'UNKNOWN')
  end;

  if not v_snapshot_found or v_snapshot.raw_payload is null then
    return jsonb_build_object(
      'ok', true,
      'payloadId', v_payload.id,
      'snapshotId', v_payload.source_snapshot_id,
      'characterName', v_payload.character_name,
      'payloadDeclaredGearType', v_declared,
      'detectedGearType', 'UNKNOWN',
      'gearParseStatus', 'UNKNOWN',
      'gearReasonCode', 'RAW_SNAPSHOT_NOT_FOUND',
      'parserVersion', '236-tristate-pve-pvp-provenance'
    );
  end if;

  if v_snapshot.retained_parser_stats_v504 is not null then
    if v_snapshot.retained_parser_stats_v504->>'characterName' is distinct from v_payload.character_name then
      return jsonb_build_object('ok',false,'code','ARCHIVED_PARSER_IDENTITY_CHANGED','payloadId',v_payload.id,'snapshotId',v_snapshot.id);
    end if;
    v_stats := v_snapshot.retained_parser_stats_v504->'stats';
  else
  v_parser_text := public.kinojo_snapshot_parser_text(v_snapshot.raw_payload);
  v_stats := public.kinojo_extract_aion_stats_from_text(v_parser_text, v_payload.character_name, null);
  end if;

  return jsonb_build_object(
    'ok', true,
    'payloadId', v_payload.id,
    'snapshotId', v_snapshot.id,
    'characterName', v_payload.character_name,
    'payloadDeclaredGearType', v_declared,
    'detectedGearType', public.kinojo_json_text(v_stats, 'detectedGearType', 'gearType'),
    'gearParseStatus', public.kinojo_json_text(v_stats, 'gearParseStatus'),
    'gearReasonCode', public.kinojo_json_text(v_stats, 'gearReasonCode'),
    'itemLevel', public.kinojo_json_int(v_stats, 'itemLevel'),
    'combatPower', public.kinojo_json_int(v_stats, 'combatPower'),
    'parserVersion', public.kinojo_json_text(v_stats, 'parserVersion'),
    'gearEvidence', coalesce(v_stats -> 'gearEvidence', '{}'::jsonb)
  );
end;
$function$
;

create function private.kinojo_superseded_snapshot_candidates_v512(
  p_after_id bigint default 0, p_limit integer default 50
) returns table(id bigint) language sql stable security definer
set search_path to 'pg_catalog' as $fn$
  select s.id
  from public.lookup_snapshots s
  join public.updater_sessions u on u.session_id=s.session_id
  where s.id>coalesce(p_after_id,0)
    and u.status in ('completed','failed','cancelled','expired','error')
    and u.finished_at is not null
    and not exists(select 1 from public.updater_runtime_jobs j where j.session_id=s.session_id
      and coalesce(j.status,'') not in ('completed','failed','cancelled','expired','error'))
    and not exists(select 1 from public.lookup_batches b where b.session_id=s.session_id
      and coalesce(b.status,'') not in ('completed','failed','cancelled','expired','error'))
    and exists(select 1 from public.lookup_snapshots newer
      where newer.server_id=s.server_id and newer.character_name=s.character_name
        and newer.status='OK' and (newer.created_at,newer.id)>(s.created_at,s.id))
    and not exists(select 1 from public.character_master m
      where m.latest_snapshot_uid=s.snapshot_uid or m.legion_source_snapshot_id=s.id)
    and not exists(select 1 from public.character_skill_current_state c where c.snapshot_id=s.id)
    and not exists(select 1 from public.character_stat_sources c where c.snapshot_id=s.id)
    and not exists(select 1 from private.character_snapshot_requests r where r.snapshot_id=s.id)
    and not exists(select 1 from public.lookup_session_targets t where t.snapshot_id=s.id)
    and not exists(select 1 from public.extension_character_payloads p where p.source_snapshot_id=s.id
      and (p.master_sync_status is distinct from 'synced'
        or exists(select 1 from public.character_master m
          where p.id in(m.latest_payload_id,m.latest_pve_payload_id,m.latest_pvp_payload_id))
        or exists(select 1 from public.character_stat_sources c where c.payload_id=p.id)
        or exists(select 1 from public.ranking_entries r where r.latest_payload_id=p.id)))
    -- Unlinked payloads can use the closest snapshot until successfully synced.
    and not exists(select 1 from public.extension_character_payloads p
      where p.session_id=s.session_id and p.source_snapshot_id is null
        and p.master_sync_status is distinct from 'synced')
    and not exists(select 1 from public.google_list_sheet_sync_queue q
      where q.session_id=s.session_id and q.sync_status not in ('synced','obsolete'))
  order by s.id
  limit least(50,greatest(1,coalesce(p_limit,50)));
$fn$;

create function private.kinojo_superseded_snapshot_cleanup_v512(
  p_dry_run boolean default true, p_limit integer default 50
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog'
set statement_timeout to '15s' set lock_timeout to '500ms' as $fn$
declare v_ids bigint[]; v_count integer:=0; v_cached integer:=0; v_id bigint; v_n integer;
begin
  if coalesce(p_dry_run,true) is false and not exists(
    select 1 from private.kinojo_snapshot_retention_control_v512
    where singleton and enabled and backup_verified_at is not null) then
    return jsonb_build_object('ok',false,'code','BACKUP_NOT_VERIFIED','deleted',0);
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
revoke all on function private.kinojo_superseded_snapshot_candidates_v512(bigint,integer),
  private.kinojo_superseded_snapshot_cleanup_v512(boolean,integer)
  from public,anon,authenticated,service_role;

-- The current official source is selected before deletion; batches remain small.
select cron.schedule('kinojo-superseded-snapshot-retention-v512','*/10 * * * *',
  'set statement_timeout=''15s''; select private.kinojo_superseded_snapshot_cleanup_v512(false,50);');
commit;
