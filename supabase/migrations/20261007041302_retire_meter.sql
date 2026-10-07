-- SQL530: Permanently retire the Meter product, explicitly authorized without backups.
-- Preserve shared identity behavior; removal is intentionally irreversible.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

CREATE OR REPLACE FUNCTION public.kinojo_parse_nonnegative_int_v530(p_value text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_numeric numeric;
begin
  if nullif(trim(coalesce(p_value, '')), '') !~ '^[0-9]{1,10}$' then return null; end if;
  v_numeric := trim(p_value)::numeric;
  if v_numeric < 0 or v_numeric > 2147483647 then return null; end if;
  return v_numeric::integer;
exception when numeric_value_out_of_range or invalid_text_representation then
  return null;
end;
$function$;


-- Remove only retired page targeting; other page assignments and shared assets remain.
delete from public.kinojo_banner_campaigns where page_code='METER';
delete from public.kinojo_banner_auto_pools_v407 where target_pages=array['METER']::text[];
update public.kinojo_banner_auto_pools_v407 set target_pages=array_remove(target_pages,'METER') where 'METER'=any(target_pages);
delete from private.kinojo_banner_event_groups_v391 where target_pages=array['METER']::text[];
update private.kinojo_banner_event_groups_v391 set target_pages=array_remove(target_pages,'METER') where 'METER'=any(target_pages);

CREATE OR REPLACE FUNCTION public.kinojo_visit_page_key_266(p_page_key text, p_page_url text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare v text:=lower(coalesce(p_page_url,'')); k text:=lower(trim(coalesce(p_page_key,'')));
begin
 if v ~ '/sanctuary-schedule/' then return 'sanctuary-schedule';
 elsif v ~ '/sanctuary/' then return 'sanctuary';
 elsif v ~ '/admin/' then return 'admin';
 elsif v ~ '/(hof|hall-of-fame)/' then return 'hall';
 elsif v ~ '/ranking/' then return 'ranking';
 elsif v ~ '/arcana/' then return 'arcana';
 elsif v ~ '/pages/' then return 'pages';
 elsif k in ('home','hall','ranking','sanctuary','sanctuary-schedule','arcana','admin','pages') then return k;
 else return coalesce(nullif(regexp_replace(k,'[^a-z0-9_-]','','g'),''),'home'); end if;
end $function$;

CREATE OR REPLACE FUNCTION public.kinojo_character_identity_recovery_apply_v1(p_session_id text, p_session_token text, p_target_id bigint, p_candidate jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
 SET statement_timeout TO '5s'
 SET lock_timeout TO '500ms'
AS $function$
declare
  v_auth jsonb;
  v_target public.lookup_session_targets%rowtype;
  v_character public.character_master%rowtype;
  v_candidate jsonb := coalesce(p_candidate, '{}'::jsonb);
  v_char_key text := nullif(trim(coalesce(v_candidate->>'charKey', v_candidate->>'char_key', '')), '');
  v_server_id integer := public.kinojo_parse_nonnegative_int_v530(coalesce(v_candidate->>'serverId', v_candidate->>'server_id'));
  v_server_name text := nullif(trim(coalesce(v_candidate->>'serverName', v_candidate->>'server_name', '')), '');
  v_name text := nullif(trim(coalesce(v_candidate->>'characterName', v_candidate->>'character_name', v_candidate->>'name', '')), '');
  v_detail_url text := nullif(trim(coalesce(v_candidate->>'detailUrl', v_candidate->>'detail_url', '')), '');
  v_profile_image text := nullif(trim(coalesce(v_candidate->>'profileImageUrl', v_candidate->>'profile_image_url', '')), '');
  v_change_type text;
  v_conflict_id bigint;
  v_server_short_name text;
  v_list_display_name text;
  v_main_renamed boolean := false;
  v_server_transferred boolean := false;
  v_previous_race_id integer;
  v_candidate_race_id integer;
  v_previous_legion_name text;
  v_assignment_legion_name text;
  v_assignment_removed_count integer := 0;
  v_legion_tree_revisions jsonb := '{}'::jsonb;
  v_evidence jsonb;
begin
  v_auth := public.kinojo_validate_updater_session(p_session_id, p_session_token);
  if coalesce((v_auth->>'ok')::boolean, false) is false then
    return jsonb_build_object(
      'ok', false,
      'code', coalesce(v_auth->>'code', 'INVALID_SESSION'),
      'message', coalesce(v_auth->>'message', '유효한 조회 세션이 아닙니다.')
    );
  end if;

  select *
    into v_target
    from public.lookup_session_targets
   where id = p_target_id
     and session_id = p_session_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'TARGET_NOT_FOUND', 'message', '복구할 조회 Target을 찾지 못했습니다.');
  end if;

  select *
    into v_character
    from public.character_master cm
   where cm.server_id = v_target.server_id
     and public.kinojo_character_identity_key_v298(cm.character_name)
       = public.kinojo_character_identity_key_v298(v_target.character_name)
   order by cm.updated_at desc nulls last
   limit 1
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'LEGION_CHARACTER_NOT_FOUND', 'message', '기존 레기온 character_master 행을 찾지 못했습니다.');
  end if;

  -- Candidate must still refer to the source identity seen before external collection.
  if not ((v_character.server_id=v_server_id and v_character.character_name=v_name)
    or (v_candidate->>'sourceServerId'=v_character.server_id::text
        and v_candidate->>'sourceCharacterName'=v_character.character_name)) then
    return jsonb_build_object('ok',false,'code','STALE_IDENTITY_SOURCE');
  end if;
  if v_char_key is null
     or nullif(trim(v_character.char_key), '') is null
     or v_char_key <> trim(v_character.char_key) then
    insert into public.character_identity_recovery_attempts(
      session_id, target_id, character_id, char_key,
      previous_server_id, previous_character_name,
      candidate_server_id, candidate_character_name,
      recovery_status, message, evidence
    ) values (
      p_session_id, p_target_id, v_character.id, v_char_key,
      v_character.server_id, v_character.character_name,
      v_server_id, v_name,
      'CHAR_KEY_MISMATCH', '후보 캐릭터의 고유값이 기존 character_master와 일치하지 않습니다.',
      v_candidate || jsonb_build_object('serverTransferApplied', false, 'legionMutationApplied', false)
    );
    return jsonb_build_object('ok', false, 'code', 'CHAR_KEY_MISMATCH', 'message', '동일 캐릭터임을 확인할 수 없어 기존 값을 유지합니다.');
  end if;

  if public.kinojo_normalize_aion_class_name(v_character.class_name) is null
     or public.kinojo_normalize_aion_class_name(v_character.class_name)
       is distinct from public.kinojo_normalize_aion_class_name(v_candidate->>'className') then
    return jsonb_build_object('ok',false,'code','CLASS_MISMATCH');
  end if;

  if v_server_id is null or v_name is null then
    return jsonb_build_object('ok', false, 'code', 'RECOVERY_IDENTITY_REQUIRED', 'message', '복구 후보의 현재 서버와 캐릭터명이 필요합니다.');
  end if;

  select sm.server_name, sm.server_short_name, sm.race_id
    into v_server_name, v_server_short_name, v_candidate_race_id
    from public.server_master sm
   where sm.server_id = v_server_id
     and coalesce(sm.is_active, true) is true;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'UNKNOWN_SERVER', 'message', 'Server Master에 없는 서버입니다.');
  end if;

  select sm.race_id
    into v_previous_race_id
    from public.server_master sm
   where sm.server_id = v_character.server_id;
  if v_previous_race_id is null
     or v_candidate_race_id is null
     or v_previous_race_id is distinct from v_candidate_race_id then
    insert into public.character_identity_recovery_attempts(
      session_id, target_id, character_id, char_key,
      previous_server_id, previous_character_name,
      candidate_server_id, candidate_character_name,
      recovery_status, message, evidence
    ) values (
      p_session_id, p_target_id, v_character.id, v_char_key,
      v_character.server_id, v_character.character_name,
      v_server_id, v_name,
      'SERVER_RACE_MISMATCH', '기존 서버와 후보 서버의 종족이 달라 자동 이전을 적용하지 않습니다.',
      v_candidate || jsonb_build_object(
        'previousRaceId', v_previous_race_id,
        'candidateRaceId', v_candidate_race_id,
        'serverTransferApplied', false,
        'legionMutationApplied', false
      )
    );
    return jsonb_build_object(
      'ok', false,
      'code', 'SERVER_RACE_MISMATCH',
      'message', '기존 서버와 후보 서버의 종족이 달라 동일 캐릭터 서버 이전으로 확정할 수 없습니다.'
    );
  end if;

  v_list_display_name := case
    when v_server_id = 2002 then v_name
    else v_name || '[' || coalesce(v_server_short_name, v_server_name, v_server_id::text) || ']'
  end;

  select cm.id
    into v_conflict_id
    from public.character_master cm
   where cm.id <> v_character.id
     and cm.server_id = v_server_id
     and public.kinojo_character_identity_key_v298(cm.character_name)
       = public.kinojo_character_identity_key_v298(v_name)
     and coalesce(cm.is_active, true) is true
   limit 1;
  if v_conflict_id is not null then
    return jsonb_build_object(
      'ok', false,
      'code', 'TARGET_IDENTITY_CONFLICT',
      'message', '변경될 서버/캐릭터명에 이미 다른 character_master 행이 존재합니다. 자동 변경하지 않습니다.',
      'conflictCharacterId', v_conflict_id
    );
  end if;

  v_server_transferred := v_character.server_id is distinct from v_server_id;
  v_previous_legion_name := nullif(btrim(v_character.legion_name), '');
  v_change_type := case
    when v_server_transferred
     and public.kinojo_character_identity_key_v298(v_character.character_name)
       <> public.kinojo_character_identity_key_v298(v_name)
      then 'SERVER_TRANSFER_AND_RENAME'
    when v_server_transferred then 'SERVER_TRANSFER'
    when public.kinojo_character_identity_key_v298(v_character.character_name)
       <> public.kinojo_character_identity_key_v298(v_name)
      then 'CHARACTER_RENAME'
    else 'RESTORED_BY_CHAR_KEY'
  end;

  v_main_renamed := coalesce(v_character.is_main, false) is true
    and public.kinojo_character_identity_key_v298(v_character.character_name)
      <> public.kinojo_character_identity_key_v298(v_name);

  if v_server_transferred then
    select a.legion_name
      into v_assignment_legion_name
      from private.legion_tree_assignments a
     where a.character_id = v_character.id
     for update;

    perform 1
      from private.legion_tree_configs c
     where c.legion_name = any(array_remove(array[v_previous_legion_name, v_assignment_legion_name], null))
     order by c.legion_name
     for update;

    delete from private.legion_tree_assignments a
     where a.character_id = v_character.id;
    get diagnostics v_assignment_removed_count = row_count;

    with updated as (
      update private.legion_tree_configs c
         set revision = c.revision + 1,
             updated_at = now(),
             updated_by = 'SYSTEM_CHARACTER_SERVER_TRANSFER_V461'
       where c.legion_name = any(array_remove(array[v_previous_legion_name, v_assignment_legion_name], null))
       returning c.legion_name, c.revision
    )
    select coalesce(jsonb_object_agg(updated.legion_name, updated.revision), '{}'::jsonb)
      into v_legion_tree_revisions
      from updated;
  end if;

  v_evidence := v_candidate || jsonb_build_object(
    'serverTransferApplied', v_server_transferred,
    'previousLegionName', v_previous_legion_name,
    'legionCleared', v_server_transferred,
    'organizationAssignmentRemoved', v_assignment_removed_count > 0,
    'organizationAssignmentRemovedCount', v_assignment_removed_count,
    'legionTreeRevisions', v_legion_tree_revisions,
    'databaseContract', '461'
  );

  if v_character.server_id is distinct from v_server_id or v_character.character_name is distinct from v_name then
  insert into public.character_identity_change_history(
    character_id, char_key,
    previous_server_id, previous_server_name, previous_character_name,
    current_server_id, current_server_name, current_character_name,
    change_type, source, session_id, target_id, evidence
  ) values (
    v_character.id, v_char_key,
    v_character.server_id, v_character.server_name, v_character.character_name,
    v_server_id, v_server_name, v_name,
    v_change_type, 'CHAR_KEY_RECOVERY', p_session_id, p_target_id, v_evidence
  );
  end if;

  if v_main_renamed then
    update public.character_master set main_character_name=v_name,updated_at=now()
      where id=v_character.id or main_character_id=v_character.id;
    -- Legacy member linkage is name-only. Refuse cross-server namesake propagation.
    update public.member_codes set main_character_name=v_name,updated_at=now()
      where public.kinojo_character_identity_key_v298(main_character_name)
        =public.kinojo_character_identity_key_v298(v_character.character_name)
        and (select count(*) from public.character_master
          where public.kinojo_character_identity_key_v298(character_name)
            =public.kinojo_character_identity_key_v298(v_character.character_name))=1;
  end if;

  update public.character_master
     set previous_name = case
           when public.kinojo_character_identity_key_v298(character_name)
             <> public.kinojo_character_identity_key_v298(v_name)
             then character_name
           else previous_name
         end,
         renamed_to = case
           when public.kinojo_character_identity_key_v298(character_name)
             <> public.kinojo_character_identity_key_v298(v_name)
             then v_name
           else renamed_to
         end,
         server_id = v_server_id,
         server_name = v_server_name,
         character_name = v_name,
         detail_url = coalesce(v_detail_url, detail_url),
         profile_image_url = coalesce(v_profile_image, profile_image_url),
         legion_name = case when v_server_transferred then null else legion_name end,
         legion_updated_at = case when v_server_transferred then now() else legion_updated_at end,
         legion_source_snapshot_id = case when v_server_transferred then null else legion_source_snapshot_id end,
         status = 'OK',
         status_updated_at = now(),
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

  if v_target.list_row is not null and (select list_sheet_sync_enabled from public.updater_sessions where session_id=p_session_id) then
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
  ) on conflict(session_id,character_name,server_id) do nothing;
  end if;

  insert into public.character_identity_recovery_attempts(
    session_id, target_id, character_id, char_key,
    previous_server_id, previous_character_name,
    candidate_server_id, candidate_character_name,
    recovery_status, message, evidence
  ) values (
    p_session_id, p_target_id, v_character.id, v_char_key,
    v_character.server_id, v_character.character_name,
    v_server_id, v_name,
    'APPLIED', v_change_type, v_evidence
  );

  return jsonb_build_object(
    'ok', true,
    'applied', true,
    'changeType', v_change_type,
    'characterId', v_character.id,
    'charKey', v_char_key,
    'serverTransferred', v_server_transferred,
    'legionCleared', v_server_transferred,
    'previousLegionName', v_previous_legion_name,
    'organizationAssignmentRemoved', v_assignment_removed_count > 0,
    'legionTreeRevisions', v_legion_tree_revisions,
    'databaseContract', '461',
    'previous', jsonb_build_object(
      'serverId', v_character.server_id,
      'serverName', v_character.server_name,
      'characterName', v_character.character_name,
      'legionName', v_previous_legion_name
    ),
    'current', jsonb_build_object(
      'serverId', v_server_id,
      'serverName', v_server_name,
      'characterName', v_name,
      'detailUrl', v_detail_url,
      'profileImageUrl', v_profile_image,
      'legionName', case when v_server_transferred then null else v_character.legion_name end
    ),
    'listSyncQueued', v_target.list_row is not null and (select list_sheet_sync_enabled from public.updater_sessions where session_id=p_session_id)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_record_lookup_admin_exclusions_v287(p_session_id text, p_session_token text, p_list jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_auth jsonb;
  v_item jsonb;
  v_raw_name text;
  v_name text;
  v_server_id integer;
  v_row integer;
  v_character public.character_master%rowtype;
  v_reason text;
  v_count integer := 0;
  v_recovery_count integer := 0;
  v_reason_counts jsonb := '{}'::jsonb;
begin
  v_auth := public.kinojo_validate_updater_session(p_session_id, p_session_token);
  if coalesce((v_auth->>'ok')::boolean, false) is false then return v_auth; end if;
  if jsonb_typeof(p_list) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_LIST', 'message', 'p_list는 배열이어야 합니다.');
  end if;

  delete from public.lookup_session_admin_exclusions where session_id = p_session_id;

  for v_item in select value from jsonb_array_elements(p_list)
  loop
    v_raw_name := nullif(trim(coalesce(v_item->>'name', v_item->>'characterName', v_item->>'character_name', '')), '');
    if v_raw_name is null then continue; end if;
    v_name := public.kinojo_strip_server_suffix(v_raw_name);
    v_server_id := public.kinojo_resolve_server_id(
      v_raw_name,
      coalesce(
        public.kinojo_parse_nonnegative_int_v530(coalesce(v_item->>'serverId', v_item->>'server_id')),
        2002
      )
    );
    v_row := public.kinojo_parse_nonnegative_int_v530(coalesce(v_item->>'row', v_item->>'listRow', v_item->>'list_row'));

    select cm.* into v_character
    from public.character_master cm
    where cm.server_id = v_server_id
      and public.kinojo_normalize_character_name(cm.character_name)
          = public.kinojo_normalize_character_name(v_name)
    order by
      case when cm.character_name = v_name then 0 else 1 end,
      cm.updated_at desc,
      cm.id desc
    limit 1;

    if not found then continue; end if;
    v_reason := public.kinojo_lookup_admin_exclusion_reason(v_character.server_id, v_character.character_name);
    if v_reason is null then continue; end if;

    insert into public.lookup_session_admin_exclusions(
      session_id, character_id, list_row, list_display_name,
      character_name, server_id, server_name, exclusion_reason,
      exclusion_category, is_main, main_character_id
    ) values (
      p_session_id, v_character.id, v_row, v_raw_name,
      v_character.character_name, v_character.server_id, v_character.server_name, v_reason,
      coalesce(v_character.exclusion_reason, v_character.inactive_reason, '기타'),
      coalesce(v_character.is_main, false), v_character.main_character_id
    )
    on conflict(session_id, list_row, list_display_name) do update set
      character_id = excluded.character_id,
      exclusion_reason = excluded.exclusion_reason,
      exclusion_category = excluded.exclusion_category,
      recorded_at = now();
    v_count := v_count + 1;

    if coalesce(v_character.exclusion_reason, '') in ('서버 이전', '이름 변경') then
      insert into public.character_identity_recovery_queue(
        character_id, source_session_id, source_list_row, reason
      ) values (
        v_character.id, p_session_id, v_row, v_character.exclusion_reason
      )
      on conflict (character_id) where queue_status in ('pending', 'retry', 'processing', 'review_required')
      do update set
        source_session_id = excluded.source_session_id,
        source_list_row = excluded.source_list_row,
        reason = excluded.reason,
        queue_status = case
          when character_identity_recovery_queue.queue_status = 'review_required' then 'review_required'
          else 'pending'
        end,
        next_retry_at = least(character_identity_recovery_queue.next_retry_at, now()),
        updated_at = now();
      update public.character_master
      set lookup_excluded = false,
          lookup_excluded_at = null,
          is_active = true,
          inactivated_at = null,
          identity_status = 'IDENTITY_PENDING',
          status = 'IDENTITY_PENDING',
          sync_status = 'identity_recovery_pending',
          updated_at = now()
      where id = v_character.id;
      v_recovery_count := v_recovery_count + 1;
    end if;
  end loop;

  select coalesce(jsonb_object_agg(category, count_value), '{}'::jsonb)
  into v_reason_counts
  from (
    select exclusion_category category, count(*)::integer count_value
    from public.lookup_session_admin_exclusions
    where session_id = p_session_id
    group by exclusion_category
  ) t;

  update public.updater_runtime_jobs
  set raw_payload = coalesce(raw_payload, '{}'::jsonb) || jsonb_build_object(
        'adminExcludedCount', v_count,
        'adminExcludedReasonCounts', v_reason_counts
      ),
      updated_at = now()
  where session_id = p_session_id;

  return jsonb_build_object(
    'ok', true,
    'sessionId', p_session_id,
    'adminExcludedCount', v_count,
    'reasonCounts', v_reason_counts,
    'identityRecoveryQueuedCount', v_recovery_count
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_identity_review_upsert_v287(p_character_id bigint, p_source_session_id text, p_candidate jsonb, p_evidence jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_review_id bigint;
  v_server_id integer := public.kinojo_parse_nonnegative_int_v530(coalesce(p_candidate->>'serverId', p_candidate->>'server_id'));
  v_name text := nullif(trim(coalesce(p_candidate->>'characterName', p_candidate->>'character_name', p_candidate->>'name')), '');
  v_char_key text := nullif(trim(coalesce(p_candidate->>'charKey', p_candidate->>'char_key')), '');
begin
  if not exists(select 1 from public.character_master where id = p_character_id) then
    return jsonb_build_object('ok', false, 'code', 'CHARACTER_NOT_FOUND');
  end if;
  if v_server_id is null or v_name is null then
    return jsonb_build_object('ok', false, 'code', 'CANDIDATE_IDENTITY_REQUIRED');
  end if;

  if not exists(
    select 1 from public.character_master cm
    join public.server_master old_s on old_s.server_id=cm.server_id
    join public.server_master new_s on new_s.server_id=v_server_id
    where cm.id=p_character_id and nullif(trim(cm.char_key),'')=v_char_key
      and public.kinojo_normalize_aion_class_name(cm.class_name)=public.kinojo_normalize_aion_class_name(p_candidate->>'className')
      and old_s.race_id=new_s.race_id and coalesce(new_s.is_active,true)
  ) then return jsonb_build_object('ok',false,'code','IDENTITY_EVIDENCE_MISMATCH'); end if;

  insert into public.character_identity_review_queue(
    character_id, source_session_id, candidate_server_id, candidate_server_name,
    candidate_character_name, candidate_char_key, candidate_detail_url,
    candidate_profile_image_url, candidate_class_name, evidence
  ) values (
    p_character_id, nullif(trim(p_source_session_id), ''), v_server_id,
    nullif(trim(coalesce(p_candidate->>'serverName', p_candidate->>'server_name')), ''),
    v_name, v_char_key,
    nullif(trim(coalesce(p_candidate->>'detailUrl', p_candidate->>'detail_url')), ''),
    nullif(trim(coalesce(p_candidate->>'profileImageUrl', p_candidate->>'profile_image_url')), ''),
    nullif(trim(coalesce(p_candidate->>'className', p_candidate->>'class_name')), ''),
    coalesce(p_evidence, '{}'::jsonb)
  )
  on conflict (
    character_id, candidate_server_id,
    public.kinojo_normalize_character_name(candidate_character_name),
    coalesce(candidate_char_key, '')
  ) where review_status = 'pending'
  do update set
    source_session_id = excluded.source_session_id,
    candidate_server_name = excluded.candidate_server_name,
    candidate_detail_url = excluded.candidate_detail_url,
    candidate_profile_image_url = excluded.candidate_profile_image_url,
    candidate_class_name = excluded.candidate_class_name,
    evidence = excluded.evidence,
    updated_at = now()
  returning review_id into v_review_id;

  update public.character_master
  set identity_status = 'REVIEW_REQUIRED', updated_at = now()
  where id = p_character_id;
  update public.character_identity_recovery_queue
  set queue_status = 'review_required', updated_at = now()
  where character_id = p_character_id
    and queue_status in ('pending', 'retry', 'processing', 'review_required');

  return jsonb_build_object('ok', true, 'reviewId', v_review_id, 'status', 'pending');
end
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_identity_list_update_payload_v287(p_character_id bigint, p_previous jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_character public.character_master%rowtype;
  v_old_display text;
  v_new_display text;
begin
  select * into v_character from public.character_master where id = p_character_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'CHARACTER_NOT_FOUND'); end if;
  v_old_display := coalesce(
    nullif(trim(p_previous->>'listDisplayName'), ''),
    public.kinojo_list_display_name_v287(
      coalesce(nullif(trim(p_previous->>'characterName'), ''), v_character.previous_character_name, v_character.character_name),
      coalesce(public.kinojo_parse_nonnegative_int_v530(p_previous->>'serverId'), v_character.previous_server_id, v_character.server_id)
    )
  );
  v_new_display := public.kinojo_list_display_name_v287(v_character.character_name, v_character.server_id);
  return jsonb_build_object(
    'ok', true, 'id', v_character.id, 'listRow', v_character.list_row,
    'originalListName', v_old_display, 'previousCharacterName', v_old_display,
    'listDisplayName', v_new_display, 'characterName', v_character.character_name,
    'serverId', v_character.server_id, 'serverName', v_character.server_name,
    'className', v_character.class_name,
    'pveItemLevel', v_character.latest_pve_item_level, 'pveCombatPower', v_character.latest_pve_combat_power,
    'pvpItemLevel', v_character.latest_pvp_item_level, 'pvpCombatPower', v_character.latest_pvp_combat_power,
    'latestPowerTotal', v_character.latest_power_total, 'latestItemLevelTotal', v_character.latest_item_level_total,
    'identityChanged', v_old_display <> v_new_display,
    'mainCharacterRenamed', coalesce(v_character.is_main, false) and v_old_display <> v_new_display
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_admin_character_identity_apply_v1(p_pass_key text, p_character_id bigint, p_candidate jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_member public.member_codes%rowtype;
  v_character public.character_master%rowtype;
  v_candidate jsonb := coalesce(p_candidate, '{}'::jsonb);
  v_char_key text := nullif(trim(coalesce(v_candidate->>'charKey', v_candidate->>'char_key', '')), '');
  v_server_id integer := public.kinojo_parse_nonnegative_int_v530(coalesce(v_candidate->>'serverId', v_candidate->>'server_id'));
  v_server_name text;
  v_server_short_name text;
  v_name text := nullif(trim(coalesce(v_candidate->>'characterName', v_candidate->>'character_name', v_candidate->>'name', '')), '');
  v_detail_url text := nullif(trim(coalesce(v_candidate->>'detailUrl', v_candidate->>'detail_url', '')), '');
  v_profile_image text := nullif(trim(coalesce(v_candidate->>'profileImageUrl', v_candidate->>'profile_image_url', '')), '');
  v_change_type text;
  v_conflict_id bigint;
  v_old_display_name text;
  v_new_display_name text;
  v_main_renamed boolean := false;
  v_server_transferred boolean := false;
  v_previous_legion_name text;
  v_assignment_legion_name text;
  v_assignment_removed_count integer := 0;
  v_legion_tree_revisions jsonb := '{}';
begin
  select * into v_member from public.kinojo_admin_member_from_credential_v325(p_pass_key) limit 1;
  if not found or coalesce(v_member.level, 0) < 4 then
    return jsonb_build_object('ok', false, 'code', 'IDENTITY_ADMIN_ACCESS_DENIED', 'message', '서버 이전 반영은 MASTER·SUB_MASTER만 사용할 수 있습니다.');
  end if;

  select * into v_character
  from public.character_master
  where id = p_character_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'CHARACTER_NOT_FOUND', 'message', '대상 캐릭터를 찾지 못했습니다.');
  end if;

  -- Candidate must still refer to the source identity seen before external collection.
  if not ((v_character.server_id=v_server_id and v_character.character_name=v_name)
    or (v_candidate->>'sourceServerId'=v_character.server_id::text
        and v_candidate->>'sourceCharacterName'=v_character.character_name)) then
    return jsonb_build_object('ok',false,'code','STALE_IDENTITY_SOURCE');
  end if;
  if v_char_key is null or nullif(trim(coalesce(v_character.char_key, '')), '') is null or v_char_key <> trim(v_character.char_key) then
    return jsonb_build_object('ok', false, 'code', 'CHAR_KEY_MISMATCH', 'message', '공식 후보의 고유값이 기존 character_master와 일치하지 않습니다.');
  end if;
  if public.kinojo_normalize_aion_class_name(v_character.class_name) is null
     or public.kinojo_normalize_aion_class_name(v_character.class_name)
       is distinct from public.kinojo_normalize_aion_class_name(v_candidate->>'className') then
    return jsonb_build_object('ok',false,'code','CLASS_MISMATCH');
  end if;

  if v_server_id is null or v_name is null then
    return jsonb_build_object('ok', false, 'code', 'RECOVERY_IDENTITY_REQUIRED', 'message', '현재 서버와 캐릭터명이 필요합니다.');
  end if;

  select server_name, server_short_name
    into v_server_name, v_server_short_name
  from public.server_master
  where server_id = v_server_id and coalesce(is_active, true) is true;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'UNKNOWN_SERVER', 'message', 'Server Master에 없는 서버입니다.');
  end if;

  if not exists(select 1 from public.server_master a join public.server_master b on a.race_id=b.race_id
    where a.server_id=v_character.server_id and b.server_id=v_server_id and coalesce(b.is_active,true)) then
    return jsonb_build_object('ok',false,'code','SERVER_RACE_MISMATCH');
  end if;

  select id into v_conflict_id
  from public.character_master cm
  where cm.id <> v_character.id
    and cm.server_id = v_server_id
    and public.kinojo_normalize_character_name(cm.character_name) = public.kinojo_normalize_character_name(v_name)
    and coalesce(cm.is_active, true) is true
  limit 1;
  if v_conflict_id is not null then
    return jsonb_build_object('ok', false, 'code', 'TARGET_IDENTITY_CONFLICT', 'message', '변경될 서버/캐릭터명에 이미 다른 활성 캐릭터가 존재합니다.', 'conflictCharacterId', v_conflict_id);
  end if;

  v_old_display_name := case
    when v_character.server_id = 2002 then v_character.character_name
    else v_character.character_name || '[' || coalesce((select server_short_name from public.server_master where server_id = v_character.server_id), v_character.server_name, v_character.server_id::text) || ']'
  end;
  v_new_display_name := case
    when v_server_id = 2002 then v_name
    else v_name || '[' || coalesce(v_server_short_name, v_server_name, v_server_id::text) || ']'
  end;

  v_change_type := case
    when v_character.server_id is distinct from v_server_id
     and public.kinojo_normalize_character_name(v_character.character_name) <> public.kinojo_normalize_character_name(v_name)
      then 'SERVER_TRANSFER_AND_RENAME'
    when v_character.server_id is distinct from v_server_id then 'SERVER_TRANSFER'
    when public.kinojo_normalize_character_name(v_character.character_name) <> public.kinojo_normalize_character_name(v_name) then 'CHARACTER_RENAME'
    else 'IDENTITY_REFRESH'
  end;

  v_main_renamed := coalesce(v_character.is_main, false) is true
    and public.kinojo_normalize_character_name(v_character.character_name) <> public.kinojo_normalize_character_name(v_name);

  v_server_transferred := v_character.server_id is distinct from v_server_id;
  v_previous_legion_name := nullif(btrim(v_character.legion_name),'');
  if v_server_transferred then
    select a.legion_name
      into v_assignment_legion_name
      from private.legion_tree_assignments a
     where a.character_id = v_character.id
     for update;

    perform 1
      from private.legion_tree_configs c
     where c.legion_name = any(array_remove(array[v_previous_legion_name, v_assignment_legion_name], null))
     order by c.legion_name
     for update;

    delete from private.legion_tree_assignments a
     where a.character_id = v_character.id;
    get diagnostics v_assignment_removed_count = row_count;

    with updated as (
      update private.legion_tree_configs c
         set revision = c.revision + 1,
             updated_at = now(),
             updated_by = 'SYSTEM_CHARACTER_SERVER_TRANSFER_V461'
       where c.legion_name = any(array_remove(array[v_previous_legion_name, v_assignment_legion_name], null))
       returning c.legion_name, c.revision
    )
    select coalesce(jsonb_object_agg(updated.legion_name, updated.revision), '{}'::jsonb)
      into v_legion_tree_revisions
      from updated;
  end if;


  if v_character.server_id is distinct from v_server_id or v_character.character_name is distinct from v_name then
  insert into public.character_identity_change_history(
    character_id, char_key,
    previous_server_id, previous_server_name, previous_character_name,
    current_server_id, current_server_name, current_character_name,
    change_type, source, session_id, target_id, evidence
  ) values (
    v_character.id, v_char_key,
    v_character.server_id, v_character.server_name, v_character.character_name,
    v_server_id, v_server_name, v_name,
    v_change_type, 'ADMIN_SERVER_IDENTITY_RECOVERY', 'admin:' || v_member.id::text, null,
    v_candidate || jsonb_build_object('adminMemberId', v_member.id, 'adminMainCharacterName', v_member.main_character_name)
  );
  end if;

  if v_main_renamed then
    update public.character_master set main_character_name=v_name,updated_at=now()
      where id=v_character.id or main_character_id=v_character.id;
    -- Legacy member linkage is name-only. Refuse cross-server namesake propagation.
    update public.member_codes set main_character_name=v_name,updated_at=now()
      where public.kinojo_character_identity_key_v298(main_character_name)
        =public.kinojo_character_identity_key_v298(v_character.character_name)
        and (select count(*) from public.character_master
          where public.kinojo_character_identity_key_v298(character_name)
            =public.kinojo_character_identity_key_v298(v_character.character_name))=1;
  end if;

  update public.character_master
     set lookup_excluded=case when exclusion_reason='삭제후보' then false else lookup_excluded end,
         lookup_policy=case when exclusion_reason='삭제후보' then 'INHERIT' else lookup_policy end,
         exclusion_reason=case when exclusion_reason='삭제후보' then null else exclusion_reason end,
         previous_name = case
           when public.kinojo_normalize_character_name(character_name) <> public.kinojo_normalize_character_name(v_name)
             then character_name else previous_name end,
         renamed_to = case
           when public.kinojo_normalize_character_name(character_name) <> public.kinojo_normalize_character_name(v_name)
             then v_name else renamed_to end,
         server_id = v_server_id,
         server_name = v_server_name,
         character_name = v_name,
         detail_url = coalesce(v_detail_url, detail_url),
         profile_image_url = coalesce(v_profile_image, profile_image_url),
         legion_name = case when v_server_transferred then null else legion_name end,
         legion_updated_at = case when v_server_transferred then now() else legion_updated_at end,
         legion_source_snapshot_id = case when v_server_transferred then null else legion_source_snapshot_id end,
         status = 'OK',
         error_message = null,
         status_updated_at = now(),
         last_seen_at = now(),
         updated_at = now()
   where id = v_character.id;

  insert into public.character_identity_recovery_attempts(
    session_id, target_id, character_id, char_key,
    previous_server_id, previous_character_name,
    candidate_server_id, candidate_character_name,
    recovery_status, message, evidence
  ) values (
    'admin:' || v_member.id::text || ':' || extract(epoch from clock_timestamp())::bigint::text,
    null, v_character.id, v_char_key,
    v_character.server_id, v_character.character_name,
    v_server_id, v_name,
    'APPLIED', v_change_type,
    v_candidate || jsonb_build_object('surface', 'ADMIN_WEB')
  );

  return jsonb_build_object(
    'ok', true,
    'applied', true,
    'serverTransferred',v_server_transferred,'legionCleared',v_server_transferred,
    'organizationAssignmentRemovedCount',v_assignment_removed_count,
    'changeType', v_change_type,
    'characterId', v_character.id,
    'previous', jsonb_build_object('serverId', v_character.server_id, 'serverName', v_character.server_name, 'characterName', v_character.character_name, 'listDisplayName', v_old_display_name),
    'current', jsonb_build_object('serverId', v_server_id, 'serverName', v_server_name, 'characterName', v_name, 'detailUrl', v_detail_url, 'profileImageUrl', v_profile_image, 'listDisplayName', v_new_display_name),
    'listUpdate', jsonb_build_object(
      'id', v_character.id,
      'listRow', v_character.list_row,
      'originalListName', v_old_display_name,
      'listDisplayName', v_new_display_name,
      'characterName', v_name,
      'serverId', v_server_id,
      'serverName', v_server_name,
      'className', v_character.class_name,
      'pveItemLevel', v_character.latest_pve_item_level,
      'pveCombatPower', v_character.latest_pve_combat_power,
      'pvpItemLevel', v_character.latest_pvp_item_level,
      'pvpCombatPower', v_character.latest_pvp_combat_power,
      'latestPowerTotal', v_character.latest_power_total,
      'latestItemLevelTotal', v_character.latest_item_level_total,
      'identityChanged', v_change_type <> 'IDENTITY_REFRESH'
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.kinojo_banner_campaign_target_valid_v386(p_type text, p_page text, p_slots text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select case
    when p_type='MAIN' then
      p_page='HOME' and p_slots=array['MAIN']::text[]
    when p_type='SIDE' and p_page in (
      'HOME','HOF','RANKING','LEGION_TREE','LEGION_ROSTER','SANCTUARY','SANCTUARY_SCHEDULE'
    ) then
      cardinality(p_slots) between 1 and 2
      and p_slots <@ array['LEFT','RIGHT']::text[]
      and cardinality(p_slots)=cardinality(
        array(select distinct s from unnest(p_slots) s)
      )
    else false
  end;
$function$;

CREATE OR REPLACE FUNCTION private.kinojo_banner_manifest_target_valid_v387(p_page text, p_slot text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select case
    when p_page='HOME' then p_slot in ('MAIN','LEFT','RIGHT')
    when p_page in (
      'HOF','RANKING','LEGION_TREE','LEGION_ROSTER','SANCTUARY','SANCTUARY_SCHEDULE'
    ) then p_slot in ('LEFT','RIGHT')
    else false
  end;
$function$;

CREATE OR REPLACE FUNCTION private.kinojo_banner_target_page_contract_v404()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'private'
AS $function$
  select jsonb_build_object(
    'contractVersion',404,
    'main',jsonb_build_object(
      'pageCode','HOME','label','홈','slotCodes',jsonb_build_array('MAIN'),
      'locked',true
    ),
    'sidePages',jsonb_build_array(
      jsonb_build_object('pageCode','HOME','label','홈','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',1),
      jsonb_build_object('pageCode','HOF','label','명예의 전당','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',2),
      jsonb_build_object('pageCode','RANKING','label','레기온 순위','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',3),
      jsonb_build_object('pageCode','LEGION_TREE','label','레기온 트리','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',4),
      jsonb_build_object('pageCode','SANCTUARY','label','성역 메인','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',6),
      jsonb_build_object('pageCode','SANCTUARY_SCHEDULE','label','성역 스케줄','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',7),
      jsonb_build_object('pageCode','LEGION_ROSTER','label','레기온 명부','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',8)
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_admin_character_identity_record_probe_v1(p_pass_key text, p_character_id bigint, p_status text, p_message text DEFAULT ''::text, p_candidate jsonb DEFAULT '{}'::jsonb, p_evidence jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_member public.member_codes%rowtype;
  v_character public.character_master%rowtype;
  v_status text := upper(trim(coalesce(p_status, 'UNKNOWN')));
begin
  select * into v_member from public.kinojo_admin_member_from_credential_v325(p_pass_key) limit 1;
  if not found or coalesce(v_member.level, 0) < 4 then
    return jsonb_build_object('ok', false, 'code', 'IDENTITY_ADMIN_ACCESS_DENIED', 'message', '서버 이전 조회 권한이 없습니다.');
  end if;

  select * into v_character from public.character_master where id = p_character_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'CHARACTER_NOT_FOUND', 'message', '대상 캐릭터를 찾지 못했습니다.');
  end if;

  insert into public.character_identity_recovery_attempts(
    session_id, target_id, character_id, char_key,
    previous_server_id, previous_character_name,
    candidate_server_id, candidate_character_name,
    recovery_status, message, evidence
  ) values (
    'admin:' || v_member.id::text || ':' || extract(epoch from clock_timestamp())::bigint::text,
    null,
    v_character.id,
    v_character.char_key,
    v_character.server_id,
    v_character.character_name,
    public.kinojo_parse_nonnegative_int_v530(coalesce(p_candidate->>'serverId', p_candidate->>'server_id')),
    nullif(trim(coalesce(p_candidate->>'characterName', p_candidate->>'character_name', '')), ''),
    left(v_status, 80),
    left(coalesce(p_message, ''), 500),
    coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object('surface', 'ADMIN_WEB', 'candidate', coalesce(p_candidate, '{}'::jsonb))
  );

  return jsonb_build_object('ok', true, 'recorded', true, 'status', v_status);
end;
$function$;

CREATE OR REPLACE FUNCTION private.kinojo_banner_supported_page_slots_v404(p_page_code text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'private'
AS $function$
  select case upper(btrim(coalesce(p_page_code,'')))
    when 'HOME' then array['LEFT','RIGHT']::text[]
    when 'HOF' then array['LEFT','RIGHT']::text[]
    when 'RANKING' then array['LEFT','RIGHT']::text[]
    when 'LEGION_TREE' then array['LEFT','RIGHT']::text[]
    when 'LEGION_ROSTER' then array['LEFT','RIGHT']::text[]
    when 'SANCTUARY' then array['LEFT','RIGHT']::text[]
    when 'SANCTUARY_SCHEDULE' then array['LEFT','RIGHT']::text[]
    else '{}'::text[]
  end;
$function$;

CREATE OR REPLACE FUNCTION private.kinojo_banner_supported_page_codes_v404()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'private'
AS $function$
  select array['HOME','HOF','RANKING','LEGION_TREE','SANCTUARY','SANCTUARY_SCHEDULE','LEGION_ROSTER']::text[];
$function$;



drop trigger if exists "meter_capture_release_immutable_50054" on public."meter_capture_module_releases";
drop trigger if exists "meter_module_bundles_immutable_50049" on public."meter_module_bundles";
drop trigger if exists "meter_private_runtime_release_immutable_50053" on public."meter_private_runtime_releases";
drop trigger if exists "meter_catalog_pack_release_immutable_50050" on public."meter_catalog_pack_releases";
drop trigger if exists "meter_ui_asset_release_immutable_50051" on public."meter_ui_asset_releases";
drop trigger if exists "meter_sessions_runtime_tracking_50039" on public."meter_sessions";
drop trigger if exists "meter_shell_release_immutable_50052" on public."meter_shell_releases";
drop trigger if exists "meter_protocol_release_immutable_50055" on public."meter_protocol_module_releases";
drop trigger if exists "meter_atomic_bundle_candidate_immutable_50060" on public."meter_atomic_bundle_candidates";
drop trigger if exists "meter_atomic_bundle_candidate_artifact_immutable_50060" on public."meter_atomic_bundle_candidate_artifacts";
drop trigger if exists "meter_sync_release_immutable_50056" on public."meter_sync_module_releases";
drop trigger if exists "meter_ce_group_release_immutable_50057" on public."meter_combat_encounter_group_releases";
drop trigger if exists "meter_ce_individual_release_immutable_50058" on public."meter_combat_encounter_individual_releases";
drop trigger if exists "meter_release_producer_artifact_immutable_50059" on public."meter_release_producer_artifacts";
drop trigger if exists "meter_release_producer_set_immutable_50059" on public."meter_release_producer_sets";
drop trigger if exists "meter_release_producer_membership_immutable_50061" on public."meter_release_producer_set_memberships";
drop trigger if exists "meter_release_producer_artifact_membership_50061" on public."meter_release_producer_artifacts";
drop trigger if exists "meter_stage85_activation_immutable_50063" on public."meter_stage85_activation_audit";

-- Explicit list and RESTRICT prevent accidental removal of unrelated dependents.
drop function if exists
public.kinojo_meter_download_access_v1(text,text),
public.kinojo_meter_reject_ui_asset_release_mutation_50051(),
public.kinojo_meter_register_ui_asset_release_v1(jsonb),
public.kinojo_meter_set_ui_asset_pointer_v1(text,bigint,bigint,bigint),
public.kinojo_meter_ui_asset_download_authorization_v1(text,text,text,jsonb,text),
public.kinojo_meter_download_authorization_v1(text,text,text,text),
public.kinojo_meter_queue_catalog_review_50003(text,text,jsonb,text,text,text,text,text,text,text),
public.kinojo_meter_catalog_v1(text),
public.kinojo_meter_current_catalog_version_50003(),
public.kinojo_meter_resolve_alias_50003(text,text),
public.kinojo_meter_web_stats_v2(text,text,text,text,text,text),
public.kinojo_meter_web_my_comparison_v2(text,text,text,text,text,text,text,text),
public.kinojo_meter_reject_shell_release_mutation_50052(),
public.kinojo_meter_shell_download_authorization_v1(text,text,text,jsonb,text),
public.kinojo_meter_bundle_download_authorization_v1(text,text,text,text,text,text),
public.kinojo_meter_register_shell_release_v1(jsonb),
public.kinojo_meter_set_shell_pointer_v1(text,bigint,bigint,bigint),
public.kinojo_meter_reject_stage85_activation_mutation_50063(),
public.kinojo_meter_submit_encounter_v1(text,jsonb),
public.kinojo_meter_period_window_50003(text,timestamp with time zone),
public.kinojo_meter_power_band_50003(bigint),
public.kinojo_meter_power_band_bounds_50003(text),
public.kinojo_meter_require_activation_step_50063(jsonb,text),
public.kinojo_meter_logout_v1(text),
public.kinojo_meter_withdraw_consent_v1(text,text),
public.kinojo_meter_consent_document_v1(),
public.kinojo_meter_activate_initial_staging_bundle_v1(jsonb),
public.kinojo_meter_stage85_activation_readback_v1(text,text),
public.kinojo_meter_select_character_v1(text,text),
public.kinojo_meter_web_stats_v4(text,text,text,text,text,text,text),
public.kinojo_meter_assert_master_50013(text),
public.kinojo_meter_assert_stage85_artifact_50063(text,text,jsonb),
public.kinojo_meter_web_my_comparison_v4(text,text,text,text,text,text),
public.kinojo_meter_resolve_encounter_catalog_v1(jsonb),
public.kinojo_meter_catalog_v4(text),
public.kinojo_meter_admin_launch_save_v1(text,text,boolean,integer[],text),
public.kinojo_meter_launch_access_v1(text,text),
public.kinojo_meter_core_download_authorization_v2(text,text,text,text,text),
public.kinojo_meter_int_50010(text),
public.kinojo_meter_bigint_50010(text),
public.kinojo_meter_upsert_character_v1(jsonb,text),
public.kinojo_meter_submit_encounter_v4(text,jsonb),
public.kinojo_meter_normalize_catalog_text_50003(text),
public.kinojo_meter_member_owns_character_50004(bigint,text),
public.kinojo_meter_catalog_v2(text),
public.kinojo_meter_web_my_comparison_v3(text,text,text,text,text,text,text,text,text),
public.kinojo_meter_submit_encounter_v3(text,jsonb),
public.kinojo_meter_presence_heartbeat_v1(text,boolean,text,jsonb),
public.kinojo_meter_party_presence_v1(text,jsonb),
public.kinojo_meter_statistics_policy_50006(),
public.kinojo_meter_catalog_v3(text),
public.kinojo_meter_submit_encounter_v2(text,jsonb),
public.kinojo_meter_activate_desktop_release_v1(text,text),
public.kinojo_meter_suspend_desktop_release_v1(text),
public.kinojo_meter_web_stats_v1(text,text,integer,integer),
public.kinojo_meter_reject_release_producer_artifact_mutation_50059(),
public.kinojo_meter_web_my_comparison_v1(text,text,text,integer,integer),
public.kinojo_meter_session_50000(text,boolean),
public.kinojo_meter_reject_release_producer_set_mutation_50059(),
public.kinojo_meter_distribution_summary_v1(text),
public.kinojo_meter_public_console_v1(text),
public.kinojo_meter_catalog_version_policy_50004(text,boolean),
public.kinojo_meter_validate_catalog_selection_50004(text,text,text,text,text,text),
public.kinojo_meter_web_stats_v3(text,text,text,text,text,text,text),
public.kinojo_meter_select_character_v2(text,text),
public.kinojo_meter_semver_key_50011(text),
public.kinojo_meter_desktop_release_manifest_v1(text,text),
public.kinojo_meter_register_desktop_release_v1(text,text,text,text,text,text,text,bigint,boolean,text),
public.kinojo_meter_track_runtime_session_50039(),
public.kinojo_meter_login_v1(text,text),
public.kinojo_meter_consent_status_v1(text,text),
public.kinojo_meter_record_consent_v1(text,text,boolean,boolean,text,text),
public.kinojo_meter_reject_module_bundle_mutation_50049(),
public.kinojo_meter_operation_payload_v1(text),
public.kinojo_meter_admin_notice_save_v1(text,bigint,text,text,text,boolean,boolean,timestamp with time zone,timestamp with time zone),
public.kinojo_meter_admin_notice_delete_v1(text,bigint),
public.kinojo_meter_submit_diagnostic_skill_aggregates_v1(text,text,jsonb),
public.kinojo_meter_submit_official_analyzer_evidence_v1(text,jsonb),
public.kinojo_meter_admin_console_v1(text,text),
public.kinojo_meter_bundle_manifest_v1(text),
public.kinojo_meter_launcher_download_authorization_v1(text,text,text,text),
public.kinojo_meter_validate_combat_record_v1(text),
public.kinojo_meter_recent_combat_records_v1(text,integer),
public.kinojo_meter_submit_combat_record_v1(text,jsonb),
public.kinojo_meter_resolve_combat_catalog_v1(jsonb),
public.kinojo_meter_migrate_legacy_observed_v1(bigint),
public.kinojo_meter_statistics_operation_v1(text),
public.kinojo_meter_statistics_overview_v1(text),
public.kinojo_meter_admin_console_v2(text,text),
public.kinojo_meter_reject_private_runtime_release_mutation_50053(),
public.kinojo_meter_public_console_v2(text),
public.kinojo_meter_web_stats_v5(text,text,text,text,text,text,text),
public.kinojo_meter_web_my_comparison_v5(text,text,text,text,text,text),
public.kinojo_meter_character_key_50000(text,text),
public.kinojo_meter_register_private_runtime_release_v1(jsonb),
public.kinojo_meter_set_private_runtime_pointer_v1(text,bigint,bigint,bigint),
public.kinojo_meter_private_runtime_download_authorization_v1(text,text,text,jsonb,text),
public.kinojo_meter_numeric_50015(text),
public.kinojo_meter_bool_50015(text),
public.kinojo_meter_reject_capture_release_mutation_50054(),
public.kinojo_meter_submit_observed_encounter_v1(text,jsonb),
public.kinojo_meter_recent_observed_v1(text,integer),
public.kinojo_meter_register_capture_release_v1(jsonb),
public.kinojo_meter_set_capture_pointer_v1(text,bigint,bigint,bigint),
public.kinojo_meter_capture_download_authorization_v1(text,text,text,jsonb,jsonb,text),
public.kinojo_meter_admin_operation_save_v1(text,text,boolean,text,timestamp with time zone,text,integer[]),
public.kinojo_meter_admin_statistics_save_v1(text,text,boolean,text),
public.kinojo_meter_activate_launcher_release_v1(text,text),
public.kinojo_meter_reject_protocol_release_mutation_50055(),
public.kinojo_meter_register_core_release_v1(text,text,text,text,text,text,text,text,bigint,text,boolean,text,boolean,text),
public.kinojo_meter_register_launcher_release_v1(text,text,text,text,text,text,text,bigint,boolean,text,boolean,text),
public.kinojo_meter_activate_core_release_v1(text,text),
public.kinojo_meter_core_download_authorization_v1(text,text,text,text,text),
public.kinojo_meter_register_protocol_release_v1(jsonb),
public.kinojo_meter_set_protocol_pointer_v1(text,bigint,bigint,bigint),
public.kinojo_meter_protocol_download_authorization_v1(text,text,text,jsonb,jsonb,jsonb,text),
public.kinojo_meter_register_core_release_v2(text,text,text,text,text,text,text,text,bigint,text,boolean,text,boolean,text,text,text,text,text),
public.kinojo_meter_core_release_manifest_v1(text),
public.kinojo_meter_launcher_release_manifest_v1(text,text),
public.kinojo_meter_store_runtime_incident_v1(text,jsonb),
public.kinojo_meter_staging_login_v1(text,text),
public.kinojo_meter_require_session_channel_v1(text,text),
public.kinojo_meter_reject_release_producer_membership_mutation_50061(),
public.kinojo_meter_link_produced_release_artifact_50061(),
public.kinojo_meter_reject_catalog_pack_release_mutation_50050(),
public.kinojo_meter_presence_offline_v1(text,text),
public.kinojo_meter_public_presence_v1(text),
public.kinojo_meter_admin_dungeon_logs_v1(text,text,integer,integer,text),
public.kinojo_meter_register_catalog_pack_release_v1(jsonb),
public.kinojo_meter_reject_sync_release_mutation_50056(),
public.kinojo_meter_register_sync_release_v1(jsonb),
public.kinojo_meter_set_sync_pointer_v1(text,bigint,bigint,bigint),
public.kinojo_meter_sync_download_authorization_v1(text,text,text,jsonb,jsonb,jsonb,jsonb,text),
public.kinojo_meter_profile_display_v347(bigint),
public.kinojo_meter_reject_combat_encounter_group_mutation_50057(),
public.kinojo_meter_register_combat_encounter_group_release_v1(jsonb),
public.kinojo_meter_set_combat_encounter_group_pointer_v1(text,bigint,bigint,bigint),
public.kinojo_meter_combat_encounter_group_download_authorization_v1(text,text,text,jsonb,jsonb,jsonb,jsonb,text),
public.kinojo_meter_reject_combat_encounter_individual_mutation_50058(),
public.kinojo_meter_register_combat_encounter_individual_release_v1(jsonb),
public.kinojo_meter_set_combat_encounter_individual_pointer_v1(text,text,bigint,bigint,bigint),
public.kinojo_meter_combat_encounter_individual_authorization_v1(text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text),
public.kinojo_meter_combat_encounter_group_payload_50058(bigint,bigint,bigint,bigint),
public.kinojo_meter_atomic_bundle_candidate_readback_v1(text,text),
public.kinojo_meter_reject_atomic_bundle_candidate_mutation_50060(),
public.kinojo_meter_register_atomic_bundle_candidate_v1(jsonb),
public.kinojo_meter_register_module_bundle_v1(text,text,text,text,text,text,integer,text,text,text,text),
public.kinojo_meter_set_catalog_pack_pointer_v1(text,text,bigint,bigint,bigint),
public.kinojo_meter_catalog_pack_download_authorization_v1(text,text,text,jsonb,text),
public.kinojo_meter_validate_bundle_manifest_50049(jsonb,text,text,text,text,text,text),
public.kinojo_meter_set_staging_bundle_pointer_v1(text,text,bigint,text,text,jsonb),
public.kinojo_meter_verify_staging_bundle_v1(uuid,text,text,bigint,text),
public.kinojo_meter_promote_staging_bundle_v1(uuid,uuid,text,text,bigint,text,text,bigint,jsonb),
public.kinojo_meter_rollback_stable_bundle_v1(uuid,uuid,text,text,bigint,jsonb),
public.kinojo_meter_register_release_producer_artifact_v1(jsonb),
public.kinojo_meter_release_producer_catalog_source_v1(),
public.kinojo_meter_release_producer_readback_v1(text,text),
public.kinojo_meter_reuse_release_producer_artifact_v1(text,text,text,bigint,text,text),
public.kinojo_meter_finalize_release_producer_set_v1(text,text,text,integer,text) restrict;

drop table if exists
public."meter_catalog_review_queue",
public."meter_observed_encounters",
public."meter_statistics_policy",
public."meter_observed_participants",
public."meter_party_profile_observations",
public."meter_sessions",
public."meter_catalog_versions",
public."meter_classes",
public."meter_content_types",
public."meter_difficulties",
public."meter_dungeons",
public."meter_bosses",
public."meter_variants",
public."meter_variant_bosses",
public."meter_catalog_aliases",
public."meter_period_types",
public."meter_power_band_policy",
public."meter_participants",
public."meter_encounters",
public."meter_desktop_release_master",
public."meter_consent_document_master",
public."meter_consent_history",
public."meter_operation_settings",
public."meter_notice_master",
public."meter_core_download_audit",
public."meter_launcher_release_master",
public."meter_core_release_master",
public."meter_character_master",
public."meter_staging_access_keys",
public."meter_character_identity_history",
public."meter_character_snapshots",
public."meter_profile_refresh_queue",
public."meter_module_bundle_staging_verifications",
public."meter_runtime_sessions",
public."meter_module_bundle_promotion_audit",
public."meter_decoder_policy",
public."meter_combat_participants",
public."meter_combat_targets",
public."meter_combat_target_actors",
public."meter_module_bundles",
public."meter_module_bundle_pointers",
public."meter_combat_records",
public."meter_runtime_incidents",
public."meter_dungeon_runs",
private."meter_diagnostic_skill_aggregates",
private."meter_diagnostic_sessions",
public."meter_catalog_pack_releases",
public."meter_catalog_pack_pointers",
public."meter_catalog_pack_download_audit",
public."meter_ui_asset_releases",
public."meter_ui_asset_pointers",
public."meter_ui_asset_download_audit",
public."meter_shell_releases",
public."meter_shell_pointers",
public."meter_shell_download_audit",
public."meter_private_runtime_releases",
public."meter_private_runtime_pointers",
public."meter_private_runtime_download_audit",
public."meter_capture_module_releases",
public."meter_capture_module_pointers",
public."meter_capture_module_download_audit",
public."meter_release_producer_sets",
public."meter_release_producer_artifacts",
public."meter_protocol_module_releases",
public."meter_protocol_module_pointers",
public."meter_protocol_module_download_audit",
public."meter_sync_module_releases",
public."meter_sync_module_pointers",
public."meter_sync_module_download_audit",
public."meter_combat_encounter_group_releases",
public."meter_combat_encounter_group_pointers",
public."meter_combat_encounter_group_download_audit",
public."meter_combat_encounter_individual_releases",
public."meter_combat_encounter_individual_pointers",
public."meter_combat_encounter_individual_download_audit",
public."meter_atomic_bundle_candidates",
public."meter_atomic_bundle_candidate_artifacts",
public."meter_release_producer_set_memberships",
public."meter_module_bundle_download_audit",
public."meter_stage85_activation_audit" restrict;

commit;
