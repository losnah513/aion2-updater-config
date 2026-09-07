-- SQL 470: list absence never overrides restored/admin state.
-- DB_ONLY; no new endpoint, grants, tables, Edge or identity discovery algorithm.
SET lock_timeout='3s';
SET statement_timeout='60s';
-- Refuse concurrent source drift or an active updater run before changing the policy.
do $guard$
begin
  if exists(select 1 from public.updater_lock_state where id='global' and is_locked) then
    raise exception 'Updater is running; retry deployment after it finishes';
  end if;
  if md5(pg_get_functiondef('public.kinojo_prepare_lookup_queue_from_list_v296(text,text,jsonb,jsonb)'::regprocedure))
      <> '9460168f9fc4f3dec5627782c3e125b8'
    or md5(pg_get_functiondef('public.kinojo_prepare_lookup_queue_from_list(text,text,jsonb,jsonb)'::regprocedure))
      <> '00bf3e6479f7ab512ad33ca12b85e37b'
    or md5(pg_get_functiondef('public.kinojo_finalize_list_absent_session_v297(text)'::regprocedure))
      <> 'ee9aece2b22fe79bf0f356d0b983d9cc'
    or md5(pg_get_functiondef('public.kinojo_finalize_list_absent_failure_v297(text,bigint,text,text)'::regprocedure))
      <> '7863d8149376cbbd20555f95372340d7' then
    raise exception 'SQL470 baseline changed; inspect before deployment';
  end if;
end;
$guard$;

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
  where coalesce(cm.is_active,true)
    and coalesce(cm.status,'') not in ('DELETED','INACTIVE')
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

