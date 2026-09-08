-- Stop writers before rollback. Keep preference columns and historical values.
begin;
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
CREATE OR REPLACE FUNCTION public.kinojo_legion_tree_listless_complete_v455(p_session_id text, p_session_token text, p_worker_id text, p_summary jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
 SET statement_timeout TO '15s'
 SET lock_timeout TO '2s'
AS $function$
declare
  v_valid jsonb;
  v_policy jsonb;
  v_batch public.lookup_batches%rowtype;
  v_progress jsonb;
  v_relation jsonb;
  v_summary jsonb := case when jsonb_typeof(coalesce(p_summary,'{}'::jsonb))='object' then coalesce(p_summary,'{}'::jsonb) else '{}'::jsonb end;
  v_total integer := 0;
  v_success integer := 0;
  v_failed integer := 0;
  v_skipped integer := 0;
  v_list_queue_count integer := 0;
  v_partial boolean := false;
  v_finish jsonb := '{}'::jsonb;
  v_message text;
begin
  v_valid:=public.kinojo_validate_updater_session(p_session_id,p_session_token);
  if coalesce((v_valid->>'ok')::boolean,false) is not true then
    return v_valid;
  end if;

  v_policy:=public.kinojo_legion_tree_listless_policy_v455(p_session_id,p_session_token);
  if coalesce((v_policy->>'ok')::boolean,false) is not true then
    return v_policy;
  end if;
  if coalesce((v_policy->>'skipListWrite')::boolean,false) is not true then
    return jsonb_build_object(
      'ok',false,'code','LEGION_TREE_LISTLESS_POLICY_DENIED',
      'message','이 세션은 레기온 트리 전용 list 생략 조건과 일치하지 않습니다.',
      'policy',v_policy
    );
  end if;

  select * into v_batch
    from public.lookup_batches b
   where b.session_id=p_session_id
   for update;
  if not found then
    return jsonb_build_object('ok',false,'code','SERVER_QUEUE_BATCH_NOT_FOUND','message','Server Queue Batch를 찾지 못했습니다.');
  end if;

  if v_batch.status='completed'
     and v_batch.stage='SERVER_QUEUE_CHARACTER_MASTER_DONE'
     and v_batch.list_sync_status='skipped' then
    return jsonb_build_object(
      'ok',true,'done',true,'completed',true,'postprocessComplete',true,
      'listWriteSkipped',true,'listReadbackSkipped',true,'listlessCharacterAdd',true,
      'sessionId',p_session_id,'databaseContract','455',
      'message','캐릭터 Master 반영과 관계 확정이 이미 완료되었습니다.'
    );
  end if;

  if v_batch.worker_id is distinct from left(coalesce(p_worker_id,''),160) then
    return jsonb_build_object('ok',false,'code','POSTPROCESS_WORKER_MISMATCH','message','Server 후처리 Worker가 일치하지 않습니다.');
  end if;
  if not (v_batch.postprocess_master_done and v_batch.postprocess_review_done and v_batch.postprocess_ranking_done) then
    return jsonb_build_object('ok',false,'code','POSTPROCESS_NOT_COMPLETE','message','완료되지 않은 Server 후처리 단계가 있습니다.');
  end if;
  if v_batch.postprocess_snapshot_required and not v_batch.postprocess_snapshot_publish_done then
    return jsonb_build_object('ok',false,'code','RANKING_SNAPSHOT_NOT_PUBLISHED','message','ranking snapshot 게시가 완료되지 않았습니다.');
  end if;

  select count(*) into v_list_queue_count
    from public.google_list_sheet_sync_queue q
   where q.session_id=p_session_id;
  if v_list_queue_count<>0 then
    return jsonb_build_object(
      'ok',false,'code','LEGION_TREE_LIST_QUEUE_NOT_EMPTY',
      'listQueueCount',v_list_queue_count,
      'message','listless 완료 전에 Google list Queue가 없어야 합니다.'
    );
  end if;

  v_relation:=private.kinojo_legion_tree_finalize_relation_v373(p_session_id);
  if coalesce((v_relation->>'ok')::boolean,false) is not true
     or coalesce((v_relation->>'processedCount')::integer,0)<>1 then
    return jsonb_build_object(
      'ok',false,'code','LEGION_TREE_RELATION_FINALIZE_FAILED',
      'relation',v_relation,
      'message','레기온 트리 본캐/부캐 관계 확정에 실패했습니다.'
    );
  end if;

  v_progress:=public.kinojo_lookup_progress_summary(p_session_id);
  v_total:=coalesce((v_progress->>'total')::integer,0);
  v_success:=coalesce((v_progress->>'successCount')::integer,0);
  v_failed:=coalesce((v_progress->>'finalFailedCount')::integer,0);
  v_skipped:=coalesce((v_progress->>'skippedCount')::integer,0);
  v_partial:=v_failed>0 and v_success>0;
  v_message:=case when v_partial
    then '공식 조회 부분 완료 · 성공 캐릭터의 Master·관계·랭킹 반영 완료'
    else '공식 조회와 캐릭터 Master·관계·랭킹 반영 완료' end;
  v_summary:=v_summary||jsonb_build_object(
    'source','LEGION_TREE_CHARACTER_ADD',
    'phase','CHARACTER_MASTER_COMPLETE',
    'databaseContract','455',
    'postprocessComplete',true,
    'listlessCharacterAdd',true,
    'listWriteSkipped',true,
    'listReadbackSkipped',true,
    'listSheetComplete',false,
    'partialSuccess',v_partial,
    'total',v_total,
    'successCount',v_success,
    'finalFailedCount',v_failed,
    'skippedCount',v_skipped,
    'relation',v_relation,
    'progress',v_progress
  );

  perform public.kinojo_lookup_step_upsert(
    p_session_id,'CHARACTER_MASTER_CONFIRM',6,'done',1,1,
    '캐릭터 Master·본캐/부캐 관계 확인 완료',
    jsonb_build_object(
      'source','LEGION_TREE_CHARACTER_ADD',
      'databaseContract','455',
      'listlessCharacterAdd',true,
      'listWriteSkipped',true,
      'listReadbackSkipped',true
    )
  );

  update public.lookup_batches
     set status='completed',
         stage='SERVER_QUEUE_CHARACTER_MASTER_DONE',
         message=v_message,
         worker_id=null,
         worker_lease_until=null,
         worker_last_finished_at=now(),
         postprocess_status=case when v_partial then 'partial_success' else 'completed' end,
         postprocess_stage='COMPLETE',
         postprocess_finished_at=now(),
         postprocess_last_error=null,
         postprocess_summary=coalesce(postprocess_summary,'{}'::jsonb)||v_summary,
         list_sync_status='skipped',
         list_sync_finished_at=now(),
         list_sync_last_error=null,
         list_sync_summary=jsonb_build_object(
           'databaseContract','455',
           'listlessCharacterAdd',true,
           'listWriteSkipped',true,
           'listReadbackSkipped',true,
           'queueCount',0
         ),
         finished_at=now(),
         last_heartbeat_at=now(),
         updated_at=now()
   where session_id=p_session_id;

  update public.updater_sessions
     set status='completed',
         stage='SERVER_QUEUE_CHARACTER_MASTER_DONE',
         message=v_message,
         raw_payload=coalesce(raw_payload,'{}'::jsonb)||jsonb_build_object(
           'databaseContract','455',
           'postprocessPending',false,
           'postprocessComplete',true,
           'listAppendPending',false,
           'listSheetComplete',false,
           'listlessCharacterAdd',true,
           'listWriteSkipped',true,
           'listReadbackSkipped',true
         ),
         progress_current=v_total,
         progress_total=v_total,
         finished_at=now(),
         last_heartbeat_at=now(),
         updated_at=now()
   where session_id=p_session_id;

  update public.updater_runtime_jobs
     set status='completed',
         current_stage='SERVER_QUEUE_CHARACTER_MASTER_DONE',
         message=v_message,
         progress_current=v_total,
         progress_total=v_total,
         eta_seconds=0,
         summary=coalesce(summary,'{}'::jsonb)||v_summary,
         raw_payload=coalesce(raw_payload,'{}'::jsonb)||jsonb_build_object(
           'databaseContract','455',
           'postprocessPending',false,
           'postprocessComplete',true,
           'listAppendPending',false,
           'listSheetComplete',false,
           'listlessCharacterAdd',true,
           'listWriteSkipped',true,
           'listReadbackSkipped',true
         ),
         finished_at=now(),
         last_heartbeat_at=now(),
         updated_at=now()
   where session_id=p_session_id;

  v_finish:=public.kinojo_runtime_finish(
    p_session_id,p_session_token,'completed',v_message,v_summary
  );

  return jsonb_build_object(
    'ok',true,'done',true,'completed',true,
    'postprocessComplete',true,
    'listSheetComplete',false,
    'listWriteSkipped',true,
    'listReadbackSkipped',true,
    'listlessCharacterAdd',true,
    'sessionId',p_session_id,
    'successCount',v_success,
    'finalFailedCount',v_failed,
    'skippedCount',v_skipped,
    'progress',public.kinojo_lookup_progress_summary(p_session_id),
    'relation',v_relation,
    'finish',v_finish,
    'databaseContract','455',
    'message',v_message
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
    'skipListWrite',v_allowed,
    'listlessCharacterAdd',v_allowed,
    'targetCount',v_target_count,
    'exactTargetCount',v_exact_target_count,
    'listQueueCount',v_list_queue_count,
    'targetSource',case when v_allowed then 'server:legion_tree_character_add_v455' else null end,
    'terminalStage',case when v_allowed then 'SERVER_QUEUE_CHARACTER_MASTER_DONE' else null end,
    'databaseContract','455',
    'message',case when v_allowed
      then '레기온 트리 캐릭터 추가 세션 · Google list 쓰기·readback 생략'
      else '기존 Server Queue Google list 계약 유지' end
  );
end;
$function$;
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
    'listSyncQueued', true
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.kinojo_queue_list_sheet_sync_session(p_session_id text, p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
declare
  v_runtime public.updater_sessions%rowtype;
  v_relation jsonb := '{}'::jsonb;
  v_count integer := 0;
  v_target_count integer := 0;
  v_append_count integer := 0;
  v_incomplete_count integer := 0;
  v_incomplete_items jsonb := '[]'::jsonb;
  v_existing_total integer := 0;
  v_existing_synced integer := 0;
  v_existing_pending integer := 0;
  v_existing_failed integer := 0;
begin
  if nullif(coalesce(p_session_id,''),'') is null or nullif(coalesce(p_session_token,''),'') is null then
    return jsonb_build_object('ok',false,'code','MISSING_SESSION','message','session_id/session_token이 필요합니다.');
  end if;

  select * into v_runtime
    from public.updater_sessions
   where session_id=p_session_id and session_token=p_session_token
   limit 1;
  if not found then
    return jsonb_build_object('ok',false,'code','SESSION_NOT_FOUND','message','Runtime session을 찾을 수 없습니다.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('character-list-queue:'||p_session_id,0));
  v_relation := private.kinojo_legion_tree_finalize_relation_v373(p_session_id);
  if coalesce((v_relation->>'ok')::boolean,false) is not true then
    return v_relation || jsonb_build_object('listQueueCreated',false);
  end if;

  select count(*)::integer,
         count(*) filter(where t.list_row is null)::integer
    into v_target_count,v_append_count
    from public.lookup_session_targets t
   where t.session_id=p_session_id
     and t.target_status='lookup_done'
     and coalesce(t.character_name,'')<>''
     and (
       t.list_row is not null
       or (lower(coalesce(t.target_source,'')) like 'server:legion_tree_character_add_v%' or private.kinojo_db_only_list_restore_allowed(t.id))
     );

  if v_target_count=0 then
    return jsonb_build_object('ok',false,'code','LIST_TARGET_NOT_FOUND','message','list 반영 대상 조회 완료 Target을 찾지 못했습니다.','sessionId',p_session_id);
  end if;

  select count(*)::integer,
         count(*) filter(where sync_status in ('synced','done','completed'))::integer,
         count(*) filter(where sync_status in ('queued','processing','retry'))::integer,
         count(*) filter(where sync_status in ('failed','error'))::integer
    into v_existing_total,v_existing_synced,v_existing_pending,v_existing_failed
    from public.google_list_sheet_sync_queue
   where session_id=p_session_id;

  if exists (
    select 1 from public.google_list_sheet_sync_queue q
    where q.session_id=p_session_id and not exists (
      select 1 from public.lookup_session_targets t join public.character_master cm on cm.id=q.character_id
      where t.session_id=p_session_id and t.target_status='lookup_done'
      and t.server_id=q.server_id and cm.server_id=q.server_id
      and public.kinojo_character_identity_key_v298(t.character_name)=public.kinojo_character_identity_key_v298(q.character_name)
      and public.kinojo_character_identity_key_v298(cm.character_name)=public.kinojo_character_identity_key_v298(q.character_name)
      and (t.list_row is not null or lower(coalesce(t.target_source,'')) like 'server:legion_tree_character_add_v%' or private.kinojo_db_only_list_restore_allowed(t.id))
    )) then
    return jsonb_build_object('ok',false,'code','LIST_QUEUE_MEMBERSHIP_MISMATCH','message','기존 Queue의 신원이 완료 Target과 달라 변경을 중단합니다.');
  end if;
  if v_existing_total=v_target_count and v_existing_total>0 and v_existing_synced=v_existing_total then
    select count(*)::integer into v_append_count
      from public.google_list_sheet_sync_queue where session_id=p_session_id and append_if_missing is true;
    return jsonb_build_object(
      'ok',true,'queued',v_existing_total,'queuedCount',v_existing_total,'targetCount',v_target_count,
      'appendCount',v_append_count,
      'pendingCount',v_existing_pending,'syncedCount',v_existing_synced,'failedCount',v_existing_failed,
      'reusedExistingQueue',true,'identitySource','lookup_session_targets','valueSource','existing_verified_queue',
      'oppositeGearMode','preserve_existing_sheet_value','clearModeSource','explicit_clear_only',
      'relation',v_relation,'message',format('기존 list Queue 상태를 보존했습니다. 전체 %s건 / 완료 %s건 / 재시도 %s건',v_existing_total,v_existing_synced,v_existing_pending+v_existing_failed),
      'noReviewToSheet',true
    );
  end if;

  select count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'characterName',t.character_name,'payloadId',p.id,'gearType',p.gear_type,
           'masterSyncStatus',p.master_sync_status,'masterLatestPayloadId',cm.latest_payload_id
         ) order by t.lookup_order),'[]'::jsonb)
    into v_incomplete_count,v_incomplete_items
    from public.lookup_session_targets t
    left join public.extension_character_payloads p on p.id=t.payload_id
    left join lateral (
      select cm.* from public.character_master cm
       where cm.server_id=t.server_id
         and public.kinojo_character_identity_key_v298(cm.character_name)=public.kinojo_character_identity_key_v298(t.character_name)
       order by case when cm.character_name=t.character_name then 0 else 1 end,
                case when coalesce(cm.is_active,true) then 0 else 1 end,
                cm.updated_at desc nulls last,cm.id desc limit 1
    ) cm on true
   where t.session_id=p_session_id
     and t.target_status='lookup_done'
     and coalesce(t.character_name,'')<>''
     and (t.list_row is not null or (lower(coalesce(t.target_source,'')) like 'server:legion_tree_character_add_v%' or private.kinojo_db_only_list_restore_allowed(t.id)))
     and (
       p.id is null or coalesce(p.master_sync_status,'')<>'synced'
       or upper(coalesce(p.gear_type,'UNKNOWN')) not in ('PVE','PVP')
       or cm.id is null or cm.latest_payload_id is distinct from p.id
     );

  if v_incomplete_count>0 then
    return jsonb_build_object('ok',false,'code','LIST_EXPORT_SOURCE_INCOMPLETE','sessionId',p_session_id,
      'incompleteCount',v_incomplete_count,'incompleteItems',v_incomplete_items,
      'message','Master 반영이 확인되지 않은 조회값이 있어 list Queue 생성을 중단했습니다.');
  end if;

  insert into public.google_list_sheet_sync_queue(
    session_id,character_id,list_row,list_original_name,character_name,
    server_id,server_name,class_name,main_character_name,append_if_missing,
    pve_item_level,pvp_item_level,pve_combat_power,pvp_combat_power,
    latest_power_total,latest_item_level_total,clear_pve_stats,clear_pvp_stats,
    sync_status,list_display_name,updated_at,identity_changed,previous_character_name,main_character_renamed
  )
  select
    p_session_id,cm.id,t.list_row,
    case when t.list_row is null then public.kinojo_list_display_name_v287(t.character_name,t.server_id)
         else coalesce(t.list_original_name,t.character_name) end,
    t.character_name,t.server_id,coalesce(cm.server_name,t.server_name,public.kinojo_server_name_by_id(t.server_id)),
    coalesce(nullif(public.kinojo_normalize_aion_class_name(cm.class_name),''),nullif(public.kinojo_normalize_aion_class_name(p.class_name),''),nullif(public.kinojo_normalize_aion_class_name(t.class_name),'')),
    case when main_cm.id is not null then public.kinojo_list_display_name_v287(main_cm.character_name,main_cm.server_id)
         when nullif(trim(cm.main_character_name),'') is not null then public.kinojo_list_display_name_v287(cm.main_character_name,cm.server_id)
         else public.kinojo_list_display_name_v287(cm.character_name,cm.server_id) end,
    (t.list_row is null and (lower(coalesce(t.target_source,'')) like 'server:legion_tree_character_add_v%' or private.kinojo_db_only_list_restore_allowed(t.id))),
    case when upper(coalesce(p.gear_type,''))='PVE' then cm.latest_pve_item_level else null end,
    case when upper(coalesce(p.gear_type,''))='PVP' then cm.latest_pvp_item_level else null end,
    case when upper(coalesce(p.gear_type,''))='PVE' then cm.latest_pve_combat_power else null end,
    case when upper(coalesce(p.gear_type,''))='PVP' then cm.latest_pvp_combat_power else null end,
    coalesce(cm.latest_power_total,0),coalesce(cm.latest_item_level_total,0),false,false,'queued',
    public.kinojo_list_display_name_v287(t.character_name,t.server_id),now(),
    coalesce(t.list_original_name,t.character_name) is distinct from public.kinojo_list_display_name_v287(t.character_name,t.server_id),
    t.list_original_name,false
  from public.lookup_session_targets t
  join public.extension_character_payloads p on p.id=t.payload_id and p.master_sync_status='synced'
  join lateral (
    select cm.* from public.character_master cm
     where cm.server_id=t.server_id
       and public.kinojo_character_identity_key_v298(cm.character_name)=public.kinojo_character_identity_key_v298(t.character_name)
     order by case when cm.character_name=t.character_name then 0 else 1 end,
              case when coalesce(cm.is_active,true) then 0 else 1 end,
              cm.updated_at desc nulls last,cm.id desc limit 1
  ) cm on cm.latest_payload_id=p.id
  left join public.character_master main_cm on main_cm.id=cm.main_character_id
  where t.session_id=p_session_id and t.target_status='lookup_done' and coalesce(t.character_name,'')<>''
    and (t.list_row is not null or (lower(coalesce(t.target_source,'')) like 'server:legion_tree_character_add_v%' or private.kinojo_db_only_list_restore_allowed(t.id)))
  order by t.list_row nulls last,t.lookup_order
  on conflict(session_id,character_name,server_id) do update set
    character_id=excluded.character_id,list_row=excluded.list_row,
    class_name=excluded.class_name,main_character_name=excluded.main_character_name,
    append_if_missing=excluded.append_if_missing,list_display_name=excluded.list_display_name,
    pve_item_level=excluded.pve_item_level,pvp_item_level=excluded.pvp_item_level,
    pve_combat_power=excluded.pve_combat_power,pvp_combat_power=excluded.pvp_combat_power,
    clear_pve_stats=excluded.clear_pve_stats,clear_pvp_stats=excluded.clear_pvp_stats,
    identity_changed=coalesce(google_list_sheet_sync_queue.identity_changed,false) or excluded.identity_changed,
    main_character_renamed=coalesce(google_list_sheet_sync_queue.main_character_renamed,false) or excluded.main_character_renamed,
    list_original_name=coalesce(google_list_sheet_sync_queue.list_original_name,excluded.list_original_name),
    updated_at=now()
  where google_list_sheet_sync_queue.sync_status not in ('synced','done','completed');

  select count(*)::integer into v_count from public.google_list_sheet_sync_queue where session_id=p_session_id;
  if v_count<>v_target_count then
    raise exception 'LIST_QUEUE_COUNT_MISMATCH';
  end if;

  select count(*)::integer into v_append_count
    from public.google_list_sheet_sync_queue where session_id=p_session_id and append_if_missing is true;

  return jsonb_build_object(
    'ok',true,'queued',v_count,'queuedCount',v_count,'targetCount',v_target_count,'appendCount',v_append_count,
    'pendingCount',v_count-v_existing_synced,'syncedCount',v_existing_synced,'failedCount',v_existing_failed,'reusedExistingQueue',v_existing_total>0,
    'identitySource','lookup_session_targets','valueSource','verified_character_master_current_gear_only',
    'oppositeGearMode','preserve_existing_sheet_value','clearModeSource','explicit_clear_only',
    'relation',v_relation,'databaseContract','373',
    'message',case when v_append_count>0 then '기존 list Queue와 신규 append Queue를 함께 생성했습니다.' else '기존 list Queue를 생성했습니다.' end,
    'noReviewToSheet',true
  );
