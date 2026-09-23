-- SQL504: remove historical parser text after retaining its exact diagnostic result.
-- Uses the existing SQL501/502 cron and 50-row budget; no new job.
begin read write;
set local lock_timeout='2s';
alter table public.lookup_snapshots add column retained_parser_stats_v504 jsonb;
CREATE FUNCTION private.kinojo_snapshot_text_v504(p_raw jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE STRICT SET search_path TO 'pg_catalog'
AS $function$
declare v_out jsonb; k record; v_before text;
begin
 if jsonb_typeof(p_raw)<>'object' then return p_raw; end if;
 v_out := p_raw - array['officialRaw','profileHtml','profile_html','pageText','text','rawText','bodyText','visibleText','visible_text','bodyInnerText'];
 -- Preserve the existing recursive audit's scalar observations before discarding the detailed object.
 for k in select keys from (values
 (array['characterName','character_name','officialName','official_name']),
 (array['serverId','server_id']),
 (array['className','class_name']),
 (array['charKey','char_key']),
 (array['combatPower','combat_power','pveCombatPower','pve_combat_power','pvpCombatPower','pvp_combat_power']),
 (array['itemLevel','item_level','pveItemLevel','pve_item_level','pvpItemLevel','pvp_item_level'])
 ) groups(keys) loop
  v_before := private.kinojo_json_find_text_v321(p_raw,k.keys);
  if v_before is distinct from private.kinojo_json_find_text_v321(v_out,k.keys) then
   v_out := jsonb_set(v_out,array[k.keys[1]],to_jsonb(coalesce(v_before,'')),true);
  end if;
 end loop;
 -- Nonstandard nested aliases must never silently change the audit contract.
 for k in select keys from (values
 (array['characterName','character_name','officialName','official_name']),
 (array['serverId','server_id']),
 (array['className','class_name']),
 (array['charKey','char_key']),
 (array['combatPower','combat_power','pveCombatPower','pve_combat_power','pvpCombatPower','pvp_combat_power']),
 (array['itemLevel','item_level','pveItemLevel','pve_item_level','pvpItemLevel','pvp_item_level'])
 ) groups(keys) loop
  if private.kinojo_json_find_text_v321(p_raw,k.keys) is distinct from private.kinojo_json_find_text_v321(v_out,k.keys) then return p_raw; end if;
 end loop;
 return v_out;
end;
$function$;
CREATE FUNCTION private.kinojo_snapshot_text_candidates_v504(p_after_id bigint DEFAULT 0,p_limit integer DEFAULT 2000)
RETURNS TABLE(id bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog'
AS $function$
WITH protected AS MATERIALIZED (
SELECT s.id FROM public.character_master m JOIN public.lookup_snapshots s ON s.snapshot_uid=m.latest_snapshot_uid
UNION SELECT legion_source_snapshot_id FROM public.character_master WHERE legion_source_snapshot_id IS NOT NULL
UNION SELECT snapshot_id FROM public.character_skill_current_state WHERE snapshot_id IS NOT NULL
UNION SELECT snapshot_id FROM public.character_stat_sources WHERE snapshot_id IS NOT NULL
UNION SELECT s.id FROM public.lookup_snapshots s JOIN private.character_snapshot_requests r ON r.snapshot_id::text=s.id::text
UNION SELECT p.source_snapshot_id FROM public.character_master m JOIN public.extension_character_payloads p ON p.id IN (m.latest_payload_id,m.latest_pve_payload_id,m.latest_pvp_payload_id) WHERE p.source_snapshot_id IS NOT NULL
UNION SELECT s.id FROM public.character_master m CROSS JOIN LATERAL (SELECT id FROM public.lookup_snapshots s WHERE s.server_id=m.server_id AND s.character_name=m.character_name ORDER BY created_at DESC FETCH FIRST 10 ROWS WITH TIES) s
UNION SELECT s.id FROM public.character_master m CROSS JOIN LATERAL (SELECT id FROM public.lookup_snapshots s WHERE s.server_id=m.server_id AND s.character_name=m.character_name AND s.status='OK' AND s.raw_payload->'officialRaw' IS NOT NULL ORDER BY created_at DESC FETCH FIRST 10 ROWS WITH TIES) s
),
missing_links AS MATERIALIZED (select distinct session_id from public.extension_character_payloads where source_snapshot_id is null), synced AS MATERIALIZED (
 select source_snapshot_id from public.extension_character_payloads where source_snapshot_id is not null
 group by source_snapshot_id having bool_and(coalesce(master_sync_status='synced',false))
)
select s.id from public.lookup_snapshots s
join public.updater_sessions u on u.session_id=s.session_id and u.status='completed'
join synced p on p.source_snapshot_id=s.id
where s.id>coalesce(p_after_id,0) and s.status='OK'
 and s.created_at<statement_timestamp()-interval '24 hours'
 and s.retained_parser_stats_v504 is null

 and not exists(select 1 from public.extension_character_payloads p where p.source_snapshot_id=s.id and p.character_name is distinct from s.character_name)
 and not exists(select 1 from missing_links p where p.session_id=s.session_id)
 and not exists(select 1 from protected k where k.id=s.id)
 and not exists(select 1 from public.lookup_session_targets t where t.snapshot_id=s.id and t.target_status is distinct from 'lookup_done')
order by s.id limit greatest(1,least(coalesce(p_limit,2000),5000));
$function$;
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
CREATE OR REPLACE FUNCTION private.kinojo_character_refresh_target_audit_v321(p_session_id text, p_target_id bigint, p_snapshot_id bigint, p_payload_id bigint, p_expected jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_target jsonb;
  v_snapshot jsonb;
  v_master jsonb;
  v_expected_name text := coalesce(p_expected->>'characterName', p_expected->>'character_name', '');
  v_expected_server text := coalesce(p_expected->>'serverId', p_expected->>'server_id', '');
  v_expected_class text := coalesce(p_expected->>'className', p_expected->>'class_name', '');
  v_expected_char_key text := coalesce(p_expected->>'charKey', p_expected->>'char_key', '');
  v_expected_combat text := coalesce(p_expected->>'combatPower', p_expected->>'combat_power', '');
  v_expected_item text := coalesce(p_expected->>'itemLevel', p_expected->>'item_level', '');
  v_gear_type text := upper(coalesce(p_expected->>'gearType', p_expected->>'gear_type', 'PVE'));
  v_actual text;
  v_target_status text;
  v_mismatches jsonb := '[]'::jsonb;
  v_checked integer := 0;
  v_master_combat_keys text[];
  v_master_item_keys text[];
begin
  if coalesce(trim(p_session_id), '') = '' or p_target_id is null then
    return jsonb_build_object('ok', false, 'code', 'AUDIT_TARGET_REQUIRED', 'checkedCount', 0, 'mismatchCount', 0);
  end if;

  select to_jsonb(t) into v_target
  from public.lookup_session_targets t
  where t.id = p_target_id and t.session_id = p_session_id
  limit 1;

  if p_snapshot_id is not null then
    select to_jsonb(s)-'retained_parser_stats_v504' into v_snapshot
    from public.lookup_snapshots s
    where s.id = p_snapshot_id and s.session_id = p_session_id
    limit 1;
  end if;

  if nullif(v_expected_char_key, '') is not null or (nullif(v_expected_name, '') is not null and nullif(v_expected_server, '') is not null) then
    select to_jsonb(cm) into v_master
    from public.character_master cm
    where (
      nullif(v_expected_char_key, '') is not null
      and coalesce(private.kinojo_json_find_text_v321(to_jsonb(cm), array['char_key','charKey']), '') = v_expected_char_key
    ) or (
      nullif(v_expected_name, '') is not null
      and nullif(v_expected_server, '') is not null
      and private.kinojo_normalize_compare_text_v321(
        private.kinojo_json_find_text_v321(to_jsonb(cm), array['character_name','characterName'])
      ) = private.kinojo_normalize_compare_text_v321(v_expected_name)
      and coalesce(private.kinojo_json_find_text_v321(to_jsonb(cm), array['server_id','serverId']), '') = v_expected_server
    )
    order by case when nullif(v_expected_char_key, '') is not null
      and coalesce(private.kinojo_json_find_text_v321(to_jsonb(cm), array['char_key','charKey']), '') = v_expected_char_key
      then 0 else 1 end
    limit 1;
  end if;

  if v_target is null then
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('source','target','field','row','expected','present','actual','missing'));
  else
    v_checked := v_checked + 3;
    v_target_status := lower(coalesce(private.kinojo_json_find_text_v321(v_target, array['target_status','status']), ''));
    if v_target_status not in ('completed','complete','done','success','succeeded','finalized') then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('source','target','field','status','expected','completed','actual',v_target_status));
    end if;
    v_actual := private.kinojo_json_find_text_v321(v_target, array['snapshot_id','snapshotId']);
    if p_snapshot_id is not null and coalesce(v_actual, '') <> p_snapshot_id::text then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('source','target','field','snapshotId','expected',p_snapshot_id,'actual',v_actual));
    end if;
    v_actual := private.kinojo_json_find_text_v321(v_target, array['payload_id','payloadId']);
    if p_payload_id is not null and coalesce(v_actual, '') <> p_payload_id::text then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('source','target','field','payloadId','expected',p_payload_id,'actual',v_actual));
    end if;
  end if;

  if v_snapshot is null then
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('source','snapshot','field','row','expected','present','actual','missing'));
  else
    if nullif(v_expected_name, '') is not null then
      v_checked := v_checked + 1;
      v_actual := private.kinojo_json_find_text_v321(v_snapshot, array['characterName','character_name','officialName','official_name']);
      if private.kinojo_normalize_compare_text_v321(v_actual) <> private.kinojo_normalize_compare_text_v321(v_expected_name) then
        v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('source','snapshot','field','characterName','expected',v_expected_name,'actual',v_actual));
      end if;
    end if;
    if nullif(v_expected_server, '') is not null then
      v_checked := v_checked + 1;
      v_actual := private.kinojo_json_find_text_v321(v_snapshot, array['serverId','server_id']);
      if coalesce(v_actual, '') <> v_expected_server then
        v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('source','snapshot','field','serverId','expected',v_expected_server,'actual',v_actual));
      end if;
    end if;
    if nullif(v_expected_class, '') is not null then
      v_checked := v_checked + 1;
      v_actual := private.kinojo_json_find_text_v321(v_snapshot, array['className','class_name']);
      if private.kinojo_normalize_compare_text_v321(v_actual) <> private.kinojo_normalize_compare_text_v321(v_expected_class) then
        v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('source','snapshot','field','className','expected',v_expected_class,'actual',v_actual));
      end if;
    end if;
    if nullif(v_expected_char_key, '') is not null then
      v_checked := v_checked + 1;
      v_actual := private.kinojo_json_find_text_v321(v_snapshot, array['charKey','char_key']);
      if coalesce(v_actual, '') <> v_expected_char_key then
        v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('source','snapshot','field','charKey','expected',v_expected_char_key,'actual',v_actual));
      end if;
    end if;
    if nullif(v_expected_combat, '') is not null then
      v_checked := v_checked + 1;
      v_actual := private.kinojo_json_find_text_v321(v_snapshot, array['combatPower','combat_power','pveCombatPower','pve_combat_power','pvpCombatPower','pvp_combat_power']);
      if not private.kinojo_numeric_equal_v321(v_expected_combat, v_actual) then
        v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('source','snapshot','field','combatPower','expected',v_expected_combat,'actual',v_actual));
      end if;
    end if;
    if nullif(v_expected_item, '') is not null then
      v_checked := v_checked + 1;
      v_actual := private.kinojo_json_find_text_v321(v_snapshot, array['itemLevel','item_level','pveItemLevel','pve_item_level','pvpItemLevel','pvp_item_level']);
      if not private.kinojo_numeric_equal_v321(v_expected_item, v_actual) then
        v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('source','snapshot','field','itemLevel','expected',v_expected_item,'actual',v_actual));
      end if;
    end if;
  end if;

  if v_master is null then
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('source','master','field','row','expected','present','actual','missing'));
  else
    if nullif(v_expected_name, '') is not null then
      v_checked := v_checked + 1;
      v_actual := private.kinojo_json_find_text_v321(v_master, array['character_name','characterName']);
      if private.kinojo_normalize_compare_text_v321(v_actual) <> private.kinojo_normalize_compare_text_v321(v_expected_name) then
        v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('source','master','field','characterName','expected',v_expected_name,'actual',v_actual));
      end if;
    end if;
    if nullif(v_expected_server, '') is not null then
      v_checked := v_checked + 1;
      v_actual := private.kinojo_json_find_text_v321(v_master, array['server_id','serverId']);
      if coalesce(v_actual, '') <> v_expected_server then
        v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('source','master','field','serverId','expected',v_expected_server,'actual',v_actual));
      end if;
    end if;
    if nullif(v_expected_class, '') is not null then
      v_checked := v_checked + 1;
      v_actual := private.kinojo_json_find_text_v321(v_master, array['class_name','className']);
      if private.kinojo_normalize_compare_text_v321(v_actual) <> private.kinojo_normalize_compare_text_v321(v_expected_class) then
        v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('source','master','field','className','expected',v_expected_class,'actual',v_actual));
      end if;
    end if;
    if nullif(v_expected_char_key, '') is not null then
      v_checked := v_checked + 1;
      v_actual := private.kinojo_json_find_text_v321(v_master, array['char_key','charKey']);
      if coalesce(v_actual, '') <> v_expected_char_key then
        v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('source','master','field','charKey','expected',v_expected_char_key,'actual',v_actual));
      end if;
    end if;

    if v_gear_type = 'PVP' then
      v_master_combat_keys := array['pvp_combat_power','pvpCombatPower'];
      v_master_item_keys := array['pvp_item_level','pvpItemLevel'];
    else
      v_master_combat_keys := array['pve_combat_power','pveCombatPower'];
      v_master_item_keys := array['pve_item_level','pveItemLevel'];
    end if;

    if nullif(v_expected_combat, '') is not null then
      v_actual := private.kinojo_json_find_text_v321(v_master, v_master_combat_keys);
      if nullif(v_actual, '') is not null then
        v_checked := v_checked + 1;
        if not private.kinojo_numeric_equal_v321(v_expected_combat, v_actual) then
          v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('source','master','field',lower(v_gear_type)||'CombatPower','expected',v_expected_combat,'actual',v_actual));
        end if;
      end if;
    end if;
    if nullif(v_expected_item, '') is not null then
      v_actual := private.kinojo_json_find_text_v321(v_master, v_master_item_keys);
      if nullif(v_actual, '') is not null then
        v_checked := v_checked + 1;
        if not private.kinojo_numeric_equal_v321(v_expected_item, v_actual) then
          v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('source','master','field',lower(v_gear_type)||'ItemLevel','expected',v_expected_item,'actual',v_actual));
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'mode', 'OBSERVE_ONLY',
    'checkedCount', v_checked,
    'mismatchCount', jsonb_array_length(v_mismatches),
    'mismatches', v_mismatches,
    'targetFound', v_target is not null,
    'snapshotFound', v_snapshot is not null,
    'masterFound', v_master is not null,
    'targetId', p_target_id,
    'snapshotId', p_snapshot_id,
    'payloadId', p_payload_id
  );