CREATE OR REPLACE FUNCTION public.kinojo_prepare_lookup_queue_from_list(
  p_session_id text,p_session_token text,p_list jsonb,p_filter jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_result jsonb;
begin
  -- v296 validates the session before any roster mutation.
  v_result := public.kinojo_prepare_lookup_queue_from_list_v296(
    p_session_id,p_session_token,p_list,coalesce(p_filter,'{}'::jsonb)
  );
  if coalesce((v_result->>'ok')::boolean,false) is not true then return v_result; end if;
  return v_result || jsonb_build_object(
    'databaseContract','470',
    'listAbsencePolicy','PRESERVE_MASTER',
    'listAbsenceMode','PRESERVE_MASTER',
    'listAbsenceImmediateWebHidden',false,
    'pendingHiddenCount',0,'absentQueuedCount',0,
    'fullLookupDetected',public.kinojo_is_full_list_lookup_v297(p_filter),
    'listAbsentCandidateCount',0,'listAbsentHiddenCount',0,
    'listPresentRestoredCount',0,
    'listAbsentVerificationEnabled',false,
    'fullListLookup',public.kinojo_is_full_list_lookup_v297(p_filter)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_finalize_list_absent_session_v297(p_session_id text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
  -- Compatibility for old queued work: successful lookup is not evidence of departure.
  select jsonb_build_object(
    'ok',true,'sessionId',p_session_id,'verifiedInactiveCount',0,
    'skipped',true,'databaseContract','470','listAbsencePolicy','PRESERVE_MASTER',
    'message','list 누락에 따른 자동 비활성화는 사용하지 않습니다.'
  );
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_finalize_list_absent_failure_v297(
  p_session_id text,p_target_id bigint,p_code text,p_message text
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
  -- Failed lookup is recorded by the caller; do not turn list absence into deactivation.
  select jsonb_build_object(
    'ok',true,'targetId',p_target_id,'skipped',true,
    'unresolvedInactive',false,'changed',false,'databaseContract','470',
    'listAbsencePolicy','PRESERVE_MASTER'
  );
$function$;

-- Atomic deployment gate: fixture data rolls back; a failed assertion rolls back all DDL.
do $test$
declare
  v_sid text := 'v470-test-'||md5(clock_timestamp()::text);
  v_token text := md5(random()::text||clock_timestamp()::text);
  v_id bigint;
  v_target bigint;
  v_list jsonb;
  v_with_night jsonb;
  v_result jsonb;
  v_before jsonb;
  v_after jsonb;
  v_report jsonb := '[]'::jsonb;
  v_count integer;
  v_expected integer;
  v_lock boolean;
begin
  begin
    select is_locked into v_lock from public.updater_lock_state where id='global' for update nowait;
    if v_lock then raise exception 'Updater busy; abort test'; end if;
    insert into public.updater_sessions(session_id,session_token,tool_name,client_id,status)
      values(v_sid,v_token,'v470_regression','v470_regression','running');
    update public.updater_lock_state set is_locked=true,session_id=v_sid,session_token=v_token,
      tool_name='v470_regression',client_id='v470_regression',status='running',
      expires_at=now()+interval '15 minutes',last_heartbeat_at=now(),started_at=now()
      where id='global';

    select id into strict v_id from public.character_master
      where character_name='밤' and server_id=2002 and char_key='563512903374739083';
    -- Simulate the user's normal restore inside the rollback-only fixture.
    update public.character_master set is_active=true,status='OK',lookup_excluded=false,
      visibility_excluded=false,inactive_reason=null,inactive_memo=null,inactivated_at=null,
      exclusion_reason=null,exclusion_memo=null,restored_at=now(),sync_status='admin_status_restored'
      where id=v_id;
    select jsonb_build_object('id',id,'name',character_name,'server',server_id,'key',char_key,
      'url',detail_url,'mainId',main_character_id,'mainName',main_character_name,'isMain',is_main,
      'listRow',list_row,'legion',legion_name,'restoredAt',restored_at) into v_before
      from public.character_master where id=v_id;
    select coalesce(jsonb_agg(jsonb_build_object('row',cm.list_row,'name',cm.character_name,
      'serverId',cm.server_id,'className',cm.class_name,'mainCharacterName',cm.main_character_name)), '[]'::jsonb)
      into v_list from public.character_master cm
      where cm.id<>v_id and coalesce(cm.is_active,true) and cm.status not in ('DELETED','INACTIVE')
        and cm.list_row is not null;
    select v_list||jsonb_build_array(jsonb_build_object('row',list_row,'name',character_name,
      'serverId',server_id,'className',class_name,'mainCharacterName',main_character_name))
      into v_with_night from public.character_master where id=v_id;

    for v_count in 1..2 loop
      v_result:=public.kinojo_prepare_lookup_queue_from_list(v_sid,v_token,v_list,
        '{"characterName":"밤","servers":[2002],"lookupMode":"all"}'::jsonb);
      if v_result->>'ok' is distinct from 'true' or v_result->>'queueCount' is distinct from '1' then
        raise exception 'single repeat %: expected exactly one night target, got %',v_count,
          jsonb_build_object('ok',v_result->'ok','queueCount',v_result->'queueCount','code',v_result->'code');
      end if;
      if not exists(select 1 from public.character_master where id=v_id and is_active
        and status='OK' and not lookup_excluded and not visibility_excluded and restored_at is not null) then
        raise exception 'night re-excluded during single prepare';
      end if;
      select id into strict v_target from public.lookup_session_targets
        where session_id=v_sid and character_name='밤' and server_id=2002;
    end loop;
    v_report:=v_report||jsonb_build_array('single repeat: 1 target, active');

    v_result:=public.kinojo_prepare_lookup_queue_from_list(v_sid,v_token,v_list,'{}'::jsonb);
    select count(*) into v_expected from public.character_master cm where coalesce(cm.is_active,true)
      and coalesce(cm.status,'') not in ('DELETED','INACTIVE')
      and public.kinojo_lookup_admin_exclusion_reason(cm.server_id,cm.character_name) is null;
    if v_result->>'ok' is distinct from 'true' or (v_result->>'queueCount')::integer<>v_expected then
      raise exception 'full roster count mismatch: got %, expected %',v_result->>'queueCount',v_expected;
    end if;
    if (select count(*) from public.lookup_session_targets where session_id=v_sid
      and server_id=2002 and character_name='밤')<>1 then raise exception 'full night missing/duplicate'; end if;
    if exists(select 1 from public.lookup_session_targets where session_id=v_sid
      and public.kinojo_is_list_absent_target_v300(target_source)) then raise exception 'legacy absent target created'; end if;
    v_report:=v_report||jsonb_build_array(jsonb_build_object('fullRoster',v_expected));

    select id into strict v_target from public.lookup_session_targets
      where session_id=v_sid and server_id=2002 and character_name='밤';
    update public.lookup_session_targets set target_source='server:list_absent_identity_check_v297',
      target_status='lookup_done' where id=v_target;
    perform public.kinojo_finalize_list_absent_session_v297(v_sid);
    perform public.kinojo_finalize_list_absent_failure_v297(v_sid,v_target,'PROVIDER_RETRY_REQUIRED','rollback-only test');
    if not exists(select 1 from public.character_master where id=v_id and is_active
      and status='OK' and not lookup_excluded and not visibility_excluded) then
      raise exception 'legacy finalize re-excluded night'; end if;
    select jsonb_build_object('id',id,'name',character_name,'server',server_id,'key',char_key,
      'url',detail_url,'mainId',main_character_id,'mainName',main_character_name,'isMain',is_main,
      'listRow',list_row,'legion',legion_name,'restoredAt',restored_at) into v_after
      from public.character_master where id=v_id;
    if v_before is distinct from v_after then raise exception 'identity/family/restoration state changed'; end if;
    v_report:=v_report||jsonb_build_array('legacy success/failure finalize: preserved','identity/family/list row/restoredAt: identical');

    update public.character_master set lookup_excluded=true,exclusion_reason='기타' where id=v_id;
    v_result:=public.kinojo_prepare_lookup_queue_from_list(v_sid,v_token,v_with_night,
      '{"characterName":"밤","servers":[2002]}'::jsonb);
    if v_result->>'queueCount' is distinct from '0'
      or not (select lookup_excluded from public.character_master where id=v_id) then
      raise exception 'manual lookup exclusion lost'; end if;
    v_result:=public.kinojo_prepare_lookup_queue_from_list(v_sid,v_token,v_list,
      '{"characterName":"밤","servers":[2002]}'::jsonb);
    if v_result->>'queueCount' is distinct from '0' then raise exception 'listless manual exclusion lost'; end if;
    v_report:=v_report||jsonb_build_array('manual exclusion: preserved with/without list row');

    update public.character_master set lookup_excluded=false,exclusion_reason=null where id=v_id;
    v_result:=public.kinojo_prepare_lookup_queue_from_list(v_sid,v_token,v_list,
      '{"characterName":"밤","servers":[2008]}'::jsonb);
    if exists(select 1 from public.lookup_session_targets where session_id=v_sid and server_id=2002) then
      raise exception 'server filter crossed server identity'; end if;
    v_result:=public.kinojo_prepare_lookup_queue_from_list(v_sid,v_token,'[]'::jsonb,
      '{"characterName":"밤","servers":[2002]}'::jsonb);
    if v_result->>'queueCount' is distinct from '1' then raise exception 'empty list suppressed master'; end if;
    v_result:=public.kinojo_prepare_lookup_queue_from_list(v_sid,v_token,v_list,
      '{"characterName":"밤","servers":[2002],"lookupMode":"missing_only"}'::jsonb);
    if v_result->>'queueCount' is distinct from '0' then raise exception 'existing night counted as new'; end if;
    v_report:=v_report||jsonb_build_array('server filter/empty list/missing-only: passed');

    select to_jsonb(cm) into v_before from public.character_master cm where id=v_id;
    v_result:=public.kinojo_prepare_lookup_queue_from_list(v_sid,'invalid',v_list,'{}'::jsonb);
    if v_result->>'ok' is distinct from 'false' then raise exception 'invalid session accepted'; end if;
    select to_jsonb(cm) into v_after from public.character_master cm where id=v_id;
    if v_before is distinct from v_after then raise exception 'invalid session mutated master'; end if;
    v_result:=public.kinojo_prepare_lookup_queue_from_list(v_sid,v_token,null,'{}'::jsonb);
    if v_result->>'code' is distinct from 'INVALID_LIST' then raise exception 'null list accepted'; end if;
    v_report:=v_report||jsonb_build_array('invalid session/null list: rejected');
    raise exception using errcode='Z0470',message='rollback all test data';
  exception when sqlstate 'Z0470' then null;
  end;
  perform set_config('kinojo.test_v470',v_report::text,true);
end;
$test$;
