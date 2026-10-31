CREATE OR REPLACE FUNCTION public.kinojo_normalize_character_name(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select regexp_replace(coalesce(trim(p_value), ''), '\s+', '', 'g');
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_character_skill_snapshot_sync_v415()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '2s'
 SET lock_timeout TO '500ms'
AS $function$
declare
  v_character_master_id bigint;
  v_skill_list jsonb;
  v_skills jsonb;
begin
  -- Historical raw removal must not replay current-state observations.
  if tg_op='UPDATE' and new.retained_parser_stats_v504 is not null
     and (old.retained_parser_stats_v504 is null or new.raw_payload is not distinct from old.raw_payload)
     and (to_jsonb(new)-array['raw_payload','retained_parser_stats_v504'])=(to_jsonb(old)-array['raw_payload','retained_parser_stats_v504']) then
    return new;
  end if;

  -- Raw retention must not replay historical skill/legion writes into current state.
  if tg_op='UPDATE' and old.raw_payload ? 'officialRaw'
     and not coalesce(new.raw_payload ? 'officialRaw',false)
     and (to_jsonb(new)-'raw_payload')=(to_jsonb(old)-'raw_payload') then
    return new;
  end if;
  v_skill_list := new.raw_payload #> '{officialRaw,equipment,skill,skillList}';

  if new.status is distinct from 'OK'
     or jsonb_typeof(v_skill_list) is distinct from 'array' then
    return new;
  end if;

  if jsonb_array_length(v_skill_list) = 0 then
    return new;
  end if;

  select cm.id
    into v_character_master_id
    from public.character_master as cm
   where cm.server_id = new.server_id
     and public.kinojo_character_identity_key_v298(cm.character_name) =
         public.kinojo_character_identity_key_v298(new.character_name)
     and coalesce(cm.is_active, true) = true
   order by cm.updated_at desc, cm.id desc
   limit 1;

  if v_character_master_id is null then
    return new;
  end if;

  v_skills := public.kinojo_character_skill_normalize_v415(v_skill_list);

  insert into public.character_skill_current_state (
    character_master_id,
    snapshot_id,
    snapshot_session_id,
    snapshot_refreshed_at,
    snapshot_source_updated_at,
    snapshot_skills,
    updated_at
  )
  values (
    v_character_master_id,
    new.id,
    new.session_id,
    new.created_at,
    new.created_at,
    v_skills,
    clock_timestamp()
  )
  on conflict (character_master_id) do update
     set snapshot_id = excluded.snapshot_id,
         snapshot_session_id = excluded.snapshot_session_id,
         snapshot_refreshed_at = excluded.snapshot_refreshed_at,
         snapshot_source_updated_at = excluded.snapshot_source_updated_at,
         snapshot_skills = excluded.snapshot_skills,
         updated_at = clock_timestamp()
   where excluded.snapshot_id = public.character_skill_current_state.snapshot_id
      or (
        excluded.snapshot_refreshed_at,
        excluded.snapshot_id
      ) > (
        coalesce(public.character_skill_current_state.snapshot_refreshed_at, '-infinity'::timestamptz),
        coalesce(public.character_skill_current_state.snapshot_id, 0)
      );

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_json_find_text_v321(p_doc jsonb, p_keys text[], p_depth integer DEFAULT 0)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'private'
AS $function$
declare
  v_key text;
  v_value jsonb;
  v_result text;
begin
  if p_doc is null or p_depth > 8 then
    return null;
  end if;

  if jsonb_typeof(p_doc) = 'object' then
    foreach v_key in array p_keys loop
      if p_doc ? v_key then
        v_value := p_doc -> v_key;
        if jsonb_typeof(v_value) in ('string', 'number', 'boolean') then
          return nullif(trim(both '"' from v_value::text), '');
        end if;
      end if;
    end loop;

    for v_value in select value from jsonb_each(p_doc) loop
      v_result := private.kinojo_json_find_text_v321(v_value, p_keys, p_depth + 1);
      if nullif(v_result, '') is not null then
        return v_result;
      end if;
    end loop;
  elsif jsonb_typeof(p_doc) = 'array' then
    for v_value in select value from jsonb_array_elements(p_doc) loop
      v_result := private.kinojo_json_find_text_v321(v_value, p_keys, p_depth + 1);
      if nullif(v_result, '') is not null then
        return v_result;
      end if;
    end loop;
  end if;

  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_sync_character_legion_from_snapshot_v296()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_legion text;
begin
  -- Historical raw removal must not replay current-state observations.
  if tg_op='UPDATE' and new.retained_parser_stats_v504 is not null
     and (old.retained_parser_stats_v504 is null or new.raw_payload is not distinct from old.raw_payload)
     and (to_jsonb(new)-array['raw_payload','retained_parser_stats_v504'])=(to_jsonb(old)-array['raw_payload','retained_parser_stats_v504']) then
    return new;
  end if;

  -- Raw retention must not replay historical skill/legion writes into current state.
  if tg_op='UPDATE' and old.raw_payload ? 'officialRaw'
     and not coalesce(new.raw_payload ? 'officialRaw',false)
     and (to_jsonb(new)-'raw_payload')=(to_jsonb(old)-'raw_payload') then
    return new;
  end if;
  if coalesce(new.status, 'OK') <> 'OK' then
    return new;
  end if;

  v_legion := public.kinojo_extract_legion_name(new.raw_payload);
  if v_legion is null then
    return new;
  end if;

  update public.character_master cm
  set legion_name = v_legion,
      legion_updated_at = coalesce(new.created_at, now()),
      legion_source_snapshot_id = new.id
  where cm.server_id = coalesce(new.server_id, cm.server_id)
    and public.kinojo_normalize_character_name(cm.character_name)
      = public.kinojo_normalize_character_name(new.character_name)
    and (cm.legion_source_snapshot_id is null or cm.legion_source_snapshot_id <= new.id);

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_payload_evidence_v509(p_evidence jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
 select case when jsonb_typeof(p_evidence)='object' then
  coalesce((select jsonb_object_agg(key,value) from jsonb_each(p_evidence)
   where key=any(array['gearReasonCode','visibleEquipmentSlotCount','populatedEquipmentSlotCount',
    'namedEquipmentSlotCount','abyssEquipmentSlotCount','gearType','detectedGearType','gearParseStatus'])),'{}'::jsonb)
 else p_evidence end;
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_snapshot_raw_summary_v514(p_raw jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$
;
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
CREATE OR REPLACE FUNCTION private.kinojo_payload_evidence_candidates_v509(p_after bigint DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS TABLE(id bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
 WITH latest AS MATERIALIZED (
  SELECT DISTINCT ON (coalesce(e.server_id,2002),public.kinojo_normalize_character_name(e.character_name)) e.id
  FROM public.extension_character_payloads e
  ORDER BY coalesce(e.server_id,2002),public.kinojo_normalize_character_name(e.character_name),e.received_at DESC,e.id DESC
 ), protected AS MATERIALIZED (
  SELECT latest_payload_id id FROM public.character_master
  UNION SELECT latest_pve_payload_id FROM public.character_master
  UNION SELECT latest_pvp_payload_id FROM public.character_master
  UNION SELECT payload_id FROM public.character_stat_sources
  UNION SELECT id FROM latest
 ), blocked_sessions AS MATERIALIZED (
  SELECT session_id FROM public.updater_runtime_jobs
  WHERE coalesce(status,'') NOT IN ('completed','failed','cancelled','expired','error')
 ), completed_targets AS MATERIALIZED (
  SELECT DISTINCT payload_id,session_id,server_id,public.kinojo_normalize_character_name(character_name) name
  FROM public.lookup_session_targets WHERE target_status='lookup_done'
 ), blocked_payloads AS MATERIALIZED (
  SELECT DISTINCT payload_id FROM public.lookup_session_targets WHERE target_status IS DISTINCT FROM 'lookup_done'
 ), blocked_slots AS MATERIALIZED (
  SELECT DISTINCT session_id,lookup_order FROM public.lookup_session_targets WHERE target_status IS DISTINCT FROM 'lookup_done'
 )
 SELECT p.id FROM public.extension_character_payloads p
 WHERE p.id>coalesce(p_after,0) AND p.master_sync_status='synced'
  AND (CASE WHEN jsonb_typeof(p.gear_evidence)='object' THEN p.gear_evidence - ARRAY['gearReasonCode','visibleEquipmentSlotCount','populatedEquipmentSlotCount','namedEquipmentSlotCount','abyssEquipmentSlotCount','gearType','detectedGearType','gearParseStatus'] <> '{}'::jsonb ELSE false END)
  AND p.received_at<now()-interval '24 hours'
  AND jsonb_typeof(p.gear_evidence)='object'
  AND p.gear_evidence IS DISTINCT FROM private.kinojo_payload_evidence_v509(p.gear_evidence)
  AND NOT EXISTS(SELECT 1 FROM protected x WHERE x.id=p.id)
  AND EXISTS(SELECT 1 FROM public.updater_sessions s WHERE s.session_id=p.session_id
    AND s.status IN ('completed','failed','cancelled','expired','error'))
  AND NOT EXISTS(SELECT 1 FROM blocked_sessions x WHERE x.session_id=p.session_id)
  AND EXISTS(SELECT 1 FROM completed_targets t WHERE t.payload_id=p.id AND t.session_id=p.session_id
    AND t.server_id IS NOT DISTINCT FROM p.server_id
    AND t.name=public.kinojo_normalize_character_name(p.character_name))
  AND NOT EXISTS(SELECT 1 FROM blocked_payloads t WHERE t.payload_id=p.id)
  AND NOT EXISTS(SELECT 1 FROM blocked_slots t WHERE t.session_id=p.session_id AND t.lookup_order=p.lookup_order)
 ORDER BY p.id LIMIT least(5000,greatest(1,coalesce(p_limit,50)));
$function$
;
