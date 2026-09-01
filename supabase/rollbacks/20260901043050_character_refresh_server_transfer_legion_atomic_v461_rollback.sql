-- Rollback for DB461: restore the pre-DB461 identity apply function exactly as read from production.
-- Captured before applying 20260901043050_character_refresh_server_transfer_legion_atomic_v461.

CREATE OR REPLACE FUNCTION public.kinojo_character_identity_recovery_apply_v1(p_session_id text, p_session_token text, p_target_id bigint, p_candidate jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_auth jsonb;
  v_target public.lookup_session_targets%rowtype;
  v_character public.character_master%rowtype;
  v_candidate jsonb := coalesce(p_candidate, '{}'::jsonb);
  v_char_key text := nullif(trim(coalesce(v_candidate->>'charKey', v_candidate->>'char_key', '')), '');
  v_server_id integer := public.kinojo_meter_int_50010(coalesce(v_candidate->>'serverId', v_candidate->>'server_id'));
  v_server_name text := nullif(trim(coalesce(v_candidate->>'serverName', v_candidate->>'server_name', '')), '');
  v_name text := nullif(trim(coalesce(v_candidate->>'characterName', v_candidate->>'character_name', v_candidate->>'name', '')), '');
  v_detail_url text := nullif(trim(coalesce(v_candidate->>'detailUrl', v_candidate->>'detail_url', '')), '');
  v_profile_image text := nullif(trim(coalesce(v_candidate->>'profileImageUrl', v_candidate->>'profile_image_url', '')), '');
  v_change_type text;
  v_conflict_id bigint;
  v_server_short_name text;
  v_list_display_name text;
  v_main_renamed boolean := false;
begin
  v_auth := public.kinojo_validate_updater_session(p_session_id, p_session_token);
  if coalesce((v_auth->>'ok')::boolean, false) is false then
    return jsonb_build_object('ok', false, 'code', coalesce(v_auth->>'code', 'INVALID_SESSION'), 'message', coalesce(v_auth->>'message', '유효한 조회 세션이 아닙니다.'));
  end if;

  select * into v_target
  from public.lookup_session_targets
  where id = p_target_id and session_id = p_session_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'TARGET_NOT_FOUND', 'message', '복구할 조회 Target을 찾지 못했습니다.');
  end if;

  select * into v_character
  from public.character_master cm
  where cm.server_id = v_target.server_id
    and public.kinojo_character_identity_key_v298(cm.character_name) = public.kinojo_character_identity_key_v298(v_target.character_name)
  order by cm.updated_at desc nulls last
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'LEGION_CHARACTER_NOT_FOUND', 'message', '기존 레기온 character_master 행을 찾지 못했습니다.');
  end if;

  if v_char_key is null or nullif(trim(v_character.char_key), '') is null or v_char_key <> trim(v_character.char_key) then
    insert into public.character_identity_recovery_attempts(
      session_id, target_id, character_id, char_key,
      previous_server_id, previous_character_name,
      candidate_server_id, candidate_character_name,
      recovery_status, message, evidence
    ) values (
      p_session_id, p_target_id, v_character.id, v_char_key,
      v_character.server_id, v_character.character_name,
      v_server_id, v_name,
      'CHAR_KEY_MISMATCH', '후보 캐릭터의 고유값이 기존 character_master와 일치하지 않습니다.', v_candidate
    );
    return jsonb_build_object('ok', false, 'code', 'CHAR_KEY_MISMATCH', 'message', '동일 캐릭터임을 확인할 수 없어 기존 값을 유지합니다.');
  end if;

  if v_server_id is null or v_name is null then
    return jsonb_build_object('ok', false, 'code', 'RECOVERY_IDENTITY_REQUIRED', 'message', '복구 후보의 현재 서버와 캐릭터명이 필요합니다.');
  end if;
  if not exists(select 1 from public.server_master where server_id = v_server_id and coalesce(is_active, true) is true) then
    return jsonb_build_object('ok', false, 'code', 'UNKNOWN_SERVER', 'message', 'Server Master에 없는 서버입니다.');
  end if;
  select server_name, server_short_name into v_server_name, v_server_short_name
  from public.server_master where server_id = v_server_id;
  v_list_display_name := case when v_server_id = 2002 then v_name else v_name || '[' || coalesce(v_server_short_name, v_server_name, v_server_id::text) || ']' end;

  select id into v_conflict_id
  from public.character_master cm
  where cm.id <> v_character.id
    and cm.server_id = v_server_id
    and public.kinojo_character_identity_key_v298(cm.character_name) = public.kinojo_character_identity_key_v298(v_name)
    and coalesce(cm.is_active, true) is true
  limit 1;
  if v_conflict_id is not null then
    return jsonb_build_object('ok', false, 'code', 'TARGET_IDENTITY_CONFLICT', 'message', '변경될 서버/캐릭터명에 이미 다른 character_master 행이 존재합니다. 자동 변경하지 않습니다.', 'conflictCharacterId', v_conflict_id);
  end if;

  v_change_type := case
    when v_character.server_id is distinct from v_server_id
     and public.kinojo_character_identity_key_v298(v_character.character_name) <> public.kinojo_character_identity_key_v298(v_name)
      then 'SERVER_TRANSFER_AND_RENAME'
    when v_character.server_id is distinct from v_server_id then 'SERVER_TRANSFER'
    when public.kinojo_character_identity_key_v298(v_character.character_name) <> public.kinojo_character_identity_key_v298(v_name) then 'CHARACTER_RENAME'
    else 'RESTORED_BY_CHAR_KEY'
  end;

  v_main_renamed := coalesce(v_character.is_main, false) is true
    and public.kinojo_character_identity_key_v298(v_character.character_name) <> public.kinojo_character_identity_key_v298(v_name);

  insert into public.character_identity_change_history(
    character_id, char_key,
    previous_server_id, previous_server_name, previous_character_name,
    current_server_id, current_server_name, current_character_name,
    change_type, source, session_id, target_id, evidence
  ) values (
    v_character.id, v_char_key,
    v_character.server_id, v_character.server_name, v_character.character_name,
    v_server_id, v_server_name, v_name,
    v_change_type, 'CHAR_KEY_RECOVERY', p_session_id, p_target_id, v_candidate
  );

  if v_main_renamed then
    update public.character_master
       set main_character_name = v_name, updated_at = now()
     where public.kinojo_character_identity_key_v298(main_character_name) = public.kinojo_character_identity_key_v298(v_character.character_name);
    update public.member_codes
       set main_character_name = v_name, updated_at = now()
     where public.kinojo_character_identity_key_v298(main_character_name) = public.kinojo_character_identity_key_v298(v_character.character_name);
  end if;

  update public.character_master
     set previous_name = case
           when public.kinojo_character_identity_key_v298(character_name) <> public.kinojo_character_identity_key_v298(v_name)
             then character_name else previous_name end,
         renamed_to = case
           when public.kinojo_character_identity_key_v298(character_name) <> public.kinojo_character_identity_key_v298(v_name)
             then v_name else renamed_to end,
         server_id = v_server_id,
         server_name = v_server_name,
         character_name = v_name,
         detail_url = coalesce(v_detail_url, detail_url),
         profile_image_url = coalesce(v_profile_image, profile_image_url),
         status = 'OK',
         is_active = true,
         inactivated_at = null,
         inactive_reason = null,
         status_updated_at = now(),
         last_synced_at = now(),
         updated_at = now()
   where id = v_character.id;

  update public.lookup_session_targets
     set server_id = v_server_id,
         server_name = v_server_name,
         character_name = v_name,
         corrected = true,
         target_status = 'claimed',
         last_error = null,
         last_failure_code = null,
         last_failure_retryable = null,
         final_failed_at = null,
         updated_at = now()
   where id = p_target_id;

  insert into public.google_list_sheet_sync_queue(
    session_id, character_id, list_row, list_original_name,
    character_name, server_id, server_name, class_name,
    pve_item_level, pvp_item_level, pve_combat_power, pvp_combat_power,
    latest_power_total, latest_item_level_total,
    identity_changed, previous_character_name, previous_server_id, list_display_name, main_character_renamed,
    sync_status, created_at, updated_at
  ) values (
    p_session_id, v_character.id, v_target.list_row, coalesce(v_target.list_original_name, v_target.character_name),
    v_name, v_server_id, v_server_name, v_character.class_name,
    v_character.latest_pve_item_level, v_character.latest_pvp_item_level,
    v_character.latest_pve_combat_power, v_character.latest_pvp_combat_power,
    v_character.latest_power_total, v_character.latest_item_level_total,
    true, v_character.character_name, v_character.server_id, v_list_display_name, v_main_renamed,
    'queued', now(), now()
  );

  insert into public.character_identity_recovery_attempts(
    session_id, target_id, character_id, char_key,
    previous_server_id, previous_character_name,
    candidate_server_id, candidate_character_name,
    recovery_status, message, evidence
  ) values (
    p_session_id, p_target_id, v_character.id, v_char_key,
    v_character.server_id, v_character.character_name,
    v_server_id, v_name,
    'APPLIED', v_change_type, v_candidate
  );

  return jsonb_build_object(
    'ok', true,
    'applied', true,
    'changeType', v_change_type,
    'characterId', v_character.id,
    'charKey', v_char_key,
    'previous', jsonb_build_object('serverId', v_character.server_id, 'serverName', v_character.server_name, 'characterName', v_character.character_name),
    'current', jsonb_build_object('serverId', v_server_id, 'serverName', v_server_name, 'characterName', v_name, 'detailUrl', v_detail_url, 'profileImageUrl', v_profile_image),
    'listSyncQueued', true
  );
end;
$function$;

revoke all on function public.kinojo_character_identity_recovery_apply_v1(text, text, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.kinojo_character_identity_recovery_apply_v1(text, text, bigint, jsonb)
  to postgres, service_role;

comment on function public.kinojo_character_identity_recovery_apply_v1(text, text, bigint, jsonb)
is '서버+이름 조회 실패 후 기존 char_key와 정확히 일치하는 후보에 한해 기존 레기온 character_master 동일 행을 갱신한다.';
