-- Local audit follow-up. No new endpoint or scheduled worker.
begin;
CREATE OR REPLACE FUNCTION public.kinojo_expire_updater_lock()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lock public.updater_lock_state%rowtype;
  v_orphan_expired integer := 0;
  v_need_orphan_cleanup boolean := false;
  v_need_lock_expire boolean := false;
begin
  -- Fast path: status polling must not serialize on the single global lock row.
  select * into v_lock
  from public.updater_lock_state
  where id = 'global';

  if not found then
    insert into public.updater_lock_state(id,is_locked,status,message)
    values ('global',false,'idle','조회 대기 중')
    on conflict (id) do nothing;

    select * into v_lock
    from public.updater_lock_state
    where id='global';
  end if;

  v_need_lock_expire := coalesce(v_lock.is_locked,false)
    and v_lock.expires_at is not null
    and v_lock.expires_at < now();

  select exists(
    select 1
    from public.updater_runtime_jobs j
    where lower(coalesce(j.status,'')) in ('starting','running','paused')
      and coalesce(j.last_heartbeat_at,j.updated_at,j.started_at,j.created_at)
        < now() - make_interval(secs => greatest(coalesce(j.timeout_seconds,180),180))
      and not (
        coalesce(v_lock.is_locked,false) is true
        and v_lock.session_id=j.session_id
      )
  ) into v_need_orphan_cleanup;

  -- No global row lock is taken on healthy polls.
  if v_need_orphan_cleanup then
    update public.updater_runtime_jobs j
       set status='expired',
           current_stage='EXPIRED',
           message=coalesce(nullif(j.message,''),'Heartbeat timeout으로 Runtime 작업이 만료되었습니다.'),
           finished_at=coalesce(j.finished_at,now()),
           summary=coalesce(j.summary,'{}'::jsonb)||jsonb_build_object(
             'runtimeExpired',true,
             'runtimeExpiredReason','heartbeat_timeout',
             'runtimeExpiredAt',now()
           ),
           updated_at=now()
     where lower(coalesce(j.status,'')) in ('starting','running','paused')
       and coalesce(j.last_heartbeat_at,j.updated_at,j.started_at,j.created_at)
         < now() - make_interval(secs => greatest(coalesce(j.timeout_seconds,180),180))
       and not (
         coalesce(v_lock.is_locked,false) is true
         and v_lock.session_id=j.session_id
       );
    get diagnostics v_orphan_expired = row_count;
  end if;

  if v_need_lock_expire then
    -- Lock only on the rare expiry path, then re-check after acquiring it.
    select * into v_lock
    from public.updater_lock_state
    where id='global'
    for update;

    if coalesce(v_lock.is_locked,false) is true
       and v_lock.expires_at is not null
       and v_lock.expires_at < now() then
      update public.updater_sessions
         set status='expired',
             finished_at=coalesce(finished_at,now()),
             error_message=coalesce(error_message,'Heartbeat timeout'),
             message='Heartbeat timeout'
       where session_id=v_lock.session_id
         and status in ('running','starting','paused');

      update public.lookup_batches
         set status='expired',
             finished_at=coalesce(finished_at,now()),
             memo=coalesce(memo,'Heartbeat timeout'),
             updated_at=now()
       where session_id=v_lock.session_id
         and status in ('running','starting','paused');

      update public.updater_runtime_jobs
         set status='expired',
             current_stage='EXPIRED',
             message=coalesce(nullif(message,''),'Heartbeat timeout으로 Runtime 작업이 만료되었습니다.'),
             finished_at=coalesce(finished_at,now()),
             summary=coalesce(summary,'{}'::jsonb)||jsonb_build_object(
               'runtimeExpired',true,
               'runtimeExpiredReason','heartbeat_timeout',
               'runtimeExpiredAt',now()
             ),
             updated_at=now()
       where session_id=v_lock.session_id
         and lower(coalesce(status,'')) in ('starting','running','paused');

      update public.updater_lock_state
         set is_locked=false,
             status='expired',
             stage='EXPIRED',
             release_reason='timeout',
             released_at=now(),
             message='이전 조회가 응답하지 않아 자동 해제되었습니다.',
             expires_at=null,
             session_token=null
       where id='global';
    end if;
  end if;

  -- The matching session is checked again by UPDATE; a later run is untouched.
  update public.kinojo_server_automation_settings a
     set running=false, active_run_id=null, active_session_id=null,
         last_finished_at=now(), last_status='failed',
         last_message='Heartbeat timeout: automatic refresh expired', updated_at=now()
   where a.automation_key='character_refresh' and a.running is true
     and exists (
        select 1 from public.updater_runtime_jobs j
        where j.session_id = a.active_session_id and lower(j.status) = 'expired'
      )
      and not exists (
        select 1 from public.updater_runtime_jobs j
        where j.session_id = a.active_session_id
          and lower(j.status) in ('starting','running','paused')
      );

  return jsonb_build_object('ok',true,'expiredRuntimeJobs',v_orphan_expired,
    'fastPath',not v_need_lock_expire and not v_need_orphan_cleanup);
