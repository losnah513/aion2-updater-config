-- SQL555 rollback: restore legacy 10/15/22 KST and 280/270/300MB policy. No business row restoration.
SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='15s';
DO $check$ BEGIN IF EXISTS(SELECT 1 FROM public.kinojo_server_automation_settings WHERE automation_key='character_refresh' AND running)
OR EXISTS(SELECT 1 FROM private.kinojo_storage_budget_control_v549 WHERE reclaim_lease_until>clock_timestamp())
THEN RAISE EXCEPTION 'WAIT_FOR_ACTIVE_WORK';END IF;END $check$;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN('kinojo-character-refresh-main2-v555','kinojo-character-refresh-alt-v555');
SELECT cron.alter_job(jobid,schedule:='0 1,6,13 * * *') FROM cron.job WHERE jobname='kinojo-character-refresh-6h-v377';
UPDATE public.kinojo_server_automation_settings SET schedule_kst='["10:00","15:00","22:00"]',updated_at=clock_timestamp() WHERE automation_key='character_refresh';
CREATE OR REPLACE FUNCTION private.kinojo_storage_reclaim_due_v553(p_bytes bigint, p_latched boolean)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT coalesce(p_bytes>=280000000 OR(p_latched AND p_bytes>270000000),false)
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_admin_server_routines_v533(p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'cron'
 SET statement_timeout TO '5s'
AS $function$
declare v_actor jsonb; v_now timestamptz:=clock_timestamp(); v_rows jsonb;
begin
  v_actor:=public.kinojo_web_admin_actor_v323(p_session_token);
  if coalesce((v_actor->>'level')::integer,0)<3 then
    return jsonb_build_object('ok',false,'code','ADMIN_ACCESS_REQUIRED','message','관리자 권한이 필요합니다.');
  end if;
  -- Bound the read by the most recent 20,000 scheduler records; never select return_message/command.
  with recent as materialized (
    select r.jobid,r.runid,r.status,r.start_time,r.end_time
      from cron.job_run_details r order by r.runid desc limit 20000
  ), latest as (
    select distinct on(r.jobid) r.* from recent r order by r.jobid,r.runid desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',j.jobid,
    'name',case j.jobname
      when 'kinojo-character-refresh-6h-v377' then '캐릭터 공식 조회'
      when 'kinojo-sanctuary-sheet-sync-12h-v377' then '성역 시트 동기화'
      when 'kinojo-member-image-cleanup-v364' then '회원 이미지 정리'
      when 'kinojo-ranking-snapshot-cleanup-v401' then '이전 순위 스냅샷 정리'
      when 'kinojo-updater-run-report-cleanup-v421' then '조회 실행 보고서 정리'
      when 'kinojo-character-growth-rollup-cleanup-v425' then '성장 요약 기록 정리'
      when 'kinojo-character-growth-raw-cleanup-v443' then '성장 원본 기록 정리'
      when 'kinojo-deferred-ranking-hof' then '순위·명예의 전당 공개 대기 확인'
      when 'kinojo-snapshot-raw-retention-v501' then '조회 원본 보관 정리'
      when 'kinojo-completed-runtime-retention-v511' then '완료된 실행 기록 정리'
      when 'kinojo-superseded-snapshot-retention-v512' then '대체된 조회 원본 정리'
      when 'kinojo-snapshot-seven-day-summary-v514' then '7일 지난 조회 원본 요약'
      when 'kinojo-payload-post-detail-cleanup-v515' then '상세 저장 후 수집 자료 정리'
      when 'kinojo-intake-post-detail-cleanup-v516' then '상세 저장 후 수집 접수 기록 정리'
      when 'kinojo-storage-capacity-watch-v553' then 'DB 용량 확인·자동 공간 회수'
      when 'kinojo-cron-run-history-retention-v520' then '서버 예약 실행 기록 정리'
      else '기타 서버 작업 #'||j.jobid::text end,
    'description',case when j.jobname='kinojo-character-refresh-6h-v377'
      then '본캐 10:00·22:00 / 부캐 15:00' when j.jobname='kinojo-deferred-ranking-hof'
      then '공개 조건을 확인하며, 매번 순위를 새로 만드는 작업은 아닙니다.' else null end,
    'active',j.active,'scheduleKst',p.preview->>'label',
    'frequency',p.preview->>'frequency',
    'scheduleEntries',(
      select coalesce(jsonb_agg(e||jsonb_build_object('description',
        case when j.jobname='kinojo-character-refresh-6h-v377'
          then case when e->>'timeKst'='15:00' then '부캐 공식 조회' else '본캐 공식 조회' end else null end
      ) order by (e->>'minuteOfDay')::int),'[]'::jsonb)
      from jsonb_array_elements(coalesce(p.preview->'entries','[]'::jsonb)) e
    ),
    'nextRunAt',case when j.active then p.preview->'nextRunAt' else 'null'::jsonb end,
    'lastStatus',l.status,'lastStartedAt',l.start_time,'lastFinishedAt',l.end_time
  ) order by case when j.jobname='kinojo-character-refresh-6h-v377' then 0 else 1 end,j.jobid),'[]'::jsonb)
    into v_rows from cron.job j
    left join latest l on l.jobid=j.jobid
    cross join lateral (select private.kinojo_cron_preview_v533(j.schedule,v_now) preview) p
   where j.jobname like 'kinojo-%';
  return jsonb_build_object('ok',true,'storageBudget',private.kinojo_storage_budget_status_v549(),'timezone','Asia/Seoul','generatedAt',v_now,
    'characterScheduleSummary','본캐 10:00·22:00 / 부캐 15:00 (매일, 한국 시간)',
    'historyNote','최근 실행은 각 작업 전체의 최신 예약 호출 결과입니다. 캐릭터별 조회 결과는 캐릭터 관리에서 확인하세요.',
    'routines',v_rows);