end;
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
  if tg_op='UPDATE' and old.retained_parser_stats_v504 is null and new.retained_parser_stats_v504 is not null
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
  if tg_op='UPDATE' and old.retained_parser_stats_v504 is null and new.retained_parser_stats_v504 is not null
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
CREATE FUNCTION private.kinojo_snapshot_text_cleanup_v504(p_dry_run boolean DEFAULT true,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog'
SET statement_timeout TO '15s' SET lock_timeout TO '500ms'
AS $function$
declare v_ids bigint[];v_count integer;
begin
 if not pg_try_advisory_xact_lock(501,501) then return jsonb_build_object('ok',true,'busy',true,'compacted',0);end if;
 begin
  lock table public.lookup_snapshots in share row exclusive mode nowait;
  lock table public.character_master,public.character_skill_current_state,public.character_stat_sources,private.character_snapshot_requests,public.updater_sessions,public.lookup_session_targets,public.extension_character_payloads in share mode nowait;
 exception when lock_not_available then return jsonb_build_object('ok',true,'busy',true,'compacted',0);end;
 select array_agg(s.id) into v_ids from public.lookup_snapshots s join private.kinojo_snapshot_text_candidates_v504(0,least(50,greatest(1,coalesce(p_limit,50)))) c on c.id=s.id;
 if coalesce(array_length(v_ids,1),0)=0 then return jsonb_build_object('ok',true,'candidates',0,'compacted',0);end if;
 if p_dry_run then return jsonb_build_object('ok',true,'candidates',array_length(v_ids,1),'compacted',0);end if;
 with locked as materialized (select s.* from public.lookup_snapshots s where s.id=any(v_ids) for update skip locked)
 update public.lookup_snapshots s set
  retained_parser_stats_v504=jsonb_build_object('characterName',x.character_name,'stats',public.kinojo_extract_aion_stats_from_text(public.kinojo_snapshot_parser_text(x.raw_payload),x.character_name,null)),
  raw_payload=private.kinojo_snapshot_text_v504(x.raw_payload)
 from locked x where s.id=x.id;
 get diagnostics v_count=row_count;
 return jsonb_build_object('ok',true,'candidates',array_length(v_ids,1),'compacted',v_count);
end;$function$;
CREATE OR REPLACE FUNCTION private.kinojo_snapshot_raw_cleanup_v501(p_dry_run boolean DEFAULT true,p_limit integer DEFAULT 2000)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'pg_catalog' SET statement_timeout TO '15s' SET lock_timeout TO '500ms'
AS $function$select private.kinojo_snapshot_text_cleanup_v504(p_dry_run,least(50,p_limit));$function$;

revoke all on function private.kinojo_snapshot_text_v504(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.kinojo_snapshot_text_candidates_v504(bigint,integer) from public,anon,authenticated,service_role;
revoke all on function private.kinojo_snapshot_text_cleanup_v504(boolean,integer) from public,anon,authenticated,service_role;
commit;
