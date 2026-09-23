-- Restore future full event writes only. Removed JSON keys require the private encrypted backup.
-- Existing event IDs, scalar values and all compacted rows remain untouched.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='15s';
CREATE OR REPLACE FUNCTION public.kinojo_master_sync_payload(p_payload_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payload public.extension_character_payloads%rowtype;
  v_character_name text;
  v_main_name text;
  v_is_main boolean;
  v_old jsonb;
  v_after jsonb;
  v_history_date int;
  v_power_total int;
  v_item_total int;
  v_changed boolean := false;
  v_diagnosis jsonb;
  v_mode text;
  v_item int;
  v_power int;
  v_character_id bigint;
  v_snapshot_id bigint;
  v_target public.lookup_session_targets%rowtype;
  v_target_id bigint;
  v_server_id integer;
begin
  select * into v_payload
    from public.extension_character_payloads
   where id = p_payload_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'PAYLOAD_NOT_FOUND', 'message', 'payload를 찾을 수 없습니다.');
  end if;

  if coalesce(v_payload.master_sync_status, '') = 'synced' then
    return jsonb_build_object('ok', true, 'skipped', true, 'payloadId', p_payload_id, 'message', '이미 Master Sync 처리된 payload입니다.');
  end if;

  v_target_id := public.kinojo_json_int(v_payload.raw_payload, 'targetId', 'target_id');
  if v_target_id is not null then
    select * into v_target
    from public.lookup_session_targets t
    where t.id = v_target_id
      and t.session_id = v_payload.session_id
    limit 1;
  end if;

  if v_target.id is null and v_payload.lookup_order is not null then
    select * into v_target
    from public.lookup_session_targets t
    where t.session_id = v_payload.session_id
      and t.lookup_order = v_payload.lookup_order
    order by t.id
    limit 1;
  end if;

  if v_target.id is null then
    update public.extension_character_payloads
       set master_sync_status = 'failed',
           master_sync_message = 'TARGET_IDENTITY_NOT_FOUND: 조회 Target을 확인하지 못해 Master 갱신을 차단했습니다.',
           master_synced_at = now()
     where id = p_payload_id;
    return jsonb_build_object('ok', false, 'retryable', false, 'code', 'TARGET_IDENTITY_NOT_FOUND', 'payloadId', p_payload_id, 'message', '조회 Target을 확인하지 못해 Master 갱신을 차단했습니다.');
  end if;

  v_server_id := v_target.server_id;
  if coalesce(v_payload.server_id, v_server_id) <> v_server_id
     or public.kinojo_character_identity_key_v298(v_payload.character_name)
        <> public.kinojo_character_identity_key_v298(v_target.character_name) then
    update public.extension_character_payloads
       set master_sync_status = 'failed',
           master_sync_message = 'TARGET_IDENTITY_MISMATCH: Payload와 조회 Target의 캐릭터/서버가 다릅니다.',
           master_synced_at = now()
     where id = p_payload_id;
    return jsonb_build_object(
      'ok', false,
      'retryable', false,
      'code', 'TARGET_IDENTITY_MISMATCH',
      'payloadId', p_payload_id,
      'targetId', v_target.id,
      'targetCharacterName', v_target.character_name,
      'targetServerId', v_target.server_id,
      'payloadCharacterName', v_payload.character_name,
      'payloadServerId', v_payload.server_id,
      'message', 'Payload와 조회 Target의 캐릭터/서버가 달라 Master 갱신을 차단했습니다.'
    );
  end if;

  v_character_name := v_target.character_name;
  if v_character_name is null then
    update public.extension_character_payloads
       set master_sync_status = 'failed',
           master_sync_message = '캐릭터명이 없습니다.',
           master_synced_at = now()
     where id = p_payload_id;
    return jsonb_build_object('ok', false, 'code', 'MISSING_CHARACTER_NAME', 'message', '캐릭터명이 없습니다.', 'payloadId', p_payload_id);
  end if;

  v_diagnosis := public.kinojo_payload_gear_diagnosis(p_payload_id);
  v_mode := coalesce(public.kinojo_json_text(v_diagnosis, 'detectedGearType'), 'UNKNOWN');
  v_item := public.kinojo_json_int(v_diagnosis, 'itemLevel');
  v_power := public.kinojo_json_int(v_diagnosis, 'combatPower');
  v_snapshot_id := public.kinojo_json_int(v_diagnosis, 'snapshotId');

  if v_mode not in ('PVE', 'PVP') or v_item is null or v_power is null then
    update public.extension_character_payloads
       set master_sync_status = 'failed',
           master_sync_message = 'GEAR_TYPE_UNKNOWN: PVE/PVP 근거가 불완전하여 Master 값을 갱신하지 않았습니다.',
           master_synced_at = now(),
           gear_type = 'UNKNOWN',
           gear_parse_status = coalesce(public.kinojo_json_text(v_diagnosis, 'gearParseStatus'), 'UNKNOWN'),
           gear_evidence = coalesce(v_diagnosis -> 'gearEvidence', '{}'::jsonb)
     where id = p_payload_id;

    return jsonb_build_object(
      'ok', false,
      'retryable', false,
      'code', 'GEAR_TYPE_UNKNOWN',
      'payloadId', p_payload_id,
      'characterName', v_character_name,
      'diagnosis', v_diagnosis,
      'message', 'PVE/PVP 판정 근거가 불완전하여 기존 PVE/PVP 값을 보존했습니다.'
    );
  end if;

  update public.extension_character_payloads
     set gear_type = v_mode,
         gear_parse_status = 'CONFIRMED',
         gear_evidence = coalesce(v_diagnosis -> 'gearEvidence', '{}'::jsonb),
         source_snapshot_id = coalesce(v_snapshot_id, source_snapshot_id),
         pve_item_level = case when v_mode = 'PVE' then v_item else null end,
         pve_combat_power = case when v_mode = 'PVE' then v_power else null end,
         pvp_item_level = case when v_mode = 'PVP' then v_item else null end,
         pvp_combat_power = case when v_mode = 'PVP' then v_power else null end
   where id = p_payload_id
   returning * into v_payload;

  v_main_name := coalesce(
    public.kinojo_strip_server_suffix(v_payload.main_character_name),
    public.kinojo_strip_server_suffix(public.kinojo_json_text(v_payload.raw_payload, 'mainCharacterName', 'main_character_name', 'owner', 'main')),
    v_character_name
  );
  v_is_main := public.kinojo_character_identity_key_v298(v_character_name) = public.kinojo_character_identity_key_v298(v_main_name);
  v_history_date := to_char(now() at time zone 'Asia/Seoul', 'YYMMDD')::int;

  select to_jsonb(cm) into v_old
    from public.character_master cm
   where cm.server_id = v_server_id
     and cm.character_name = v_character_name;

  insert into public.character_master (
    server_id, server_name, character_name, char_key, profile_image_url, detail_url, status,
    main_character_name, is_main, class_name, first_seen_at, last_seen_at,
    latest_pve_item_level, latest_pve_combat_power, latest_pvp_item_level, latest_pvp_combat_power,
    latest_item_level_total, latest_power_total, latest_session_id, latest_payload_id,
    latest_snapshot_uid, latest_payload_hash, last_synced_at, sync_status
  ) values (
    v_server_id,
    coalesce(v_target.server_name, v_payload.server_name, public.kinojo_server_name_by_id(v_server_id)),
    v_character_name,
    v_payload.char_key,
    v_payload.profile_image_url,
    v_payload.detail_url,
    coalesce(public.kinojo_json_text(v_payload.raw_payload, 'status', 'crawlStatus'), 'OK'),
    v_main_name,
    v_is_main,
    v_payload.class_name,
    now(),
    now(),
    case when v_mode = 'PVE' then v_item end,
    case when v_mode = 'PVE' then v_power end,
    case when v_mode = 'PVP' then v_item end,
    case when v_mode = 'PVP' then v_power end,
    v_item,
    v_power,
    v_payload.session_id,
    v_payload.id,
    v_payload.snapshot_uid,
    v_payload.payload_hash,
    now(),
    'synced'
  )
  on conflict (server_id, character_name) do update set
    server_name = coalesce(excluded.server_name, public.character_master.server_name),
    char_key = coalesce(excluded.char_key, public.character_master.char_key),
    profile_image_url = coalesce(excluded.profile_image_url, public.character_master.profile_image_url),
    detail_url = coalesce(excluded.detail_url, public.character_master.detail_url),
    status = coalesce(excluded.status, public.character_master.status),
    main_character_name = coalesce(excluded.main_character_name, public.character_master.main_character_name),
    is_main = excluded.is_main,
    class_name = coalesce(excluded.class_name, public.character_master.class_name),
    latest_pve_item_level = case when v_mode = 'PVE' then v_item else public.character_master.latest_pve_item_level end,
    latest_pve_combat_power = case when v_mode = 'PVE' then v_power else public.character_master.latest_pve_combat_power end,
    latest_pvp_item_level = case when v_mode = 'PVP' then v_item else public.character_master.latest_pvp_item_level end,
    latest_pvp_combat_power = case when v_mode = 'PVP' then v_power else public.character_master.latest_pvp_combat_power end,
    latest_item_level_total =
      coalesce(case when v_mode = 'PVE' then v_item else public.character_master.latest_pve_item_level end, 0)
      + coalesce(case when v_mode = 'PVP' then v_item else public.character_master.latest_pvp_item_level end, 0),
    latest_power_total =
      coalesce(case when v_mode = 'PVE' then v_power else public.character_master.latest_pve_combat_power end, 0)
      + coalesce(case when v_mode = 'PVP' then v_power else public.character_master.latest_pvp_combat_power end, 0),
    latest_session_id = excluded.latest_session_id,
    latest_payload_id = excluded.latest_payload_id,
    latest_snapshot_uid = excluded.latest_snapshot_uid,
    latest_payload_hash = excluded.latest_payload_hash,
    last_seen_at = now(),
    last_synced_at = now(),
    sync_status = 'synced'
  returning id into v_character_id;

  insert into public.character_stat_sources (
    character_id, gear_type, item_level, combat_power, payload_id, snapshot_id,
    parser_version, parse_status, evidence, detected_at
  ) values (
    v_character_id,
    v_mode,
    v_item,
    v_power,
    v_payload.id,
    v_snapshot_id,
    public.kinojo_json_text(v_diagnosis, 'parserVersion'),
    'CONFIRMED',
    coalesce(v_diagnosis -> 'gearEvidence', '{}'::jsonb),
    coalesce(v_payload.received_at, now())
  )
  on conflict (character_id, gear_type) do update set
    item_level = excluded.item_level,
    combat_power = excluded.combat_power,
    payload_id = excluded.payload_id,
    snapshot_id = excluded.snapshot_id,
    parser_version = excluded.parser_version,
    parse_status = excluded.parse_status,
    evidence = excluded.evidence,
    detected_at = excluded.detected_at;

  if not exists (
    select 1 from public.character_history h
     where h.session_id = v_payload.session_id
       and coalesce(h.server_id, 2002) = v_server_id
       and h.character_name = v_character_name
       and h.record_type = 'POWER'
  ) then
    insert into public.character_history (
      character_master_id, source_payload_id,
      history_date, character_name, record_type, gear_type,
      pve_item_level, pve_combat_power, pvp_item_level, pvp_combat_power,
      status, session_id, server_id, server_name, updated_at_sheet, memo
    ) values (
      v_character_id, v_payload.id,
      v_history_date,
      v_character_name,
      'POWER',
      v_mode,
      case when v_mode = 'PVE' then v_item end,
      case when v_mode = 'PVE' then v_power end,
      case when v_mode = 'PVP' then v_item end,
      case when v_mode = 'PVP' then v_power end,
      coalesce(public.kinojo_json_text(v_payload.raw_payload, 'status', 'crawlStatus'), 'OK'),
      v_payload.session_id,
      v_server_id,
      coalesce(v_target.server_name, v_payload.server_name, public.kinojo_server_name_by_id(v_server_id)),
      now(),
      '258 Master Sync · ' || v_mode || ' · ' || coalesce(public.kinojo_json_text(v_diagnosis, 'gearReasonCode'), '')
    );
    v_changed := true;
  end if;

  update public.extension_character_payloads
     set intake_status = 'master_synced',
         master_sync_status = 'synced',
         master_sync_message = 'Master Sync 완료 · ' || v_mode,
         master_synced_at = now()
   where id = p_payload_id;

  select to_jsonb(cm), cm.latest_power_total, cm.latest_item_level_total
    into v_after, v_power_total, v_item_total
    from public.character_master cm
   where cm.id = v_character_id;

  insert into public.master_sync_events (
    session_id, payload_id, character_name, main_character_name, event_type, status, message,
    before_data, after_data, raw_payload
  ) values (
    v_payload.session_id,
    v_payload.id,
    v_character_name,
    v_main_name,
    case when v_old is null then 'insert_master' else 'update_master' end,
    'synced',
    'Master Sync 완료 · ' || v_mode,
    coalesce(v_old, '{}'::jsonb),
    coalesce(v_after, '{}'::jsonb),
    v_payload.raw_payload || jsonb_build_object('gearDiagnosis', v_diagnosis)
  );

  return jsonb_build_object(
    'ok', true,
    'payloadId', p_payload_id,
    'targetId', v_target.id,
    'listOriginalName', coalesce(v_target.list_original_name, v_target.character_name),
    'serverId', v_server_id,
    'characterName', v_character_name,
    'mainCharacterName', v_main_name,
    'isMain', v_is_main,
    'gearType', v_mode,
    'historyInserted', v_changed,
    'latestPowerTotal', v_power_total,
    'latestItemLevelTotal', v_item_total,
    'diagnosis', v_diagnosis,
    'message', 'Master Sync 완료'
  );
end;
$function$;

drop function private.kinojo_master_event_raw_v499(jsonb);
drop function private.kinojo_master_event_state_v499(jsonb);
commit;