end;
$function$;
drop trigger if exists character_refresh_list_write_preference on public.updater_sessions;
drop function if exists private.kinojo_freeze_list_write_preference();
drop function if exists public.kinojo_automation_admin_list_write_save(text,boolean);
CREATE OR REPLACE FUNCTION private.kinojo_queue_summary_refresh_core_v422(p_session_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '2s'
 SET lock_timeout TO '250ms'
AS $function$
declare
  v_session public.updater_sessions%rowtype;
  v_job public.updater_runtime_jobs%rowtype;
  v_batch public.lookup_batches%rowtype;
  v_lock public.updater_lock_state%rowtype;
  v_rate public.official_lookup_rate_state%rowtype;
  v_queue_meta jsonb := '{}'::jsonb;
  v_session_status text := 'pending';
  v_job_status text := 'pending';
  v_batch_status text := 'pending';
  v_control_state text := 'finished';
  v_active boolean := false;
  v_terminal_at timestamp with time zone;
  v_execution_source text := 'KINOJO_SERVER_CHARACTER_QUEUE';
  v_handoff_state text := 'not_started';
  v_handoff_safety text := 'unsafe';
  v_handoff_message text := '조회 작업을 시작하면 종료 안전 상태가 표시됩니다.';
  v_handoff_heartbeat timestamp with time zone;
  v_wait_ms integer := 0;
  v_master_total integer := 0;
begin
  if coalesce(trim(p_session_id), '') = '' then
    return;
  end if;

  select * into v_session
  from public.updater_sessions s
  where s.session_id = p_session_id;

  if not found then
    delete from public.updater_session_progress_current c
    where c.session_id = p_session_id;
    return;
  end if;

  select * into v_job
  from public.updater_runtime_jobs j
  where j.session_id = p_session_id;

  select * into v_batch
  from public.lookup_batches b
  where b.session_id = p_session_id;

  select * into v_lock
  from public.updater_lock_state l
  where l.id = 'global';

  select * into v_rate
  from public.official_lookup_rate_state r
  where r.provider = 'plaync';

  v_queue_meta := coalesce(v_session.raw_payload->'queueMeta', '{}'::jsonb);
  v_session_status := lower(coalesce(v_session.status, 'pending'));
  v_job_status := lower(coalesce(v_job.status, 'pending'));
  v_batch_status := lower(coalesce(v_batch.status, 'pending'));
  v_control_state := lower(coalesce(
    nullif(v_session.raw_payload->>'adminControlState', ''),
    case when v_session_status in ('starting', 'running', 'paused') then 'running' else 'finished' end
  ));

  v_active := coalesce(v_lock.is_locked, false)
    and v_lock.session_id = p_session_id
    and v_session_status in ('starting', 'running', 'paused')
    and v_job_status in ('starting', 'running', 'paused')
    and v_batch_status in ('starting', 'running', 'paused');

  v_terminal_at := case
    when v_session_status in ('completed', 'failed', 'cancelled', 'expired')
      or v_job_status in ('completed', 'failed', 'cancelled', 'expired')
      or v_batch_status in ('completed', 'failed', 'cancelled', 'expired')
    then coalesce(v_session.finished_at, v_job.finished_at, v_batch.finished_at, statement_timestamp())
    else null
  end;

  v_execution_source := coalesce(
    nullif(v_session.raw_payload->>'requestedSurface', ''),
    nullif(v_session.client_id, ''),
    nullif(v_session.tool_name, ''),
    'KINOJO_SERVER_CHARACTER_QUEUE'
  );

  v_handoff_state := coalesce(
    nullif(v_session.raw_payload->>'serverHandoffState', ''),
    case
      when coalesce(v_batch.postprocess_status, '') in ('completed', 'partial_success') then 'complete'
      when coalesce((v_session.raw_payload->>'serverQueue')::boolean, false) then 'preparing'
      else 'not_started'
    end
  );
  v_handoff_safety := coalesce(
    nullif(v_session.raw_payload->>'serverHandoffSafety', ''),
    case when v_handoff_state = 'complete' then 'complete' else 'unsafe' end
  );
  v_handoff_message := coalesce(
    nullif(v_session.raw_payload->>'serverHandoffMessage', ''),
    v_handoff_message
  );
  begin
    v_handoff_heartbeat := nullif(v_session.raw_payload->>'serverHandoffHeartbeatAt', '')::timestamp with time zone;
  exception when invalid_text_representation or datetime_field_overflow then
    v_handoff_heartbeat := null;
  end;

  if v_session_status = 'completed' or coalesce(v_batch.postprocess_status, '') in ('completed', 'partial_success') then
    v_handoff_state := 'complete';
    v_handoff_safety := 'complete';
    v_handoff_message := '캐릭터 조회와 Master·성장 리뷰·랭킹·Google list 반영을 완료했습니다.';
  end if;

  if v_rate.paused_until is not null and v_rate.paused_until > statement_timestamp() then
    v_wait_ms := greatest(1, ceil(extract(epoch from (v_rate.paused_until - statement_timestamp())) * 1000)::integer);
  end if;

  select count(*)::integer into v_master_total
  from public.character_master m
  where coalesce(m.is_active, true) is true;

  insert into public.updater_session_progress_current (
    session_id,
    requested_by_member_id,
    started_at,
    session_status,
    job_status,
    batch_status,
    control_state,
    active,
    session_payload,
    job_payload,
    batch_payload,
    queue_meta,
    source_summary,
    handoff,
    postprocess,
    plaync_rate_gate,
    execution_source,
    batch_expires_at,
    worker_lease_until,
    updated_at,
    terminal_at
  ) values (
    p_session_id,
    v_session.requested_by_member_id,
    v_session.started_at,
    v_session_status,
    v_job_status,
    v_batch_status,
    v_control_state,
    v_active,
    to_jsonb(v_session) - 'session_token',
    coalesce(to_jsonb(v_job) - 'session_token_hash', '{}'::jsonb),
    coalesce(to_jsonb(v_batch) - 'session_token', '{}'::jsonb),
    v_queue_meta,
    jsonb_build_object(
      'listCount', case when coalesce(v_queue_meta->>'rawListCount', '') ~ '^[0-9]+$' then (v_queue_meta->>'rawListCount')::integer else 0 end,
      'serverMasterTotal', v_master_total,
      'matchedCount', 0,
      'newCharacterCount', 0,
      'targetCount', 0
    ),
    jsonb_build_object(
      'state', v_handoff_state,
      'safety', v_handoff_safety,
      'message', v_handoff_message,
      'heartbeatAt', v_handoff_heartbeat,
      'workerId', v_session.raw_payload->>'serverHandoffWorkerId',
      'lastError', v_session.raw_payload->>'serverHandoffLastError',
      'stale', false
    ),
    jsonb_build_object(
      'status', coalesce(v_batch.postprocess_status, 'pending'),
      'stage', coalesce(v_batch.postprocess_stage, 'PENDING'),
      'attemptCount', coalesce(v_batch.postprocess_attempt_count, 0),
      'maxAttempts', 3,
      'masterDone', coalesce(v_batch.postprocess_master_done, false),
      'reviewDone', coalesce(v_batch.postprocess_review_done, false),
      'rankingDone', coalesce(v_batch.postprocess_ranking_done, false),
      'lastError', v_batch.postprocess_last_error,
      'startedAt', v_batch.postprocess_started_at,
      'finishedAt', v_batch.postprocess_finished_at,
      'summary', coalesce(v_batch.postprocess_summary, '{}'::jsonb)
    ),
    jsonb_build_object(
      'rateLimited', v_wait_ms > 0,
      'waitMs', v_wait_ms,
      'pausedUntil', v_rate.paused_until,
      'lastHttpStatus', v_rate.last_http_status,
      'retryAfterSeconds', v_rate.last_retry_after_seconds,
      'consecutive429', v_rate.consecutive_429,
      'source', v_rate.last_source
    ),
    v_execution_source,
    v_batch.expires_at,
    v_batch.worker_lease_until,
    statement_timestamp(),
    v_terminal_at
  )
  on conflict (session_id) do update set
    requested_by_member_id = excluded.requested_by_member_id,
    started_at = excluded.started_at,
    session_status = excluded.session_status,
    job_status = excluded.job_status,
    batch_status = excluded.batch_status,
    control_state = excluded.control_state,
    active = excluded.active,
    session_payload = excluded.session_payload,
    job_payload = excluded.job_payload,
    batch_payload = excluded.batch_payload,
    queue_meta = excluded.queue_meta,
    source_summary = jsonb_build_object(
      'listCount', excluded.source_summary->'listCount',
      'serverMasterTotal', excluded.source_summary->'serverMasterTotal',
      'matchedCount', coalesce(updater_session_progress_current.source_summary->'matchedCount', '0'::jsonb),
      'newCharacterCount', coalesce(updater_session_progress_current.source_summary->'newCharacterCount', '0'::jsonb),
      'targetCount', coalesce(updater_session_progress_current.source_summary->'targetCount', '0'::jsonb)
    ),
    handoff = excluded.handoff,
    postprocess = excluded.postprocess,
    plaync_rate_gate = excluded.plaync_rate_gate,
    execution_source = excluded.execution_source,
    batch_expires_at = excluded.batch_expires_at,
    worker_lease_until = excluded.worker_lease_until,
    updated_at = statement_timestamp(),
    terminal_at = coalesce(updater_session_progress_current.terminal_at, excluded.terminal_at);
end;
$function$;
CREATE OR REPLACE FUNCTION private.kinojo_queue_summary_refresh_progress_v422(p_session_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '2s'
 SET lock_timeout TO '250ms'
AS $function$
declare
  v_row public.updater_session_progress_current%rowtype;
  v_phases jsonb := '[]'::jsonb;
  v_overall numeric := 0;
  v_eta integer := 0;
  v_current_phase_id text := '';
  v_current_phase_label text := '대기';
  v_step1_status text := 'pending';
  v_step2_status text := 'pending';
  v_step3_status text := 'pending';
  v_step1_percent numeric := 0;
  v_step2_percent numeric := 0;
  v_step3_percent numeric := 0;
  v_current_step integer := 0;
  v_current_step_label text := '대기';
  v_complete boolean := false;
  v_ms_per_item numeric := 3200;
begin
  select * into v_row
  from public.updater_session_progress_current c
  where c.session_id = p_session_id;

  if not found then
    perform private.kinojo_queue_summary_refresh_core_v422(p_session_id);
    select * into v_row
    from public.updater_session_progress_current c
    where c.session_id = p_session_id;
  end if;

  if not found then
    return;
  end if;

  begin
    v_ms_per_item := greatest(50, coalesce((v_row.job_payload->>'avg_ms_per_item')::numeric, 3200));
  exception when invalid_text_representation or numeric_value_out_of_range then
    v_ms_per_item := 3200;
  end;

  with phase_def as (
    select * from (values
      (1, 'list_master_compare'::text, 'LIST_MASTER_COMPARE'::text, 'LIST / MASTER 대조'::text, 12::numeric, 'target'::text),
      (2, 'character_lookup', 'CHARACTER_LOOKUP', 'PLAYNC 공식 조회', 56::numeric, 'target'),
      (3, 'missing_recheck', 'MISSING_RECHECK', '누락 검산 / 재조회', 6::numeric, 'job'),
      (4, 'master_sync', 'MASTER_SYNC', 'character_master 최신화', 8::numeric, 'target'),
      (5, 'growth_review', 'GROWTH_REVIEW', '성장 리뷰 생성', 7::numeric, 'target'),
      (6, 'ranking_rebuild', 'RANKING_REBUILD', '랭킹 / 명예의 전당 계산', 6::numeric, 'job'),
      (7, 'list_sheet_export', 'LIST_SHEET_EXPORT', 'Google list 시트 반영', 5::numeric, 'target')
    ) d(no, phase_id, step_key, label, weight, total_kind)
  ), latest_step as (
    select distinct on (upper(s.step_key))
      upper(s.step_key) step_key,
      lower(coalesce(s.status, 'pending')) status,
      greatest(0, coalesce(s.progress_current, 0)) progress_current,
      greatest(0, coalesce(s.progress_total, 0)) progress_total,
      coalesce(s.message, '') message,
      coalesce(s.detail, '{}'::jsonb) detail,
      s.started_at,
      s.finished_at,
      s.updated_at
    from public.lookup_session_steps s
    where s.session_id = p_session_id
    order by upper(s.step_key), s.updated_at desc nulls last, s.id desc
  ), normalized as (
    select
      d.*,
      case
        when d.phase_id = 'character_lookup' then
          case
            when ls.status in ('failed', 'error') then 'error'
            when (v_row.total_count > 0 and v_row.completed_count >= v_row.total_count)
              or (v_row.total_count = 0 and ls.status in ('done', 'completed')) then 'done'
            when v_row.total_count > 0
              and (v_row.claimed_count + v_row.queued_count + v_row.retry_pending_count) > 0 then 'active'
            when ls.status in ('active', 'running') then 'active'
            else 'pending'
          end
        when ls.status in ('done', 'completed') then 'done'
        when ls.status in ('active', 'running') then 'active'
        when ls.status in ('failed', 'error') then 'error'
        else 'pending'
      end status,
      case
        when d.phase_id = 'character_lookup' then v_row.completed_count
        when ls.status in ('done', 'completed') then greatest(
          coalesce(ls.progress_current, 0),
          case when d.total_kind = 'target' then v_row.total_count else 1 end
        )
        else coalesce(ls.progress_current, 0)
      end current_count,
      greatest(1, coalesce(
        nullif(ls.progress_total, 0),
        case when d.total_kind = 'target' then greatest(v_row.total_count, 1) else 1 end
      )) total_count,
      coalesce(
        nullif(ls.message, ''),
        case when d.phase_id = 'character_lookup' then nullif(v_row.current_character, '') else null end,
        '대기'
      ) message,
      coalesce(ls.detail, '{}'::jsonb) detail,
      ls.started_at,
      ls.finished_at,
      ls.updated_at
    from phase_def d
    left join latest_step ls on ls.step_key = d.step_key
  ), calculated as (
    select
      n.*,
      case
        when n.status = 'done' then 100::numeric
        when n.total_count > 0 then least(100, greatest(0, round(n.current_count::numeric * 1000 / n.total_count) / 10))
        else 0::numeric
      end percent,
      case
        when n.phase_id = 'character_lookup' and n.status not in ('done', 'error')
          then ceil(greatest(0, v_row.total_count - v_row.completed_count) * v_ms_per_item / 1000)::integer
        else 0
      end eta_seconds,
      case
        when n.started_at is null then 0
        else greatest(0, floor(extract(epoch from (coalesce(n.finished_at, statement_timestamp()) - n.started_at)))::integer)
      end elapsed_seconds
    from normalized n
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'no', c.no,
        'id', c.phase_id,
        'stepKey', c.step_key,
        'label', c.label,
        'status', c.status,
        'current', least(c.current_count, c.total_count),
        'total', c.total_count,
        'percent', c.percent,
        'etaSeconds', c.eta_seconds,
        'elapsedSeconds', c.elapsed_seconds,
        'secondsPerItem', case when c.phase_id = 'character_lookup' then round(v_ms_per_item / 1000, 2) else 0 end,
        'etaIncluded', c.phase_id = 'character_lookup',
        'startedAt', c.started_at,
        'finishedAt', c.finished_at,
        'updatedAt', c.updated_at,
        'message', c.message,
        'details', c.detail || case when c.phase_id = 'character_lookup' then jsonb_build_object(
          'currentCharacter', v_row.current_character,
          'successCount', v_row.success_count,
          'retryPendingCount', v_row.retry_pending_count,
          'finalFailedCount', v_row.failed_count
        ) else '{}'::jsonb end
      ) order by c.no
    ), '[]'::jsonb),
    coalesce(sum(c.weight * c.percent / 100), 0),
    coalesce(sum(c.eta_seconds), 0)
  into v_phases, v_overall, v_eta
  from calculated c;

  select coalesce(p->>'status', 'pending'), coalesce((p->>'percent')::numeric, 0)
  into v_step1_status, v_step1_percent
  from jsonb_array_elements(v_phases) p
  where p->>'id' = 'list_master_compare';

  select coalesce(p->>'status', 'pending'), coalesce((p->>'percent')::numeric, 0)
  into v_step2_status, v_step2_percent
  from jsonb_array_elements(v_phases) p
  where p->>'id' = 'character_lookup';

  select
    case
      when bool_or((p->>'status') = 'error') then 'error'
      when bool_or((p->>'id') = 'list_sheet_export' and (p->>'status') = 'done') then 'done'
      when bool_or((p->>'status') in ('active', 'done', 'error')) then 'active'
      else 'pending'
    end,
    round(coalesce(sum(
      (case (p->>'id')
        when 'missing_recheck' then 6
        when 'master_sync' then 8
        when 'growth_review' then 7
        when 'ranking_rebuild' then 6
        when 'list_sheet_export' then 5
        else 0
      end) * coalesce((p->>'percent')::numeric, 0) / 100
    ), 0) * 100 / 32, 1)
  into v_step3_status, v_step3_percent
  from jsonb_array_elements(v_phases) p
  where (p->>'no')::integer between 3 and 7;

  select count(*) = 7 and bool_and((p->>'status') = 'done')
  into v_complete
  from jsonb_array_elements(v_phases) p;

  select coalesce(p->>'id', ''), coalesce(p->>'label', '대기')
  into v_current_phase_id, v_current_phase_label
  from jsonb_array_elements(v_phases) p
  where p->>'status' in ('active', 'error')
  order by (p->>'no')::integer
  limit 1;

  if coalesce(v_current_phase_id, '') = '' and not v_complete then
    select coalesce(p->>'id', ''), coalesce(p->>'label', '대기')
    into v_current_phase_id, v_current_phase_label
    from jsonb_array_elements(v_phases) p
    where p->>'status' = 'pending'
    order by (p->>'no')::integer
    limit 1;
  end if;

  v_current_step := case
    when v_complete then 7
    when v_step3_status in ('active', 'error', 'done') then 3
    when v_step2_status in ('active', 'error', 'done') then 2
    when v_step1_status in ('active', 'error', 'done') then 1
    else 0
  end;
  v_current_step_label := case v_current_step
    when 1 then '원본 대조'
    when 2 then '공식 조회'
    when 3 then '서버 후처리'
    when 7 then '전체 작업 완료'
    else '대기'
  end;

  if v_complete then
    v_overall := 100;
    v_eta := 0;
    v_current_phase_id := 'complete';
    v_current_phase_label := '완료';
  end if;

  update public.updater_session_progress_current c
  set current_step = v_current_step,
      current_step_label = v_current_step_label,
      phases = v_phases,
      eta_seconds = greatest(0, v_eta),
      progress_payload = jsonb_build_object(
        'ok', true,
        'sessionId', p_session_id,
        'total', c.total_count,
        'activePosition', c.active_position,
        'currentCharacter', c.current_character,
        'completedCount', c.completed_count,
        'successCount', c.success_count,
        'skippedCount', c.skipped_count,
        'finalFailedCount', c.failed_count,
        'retryPendingCount', c.retry_pending_count,
        'queuedCount', c.queued_count,
        'claimedCount', c.claimed_count,
        'remainingCount', c.remaining_count,
        'overallProgressPercent', round(least(100, greatest(0, v_overall)), 1),
        'currentStep', v_current_step,
        'currentStepLabel', v_current_step_label,
        'currentPhaseId', coalesce(v_current_phase_id, ''),
        'currentPhaseLabel', coalesce(v_current_phase_label, '대기'),
        'step1Status', coalesce(v_step1_status, 'pending'),
        'step2Status', coalesce(v_step2_status, 'pending'),
        'step3Status', coalesce(v_step3_status, 'pending'),
        'step1Percent', coalesce(v_step1_percent, 0),
        'step2Percent', coalesce(v_step2_percent, 0),
        'step3Percent', coalesce(v_step3_percent, 0),
        'phases', v_phases,
        'phaseCount', 7,
        'etaSeconds', greatest(0, v_eta),
        'databaseContract', '422',
        'progressContract', 'server-worker-seven-phase-v3-materialized',
        'targets', jsonb_build_object(
          'total', c.total_count,
          'queued', c.queued_count,
          'claimed', c.claimed_count,
          'lookupDone', c.success_count,
          'skipped', c.skipped_count,
          'missingAndRetryQueued', c.retry_pending_count,
          'finalFailed', c.failed_count,
          'terminal', c.completed_count,
          'remaining', c.remaining_count
        )
      ),
      updated_at = statement_timestamp(),
      terminal_at = case when v_complete then coalesce(c.terminal_at, statement_timestamp()) else c.terminal_at end
  where c.session_id = p_session_id;
end;
$function$;
commit;