end;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_character_skill_manual_sync_v415()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '2s'
 SET lock_timeout TO '500ms'
AS $function$
begin
  -- Progress/heartbeat-only updates do not alter the selected skill source.
  if tg_op = 'UPDATE' then
    if old.character_master_id is not distinct from new.character_master_id
       and old.status is not distinct from new.status
       and old.completed_at is not distinct from new.completed_at
       and (old.base_equipment_payload #> '{skill,skillList}')
         is not distinct from (new.base_equipment_payload #> '{skill,skillList}') then
      return new;
    end if;
  end if;
  if tg_op = 'DELETE' then
    perform public.kinojo_character_skill_manual_refresh_v415(old.character_master_id);
    return old;
  end if;

  if tg_op = 'UPDATE'
     and old.character_master_id is distinct from new.character_master_id then
    perform public.kinojo_character_skill_manual_refresh_v415(old.character_master_id);
  end if;

  perform public.kinojo_character_skill_manual_refresh_v415(new.character_master_id);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_character_skill_manual_refresh_v415(p_character_master_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '2s'
 SET lock_timeout TO '500ms'
AS $function$
declare
  v_job_id uuid;
  v_refreshed_at timestamptz;
  v_source_updated_at timestamptz;
  v_skill_list jsonb;
begin
  if coalesce(p_character_master_id, 0) <= 0 then
    return;
  end if;

  select
    j.id,
    coalesce(j.completed_at, j.updated_at, j.created_at),
    j.updated_at,
    j.base_equipment_payload #> '{skill,skillList}'
    into v_job_id, v_refreshed_at, v_source_updated_at, v_skill_list
    from public.character_detail_refresh_jobs as j
   where j.character_master_id = p_character_master_id
     and j.status in ('completed', 'partial_failed')
     and jsonb_typeof(j.base_equipment_payload #> '{skill,skillList}') = 'array'
     and jsonb_array_length(
       case
         when jsonb_typeof(j.base_equipment_payload #> '{skill,skillList}') = 'array'
           then j.base_equipment_payload #> '{skill,skillList}'
         else '[]'::jsonb
       end
     ) > 0
   order by j.completed_at desc nulls last, j.updated_at desc, j.id::text desc
   limit 1;

  if v_job_id is null then
    update public.character_skill_current_state
       set manual_job_id = null,
           manual_refreshed_at = null,
           manual_source_updated_at = null,
           manual_skills = '[]'::jsonb,
           updated_at = clock_timestamp()
     where character_master_id = p_character_master_id
       and jsonb_array_length(manual_skills) > 0;
    return;
  end if;

  insert into public.character_skill_current_state (
    character_master_id,
    manual_job_id,
    manual_refreshed_at,
    manual_source_updated_at,
    manual_skills,
    updated_at
  )
  values (
    p_character_master_id,
    v_job_id,
    v_refreshed_at,
    v_source_updated_at,
    public.kinojo_character_skill_normalize_v415(v_skill_list),
    clock_timestamp()
  )
  on conflict (character_master_id) do update
     set manual_job_id = excluded.manual_job_id,
         manual_refreshed_at = excluded.manual_refreshed_at,
         manual_source_updated_at = excluded.manual_source_updated_at,
         manual_skills = excluded.manual_skills,
         updated_at = clock_timestamp()
   where (character_skill_current_state.manual_job_id,
          character_skill_current_state.manual_refreshed_at,
          character_skill_current_state.manual_skills)
     is distinct from
         (excluded.manual_job_id, excluded.manual_refreshed_at, excluded.manual_skills);
end;
$function$
;

CREATE OR REPLACE FUNCTION private.kinojo_ranking_snapshot_validate_v390(p_snapshot_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private', 'public'
 SET statement_timeout TO '15s'
 SET lock_timeout TO '2s'
AS $function$
declare
  v_snapshot private.kinojo_ranking_snapshots_v390%rowtype;
  v_errors text[] := array[]::text[];
  v_scope_count integer;
  v_item_mismatch integer;
  v_duplicate_identity integer;
  v_rank_gap integer;
  v_bad_payload integer;
  v_bad_metrics integer;
  v_report jsonb;
begin
  if pg_try_advisory_xact_lock(hashtext('kinojo_ranking_snapshot_build_v390')::bigint) is not true then
    return jsonb_build_object('ok', false, 'code', 'SNAPSHOT_BUILD_BUSY');
  end if;

  select * into v_snapshot
  from private.kinojo_ranking_snapshots_v390
  where snapshot_id = p_snapshot_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'SNAPSHOT_NOT_FOUND');
  end if;
  if v_snapshot.status <> 'BUILDING' then
    return jsonb_build_object(
      'ok', false, 'code', 'SNAPSHOT_NOT_BUILDING',
      'snapshotId', p_snapshot_id, 'status', v_snapshot.status
    );
  end if;
  if v_snapshot.next_scope <> 4 then
    v_errors := array_append(v_errors, 'SCOPE_BUILD_INCOMPLETE');
  end if;

  select count(*)::integer into v_scope_count
  from private.kinojo_ranking_snapshot_scopes_v390
  where snapshot_id = p_snapshot_id;
  if v_scope_count <> 4 then
    v_errors := array_append(v_errors, 'SCOPE_COUNT_INVALID');
  end if;

  select count(*)::integer into v_bad_payload
  from private.kinojo_ranking_snapshot_scopes_v390 s
  where s.snapshot_id = p_snapshot_id
    and (
      coalesce((s.ranking_payload ->> 'ok')::boolean, false) is not true
      or coalesce((s.hof_payload ->> 'ok')::boolean, false) is not true
      or jsonb_typeof(s.ranking_payload -> 'pveItems') is distinct from 'array'
      or jsonb_typeof(s.ranking_payload -> 'pvpItems') is distinct from 'array'
      or jsonb_typeof(s.hof_payload -> 'summarySections') is distinct from 'object'
      or not (s.hof_payload ? 'pveTop')
      or not (s.hof_payload ? 'pvpTop')
      or not (s.hof_payload ? 'weeklyAwards')
      or not (s.hof_payload ? 'rankingPeriod')
      or coalesce((s.ranking_payload ->> 'includeSubs')::boolean, false) <> s.include_subs
      or coalesce((s.ranking_payload ->> 'includeAllLegions')::boolean, false) <> s.include_all_legions
      or coalesce((s.hof_payload ->> 'includeSubs')::boolean, false) <> s.include_subs
      or coalesce((s.hof_payload ->> 'includeAllLegions')::boolean, false) <> s.include_all_legions
    );
  if v_bad_payload > 0 then
    v_errors := array_append(v_errors, 'PAYLOAD_CONTRACT_INVALID');
  end if;

  select count(*)::integer into v_item_mismatch
  from private.kinojo_ranking_snapshot_scopes_v390 s
  where s.snapshot_id = p_snapshot_id
    and (
      s.pve_count <> (
        select count(*) from private.kinojo_ranking_snapshot_items_v390 i
        where i.snapshot_id = s.snapshot_id
          and i.include_subs = s.include_subs
          and i.include_all_legions = s.include_all_legions
          and i.rank_mode = 'PVE'
      )
      or s.pvp_count <> (
        select count(*) from private.kinojo_ranking_snapshot_items_v390 i
        where i.snapshot_id = s.snapshot_id
          and i.include_subs = s.include_subs
          and i.include_all_legions = s.include_all_legions
          and i.rank_mode = 'PVP'
      )
    );
  if v_item_mismatch > 0 then
    v_errors := array_append(v_errors, 'RANK_ITEM_COUNT_MISMATCH');
  end if;

  select count(*)::integer into v_rank_gap
  from (
    select include_subs, include_all_legions, rank_mode,
           min(rank_no) min_rank, max(rank_no) max_rank, count(*) item_count
    from private.kinojo_ranking_snapshot_items_v390
    where snapshot_id = p_snapshot_id
    group by include_subs, include_all_legions, rank_mode
  ) ranked
  where min_rank <> 1 or max_rank <> item_count;
  if v_rank_gap > 0 then
    v_errors := array_append(v_errors, 'RANK_SEQUENCE_INVALID');
  end if;

  select count(*)::integer into v_duplicate_identity
  from (
    select include_subs, include_all_legions, rank_mode, server_id,
           public.kinojo_normalize_character_name(character_name), count(*)
    from private.kinojo_ranking_snapshot_items_v390
    where snapshot_id = p_snapshot_id
    group by include_subs, include_all_legions, rank_mode, server_id,
             public.kinojo_normalize_character_name(character_name)
    having count(*) > 1
  ) duplicates;
  if v_duplicate_identity > 0 then
    v_errors := array_append(v_errors, 'DUPLICATE_SERVER_CHARACTER');
  end if;

  select count(*)::integer into v_bad_metrics
  from private.kinojo_ranking_snapshot_scopes_v390 s
  where s.snapshot_id = p_snapshot_id
    and not (
      s.owner_metric_counts ?& array['enhance','pve','pvp','like','dislike','growth']
    );
  if v_bad_metrics > 0 then
    v_errors := array_append(v_errors, 'OWNER_METRIC_CONTRACT_INCOMPLETE');
  end if;

  v_report := jsonb_build_object(
    'ok', cardinality(v_errors) = 0,
    'contractVersion', 390,
    'snapshotId', p_snapshot_id,
    'scopeCount', v_scope_count,
    'errors', to_jsonb(v_errors),
    'validatedAt', pg_catalog.statement_timestamp()
  );

  if cardinality(v_errors) > 0 then
    update private.kinojo_ranking_snapshots_v390
    set status = 'FAILED',
        validation_report = v_report,
        validated_at = pg_catalog.statement_timestamp(),
        updated_at = pg_catalog.statement_timestamp(),
        last_error_code = 'SNAPSHOT_VALIDATION_FAILED',
        last_error_message = array_to_string(v_errors, ',')
    where snapshot_id = p_snapshot_id;
    return v_report;
  end if;

  update private.kinojo_ranking_snapshots_v390
  set status = 'READY',
      validation_report = v_report,
      validated_at = pg_catalog.statement_timestamp(),
      updated_at = pg_catalog.statement_timestamp(),
      last_error_code = null,
      last_error_message = null
  where snapshot_id = p_snapshot_id;

  return v_report;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_lookup_progress_summary(p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total int := 0;
  v_queued int := 0;
  v_claimed int := 0;
  v_lookup_done int := 0;
  v_skipped int := 0;
  v_missing int := 0;
  v_retry_queued int := 0;
  v_final_failed int := 0;
  v_terminal int := 0;
  v_active_position int := 0;
  v_current_character text := '';
  v_step1_status_raw text := '';
  v_step2_status_raw text := '';
  v_step1_current numeric := 0;
  v_step1_total numeric := 0;
  v_step1_ratio numeric := 0;
  v_step2_ratio numeric := 0;
  v_step3_weighted numeric := 0;
  v_step3_ratio numeric := 0;
  v_overall numeric := 0;
  v_step1_status text := 'pending';
  v_step2_status text := 'pending';
  v_step3_status text := 'pending';
  v_step3_has_error boolean := false;
  v_step3_has_active boolean := false;
  v_step3_has_started boolean := false;
  v_step3_export_done boolean := false;
  v_current_step int := 0;
  v_current_step_label text := '대기';
begin
  if coalesce(trim(p_session_id), '') = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'MISSING_SESSION_ID',
      'message', 'session_id가 필요합니다.'
    );
  end if;

  -- Progress is read-only. Exclusions are applied by authenticated queue actions.

  select
    count(*)::int,
    count(*) filter(where target_status = 'queued')::int,
    count(*) filter(where target_status = 'claimed')::int,
    count(*) filter(where target_status = 'lookup_done')::int,
    count(*) filter(where target_status = 'skipped')::int,
    count(*) filter(where target_status = 'missing')::int,
    count(*) filter(where target_status = 'retry_queued')::int,
    count(*) filter(where target_status = 'final_failed')::int,
    count(*) filter(where target_status in ('lookup_done','skipped','final_failed'))::int
  into
    v_total,
    v_queued,
    v_claimed,
    v_lookup_done,
    v_skipped,
    v_missing,
    v_retry_queued,
    v_final_failed,
    v_terminal
  from public.lookup_session_targets
  where session_id = p_session_id;

  with ranked as (
    select
      id,
      character_name,
      target_status,
      claimed_at,
      row_number() over(order by lookup_order nulls last, id) as active_position
    from public.lookup_session_targets
    where session_id = p_session_id
  )
  select active_position::int, coalesce(character_name, '')
    into v_active_position, v_current_character
  from ranked
  where target_status = 'claimed'
  order by claimed_at desc nulls last, id desc
  limit 1;

  v_active_position := coalesce(v_active_position, 0);
  v_current_character := coalesce(v_current_character, '');

  select
    lower(coalesce(status, '')),
    coalesce(progress_current, 0)::numeric,
    coalesce(progress_total, 0)::numeric
  into v_step1_status_raw, v_step1_current, v_step1_total
  from public.lookup_session_steps
  where session_id = p_session_id
    and upper(step_key) = 'LIST_MASTER_COMPARE'
  order by updated_at desc nulls last, id desc
  limit 1;

  select lower(coalesce(status, ''))
    into v_step2_status_raw
  from public.lookup_session_steps
  where session_id = p_session_id
    and upper(step_key) = 'CHARACTER_LOOKUP'
  order by updated_at desc nulls last, id desc
  limit 1;

  v_step1_status_raw := coalesce(v_step1_status_raw, '');
  v_step2_status_raw := coalesce(v_step2_status_raw, '');

  v_step1_ratio := case
    when v_step1_status_raw in ('done','completed') then 1
    when v_step1_total > 0 then least(1, greatest(0, v_step1_current / v_step1_total))
    else 0
  end;

  v_step2_ratio := case
    when v_total > 0 then least(1, greatest(0, v_terminal::numeric / v_total::numeric))
    when v_step2_status_raw in ('done','completed') then 1
    else 0
  end;

  with phase_def(step_key, weight) as (
    values
      ('MISSING_RECHECK'::text, 6::numeric),
      ('MASTER_SYNC'::text, 8::numeric),
      ('GROWTH_REVIEW'::text, 7::numeric),
      ('RANKING_REBUILD'::text, 6::numeric),
      ('LIST_SHEET_EXPORT'::text, 5::numeric)
  ), latest as (
    select distinct on (upper(step_key))
      upper(step_key) as step_key,
      lower(coalesce(status, '')) as status,
      coalesce(progress_current, 0)::numeric as progress_current,
      coalesce(progress_total, 0)::numeric as progress_total
    from public.lookup_session_steps
    where session_id = p_session_id
      and upper(step_key) in ('MISSING_RECHECK','MASTER_SYNC','GROWTH_REVIEW','RANKING_REBUILD','LIST_SHEET_EXPORT')
    order by upper(step_key), updated_at desc nulls last, id desc
  )
  select
    coalesce(sum(d.weight * case
      when d.step_key='LIST_SHEET_EXPORT' and l.status='skipped'
        and exists(select 1 from public.lookup_batches where session_id=p_session_id and list_sync_status='skipped') then 1
      when l.status in ('done','completed') then 1
      when l.progress_total > 0 then least(1, greatest(0, l.progress_current / l.progress_total))
      else 0
    end), 0),
    coalesce(bool_or(l.status in ('failed','error')), false),
    coalesce(bool_or(l.status in ('active','running')), false),
    coalesce(bool_or(l.status in ('active','running','done','completed','failed','error')), false),
    coalesce(bool_or(l.step_key = 'LIST_SHEET_EXPORT' and (l.status in ('done','completed')
      or (l.status='skipped' and exists(select 1 from public.lookup_batches where session_id=p_session_id and list_sync_status='skipped')))), false)
  into
    v_step3_weighted,
    v_step3_has_error,
    v_step3_has_active,
    v_step3_has_started,
    v_step3_export_done
  from phase_def d
  left join latest l on l.step_key = d.step_key;

  v_step3_ratio := least(1, greatest(0, v_step3_weighted / 32));

  v_step1_status := case
    when v_step1_status_raw in ('failed','error') then 'error'
    when v_step1_status_raw in ('done','completed') then 'done'
    when v_step1_status_raw in ('active','running') then 'active'
    else 'pending'
  end;

  v_step2_status := case
    when v_step2_status_raw in ('failed','error') then 'error'
    when (v_total > 0 and v_terminal >= v_total)
      or (v_total = 0 and v_step2_status_raw in ('done','completed')) then 'done'
    when v_total > 0 and (v_claimed + v_queued + v_missing + v_retry_queued) > 0 then 'active'
    when v_step2_status_raw in ('active','running') then 'active'
    else 'pending'
  end;

  v_step3_status := case
    when v_step3_has_error then 'error'
    when v_step3_export_done then 'done'
    when v_step3_has_active or v_step3_has_started then 'active'
    else 'pending'
  end;

  v_current_step := case
    when v_step3_status in ('active','error','done') then 3
    when v_step2_status in ('active','error','done') then 2
    when v_step1_status in ('active','error','done') then 1
    else 0
  end;

  v_current_step_label := case v_current_step
    when 1 then '원본 대조'
    when 2 then '공식 조회'
    when 3 then '서버 후처리'
    else '대기'
  end;

  v_overall := least(100, greatest(0,
    (12 * v_step1_ratio)
    + (56 * v_step2_ratio)
    + v_step3_weighted
  ));

  return jsonb_build_object(
    'ok', true,
    'sessionId', p_session_id,
    'total', v_total,
    'activePosition', v_active_position,
    'currentCharacter', v_current_character,
    'completedCount', v_terminal,
    'successCount', v_lookup_done,
    'skippedCount', v_skipped,
    'finalFailedCount', v_final_failed,
    'retryPendingCount', v_missing + v_retry_queued,
    'queuedCount', v_queued,
    'claimedCount', v_claimed,
    'overallProgressPercent', round(v_overall, 1),
    'listSheetSyncEnabled', coalesce((select (to_jsonb(s)->>'list_sheet_sync_enabled')::boolean from public.updater_sessions s where s.session_id=p_session_id),true),
    'listWriteSkipped', coalesce((select b.list_sync_status='skipped' from public.lookup_batches b where b.session_id=p_session_id),false),
    'currentStep', v_current_step,
    'currentStepLabel', v_current_step_label,
    'step1Status', v_step1_status,
    'step2Status', v_step2_status,
    'step3Status', v_step3_status,
    'step1Percent', round(v_step1_ratio * 100, 1),
    'step2Percent', round(v_step2_ratio * 100, 1),
    'step3Percent', round(v_step3_ratio * 100, 1),
    'targets', jsonb_build_object(
      'total', v_total,
      'queued', v_queued,
      'claimed', v_claimed,
      'lookupDone', v_lookup_done,
      'skipped', v_skipped,
      'missing', v_missing,
      'retryQueued', v_retry_queued,
      'finalFailed', v_final_failed,
      'terminal', v_terminal
    )
  );
end;
$function$
;
revoke execute on function public.kinojo_lookup_apply_admin_exclusions(text) from public, anon, authenticated;
grant execute on function public.kinojo_lookup_apply_admin_exclusions(text) to service_role;
commit;
