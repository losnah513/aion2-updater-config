-- SQL533 rollback: code and future schedule only; preserve completed character data.
begin;
set local lock_timeout='2s';
CREATE OR REPLACE FUNCTION public.kinojo_automation_system_character_start_v377(p_run_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_setting public.kinojo_server_automation_settings%rowtype;
  v_lock public.updater_lock_state%rowtype;
  v_session_id text := gen_random_uuid()::text;
  v_session_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_job_id text := gen_random_uuid()::text;
  v_payload jsonb := jsonb_build_object(
    'schemaVersion', 'kinojo-crawl-v1',
    'tool', 'KINOJO_SERVER_AUTOMATION',
    'requestedSurface', 'SYSTEM_CRON_CHARACTER_REFRESH',
    'serverQueue', true,
    'scheduledAutomation', true,
    'automationRunId', p_run_id,
    'lookupOnlyPhase', false,
    'postprocessPhase', true,
    'sheetDeferred', false,
    'extensionDoesNotReadListSheet', true,
    'listReadMode', 'server_edge_bridge',
    'clientVersion', 'KINOJO_SERVER_377',
    'lookupFilter', jsonb_build_object(
      'lookupMode', 'all', 'classes', '[]'::jsonb, 'gearTypes', '["PVE","PVP"]'::jsonb,
      'races', '[]'::jsonb, 'servers', '[]'::jsonb, 'characterName', ''
    ),
    'lookupFilterSummary', '전체 캐릭터 · PVE+PVP · 자동 실행'
  );
begin
  select * into v_setting from public.kinojo_server_automation_settings
  where automation_key = 'character_refresh' for update;
  if not found or v_setting.running is not true or v_setting.active_run_id is distinct from p_run_id then
    return jsonb_build_object('ok', false, 'code', 'AUTOMATION_RUN_INVALID', 'message', '유효한 캐릭터 자동 실행이 아닙니다.');
  end if;

  v_payload:=v_payload||jsonb_build_object('listSheetSyncEnabled',v_setting.list_sheet_sync_enabled);

  perform public.kinojo_expire_updater_lock();
  select * into v_lock from public.updater_lock_state where id = 'global' for update;
  if coalesce(v_lock.is_locked, false) is true then
    return jsonb_build_object('ok', false, 'code', 'LOCKED', 'message', '다른 캐릭터 조회가 진행 중입니다.');
  end if;

  insert into public.updater_sessions(
    session_id, session_token, tool_name, client_id,
    requested_by_member_id, requested_by_character, requested_by_role, requested_by_level,
    status, stage, message, progress_current, progress_total,
    started_at, last_heartbeat_at, expires_at, raw_payload
  ) values (
    v_session_id, v_session_token, 'KINOJO_SERVER_AUTOMATION', 'SYSTEM_CRON_CHARACTER_REFRESH',
    null, 'SYSTEM:CRON', 'SYSTEM', 5,
    'starting', 'LOCK_ACQUIRED', '예약 캐릭터 최신화 준비 중', 0, 0,
    now(), now(), now() + interval '10 minutes', v_payload
  );

  insert into public.lookup_batches(
    session_id, source, owner_main_character, owner_role, owner_level, device_id,
    status, total_count, done_count, started_at, updated_at, memo,
    tool_name, session_token, client_id, stage, message, last_heartbeat_at, expires_at
  ) values (
    v_session_id, 'server_automation', 'SYSTEM:CRON', 'SYSTEM', 5, 'SYSTEM_CRON_CHARACTER_REFRESH',
    'starting', 0, 0, now(), now(), 'scheduled-character-refresh-v377',
    'KINOJO_SERVER_AUTOMATION', v_session_token, 'SYSTEM_CRON_CHARACTER_REFRESH',
    'LOCK_ACQUIRED', '예약 캐릭터 최신화 준비 중', now(), now() + interval '10 minutes'
  );

  update public.updater_lock_state
  set is_locked = true, session_id = v_session_id, session_token = v_session_token,
      locked_by_member_id = null, locked_by_character = 'SYSTEM:CRON', locked_by_role = 'SYSTEM', locked_by_level = 5,
      tool_name = 'KINOJO_SERVER_AUTOMATION', client_id = 'SYSTEM_CRON_CHARACTER_REFRESH',
      status = 'starting', stage = 'LOCK_ACQUIRED', message = '예약 캐릭터 최신화 준비 중',
      progress_current = 0, progress_total = 0, started_at = now(), last_heartbeat_at = now(),
      expires_at = now() + interval '10 minutes', released_at = null, release_reason = null, updated_at = now()
  where id = 'global';

  insert into public.updater_runtime_jobs(
    job_id, session_id, session_token_hash, tool_name, client_id,
    requested_by_character, requested_by_role, requested_by_level,
    status, current_stage, message, progress_current, progress_total,
    heartbeat_interval_seconds, timeout_seconds, started_at, last_heartbeat_at, raw_payload
  ) values (
    v_job_id, v_session_id, md5(v_session_token), 'KINOJO_SERVER_AUTOMATION', 'SYSTEM_CRON_CHARACTER_REFRESH',
    'SYSTEM:CRON', 'SYSTEM', 5, 'running', 'STARTED', '예약 캐릭터 최신화가 시작되었습니다.',
    0, 0, 15, 600, now(), now(), v_payload
  );

  insert into public.updater_runtime_events(
    session_id, job_id, event_type, stage, progress_current, progress_total, message, payload
  ) values (
    v_session_id, v_job_id, 'start', 'STARTED', 0, 0, '예약 캐릭터 최신화가 시작되었습니다.', v_payload
  );

  update public.kinojo_server_automation_settings
  set active_session_id = v_session_id, last_message = 'character automation session created', updated_at = now()
  where automation_key = 'character_refresh';

  return jsonb_build_object(
    'ok', true, 'runId', p_run_id, 'sessionId', v_session_id, 'sessionToken', v_session_token,
    'lookupFilter', v_payload->'lookupFilter', 'payload', v_payload, 'startedAt', now()
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.kinojo_prepare_lookup_queue_from_list_v296(p_session_id text, p_session_token text, p_list jsonb, p_filter jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_valid jsonb;
  v_policy jsonb;
  v_compare_total int := 0;
  v_total int := 0;
  v_new int := 0;
  v_existing int := 0;
  v_corrected int := 0;
  v_excluded int := 0;
  v_absent int := 0;
  v_master_only_count int := 0;
  v_queue jsonb := '[]'::jsonb;
  v_item jsonb;
  v_row_no int;
  v_raw_name text;
  v_raw_class text;
  v_raw_main text;
  v_main_name text;
  v_is_main boolean;
  v_class_name text;
  v_name text;
  v_server_id int;
  v_server_name text;
  v_exists boolean;
  v_before_list_row int;
  v_filter jsonb;
  v_filter_classes jsonb;
  v_filter_gear_types jsonb;
  v_filter_races jsonb;
  v_filter_servers jsonb;
  v_filter_character text;
  v_lookup_mode text := 'all';
  v_filter_applied boolean := false;
  v_filter_summary text := '전체 조회';
  v_selected_new int := 0;
  v_selected_existing int := 0;
  v_gear_filter_ignored boolean := false;
  v_admin_reason text;
  v_admin_excluded int := 0;
  v_absent_deactivated int := 0;
  v_auto_restored int := 0;
  v_active_list_master int := 0;
  v_list_coverage numeric := 0;
  v_incoming_max_row integer := 0;
  v_master_max_row integer := 0;
  v_list_row_coverage numeric := 0;
  v_list_absence_sync_accepted boolean := false;
  v_changed int := 0;
  v_duplicate_list_count int := 0;
  v_duplicate_master_count int := 0;
  v_master_id bigint;
  v_master_match_count int := 0;
  v_master_row_found boolean := false;
  v_master_status text;
  v_master_sync_status text;
  v_master_bootstrap_source text;
  v_normalized_name text;
  v_identity jsonb;
  v_identity_status text;
  v_invalid_server_count integer := 0;
  v_invalid_server_rows jsonb := '[]'::jsonb;
begin
  v_valid := public.kinojo_validate_updater_session(p_session_id, p_session_token);
  if coalesce((v_valid->>'ok')::boolean, false) is not true then
    return v_valid;
  end if;

  if coalesce(p_filter->>'serverReadComplete','false')<>'true' then
    return jsonb_build_object('ok',false,'code','COMPLETE_LIST_READ_REQUIRED');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('character-prepare:'||p_session_id,0));
  if exists(select 1 from public.lookup_session_targets where session_id=p_session_id) then
    return jsonb_build_object('ok',false,'code','SESSION_ALREADY_PREPARED','message','기존 Target을 보존합니다. 새 준비 대신 기존 세션을 이어서 실행하세요.');
  end if;
  if p_list is null or jsonb_typeof(p_list) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_LIST', 'message', 'p_list는 배열이어야 합니다.');
  end if;

  v_filter := case when jsonb_typeof(coalesce(p_filter, '{}'::jsonb)) = 'object' then coalesce(p_filter, '{}'::jsonb) else '{}'::jsonb end;
  v_filter_classes := case when jsonb_typeof(v_filter->'classes') = 'array' then v_filter->'classes' else '[]'::jsonb end;
  v_filter_gear_types := case when jsonb_typeof(v_filter->'gearTypes') = 'array' then v_filter->'gearTypes' else '[]'::jsonb end;
  v_filter_races := case when jsonb_typeof(v_filter->'races') = 'array' then v_filter->'races' else '[]'::jsonb end;
  v_filter_servers := case when jsonb_typeof(v_filter->'servers') = 'array' then v_filter->'servers' else '[]'::jsonb end;
  v_filter_character := nullif(trim(coalesce(v_filter->>'characterName', '')), '');
  v_lookup_mode := lower(trim(coalesce(v_filter->>'lookupMode', v_filter->>'lookup_mode', 'all')));

  if v_lookup_mode in ('new', 'new_only', 'missing', 'missing_only') then
    v_lookup_mode := 'missing_only';
  elsif v_lookup_mode in ('all', 'full', '') then
    v_lookup_mode := 'all';
  else
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_LOOKUP_MODE',
      'message', 'lookupMode는 all 또는 missing_only만 허용됩니다.',
      'lookupMode', v_lookup_mode
    );
  end if;

  v_filter := jsonb_set(v_filter, '{lookupMode}', to_jsonb(v_lookup_mode), true);

  -- 신규 캐릭터는 기존 Master 장비 이력이 없으므로 장비 유형 조건으로 판정하지 않는다.
  if v_lookup_mode = 'missing_only' and jsonb_array_length(v_filter_gear_types) > 0 then
    v_gear_filter_ignored := true;
    v_filter_gear_types := '[]'::jsonb;
    v_filter := jsonb_set(v_filter, '{gearTypes}', '[]'::jsonb, true);
  end if;

  v_filter_applied :=
       v_lookup_mode = 'missing_only'
    or jsonb_array_length(v_filter_classes) > 0
    or jsonb_array_length(v_filter_gear_types) > 0
    or jsonb_array_length(v_filter_races) > 0
    or jsonb_array_length(v_filter_servers) > 0
    or v_filter_character is not null;

  if v_filter_character is not null then
    v_filter_summary := concat_ws(' · ',
      case when v_lookup_mode = 'missing_only' then '신규 캐릭터만' else null end,
      '캐릭터 ' || public.kinojo_strip_server_suffix(v_filter_character)
    );
  elsif v_filter_applied then
    v_filter_summary := concat_ws(' · ',
      case when v_lookup_mode = 'missing_only' then '신규 캐릭터만' else null end,
      case when jsonb_array_length(v_filter_classes) > 0 then '클래스 ' || jsonb_array_length(v_filter_classes)::text else null end,
      case when jsonb_array_length(v_filter_gear_types) > 0 then '장비 ' || jsonb_array_length(v_filter_gear_types)::text else null end,
      case when jsonb_array_length(v_filter_races) > 0 then '종족 ' || jsonb_array_length(v_filter_races)::text else null end,
      case when jsonb_array_length(v_filter_servers) > 0 then '서버 ' || jsonb_array_length(v_filter_servers)::text else null end
    );
  end if;

  perform public.kinojo_lookup_step_upsert(
    p_session_id, 'LIST_MASTER_COMPARE', 1, 'active', 0, greatest(jsonb_array_length(p_list), 1),
    'Server Engine이 Google list 원본과 character_master를 대조합니다.',
    jsonb_build_object(
      'rawListCount', jsonb_array_length(p_list),
      'serverOwnedCompare', true,
      'serverOwnedFilter', true,
      'lookupMode', v_lookup_mode,
      'gearTypeFilterIgnored', v_gear_filter_ignored,
      'lookupFilter', v_filter,
      'lookupFilterSummary', v_filter_summary
    )
  );

  create temporary table if not exists tmp_kinojo_prepare_list (
    list_row int,
    raw_name text,
    character_name text,
    normalized_name text,
    server_id int,
    server_name text,
    class_name text,
    main_character_name text,
    is_main boolean,
    existed boolean,
    corrected boolean
  ) on commit drop;
  truncate tmp_kinojo_prepare_list;

  delete from public.lookup_session_targets where session_id = p_session_id;

  for v_item in select value from jsonb_array_elements(p_list)
  loop
    v_raw_name := nullif(trim(coalesce(v_item->>'name', v_item->>'characterName', v_item->>'character_name', '')), '');
    if v_raw_name is null then
      v_excluded := v_excluded + 1;
      continue;
    end if;

    v_row_no := case when coalesce(v_item->>'row', '') ~ '^[0-9]+$' then (v_item->>'row')::int else null end;
    v_raw_class := nullif(trim(coalesce(v_item->>'className', v_item->>'class_name', v_item->>'class', '')), '');
    v_class_name := public.kinojo_normalize_aion_class_name(v_raw_class);
    v_raw_main := nullif(trim(coalesce(
      v_item->>'mainCharacterName', v_item->>'main_character_name', v_item->>'owner', v_item->>'main', ''
    )), '');
    if v_raw_main is null then v_raw_main := v_raw_name; end if;

    v_identity := public.kinojo_character_identity_strict_258(
      v_raw_name,
      coalesce(
        case when coalesce(v_item->>'serverId','') ~ '^[0-9]+$' then (v_item->>'serverId')::int else null end,
        case when coalesce(v_item->>'server_id','') ~ '^[0-9]+$' then (v_item->>'server_id')::int else null end,
        2002
      )
    );
    v_identity_status := coalesce(v_identity->>'status', 'IDENTITY_UNAVAILABLE');

    if coalesce((v_identity->>'matchable')::boolean, false) is not true then
      v_invalid_server_count := v_invalid_server_count + 1;
      v_invalid_server_rows := v_invalid_server_rows || jsonb_build_array(jsonb_build_object(
        'row', v_row_no,
        'originalName', v_raw_name,
        'characterName', coalesce(v_identity->>'characterName', public.kinojo_strip_server_suffix(v_raw_name), ''),
        'serverSuffix', coalesce(v_identity->>'serverSuffix', ''),
        'status', v_identity_status,
        'message', case v_identity_status
          when 'UNKNOWN_SERVER_SUFFIX' then '등록되지 않은 서버 태그입니다.'
          when 'AMBIGUOUS_SERVER_SUFFIX' then '여러 서버와 겹치는 서버 태그입니다. 전체 서버명을 사용하세요.'
          when 'DEFAULT_SERVER_NOT_FOUND' then '기본 서버를 server_master에서 찾지 못했습니다.'
          else '캐릭터 서버를 확정하지 못했습니다.'
        end
      ));
      v_excluded := v_excluded + 1;
      continue;
    end if;

    v_name := nullif(v_identity->>'characterName', '');
    v_server_id := nullif(v_identity->>'serverId', '')::integer;
    v_server_name := coalesce(nullif(v_identity->>'serverName', ''), public.kinojo_server_name_by_id(v_server_id), '');
    v_main_name := coalesce(public.kinojo_strip_server_suffix(v_raw_main), v_name);
    v_is_main := public.kinojo_character_identity_key_v298(v_raw_name)
                 = public.kinojo_character_identity_key_v298(v_raw_main);
    v_normalized_name := public.kinojo_character_identity_key_v298(v_name);

    if coalesce(v_normalized_name, '') = '' then
      v_excluded := v_excluded + 1;
      continue;
    end if;

    -- 같은 Server + 정규화 캐릭터가 list에 여러 번 있어도 Target은 한 번만 만든다.
    if exists (
      select 1 from tmp_kinojo_prepare_list t
       where t.server_id = v_server_id
         and t.normalized_name = v_normalized_name
    ) then
      v_duplicate_list_count := v_duplicate_list_count + 1;
      update tmp_kinojo_prepare_list t
         set class_name = coalesce(t.class_name, v_class_name),
             main_character_name = coalesce(t.main_character_name, v_main_name),
             is_main = t.is_main or v_is_main
       where t.server_id = v_server_id
         and t.normalized_name = v_normalized_name;
      continue;
    end if;

    v_exists := false;
    v_master_row_found := false;
    v_before_list_row := null;
    v_master_id := null;
    v_master_match_count := 0;
    v_master_status := null;
    v_master_sync_status := null;
    v_master_bootstrap_source := null;
    select cm.id, cm.list_row, count(*) over(), cm.status, cm.sync_status, cm.bootstrap_source
      into v_master_id, v_before_list_row, v_master_match_count, v_master_status, v_master_sync_status, v_master_bootstrap_source
      from public.character_master cm
     where cm.server_id = v_server_id
       and public.kinojo_character_identity_key_v298(cm.character_name) = v_normalized_name
     order by
       case when cm.character_name = v_name then 0 else 1 end,
       case when coalesce(cm.is_active, true) then 0 else 1 end,
       cm.updated_at desc nulls last,
       cm.id desc
     limit 1;
    v_master_row_found := found;
    -- prepare 단계가 만든 WAIT_LOOKUP placeholder는 Master 행이 있어도 아직 조회된 캐릭터가 아니다.
    -- 필터에서 한 번 제외됐거나 이전 회차가 중단돼도 신규 조회에서 다시 잡히게 한다.
    v_exists := v_master_row_found and not (
      coalesce(v_master_status, '') = 'WAIT_LOOKUP'
      and coalesce(v_master_sync_status, '') = 'lookup_queued'
      and coalesce(v_master_bootstrap_source, '') like 'google_list_prepare%'
    );
    v_duplicate_master_count := v_duplicate_master_count + greatest(coalesce(v_master_match_count, 0) - 1, 0);

    -- H is raw state from AppsScript_MASTER. Preserve exclusion before any target/API call.
    if upper(v_name) like '%\_D' escape '\'
       or btrim(coalesce(v_item->>'status',''))='삭제후보' then
      with changed as (
        update public.character_master set lookup_excluded=true,
          exclusion_reason='삭제후보',lookup_excluded_at=coalesce(lookup_excluded_at,now()),
          exclusion_memo='list _D/H 삭제후보 사전 제외',updated_at=now()
        where id=v_master_id and (lookup_excluded is distinct from true or exclusion_reason is distinct from '삭제후보')
        returning character_name,server_id
      )
      insert into public.character_status_history(character_name,server_id,action,reason,memo)
        select character_name,server_id,'LOOKUP_EXCLUDE','삭제후보','list _D/H 삭제후보 사전 제외' from changed;
      v_admin_excluded:=v_admin_excluded+1;
      continue;
    end if;

    v_admin_reason := public.kinojo_lookup_admin_exclusion_reason(v_server_id, v_name);
    if v_admin_reason is not null then
      v_admin_excluded := v_admin_excluded + 1;
      update public.character_master cm
         set list_row = coalesce(v_row_no, cm.list_row),
             last_seen_at = now(),
             sync_status = 'admin_excluded',
             updated_at = now()
       where cm.id = v_master_id;
      continue;
    end if;

    if v_master_id is not null then
      v_policy:=private.kinojo_character_lookup_policy(v_master_id);
      if coalesce((v_policy->>'eligible')::boolean,false) is not true then
        v_admin_excluded:=v_admin_excluded+1; continue;
      end if;
    end if;
    if v_exists then
      v_existing := v_existing + 1;
      if v_row_no is not null and coalesce(v_before_list_row, -1) <> v_row_no then
        v_corrected := v_corrected + 1;
      end if;
    else
      v_new := v_new + 1;
    end if;

    if v_master_row_found then
      update public.character_master cm
         set character_name = v_name,
             server_name = coalesce(v_server_name, cm.server_name),
             list_row = coalesce(v_row_no, cm.list_row),
             class_name = coalesce(cm.class_name, v_class_name),
             main_character_name = coalesce(v_main_name, cm.main_character_name),
             is_main = v_is_main,
             last_seen_at = now(),
             sync_status = case
               when v_lookup_mode = 'missing_only' and v_exists then cm.sync_status
               else 'lookup_queued'
             end,
             status = case
               when v_exists and coalesce(cm.status, '') in ('', 'WAIT_LOOKUP') then 'OK'
               else cm.status
             end,
             updated_at = now()
       where cm.id = v_master_id;
    else
      insert into public.character_master (
        server_id, server_name, character_name, status, main_character_name, is_main, class_name,
        list_row, first_seen_at, last_seen_at, sync_status, bootstrap_source, bootstrap_imported_at
      ) values (
        v_server_id, v_server_name, v_name, 'WAIT_LOOKUP',
        v_main_name, v_is_main, v_class_name, v_row_no, now(), now(), 'lookup_queued',
        case when v_lookup_mode = 'missing_only' then 'google_list_prepare_v8_strict_missing_only' else 'google_list_prepare_v8_strict' end,
        now()
      )
      on conflict (server_id, character_name) do update set
        server_name = coalesce(excluded.server_name, public.character_master.server_name),
        list_row = coalesce(excluded.list_row, public.character_master.list_row),
        class_name = coalesce(public.character_master.class_name, excluded.class_name),
        main_character_name = coalesce(excluded.main_character_name, public.character_master.main_character_name),
        is_main = excluded.is_main,
        last_seen_at = now(),
        sync_status = 'lookup_queued',
        updated_at = now();
    end if;

    insert into tmp_kinojo_prepare_list(list_row, raw_name, character_name, normalized_name, server_id, server_name, class_name, main_character_name, is_main, existed, corrected)
    values(v_row_no, v_raw_name, v_name, v_normalized_name, v_server_id, v_server_name, v_class_name, v_main_name, v_is_main, v_exists, v_exists and v_row_no is not null and coalesce(v_before_list_row, -1) <> v_row_no);
  end loop;

  -- v470: The DB roster remains queryable even without a Google list row.
  -- Insert directly from Master: do not rewrite its identity, family or list row.
  insert into tmp_kinojo_prepare_list(
    list_row,raw_name,character_name,normalized_name,server_id,server_name,
    class_name,main_character_name,is_main,existed,corrected
  )
  select null,cm.character_name,cm.character_name,
    public.kinojo_character_identity_key_v298(cm.character_name),
    cm.server_id,cm.server_name,cm.class_name,cm.main_character_name,cm.is_main,
    not (
      coalesce(cm.status,'')='WAIT_LOOKUP'
      and coalesce(cm.sync_status,'')='lookup_queued'
      and coalesce(cm.bootstrap_source,'') like 'google_list_prepare%'
    ),false
  from public.character_master cm
  where upper(cm.character_name) not like '%\_D' escape '\'
    and coalesce((private.kinojo_character_lookup_policy(cm.id)->>'eligible')::boolean,false)
    and public.kinojo_lookup_admin_exclusion_reason(cm.server_id,cm.character_name) is null
    and not exists (
      select 1 from tmp_kinojo_prepare_list t
      where t.server_id=cm.server_id
        and t.normalized_name=public.kinojo_character_identity_key_v298(cm.character_name)
    );
  get diagnostics v_master_only_count = row_count;
  select count(*) filter(where not existed),count(*) filter(where existed)
    into v_new,v_existing from tmp_kinojo_prepare_list;

  select count(*) into v_compare_total from tmp_kinojo_prepare_list;

  insert into public.lookup_session_targets(
    session_id, lookup_order, list_row, list_original_name, server_id, server_name, character_name,
    main_character_name, class_name, target_status, target_source, existed_in_master, corrected
  )
  select
    p_session_id,
    row_number() over(order by t.character_name, t.server_id),
    t.list_row,
    t.raw_name,
    t.server_id,
    coalesce(cm.server_name, t.server_name, '지켈'),
    t.character_name,
    coalesce(t.main_character_name, cm.main_character_name, t.character_name),
    coalesce(t.class_name, cm.class_name, ''),
    'queued',
    case
      when t.list_row is null then 'server:db_only_restore_v1'
      when v_lookup_mode = 'missing_only' then 'server:list_master_missing_only_owner_v8_strict'
      when v_filter_applied and t.existed then 'server:list_master_existing_filtered_owner_v8_strict'
      when v_filter_applied then 'server:list_master_new_filtered_owner_v8_strict'
      when t.existed then 'server:list_master_existing_owner_v8_strict'
      else 'server:list_master_new_wait_lookup_owner_v8_strict'
    end,
    t.existed,
    t.corrected
  from tmp_kinojo_prepare_list t
  left join lateral (
    select cm.*
      from public.character_master cm
     where cm.server_id = t.server_id
       and public.kinojo_character_identity_key_v298(cm.character_name) = t.normalized_name
     order by
       case when cm.character_name = t.character_name then 0 else 1 end,
       case when coalesce(cm.is_active, true) then 0 else 1 end,
       cm.updated_at desc nulls last,
       cm.id desc
     limit 1
  ) cm on true
  where
    (v_lookup_mode = 'all' or coalesce(t.existed, false) is false)
    and (
      v_filter_character is null
      or public.kinojo_character_identity_key_v298(t.character_name)
         = public.kinojo_character_identity_key_v298(public.kinojo_strip_server_suffix(v_filter_character))
    )
    and (
      jsonb_array_length(v_filter_classes) = 0
      or exists (
        select 1
        from jsonb_array_elements_text(v_filter_classes) f(value)
        where public.kinojo_normalize_aion_class_name(f.value)
              = public.kinojo_normalize_aion_class_name(coalesce(t.class_name, cm.class_name, ''))
      )
    )
    and (
      jsonb_array_length(v_filter_races) = 0
      or exists (
        select 1
        from jsonb_array_elements_text(v_filter_races) f(value)
        where upper(trim(f.value)) = case
          when t.server_id between 1000 and 1999 then 'ELYOS'
          when t.server_id between 2000 and 2999 then 'ASMODIAN'
          else ''
        end
      )
    )
    and (
      jsonb_array_length(v_filter_servers) = 0
      or exists (
        select 1
        from jsonb_array_elements_text(v_filter_servers) f(value)
        where regexp_replace(f.value, '[^0-9]', '', 'g') = t.server_id::text
         or exists (
           select 1
           from public.server_master sm
           where sm.server_id = t.server_id
             and btrim(f.value) in (sm.server_name, sm.server_short_name)
         )
      )
    )
    and (
      jsonb_array_length(v_filter_gear_types) = 0
      or jsonb_array_length(v_filter_gear_types) >= 2
      or exists (
        select 1
        from jsonb_array_elements_text(v_filter_gear_types) f(value)
        where
          (upper(trim(f.value)) = 'PVE' and (coalesce(cm.latest_pve_combat_power, 0) > 0 or coalesce(cm.latest_pve_item_level, 0) > 0))
          or
          (upper(trim(f.value)) = 'PVP' and (coalesce(cm.latest_pvp_combat_power, 0) > 0 or coalesce(cm.latest_pvp_item_level, 0) > 0))
      )
    )
  order by t.character_name, t.server_id
  on conflict(session_id, server_id, character_name) do update set
    lookup_order = excluded.lookup_order,
    list_row = excluded.list_row,
    list_original_name = excluded.list_original_name,
    server_name = excluded.server_name,
    main_character_name = excluded.main_character_name,
    class_name = excluded.class_name,
    target_status = 'queued',
    target_source = excluded.target_source,
    existed_in_master = excluded.existed_in_master,
    corrected = excluded.corrected,
    payload_id = null,
    snapshot_id = null,
    last_error = null,
    queued_at = now(),
    claimed_at = null,
    looked_up_at = null,
    updated_at = now();

  select
    count(*)::int,
    count(*) filter (where coalesce(existed_in_master, false) is false)::int,
    count(*) filter (where coalesce(existed_in_master, false) is true)::int
  into v_total, v_selected_new, v_selected_existing
  from public.lookup_session_targets
  where session_id = p_session_id;

  select count(*) into v_absent
  from public.character_master cm
  where coalesce(cm.status, '') not in ('DELETED', 'INACTIVE')
    and coalesce(cm.is_active, true) is true
    and (cm.list_row is not null or coalesce(cm.bootstrap_source, '') like 'google_list%')
    and public.kinojo_lookup_admin_exclusion_reason(cm.server_id, cm.character_name) is null
    and not exists (
      select 1 from tmp_kinojo_prepare_list t
      where t.server_id = cm.server_id
        and public.kinojo_character_identity_key_v298(t.character_name) = public.kinojo_character_identity_key_v298(cm.character_name)
    );

  select count(*), coalesce(max(cm.list_row), 0)
  into v_active_list_master, v_master_max_row
  from public.character_master cm
  where coalesce(cm.is_active,true) is true
    and (cm.list_row is not null or coalesce(cm.bootstrap_source,'') like 'google_list%')
    and public.kinojo_lookup_admin_exclusion_reason(cm.server_id, cm.character_name) is null;

  select coalesce(max(t.list_row), 0) into v_incoming_max_row
  from tmp_kinojo_prepare_list t;

  v_list_coverage := case
    when v_active_list_master > 0 then least(1, v_compare_total::numeric / v_active_list_master::numeric)
    else 1
  end;
  v_list_row_coverage := case
    when v_master_max_row > 0 then least(1, v_incoming_max_row::numeric / v_master_max_row::numeric)
    else 1
  end;
  -- v470: list presence is not an administrative exclusion or membership decision.
  v_list_absence_sync_accepted := false;
  v_absent_deactivated := 0;

  select coalesce(jsonb_agg(jsonb_build_object(
    'row', t.list_row,
    'name', t.character_name,
    'originalName', coalesce(t.list_original_name, t.character_name),
    'characterName', t.character_name,
    'mainCharacterName', t.main_character_name,
    'serverId', t.server_id::text,
    'serverName', coalesce(t.server_name, '지켈'),
    'className', coalesce(t.class_name, ''),
    'latestPveItemLevel', cm.latest_pve_item_level,
    'latestPveCombatPower', cm.latest_pve_combat_power,
    'latestPvpItemLevel', cm.latest_pvp_item_level,
    'latestPvpCombatPower', cm.latest_pvp_combat_power,
    'source', t.target_source,
    'targetId', t.id
  ) order by t.lookup_order), '[]'::jsonb)
  into v_queue
  from public.lookup_session_targets t
  left join lateral (
    select cm.*
      from public.character_master cm
     where cm.server_id = t.server_id
       and public.kinojo_character_identity_key_v298(cm.character_name)
           = public.kinojo_character_identity_key_v298(t.character_name)
     order by
       case when cm.character_name = t.character_name then 0 else 1 end,
       case when coalesce(cm.is_active, true) then 0 else 1 end,
       cm.updated_at desc nulls last,
       cm.id desc
     limit 1
  ) cm on true
  where t.session_id = p_session_id;

  perform public.kinojo_lookup_step_upsert(
    p_session_id, 'LIST_MASTER_COMPARE', 1, 'done', v_compare_total, greatest(v_compare_total, 1),
    'Server Engine LIST / MASTER 대조·중복 정리 및 조회 조건 적용 완료',
    jsonb_build_object(
      'rawListCount', jsonb_array_length(p_list),
      'compareCount', v_compare_total,
      'queueCount', v_total,
      'newCount', v_new,
      'existingCount', v_existing,
      'correctedCount', v_corrected,
      'duplicateListCount', v_duplicate_list_count,
      'duplicateMasterCount', v_duplicate_master_count,
      'excludedCount', v_excluded,
      'invalidServerCount', v_invalid_server_count,
      'invalidServerRows', v_invalid_server_rows,
      'adminExcludedCount', v_admin_excluded,
      'absentCandidateCount', v_absent,
      'autoDeactivatedCount', v_absent_deactivated,
      'autoRestoredCount', v_auto_restored,
      'listCoverage', round(v_list_coverage, 4),
      'listAbsenceSyncAccepted', v_list_absence_sync_accepted,
      'listAbsenceCountThreshold', 0.95,
      'listAbsenceRowThreshold', 0.98,
      'listRowCoverage', round(v_list_row_coverage, 4),
      'serverOwnedCompare', true,
      'serverOwnedFilter', true,
      'lookupMode', v_lookup_mode,
      'selectedNewCount', v_selected_new,
      'selectedExistingCount', v_selected_existing,
      'gearTypeFilterIgnored', v_gear_filter_ignored,
      'lookupFilter', v_filter,
      'lookupFilterSummary', v_filter_summary,
      'persistentTargets', true
    )
  );

  perform public.kinojo_runtime_progress(
    p_session_id, p_session_token, 'LIST_MASTER_COMPARE', null,
    'Server Engine LIST / MASTER 대조·중복 정리 및 조회 조건 적용 완료', v_compare_total, greatest(v_compare_total, 1),
    jsonb_build_object(
      'rawListCount', jsonb_array_length(p_list),
      'compareCount', v_compare_total,
      'queueCount', v_total,
      'newCount', v_new,
      'existingCount', v_existing,
      'correctedCount', v_corrected,
      'duplicateListCount', v_duplicate_list_count,
      'duplicateMasterCount', v_duplicate_master_count,
      'excludedCount', v_excluded,
      'invalidServerCount', v_invalid_server_count,
      'invalidServerRows', v_invalid_server_rows,
      'adminExcludedCount', v_admin_excluded,
      'absentCandidateCount', v_absent,
      'autoDeactivatedCount', v_absent_deactivated,
      'autoRestoredCount', v_auto_restored,
      'listCoverage', round(v_list_coverage, 4),
      'listAbsenceSyncAccepted', v_list_absence_sync_accepted,
      'listAbsenceCountThreshold', 0.95,
      'listAbsenceRowThreshold', 0.98,
      'listRowCoverage', round(v_list_row_coverage, 4),
      'serverOwnedCompare', true,
      'serverOwnedFilter', true,
      'lookupMode', v_lookup_mode,
      'selectedNewCount', v_selected_new,
      'selectedExistingCount', v_selected_existing,
      'gearTypeFilterIgnored', v_gear_filter_ignored,
      'lookupFilter', v_filter,
      'lookupFilterSummary', v_filter_summary,
      'persistentTargets', true
    )
  );

  return jsonb_build_object(
    'ok', true,
    'masterOnlyCount',v_master_only_count,
    'sessionId', p_session_id,
    'rawListCount', jsonb_array_length(p_list),
    'compareCount', v_compare_total,
    'queueCount', v_total,
    'lookupMode', v_lookup_mode,
    'filteredCount', v_total,
    'newCharacterCount', v_new,
    'existingMasterCount', v_existing,
    'invalidCount', v_excluded,
    'invalidServerCount', v_invalid_server_count,
    'invalidServerRows', v_invalid_server_rows,
    'selectedNewCount', v_selected_new,
    'selectedExistingCount', v_selected_existing,
    'gearTypeFilterIgnored', v_gear_filter_ignored,
    'newCount', v_new,
    'existingCount', v_existing,
    'correctedCount', v_corrected,
    'duplicateListCount', v_duplicate_list_count,
    'duplicateMasterCount', v_duplicate_master_count,
    'excludedCount', v_excluded,
    'adminExcludedCount', v_admin_excluded,
    'absentCandidateCount', v_absent,
    'autoDeactivatedCount', v_absent_deactivated,
    'autoRestoredCount', v_auto_restored,
    'listCoverage', round(v_list_coverage, 4),
    'listAbsenceSyncAccepted', v_list_absence_sync_accepted,
    'listAbsenceCountThreshold', 0.95,
    'listAbsenceRowThreshold', 0.98,
    'listRowCoverage', round(v_list_row_coverage, 4),
    'filterApplied', v_filter_applied,
    'lookupFilter', v_filter,
    'lookupFilterSummary', v_filter_summary,
    'queue', v_queue,
    'message', case
      when v_lookup_mode = 'missing_only' and v_total = 0
        then '신규 캐릭터가 없습니다. list와 Server Master가 모두 일치합니다.'
      when v_lookup_mode = 'missing_only'
        then 'Server Engine 신규 캐릭터 Target 생성 완료 · 신규 조회 ' || v_total::text || '명 · 관리자 제외 ' || v_admin_excluded::text || '명'
      when v_filter_applied
        then 'Server Engine LIST / MASTER 대조·중복 정리 및 조건 Target 생성 완료 · 관리자 제외 ' || v_admin_excluded::text || '명'
      else 'Server Engine LIST / MASTER 대조·중복 정리 및 전체 Target 생성 완료 · 관리자 제외 ' || v_admin_excluded::text || '명' || case when v_invalid_server_count > 0 then ' · 서버 확인 필요 ' || v_invalid_server_count::text || '명' else '' end
    end
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.kinojo_legion_tree_listless_policy_v455(p_session_id text, p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
 SET statement_timeout TO '5s'
 SET lock_timeout TO '1s'
AS $function$
declare
  v_valid jsonb;
  v_session public.updater_sessions%rowtype;
  v_target_count integer := 0;
  v_exact_target_count integer := 0;
  v_list_queue_count integer := 0;
  v_allowed boolean := false;
begin
  v_valid:=public.kinojo_validate_updater_session(p_session_id,p_session_token);
  if coalesce((v_valid->>'ok')::boolean,false) is not true then
    return v_valid;
  end if;

  select * into v_session
    from public.updater_sessions s
   where s.session_id=p_session_id;
  if not found then
    return jsonb_build_object('ok',false,'code','SERVER_QUEUE_SESSION_NOT_FOUND','message','Server Queue 세션을 찾지 못했습니다.');
  end if;

  select count(*),
         count(*) filter (where t.target_source='server:legion_tree_character_add_v455')
    into v_target_count,v_exact_target_count
    from public.lookup_session_targets t
   where t.session_id=p_session_id;

  select count(*) into v_list_queue_count
    from public.google_list_sheet_sync_queue q
   where q.session_id=p_session_id;

  v_allowed:=v_target_count=1
    and v_exact_target_count=1
    and coalesce(v_session.raw_payload->>'requestedSurface','')='LEGION_TREE_CHARACTER_ADD'
    and coalesce(v_session.raw_payload->>'databaseContract','')='455';

  return jsonb_build_object(
    'ok',true,
    'skipListWrite',v_allowed or not v_session.list_sheet_sync_enabled,
    'listSheetSyncEnabled',v_session.list_sheet_sync_enabled,
    'listSkipReason',case when v_allowed then 'LEGION_TREE_CHARACTER_ADD' when not v_session.list_sheet_sync_enabled then 'USER_DISABLED' else null end,
    'listlessCharacterAdd',v_allowed,
    'targetCount',v_target_count,
    'exactTargetCount',v_exact_target_count,
    'listQueueCount',v_list_queue_count,
    'targetSource',case when v_allowed then 'server:legion_tree_character_add_v455' else null end,
    'terminalStage',case when v_allowed or not v_session.list_sheet_sync_enabled then 'SERVER_QUEUE_CHARACTER_MASTER_DONE' else null end,
    'databaseContract','455',
    'message',case when v_allowed
      then '레기온 트리 캐릭터 추가 세션 · Google list 쓰기·readback 생략'
      when not v_session.list_sheet_sync_enabled then '실행 설정에 따라 Google list 쓰기·readback 생략'
      else '기존 Server Queue Google list 계약 유지' end
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.kinojo_character_activity_claim(p_session_id text, p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare c public.character_master%rowtype; p jsonb; result jsonb:='[]'; v_id uuid; n integer:=0;
begin
 if not private.kinojo_character_activity_session(p_session_id,p_session_token) then
   return jsonb_build_object('ok',false,'code','ACTIVITY_SESSION_INVALID');end if;
 perform private.kinojo_character_activity_lock();
 -- A repeated call in the same scheduled run never consumes another batch.
 if exists(select 1 from private.character_activity_checks where session_id=p_session_id) then
   return jsonb_build_object('ok',true,'targets',result,'repeated',true);end if;
 -- Establish exclusion episodes before any pending claim invalidates family evidence.
 for c in select m.* from public.character_master m order by m.id loop
   if private.kinojo_character_lookup_policy(c.id)->>'reason'='AUTO_NO_ACTIVITY'
     or exists(select 1 from private.character_activity_lifecycle l where l.character_id=c.id) then
     perform private.kinojo_character_activity_reconcile(c.id);
   end if;
 end loop;
 for c in select m.* from public.character_master m left join private.character_activity_checks r on r.character_id=m.id
   where coalesce(r.next_check_at,'-infinity'::timestamptz)<=now()
   order by coalesce(r.next_check_at,'-infinity'::timestamptz),m.id
 loop
   p:=private.kinojo_character_lookup_policy(c.id);
   if p->>'reason' in ('AUTO_NO_ACTIVITY','AUTO_INACTIVE') or (p->>'reason' in ('ACTIVITY_REVIEW_WAIT','ACTIVITY_REVIEW_DUE')
     and exists(select 1 from private.character_activity_lifecycle l where l.character_id=c.id and l.excluded_at is not null)) then
     v_id:=gen_random_uuid();
     insert into private.character_activity_checks(character_id,session_id,claim_id,claimed_at,lease_until,next_check_at,source_revision,outcome)
       values(c.id,p_session_id,v_id,now(),now()+interval '100 seconds',now()+interval '7 days',to_jsonb(c),'CLAIMED')
     on conflict(character_id) do update set session_id=excluded.session_id,claim_id=excluded.claim_id,claimed_at=excluded.claimed_at,
       lease_until=excluded.lease_until,next_check_at=excluded.next_check_at,source_revision=excluded.source_revision,
       checked_at=null,outcome='CLAIMED',code=null,profile=null;
     perform private.kinojo_character_activity_reconcile(c.id);
     result:=result||jsonb_build_array(jsonb_build_object('characterId',c.id,'claimId',v_id,'serverId',c.server_id,
       'characterName',c.character_name,'charKey',c.char_key,'detailUrl',c.detail_url,'className',c.class_name));
     n:=n+1;exit when n>=5;
   elsif exists(select 1 from private.character_activity_lifecycle l where l.character_id=c.id) then
     perform private.kinojo_character_activity_reconcile(c.id);
   end if;
 end loop;
 return jsonb_build_object('ok',true,'targets',result,'batchLimit',5,'intervalDays',7);
exception when lock_not_available then
 return jsonb_build_object('ok',false,'code','ACTIVITY_RELATION_BUSY','retryable',true);
end;
$function$;


CREATE OR REPLACE FUNCTION public.kinojo_automation_window_v377(p_job_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_key text := lower(trim(coalesce(p_job_type, '')));
  v_setting public.kinojo_server_automation_settings%rowtype;
  v_now timestamptz := clock_timestamp();
  v_now_kst timestamp := timezone('Asia/Seoul', v_now);
  v_today date := timezone('Asia/Seoul', v_now)::date;
  v_item text;
  v_hour integer;
  v_minute integer;
  v_run_local timestamp;
  v_run_at timestamptz;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_active_run timestamptz;
  v_active_start timestamptz;
  v_active_end timestamptz;
  v_next_run timestamptz;
  v_phase text := 'available';
  v_message text := '';
  v_blocked boolean := false;
begin
  select * into v_setting
  from public.kinojo_server_automation_settings
  where automation_key = v_key;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'AUTOMATION_NOT_FOUND', 'message', '자동화 설정을 찾지 못했습니다.');
  end if;

  for v_item in select jsonb_array_elements_text(v_setting.schedule_kst)
  loop
    v_hour := split_part(v_item, ':', 1)::integer;
    v_minute := split_part(v_item, ':', 2)::integer;

    for i in -1..1 loop
      v_run_local := (v_today + i) + make_interval(hours => v_hour, mins => v_minute);
      v_run_at := v_run_local at time zone 'Asia/Seoul';
      v_window_start := v_run_at - make_interval(mins => v_setting.pre_block_minutes);
      v_window_end := v_run_at + make_interval(mins => v_setting.post_block_minutes);

      if v_run_at > v_now and (v_next_run is null or v_run_at < v_next_run) then
        v_next_run := v_run_at;
      end if;

      if v_now >= v_window_start and v_now <= v_window_end then
        v_active_run := v_run_at;
        v_active_start := v_window_start;
        v_active_end := v_window_end;
        if v_now < v_run_at then v_phase := 'pre';
        elsif v_now = v_run_at then v_phase := 'scheduled';
        else v_phase := 'post';
        end if;
      end if;
    end loop;
  end loop;

  -- Read-only effective state: an expired job must not keep manual work blocked.
  if v_setting.running is true and exists (
    select 1 from public.updater_runtime_jobs j
    where j.session_id=v_setting.active_session_id and lower(j.status)='expired'
  ) and not exists (
    select 1 from public.updater_runtime_jobs j
    where j.session_id=v_setting.active_session_id
      and lower(j.status) in ('starting','running','paused')
  ) then
    v_setting.running := false;
    v_setting.last_status := 'failed';
    v_setting.last_message := 'Heartbeat timeout: automatic refresh expired';
  end if;

  if v_setting.running is true then
    v_phase := 'running';
    v_blocked := true;
    v_message := case v_key
      when 'character_refresh' then '서버에서 캐릭터 정보 자동 최신화를 진행 중입니다. 완료 후 다시 이용해 주세요.'
      else '서버에서 성역 시트 자동 동기화를 진행 중입니다. 완료 후 다시 이용해 주세요.'
    end;
  elsif v_setting.enabled is true and v_active_run is not null then
    v_blocked := true;
    if v_phase = 'pre' then
      v_message := to_char(timezone('Asia/Seoul', v_active_run), 'HH24:MI') ||
        case v_key when 'character_refresh' then ' 캐릭터 정보 자동 최신화 예정으로 수동 조회가 제한됩니다.'
        else ' 성역 시트 자동 동기화 예정으로 수동 동기화가 제한됩니다.' end;
    else
      v_message := case v_key when 'character_refresh' then '캐릭터 정보 자동 최신화 후 안정화 중입니다.'
        else '성역 시트 자동 동기화 후 안정화 중입니다.' end ||
        ' ' || to_char(timezone('Asia/Seoul', v_active_end), 'HH24:MI') || '부터 다시 이용할 수 있습니다.';
    end if;
  elsif v_setting.enabled is not true then
    v_phase := 'disabled';
    v_message := '자동 실행이 OFF 상태입니다.';
  else
    v_message := '수동 실행을 이용할 수 있습니다.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'jobType', v_key,
    'enabled', v_setting.enabled,
    'listSheetSyncEnabled', coalesce((to_jsonb(v_setting)->>'list_sheet_sync_enabled')::boolean,true),
    'running', v_setting.running,
    'runId', v_setting.active_run_id,
    'sessionId', v_setting.active_session_id,
    'scheduleKst', v_setting.schedule_kst,
    'preBlockMinutes', v_setting.pre_block_minutes,
    'postBlockMinutes', v_setting.post_block_minutes,
    'manualBlocked', v_blocked,
    'phase', v_phase,
    'message', v_message,
    'blockedFrom', v_active_start,
    'blockedUntil', case when v_setting.running then null else v_active_end end,
    'scheduledRunAt', v_active_run,
    'nextRunAt', v_next_run,
    'lastStartedAt', v_setting.last_started_at,
    'lastFinishedAt', v_setting.last_finished_at,
    'lastStatus', v_setting.last_status,
    'lastMessage', v_setting.last_message,
    'generatedAt', v_now
  );
end;
$function$;

do $rollback$ declare j record; begin
  perform 1 from public.kinojo_server_automation_settings where automation_key='character_refresh' for update;
  if (select running from public.kinojo_server_automation_settings where automation_key='character_refresh') then
    raise exception 'AUTOMATION_RUNNING';
  end if;
  update public.kinojo_server_automation_settings set schedule_kst='["10:00","22:00"]'::jsonb,updated_at=now() where automation_key='character_refresh';
  for j in select jobid from cron.job where jobname='kinojo-character-refresh-6h-v377' loop
    perform cron.alter_job(j.jobid,schedule := '0 1,13 * * *');
  end loop;
end; $rollback$;
drop function if exists public.kinojo_admin_server_routines_v533(text);
drop function if exists private.kinojo_cron_preview_v533(text,timestamptz);
commit;