end;
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_automation_admin_save_v377(p_pass_key text, p_job_type text, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'cron'
AS $function$
declare
  v_actor record;
  v_key text := lower(trim(coalesce(p_job_type, '')));
  v_running boolean;
  v_job_name text;
begin
  select * into v_actor from public.kinojo_get_updater_actor(p_pass_key) limit 1;
  if not found or coalesce(v_actor.level, 0) < 5 then
    return jsonb_build_object('ok', false, 'code', 'MASTER_ACCESS_REQUIRED', 'message', '자동 실행 ON/OFF는 MASTER만 변경할 수 있습니다.');
  end if;
  if v_key not in ('character_refresh', 'sanctuary_sync') then
    return jsonb_build_object('ok', false, 'code', 'AUTOMATION_NOT_FOUND', 'message', '자동화 종류를 확인해 주세요.');
  end if;

  select running into v_running
  from public.kinojo_server_automation_settings
  where automation_key = v_key
  for update;

  if v_running is true then
    return jsonb_build_object('ok', false, 'code', 'AUTOMATION_RUNNING', 'message', '자동 작업 진행 중에는 ON/OFF를 변경할 수 없습니다.');
  end if;

  update public.kinojo_server_automation_settings
  set enabled = coalesce(p_enabled, false),
      updated_by = coalesce(v_actor.main_character_name, 'MASTER'),
      updated_at = now()
  where automation_key = v_key;

  v_job_name := case v_key
    when 'character_refresh' then 'kinojo-character-refresh-6h-v377'
    else 'kinojo-sanctuary-sheet-sync-12h-v377'
  end;
  perform cron.alter_job(j.jobid, active := coalesce(p_enabled, false))
  from cron.job j where j.jobname = v_job_name;

  return jsonb_build_object(
    'ok', true,
    'message', case when p_enabled then '자동 실행을 ON으로 변경했습니다.' else '자동 실행을 OFF로 변경했습니다.' end,
    'status', public.kinojo_automation_admin_status_v377(p_pass_key)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_automation_system_character_start_v377(p_run_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_setting public.kinojo_server_automation_settings%rowtype;
  v_claim_kst timestamp;
  v_scope text;
  v_slot text;
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

  -- Freeze the claimed slot, so delayed preparation/retries cannot switch scope.
  v_claim_kst := timezone('Asia/Seoul',coalesce(v_setting.running_since,v_setting.last_started_at,now()));
  v_slot := case when v_claim_kst::time >= time '22:00' then '22:00'
                 when v_claim_kst::time >= time '15:00' then '15:00'
                 when v_claim_kst::time >= time '10:00' then '10:00'
                 else '22:00' end;
  v_scope := case when v_slot='15:00' then 'ALT_ONLY' else 'MAIN_ONLY' end;
  v_payload:=v_payload||jsonb_build_object(
    'listSheetSyncEnabled',v_setting.list_sheet_sync_enabled,
    'scheduledCharacterScope',v_scope,'scheduledSlotKst',v_slot,
    'lookupFilterSummary',case when v_scope='ALT_ONLY' then '부캐만' else '본캐만' end || ' · PVE+PVP · ' || v_slot || ' 자동 실행'
  );

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
    'characterScheduleSummary',case when v_key='character_refresh' then '본캐 10:00·22:00 / 부캐 15:00 (매일, 한국 시간)' else null end,
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

CREATE OR REPLACE FUNCTION private.kinojo_storage_budget_status_v549()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT jsonb_build_object('databaseBytes',s.bytes,'targetBytes',c.target_bytes,'warningBytes',c.warning_bytes,
  'steadyBytes',c.steady_bytes,'enabled',c.enabled,'lastCleanupAt',c.last_checked_at,'lastCleanup',c.last_compaction,
  'status',CASE WHEN NOT c.enabled THEN 'DISABLED' WHEN s.bytes>c.target_bytes THEN 'TARGET_EXCEEDED'
    WHEN s.bytes>=c.warning_bytes THEN 'WARNING' ELSE 'NORMAL' END,
  'headroomBytes',greatest(0,c.target_bytes-s.bytes),'autoReclaim',jsonb_build_object(
   'enabled',c.reclaim_enabled,'watchActive',EXISTS(SELECT 1 FROM cron.job WHERE jobname='kinojo-storage-capacity-watch-v553' AND active),
   'status',CASE WHEN c.reclaim_enabled AND private.kinojo_storage_reclaim_due_v553(s.bytes,c.reclaim_latched)
    AND private.kinojo_storage_reclaim_active_v553() THEN 'ACTIVE_WORK' ELSE c.reclaim_status END,'retryAt',c.reclaim_retry_at,
   'lastAt',c.last_reclaim_at,'lastResult',c.last_reclaim_result,'errorCode',c.last_reclaim_error,'checkIntervalSeconds',60))
 FROM private.kinojo_storage_budget_control_v549 c CROSS JOIN LATERAL(SELECT pg_database_size(current_database()) bytes)s WHERE c.singleton
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_web_notification_summary_v316(p_pass_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_member public.member_codes%rowtype;
  v_support_count integer := 0;
  v_code_count integer := 0;
  v_image_request_pending_count integer := 0;
  v_latest_support jsonb;
  v_latest_code jsonb;
  v_latest_image_request jsonb;
  v_master jsonb;
begin
  select * into v_member
  from public.kinojo_member_from_web_credential_v326(p_pass_key)
  limit 1;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'SESSION_INVALID', 'totalCount', 0);
  end if;

  select count(*)::integer into v_support_count
  from public.sanctuary_party_support_requests r
  where r.status = 'PENDING'
    and private.kinojo_sanctuary_roster_can_manage_force_v308(
      v_member.id, r.sanctuary_id, r.team_no
    );

  if coalesce(v_member.can_manage, false) or coalesce(v_member.level, 0) >= 3 then
    select count(*)::integer into v_code_count
    from public.code_requests cr
    where cr.status = 'PENDING';

    select pg_catalog.jsonb_build_object(
      'id', cr.id,
      'requestId', cr.request_id,
      'characterName', cr.character_name,
      'createdAt', cr.created_at
    ) into v_latest_code
    from public.code_requests cr
    where cr.status = 'PENDING'
    order by cr.created_at desc, cr.id desc
    limit 1;
  end if;

  select pg_catalog.jsonb_build_object(
    'id', r.id,
    'characterName', c.character_name,
    'sanctuaryCode', r.sanctuary_id,
    'teamNo', r.team_no,
    'partyNo', r.party_no,
    'slotNo', r.slot_no,
    'createdAt', r.created_at
  ) into v_latest_support
  from public.sanctuary_party_support_requests r
  join public.character_master c on c.id = r.character_master_id
  where r.status = 'PENDING'
    and private.kinojo_sanctuary_roster_can_manage_force_v308(
      v_member.id, r.sanctuary_id, r.team_no
    )
  order by r.created_at desc, r.id desc
  limit 1;

  v_master := public.kinojo_master_session_validate_v337(p_pass_key);
  if coalesce((v_master ->> 'ok')::boolean, false) is true then
    select count(*)::integer into v_image_request_pending_count
    from private.member_image_requests r
    where r.status = 'SUBMITTED'
      and r.acknowledged_at is null
      and r.metadata_expires_at > statement_timestamp();

    select pg_catalog.jsonb_build_object(
      'requestId', r.request_id,
      'memberId', r.member_id,
      'memberMainCharacterName', m.main_character_name,
      'characterId', r.character_id,
      'characterName', c.character_name,
      'styleCode', r.style_code,
      'itemCount', (
        select count(*)::integer
        from private.member_image_request_items i
        where i.request_id = r.request_id
      ),
      'createdAt', r.submitted_at
    ) into v_latest_image_request
    from private.member_image_requests r
    join public.member_codes m on m.id = r.member_id
    join public.character_master c on c.id = r.character_id
    where r.status = 'SUBMITTED'
      and r.acknowledged_at is null
      and r.metadata_expires_at > statement_timestamp()
    order by r.submitted_at desc, r.request_id desc
    limit 1;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contractVersion', 316,
    'notificationFeatureVersion', 444,
    'memberId', v_member.id,
    'supportRequestCount', v_support_count,
    'codeRequestCount', v_code_count,
    'memberImagePendingCount', 0,
    'memberImageRequestPendingCount', v_image_request_pending_count,
    'totalCount', v_support_count + v_code_count + v_image_request_pending_count,
    'latestSupportRequest', v_latest_support,
    'latestCodeRequest', v_latest_code,
    'latestReferenceUpload', null,
    'latestCharacterImageUpload', null,
    'latestImageRequest', v_latest_image_request
  );
end;
$function$;
CREATE OR REPLACE FUNCTION private.kinojo_storage_capacity_tick_v553()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog' SET TimeZone='UTC'
SET statement_timeout='5s' SET lock_timeout='300ms' AS $fn$
DECLARE b private.kinojo_storage_budget_control_v549%rowtype;v_bytes bigint;v_id bigint;v_token text;v_now timestamptz:=clock_timestamp();
BEGIN
 IF NOT pg_try_advisory_xact_lock(553,553) THEN RETURN jsonb_build_object('ok',true,'operation','BUSY');END IF;
 BEGIN SELECT * INTO STRICT b FROM private.kinojo_storage_budget_control_v549 WHERE singleton FOR UPDATE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RETURN jsonb_build_object('ok',true,'operation','BUSY');END;
 IF NOT b.enabled OR NOT b.reclaim_enabled THEN RETURN jsonb_build_object('ok',true,'operation','DISABLED');END IF;
 v_bytes:=pg_database_size(current_database());

 IF NOT private.kinojo_storage_reclaim_due_v553(v_bytes,b.reclaim_latched) AND NOT b.reclaim_latched
 THEN RETURN jsonb_build_object('ok',true,'operation','BELOW_THRESHOLD');END IF;
 IF v_bytes<=b.steady_bytes THEN
  UPDATE private.kinojo_storage_budget_control_v549 SET reclaim_latched=false,reclaim_status='IDLE',reclaim_tables_done='{}',reclaim_had_deferred=false,reclaim_retry_at=NULL WHERE singleton;
  RETURN jsonb_build_object('ok',true,'operation','BELOW_THRESHOLD');END IF;
 IF b.reclaim_lease_until>v_now OR b.reclaim_retry_at>v_now OR b.reclaim_dispatched_at>v_now-interval '90seconds'
 THEN RETURN jsonb_build_object('ok',true,'operation','WAITING');END IF;
 IF private.kinojo_storage_reclaim_active_v553() THEN RETURN jsonb_build_object('ok',true,'operation','ACTIVE_WORK');END IF;
 SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name='kinojo_server_automation_cron_token' ORDER BY created_at DESC LIMIT 1;
 IF nullif(v_token,'') IS NULL THEN RETURN jsonb_build_object('ok',false,'code','CONFIGURATION_MISSING');END IF;
 SELECT net.http_post(url:='https://josvoltpktvwysrasffq.supabase.co/functions/v1/kinojo-storage-maintenance',
  headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('action','maintain','cronToken',v_token),timeout_milliseconds:=60000) INTO v_id;
 UPDATE private.kinojo_storage_budget_control_v549 SET reclaim_dispatched_at=v_now,reclaim_request_id=v_id,
  reclaim_status='QUEUED',reclaim_latched=true WHERE singleton;
 RETURN jsonb_build_object('ok',true,'operation','QUEUED');
END
$fn$;
ALTER TABLE private.kinojo_storage_budget_control_v549 DROP CONSTRAINT storage_budget_limits_v555;
UPDATE private.kinojo_storage_budget_control_v549 SET target_bytes=300000000,warning_bytes=280000000,steady_bytes=270000000;
ALTER TABLE private.kinojo_storage_budget_control_v549 ALTER COLUMN target_bytes SET DEFAULT 300000000,ALTER COLUMN warning_bytes SET DEFAULT 280000000,ALTER COLUMN steady_bytes SET DEFAULT 270000000,
 ADD CONSTRAINT kinojo_storage_budget_control_v549_target_bytes_check CHECK(target_bytes=300000000),
 ADD CONSTRAINT storage_reclaim_thresholds_v553 CHECK(warning_bytes=280000000 AND steady_bytes=270000000),
 DROP COLUMN capacity_checked_at;
DROP FUNCTION public.kinojo_admin_character_schedule_save_v555(text,jsonb,text,bigint);
DROP FUNCTION private.kinojo_character_schedule_summary_v555(),private.kinojo_character_slot_v555(timestamp,jsonb,jsonb);
ALTER TABLE public.kinojo_server_automation_settings DROP COLUMN character_main_times,DROP COLUMN character_schedule_revision;
