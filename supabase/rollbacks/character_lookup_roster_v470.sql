-- Restore definitions only. Do not re-deactivate the repaired character.
CREATE OR REPLACE FUNCTION public.kinojo_prepare_lookup_queue_from_list_v296(p_session_id text, p_session_token text, p_list jsonb, p_filter jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_valid jsonb;
  v_compare_total int := 0;
  v_total int := 0;
  v_new int := 0;
  v_existing int := 0;
  v_corrected int := 0;
  v_excluded int := 0;
  v_absent int := 0;
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

  if jsonb_typeof(p_list) <> 'array' then
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

    -- Google list에서 자동 탈퇴 처리된 캐릭터가 다시 나타나면 자동 복구합니다.
    with restored as (
      update public.character_master cm
         set is_active = true,
             inactive_reason = null,
             inactive_memo = null,
             restored_at = now(),
             status_updated_at = now(),
             status = case when coalesce(cm.status,'') in ('INACTIVE','DELETED') then 'OK' else cm.status end,
             sync_status = 'list_present_auto_restored',
             updated_at = now()
       where cm.id = v_master_id
         and coalesce(cm.is_active,true) is false
         and cm.sync_status = 'list_absent_auto_inactive'
      returning cm.character_name, cm.server_id
    )
    insert into public.character_status_history(character_name, server_id, action, reason, memo, admin_pass_key)
    select character_name, server_id, 'RESTORE_AUTO_LIST_PRESENT', 'LIST_PRESENT', 'Google list에 다시 등록되어 자동 복구', 'SERVER_ENGINE'
    from restored;
    get diagnostics v_changed = row_count;
    v_auto_restored := v_auto_restored + coalesce(v_changed,0);

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
             class_name = coalesce(v_class_name, cm.class_name),
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
        class_name = coalesce(excluded.class_name, public.character_master.class_name),
        main_character_name = coalesce(excluded.main_character_name, public.character_master.main_character_name),
        is_main = excluded.is_main,
        last_seen_at = now(),
        sync_status = 'lookup_queued',
        updated_at = now();
    end if;

    insert into tmp_kinojo_prepare_list(list_row, raw_name, character_name, normalized_name, server_id, server_name, class_name, main_character_name, is_main, existed, corrected)
    values(v_row_no, v_raw_name, v_name, v_normalized_name, v_server_id, v_server_name, v_class_name, v_main_name, v_is_main, v_exists, v_exists and v_row_no is not null and coalesce(v_before_list_row, -1) <> v_row_no);
  end loop;

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
  v_list_absence_sync_accepted := v_invalid_server_count = 0
    and jsonb_array_length(p_list) > 0
    and (
      v_active_list_master < 10
      or (v_list_coverage >= 0.95 and v_list_row_coverage >= 0.98)
    );

  -- 시트 일부 읽기·중간 중단으로 대량 탈퇴되는 일을 막기 위해 수량과 마지막 행을 함께 검증합니다.
  if v_list_absence_sync_accepted then
    with deactivated as (
      update public.character_master cm
         set is_active = false,
             inactive_reason = '탈퇴',
             inactive_memo = 'Google list 원본에서 삭제되어 조회 시작 시 자동 탈퇴 처리',
             inactivated_at = now(),
             restored_at = null,
             status_updated_at = now(),
             status = 'INACTIVE',
             sync_status = 'list_absent_auto_inactive',
             updated_at = now()
       where coalesce(cm.is_active,true) is true
         and (cm.list_row is not null or coalesce(cm.bootstrap_source,'') like 'google_list%')
         and public.kinojo_lookup_admin_exclusion_reason(cm.server_id, cm.character_name) is null
         and not exists (
           select 1 from tmp_kinojo_prepare_list t
           where t.server_id = cm.server_id
             and public.kinojo_character_identity_key_v298(t.character_name) = public.kinojo_character_identity_key_v298(cm.character_name)
         )
      returning cm.character_name, cm.server_id
    )
    insert into public.character_status_history(character_name, server_id, action, reason, memo, admin_pass_key)
    select character_name, server_id, 'DEACTIVATE_AUTO_LIST_ABSENT', '탈퇴', 'Google list 원본에서 삭제되어 자동 탈퇴 처리', 'SERVER_ENGINE'
    from deactivated;
    get diagnostics v_absent_deactivated = row_count;
  end if;

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

CREATE OR REPLACE FUNCTION public.kinojo_prepare_lookup_queue_from_list(p_session_id text, p_session_token text, p_list jsonb, p_filter jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb := '{}'::jsonb;
  v_augmented_list jsonb := coalesce(p_list, '[]'::jsonb);
  v_item jsonb;
  v_identity jsonb;
  v_raw_name text;
  v_server_id integer;
  v_full_lookup boolean := false;
  v_absent_count integer := 0;
  v_hidden_count integer := 0;
  v_restored_count integer := 0;
  v_queue jsonb := '[]'::jsonb;
  v_original_count integer := 0;
begin
  if jsonb_typeof(p_list) <> 'array' then
    return jsonb_build_object('ok',false,'code','INVALID_LIST','message','p_list는 배열이어야 합니다.');
  end if;

  v_original_count := jsonb_array_length(p_list);
  v_full_lookup := public.kinojo_is_full_list_lookup_v297(p_filter);

  create temporary table if not exists tmp_kinojo_original_list_identity_v297 (
    server_id integer not null,
    normalized_name text not null,
    primary key(server_id, normalized_name)
  ) on commit drop;
  truncate tmp_kinojo_original_list_identity_v297;

  for v_item in select value from jsonb_array_elements(p_list)
  loop
    v_raw_name := nullif(trim(coalesce(v_item->>'name',v_item->>'characterName',v_item->>'character_name','')), '');
    if v_raw_name is null then continue; end if;
    v_server_id := coalesce(
      case when coalesce(v_item->>'serverId','') ~ '^[0-9]+$' then (v_item->>'serverId')::integer end,
      case when coalesce(v_item->>'server_id','') ~ '^[0-9]+$' then (v_item->>'server_id')::integer end,
      2002
    );
    v_identity := public.kinojo_character_identity_strict_258(v_raw_name, v_server_id);
    if coalesce((v_identity->>'matchable')::boolean,false) then
      insert into tmp_kinojo_original_list_identity_v297(server_id,normalized_name)
      values((v_identity->>'serverId')::integer, public.kinojo_character_identity_key_v298(v_identity->>'characterName'))
      on conflict do nothing;
    end if;
  end loop;

  create temporary table if not exists tmp_kinojo_absent_candidates_v297 (
    character_id bigint primary key,
    server_id integer not null,
    server_name text,
    character_name text not null,
    class_name text,
    main_character_name text,
    is_main boolean,
    previous_sync_status text,
    previous_is_active boolean
  ) on commit drop;
  truncate tmp_kinojo_absent_candidates_v297;

  if v_full_lookup and v_original_count > 0 then
    insert into tmp_kinojo_absent_candidates_v297(
      character_id,server_id,server_name,character_name,class_name,main_character_name,is_main,
      previous_sync_status,previous_is_active
    )
    select
      cm.id,cm.server_id,cm.server_name,cm.character_name,cm.class_name,
      coalesce(cm.main_character_name,cm.character_name),coalesce(cm.is_main,false),
      cm.sync_status,coalesce(cm.is_active,true)
    from public.character_master cm
    where coalesce(cm.status,'') <> 'DELETED'
      and (cm.list_row is not null or coalesce(cm.bootstrap_source,'') like 'google_list%')
      and public.kinojo_lookup_admin_exclusion_reason(cm.server_id,cm.character_name) is null
      and (
        coalesce(cm.is_active,true) is true
        or coalesce(cm.sync_status,'') in ('list_absent_auto_inactive','list_absent_identity_check')
        or coalesce(cm.exclusion_reason,'') = 'LIST_ABSENT_PENDING'
        or coalesce(cm.identity_status,'') = 'LIST_ABSENT_CHECK'
      )
      and not exists (
        select 1 from tmp_kinojo_original_list_identity_v297 li
        where li.server_id=cm.server_id
          and li.normalized_name=public.kinojo_character_identity_key_v298(cm.character_name)
      );

    select count(*) into v_absent_count from tmp_kinojo_absent_candidates_v297;

    select v_augmented_list || coalesce(jsonb_agg(jsonb_build_object(
      'row',null,
      'name',c.character_name,
      'characterName',c.character_name,
      'serverId',c.server_id,
      'serverName',c.server_name,
      'className',c.class_name,
      'mainCharacterName',c.main_character_name,
      '__listAbsentCandidate',true,
      '__characterMasterId',c.character_id
    )),'[]'::jsonb)
    into v_augmented_list
    from tmp_kinojo_absent_candidates_v297 c;

    with changed as (
      update public.character_master cm
         set visibility_excluded=true,
             exclusion_reason='LIST_ABSENT_PENDING',
             exclusion_memo='Google list에서 제외되어 공식 이름·서버·저장 상세 URL·charKey 확인 중',
             visibility_excluded_at=coalesce(cm.visibility_excluded_at,now()),
             sync_status='list_absent_identity_check',
             identity_status='LIST_ABSENT_CHECK',
             status_updated_at=now(),
             updated_at=now()
        from tmp_kinojo_absent_candidates_v297 c
       where cm.id=c.character_id
         and (
           coalesce(cm.visibility_excluded,false) is false
           or coalesce(cm.sync_status,'') <> 'list_absent_identity_check'
           or coalesce(cm.identity_status,'') <> 'LIST_ABSENT_CHECK'
         )
      returning cm.character_name,cm.server_id
    )
    insert into public.character_status_history(character_name,server_id,action,reason,memo,admin_pass_key)
    select character_name,server_id,'HIDE_AUTO_LIST_ABSENT_PENDING','LIST_ABSENT',
           'Google list 제외 감지 · 공식 신원 확인 전 WEB 전체 미노출','SERVER_ENGINE'
    from changed;
    get diagnostics v_hidden_count = row_count;
  end if;

  v_result := public.kinojo_prepare_lookup_queue_from_list_v296(
    p_session_id,p_session_token,v_augmented_list,coalesce(p_filter,'{}'::jsonb)
  );
  if coalesce((v_result->>'ok')::boolean,false) is not true then return v_result; end if;

  if v_full_lookup and v_absent_count > 0 then
    update public.lookup_session_targets t
       set list_row=null,
           target_source='server:list_absent_identity_check_v297',
           list_original_name=coalesce(t.list_original_name,t.character_name),
           updated_at=now()
      from tmp_kinojo_absent_candidates_v297 c
     where t.session_id=p_session_id
       and t.server_id=c.server_id
       and public.kinojo_character_identity_key_v298(t.character_name)
           = public.kinojo_character_identity_key_v298(c.character_name);

    update public.character_master cm
       set visibility_excluded=true,
           exclusion_reason='LIST_ABSENT_PENDING',
           exclusion_memo='Google list에서 제외되어 공식 이름·서버·저장 상세 URL·charKey 확인 중',
           visibility_excluded_at=coalesce(cm.visibility_excluded_at,now()),
           sync_status='list_absent_identity_check',
           identity_status='LIST_ABSENT_CHECK',
           updated_at=now()
      from tmp_kinojo_absent_candidates_v297 c
     where cm.id=c.character_id;
  end if;

  with restored as (
    update public.character_master cm
       set is_active=true,
           inactive_reason=null,
           inactive_memo=null,
           inactivated_at=null,
           restored_at=now(),
           status='OK',
           visibility_excluded=false,
           exclusion_reason=null,
           exclusion_memo=null,
           visibility_excluded_at=null,
           identity_status='CURRENT',
           identity_verified_at=now(),
           sync_status='list_present_auto_restored',
           status_updated_at=now(),
           updated_at=now()
     where coalesce(cm.sync_status,'') in (
       'list_absent_identity_check','list_absent_verified_inactive','list_absent_unresolved_inactive'
     )
       and exists (
         select 1 from tmp_kinojo_original_list_identity_v297 li
         where li.server_id=cm.server_id
           and li.normalized_name=public.kinojo_character_identity_key_v298(cm.character_name)
       )
    returning cm.character_name,cm.server_id
  )
  insert into public.character_status_history(character_name,server_id,action,reason,memo,admin_pass_key)
  select character_name,server_id,'RESTORE_AUTO_LIST_PRESENT','LIST_PRESENT',
         'Google list에 다시 등록되어 기존 캐릭터 행 자동 복구','SERVER_ENGINE'
  from restored;
  get diagnostics v_restored_count = row_count;

  select coalesce(jsonb_agg(jsonb_build_object(
    'row',t.list_row,
    'name',t.character_name,
    'originalName',coalesce(t.list_original_name,t.character_name),
    'characterName',t.character_name,
    'mainCharacterName',t.main_character_name,
    'serverId',t.server_id::text,
    'serverName',coalesce(t.server_name,''),
    'className',coalesce(t.class_name,''),
    'source',t.target_source,
    'targetId',t.id,
    'listAbsentCandidate',t.target_source='server:list_absent_identity_check_v297'
  ) order by t.lookup_order),'[]'::jsonb)
  into v_queue
  from public.lookup_session_targets t
  where t.session_id=p_session_id;

  perform public.kinojo_lookup_step_upsert(
    p_session_id,'LIST_MASTER_COMPARE',1,'done',
    v_original_count+v_absent_count,greatest(v_original_count+v_absent_count,1),
    '현재 list와 Master 대조 · list 이탈 캐릭터 공식 신원 확인 Queue 통합 완료',
    coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
      'databaseContract','297',
      'rawListCount',v_original_count,
      'absentCandidateCount',v_absent_count,
      'absentQueuedCount',v_absent_count,
      'pendingHiddenCount',v_hidden_count,
      'autoRestoredCount',v_restored_count,
      'listAbsenceMode','OFFICIAL_LOOKUP_THEN_INACTIVE',
      'listAbsenceImmediateWebHidden',true,
      'listAbsenceTargetSource','server:list_absent_identity_check_v297',
      'fullLookupDetected',v_full_lookup
    )
  );

  return v_result || jsonb_build_object(
    'databaseContract','297',
    'rawListCount',v_original_count,
    'queueCount',jsonb_array_length(v_queue),
    'filteredCount',jsonb_array_length(v_queue),
    'absentCandidateCount',v_absent_count,
    'absentQueuedCount',v_absent_count,
    'pendingHiddenCount',v_hidden_count,
    'autoDeactivatedCount',0,
    'autoRestoredCount',v_restored_count,
    'listAbsenceSyncAccepted',v_full_lookup,
    'listAbsenceMode','OFFICIAL_LOOKUP_THEN_INACTIVE',
    'listAbsenceImmediateWebHidden',true,
    'fullLookupDetected',v_full_lookup,
    'queue',v_queue,
    'message',case when v_absent_count>0
      then 'Server Engine 전체 Target 생성 완료 · 현재 list '||v_original_count::text||'명 · list 이탈 신원 확인 '||v_absent_count::text||'명'
      else coalesce(v_result->>'message','Server Engine Target 생성 완료') end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_finalize_list_absent_session_v297(p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_count integer := 0;
begin
  with candidates as (
    select distinct on (cm.id)
      cm.id,cm.character_name,cm.server_id,t.id as target_id,t.snapshot_id,t.payload_id
    from public.lookup_session_targets t
    join public.character_master cm
      on cm.server_id=t.server_id
     and public.kinojo_character_identity_key_v298(cm.character_name)
         = public.kinojo_character_identity_key_v298(t.character_name)
    where t.session_id=p_session_id
      and public.kinojo_is_list_absent_target_v300(t.target_source)
      and t.target_status='lookup_done'
    order by cm.id,t.updated_at desc,t.id desc
  ), changed as (
    update public.character_master cm
       set is_active=false,
           inactive_reason='탈퇴',
           inactive_memo='Google list 제외 후 공식 정보 최신화 및 신원 확인 완료',
           inactivated_at=coalesce(cm.inactivated_at,now()),
           restored_at=null,
           status='INACTIVE',
           visibility_excluded=true,
           exclusion_reason='LIST_ABSENT_VERIFIED',
           exclusion_memo='Google list 제외 · 공식 정보 최신화 완료 · WEB 전체 미노출',
           visibility_excluded_at=coalesce(cm.visibility_excluded_at,now()),
           sync_status='list_absent_verified_inactive',
           identity_status='VERIFIED_INACTIVE',
           identity_verified_at=now(),
           status_updated_at=now(),
           updated_at=now()
      from candidates c
     where cm.id=c.id
       and (
         coalesce(cm.sync_status,'') <> 'list_absent_verified_inactive'
         or coalesce(cm.status,'') <> 'INACTIVE'
         or coalesce(cm.identity_status,'') <> 'VERIFIED_INACTIVE'
       )
    returning cm.character_name,cm.server_id
  )
  insert into public.character_status_history(character_name,server_id,action,reason,memo,admin_pass_key)
  select character_name,server_id,'DEACTIVATE_AUTO_LIST_ABSENT_VERIFIED','탈퇴',
         'Google list 제외 후 공식 정보 최신화 완료 · WEB 전체 미노출','SERVER_ENGINE'
  from changed;
  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok',true,'sessionId',p_session_id,'verifiedInactiveCount',v_count,
    'syncStatus','list_absent_verified_inactive','databaseContract','300',
    'message','list 이탈 캐릭터의 공식 정보 최신화 후 비활성화를 완료했습니다.'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_finalize_list_absent_failure_v297(p_session_id text, p_target_id bigint, p_code text, p_message text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_target public.lookup_session_targets%rowtype;
  v_character public.character_master%rowtype;
  v_changed integer := 0;
begin
  select * into v_target from public.lookup_session_targets
  where id=p_target_id and session_id=p_session_id;
  if not found or not public.kinojo_is_list_absent_target_v300(v_target.target_source) then
    return jsonb_build_object('ok',true,'skipped',true,'databaseContract','300');
  end if;

  select * into v_character
  from public.character_master cm
  where cm.server_id=v_target.server_id
    and public.kinojo_character_identity_key_v298(cm.character_name)
        = public.kinojo_character_identity_key_v298(v_target.character_name)
  order by cm.updated_at desc nulls last,cm.id desc
  limit 1;
  if not found then
    return jsonb_build_object('ok',false,'code','LIST_ABSENT_MASTER_NOT_FOUND','targetId',p_target_id,'databaseContract','300');
  end if;

  with changed as (
    update public.character_master cm
       set is_active=false,
           inactive_reason='탈퇴',
           inactive_memo='Google list 제외 후 공식 조회 실패 · 서버 이전·이름 변경·삭제 의심',
           inactivated_at=coalesce(cm.inactivated_at,now()),
           restored_at=null,
           status='INACTIVE',
           visibility_excluded=true,
           exclusion_reason='LIST_ABSENT_UNRESOLVED',
           exclusion_memo=left('공식 신원 확인 실패 · '||coalesce(p_code,'CHARACTER_NOT_FOUND')||' · '||coalesce(p_message,''),1000),
           visibility_excluded_at=coalesce(cm.visibility_excluded_at,now()),
           sync_status='list_absent_unresolved_inactive',
           identity_status='UNRESOLVED',
           identity_change_type='SERVER_TRANSFER_OR_RENAME_OR_DELETED_SUSPECTED',
           identity_changed_at=coalesce(cm.identity_changed_at,now()),
           status_updated_at=now(),
           updated_at=now()
     where cm.id=v_character.id
       and (
         coalesce(cm.sync_status,'') <> 'list_absent_unresolved_inactive'
         or coalesce(cm.status,'') <> 'INACTIVE'
         or coalesce(cm.identity_status,'') <> 'UNRESOLVED'
       )
    returning cm.character_name,cm.server_id
  )
  insert into public.character_status_history(character_name,server_id,action,reason,memo,admin_pass_key)
  select character_name,server_id,'DEACTIVATE_AUTO_LIST_ABSENT_UNRESOLVED','탈퇴',
         '공식 조회 실패 · 서버 이전·이름 변경·삭제 의심 · WEB 전체 미노출','SERVER_ENGINE'
  from changed;
  get diagnostics v_changed = row_count;

  insert into public.character_identity_recovery_queue(
    character_id,source_session_id,source_list_row,reason,queue_status,attempt_count,
    next_retry_at,last_evidence,last_error,created_at,updated_at
  ) values (
    v_character.id,p_session_id,v_character.list_row,
    'LIST_ABSENT_SERVER_TRANSFER_OR_RENAME_OR_DELETED_SUSPECTED','review_required',0,
    now(),jsonb_build_object(
      'targetId',p_target_id,'targetSource',v_target.target_source,
      'characterName',v_target.character_name,'serverId',v_target.server_id,
      'charKey',v_character.char_key,'detailUrl',v_character.detail_url,
      'failureCode',p_code,'failureMessage',p_message,'databaseContract','300'
    ),left(coalesce(p_code,'')||': '||coalesce(p_message,''),1000),now(),now()
  )
  on conflict (character_id) where queue_status in ('pending','retry','processing','review_required')
  do update set
    source_session_id=excluded.source_session_id,
    source_list_row=excluded.source_list_row,
    reason=excluded.reason,
    queue_status='review_required',
    next_retry_at=now(),
    last_evidence=excluded.last_evidence,
    last_error=excluded.last_error,
    updated_at=now(),
    completed_at=null;

  return jsonb_build_object(
    'ok',true,'targetId',p_target_id,'characterId',v_character.id,
    'unresolvedInactive',true,'changed',v_changed>0,
    'classification','SERVER_TRANSFER_OR_RENAME_OR_DELETED_SUSPECTED',
    'recoveryQueueStatus','review_required','databaseContract','300'
  );
end;
$function$;
