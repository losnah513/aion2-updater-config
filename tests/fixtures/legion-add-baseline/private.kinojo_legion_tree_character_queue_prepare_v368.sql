CREATE OR REPLACE FUNCTION private.kinojo_legion_tree_character_queue_prepare_v368(p_web_session_token text, p_server_id integer, p_target_character_name text, p_main_character_name text, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'extensions'
AS $function$
declare
  v_web jsonb;
  v_profile jsonb;
  v_member_id bigint;
  v_actor_name text;
  v_actor_role text;
  v_actor_level integer;
  v_server public.server_master%rowtype;
  v_mode text := upper(pg_catalog.btrim(coalesce(p_mode,'')));
  v_target text := pg_catalog.btrim(coalesce(p_target_character_name,''));
  v_main text := pg_catalog.btrim(coalesce(p_main_character_name,''));
  v_dedupe jsonb;
  v_dedupe_code text;
  v_existing_character_id bigint;
  v_lock public.updater_lock_state%rowtype;
  v_existing_session public.updater_sessions%rowtype;
  v_existing_target_id bigint;
  v_session_id text;
  v_session_token text;
  v_job_id text := gen_random_uuid()::text;
  v_prepare jsonb;
  v_target_id bigint;
  v_queue_count integer;
  v_target_source text := 'server:legion_tree_character_add_v368';
  v_payload jsonb;
begin
  v_web := public.kinojo_web_session_validate_v320(p_web_session_token, true);
  if coalesce((v_web->>'ok')::boolean,false) is not true then
    return v_web;
  end if;

  v_profile := coalesce(v_web->'profile','{}'::jsonb);
  v_member_id := nullif(v_profile->>'id','')::bigint;
  v_actor_name := pg_catalog.btrim(coalesce(v_profile->>'mainCharacterName',''));
  v_actor_role := pg_catalog.btrim(coalesce(v_profile->>'role','MEMBER'));
  v_actor_level := coalesce(nullif(v_profile->>'level','')::integer,0);

  if v_member_id is null or v_actor_level < 1 then
    return jsonb_build_object('ok',false,'code','NO_LOOKUP_PERMISSION','message','조회 권한이 없는 계정입니다.');
  end if;

  if v_mode not in ('MAIN','ALT') then
    return jsonb_build_object('ok',false,'code','INVALID_ADD_MODE','message','캐릭터 추가 모드가 올바르지 않습니다.');
  end if;
  if v_target = '' or v_main = '' then
    return jsonb_build_object('ok',false,'code','CHARACTER_NAME_REQUIRED','message','본캐와 추가 대상 이름을 확인해 주세요.');
  end if;
  if v_mode = 'MAIN'
     and public.kinojo_character_identity_key_v298(v_target) <> public.kinojo_character_identity_key_v298(v_main) then
    return jsonb_build_object('ok',false,'code','MAIN_MODE_IDENTITY_MISMATCH','message','본캐 추가 대상이 본캐 이름과 일치하지 않습니다.');
  end if;
  if v_mode = 'ALT'
     and public.kinojo_character_identity_key_v298(v_target) = public.kinojo_character_identity_key_v298(v_main) then
    return jsonb_build_object('ok',false,'code','MAIN_ALT_SAME_CHARACTER','message','본캐와 부캐 이름이 같습니다.');
  end if;

  select * into v_server
    from public.server_master
   where server_id = p_server_id
     and coalesce(is_active,false) is true
   limit 1;
  if not found then
    return jsonb_build_object('ok',false,'code','SERVER_NOT_FOUND','message','현재 사용할 수 없는 서버입니다.');
  end if;

  if public.kinojo_lookup_admin_exclusion_reason(p_server_id,v_target) is not null then
    return jsonb_build_object('ok',false,'code','CHARACTER_EXCLUDED','message','현재 조회 제외로 관리 중인 캐릭터입니다.');
  end if;

  v_dedupe := private.kinojo_legion_tree_character_dedupe_v366(p_server_id,v_target);
  if coalesce((v_dedupe->>'ok')::boolean,false) is not true then
    return v_dedupe;
  end if;
  v_dedupe_code := coalesce(v_dedupe->>'code','');
  v_existing_character_id := nullif(v_dedupe->>'existingCharacterId','')::bigint;

  if v_dedupe_code = 'ALREADY_REGISTERED' then
    return v_dedupe || jsonb_build_object('queueCreated',false,'workerStartNeeded',false);
  end if;
  if v_dedupe_code = 'EXISTING_CHARACTER_INACTIVE' then
    return v_dedupe || jsonb_build_object('queueCreated',false,'workerStartNeeded',false);
  end if;
  if v_dedupe_code not in ('NEW_CHARACTER','EXISTING_CHARACTER_REUSE') then
    return jsonb_build_object('ok',false,'code','DEDUPE_RESULT_UNSUPPORTED','message','중복 판정 결과를 처리할 수 없습니다.');
  end if;

  perform public.kinojo_expire_updater_lock();
  select * into v_lock
    from public.updater_lock_state
   where id='global'
   for update;
  if not found then
    return jsonb_build_object('ok',false,'code','QUEUE_LOCK_STATE_MISSING','message','캐릭터 조회 Lock 상태를 확인하지 못했습니다.');
  end if;

  if coalesce(v_lock.is_locked,false) is true then
    if coalesce(v_lock.locked_by_member_id,-1)=v_member_id
       and coalesce(v_lock.client_id,'')='LEGION_TREE_WEB'
       and coalesce(v_lock.tool_name,'')='KINOJO_SERVER_CHARACTER_QUEUE' then
      select * into v_existing_session
        from public.updater_sessions s
       where s.session_id=v_lock.session_id
         and s.session_token=v_lock.session_token
         and coalesce(s.raw_payload->>'requestedSurface','')='LEGION_TREE_CHARACTER_ADD'
         and coalesce((s.raw_payload->>'serverId')::integer,-1)=p_server_id
         and public.kinojo_character_identity_key_v298(coalesce(s.raw_payload->>'targetCharacterName',''))
             = public.kinojo_character_identity_key_v298(v_target)
       limit 1;
      if found then
        select id into v_existing_target_id
          from public.lookup_session_targets
         where session_id=v_existing_session.session_id
           and server_id=p_server_id
           and public.kinojo_character_identity_key_v298(character_name)=public.kinojo_character_identity_key_v298(v_target)
         order by id desc
         limit 1;
        return jsonb_build_object(
          'ok',true,
          'code','QUEUE_ALREADY_RUNNING',
          'databaseContract','368',
          'sessionId',v_existing_session.session_id,
          'sessionToken',v_existing_session.session_token,
          'targetId',v_existing_target_id,
          'queueCount',1,
          'queueCreated',false,
          'workerStartNeeded',true,
          'resume',true,
          'dedupeCode',v_dedupe_code,
          'existingCharacterId',v_existing_character_id,
          'message','같은 캐릭터 추가 Queue가 이미 진행 중이어서 기존 Queue를 이어갑니다.'
        );
      end if;
    end if;

    return jsonb_build_object(
      'ok',false,
      'code','QUEUE_BUSY',
      'message','다른 캐릭터 정보 최신화 작업이 진행 중입니다. 완료 후 다시 시도해 주세요.',
      'queueCreated',false,
      'workerStartNeeded',false
    );
  end if;

  v_session_id := gen_random_uuid()::text;
  v_session_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  v_payload := jsonb_build_object(
    'requestedSurface','LEGION_TREE_CHARACTER_ADD',
    'queueContract','368',
    'serverQueueContract','276',
    'databaseContract','368',
    'authContract','320',
    'dedupeContract','366',
    'mode',v_mode,
    'serverId',p_server_id,
    'serverName',v_server.server_name,
    'targetCharacterName',v_target,
    'mainCharacterName',v_main,
    'existingCharacterId',v_existing_character_id,
    'dedupeCode',v_dedupe_code,
    'listRow',null,
    'listAppendPending',true,
    'serverQueue',true,
    'lookupOnlyPhase',false,
    'postprocessPhase',true,
    'postprocessPending',true,
    'sheetDeferred',false,
    'adminControlState','running',
    'workerBatchLimit',1,
    'queueMergeStrategy','global_lock_single_active',
    'officialRateGate','plaync_global_700ms',
    'officialRawReuseSeconds',900,
    'plaync429AttemptConsumed',false
  );

  insert into public.updater_sessions(
    session_id,session_token,tool_name,client_id,
    requested_by_member_id,requested_by_character,requested_by_role,requested_by_level,
    status,stage,message,progress_current,progress_total,
    started_at,last_heartbeat_at,expires_at,raw_payload
  ) values (
    v_session_id,v_session_token,'KINOJO_SERVER_CHARACTER_QUEUE','LEGION_TREE_WEB',
    v_member_id,v_actor_name,v_actor_role,v_actor_level,
    'starting','LOCK_ACQUIRED','레기온 트리 캐릭터 추가 조회 준비 중',0,1,
    now(),now(),now()+interval '3 minutes',v_payload
  );

  insert into public.lookup_batches(
    session_id,source,owner_main_character,owner_role,owner_level,device_id,
    status,total_count,done_count,started_at,updated_at,memo,
    tool_name,session_token,client_id,stage,message,last_heartbeat_at,expires_at,
    worker_id,worker_lease_until,worker_batch_no,worker_last_summary,
    postprocess_status,postprocess_stage,postprocess_attempt_count,
    postprocess_master_done,postprocess_review_done,postprocess_ranking_done,
    postprocess_last_error,postprocess_started_at,postprocess_finished_at,postprocess_summary,
    list_sync_status,list_sync_attempt_count,list_sync_started_at,list_sync_finished_at,list_sync_last_error,list_sync_summary
  ) values (
    v_session_id,'legion_tree_character_add',v_actor_name,v_actor_role,v_actor_level,'LEGION_TREE_WEB',
    'starting',1,0,now(),now(),'legion-tree-character-add-lock-acquired',
    'KINOJO_SERVER_CHARACTER_QUEUE',v_session_token,'LEGION_TREE_WEB','LOCK_ACQUIRED','레기온 트리 캐릭터 추가 조회 준비 중',now(),now()+interval '3 minutes',
    null,null,0,'{}'::jsonb,
    'pending','MASTER_SYNC',0,false,false,false,null,null,null,'{}'::jsonb,
    'pending',0,null,null,null,'{}'::jsonb
  );

  update public.updater_lock_state
     set is_locked=true,
         session_id=v_session_id,
         session_token=v_session_token,
         locked_by_member_id=v_member_id,
         locked_by_character=v_actor_name,
         locked_by_role=v_actor_role,
         locked_by_level=v_actor_level,
         tool_name='KINOJO_SERVER_CHARACTER_QUEUE',
         client_id='LEGION_TREE_WEB',
         status='starting',
         stage='LOCK_ACQUIRED',
         message='레기온 트리 캐릭터 추가 조회 준비 중',
         progress_current=0,
         progress_total=1,
         started_at=now(),
         last_heartbeat_at=now(),
         expires_at=now()+interval '3 minutes',
         released_at=null,
         release_reason=null,
         updated_at=now()
   where id='global';

  insert into public.updater_runtime_jobs(
    job_id,session_id,session_token_hash,tool_name,client_id,
    requested_by_character,requested_by_role,requested_by_level,
    status,current_stage,message,progress_current,progress_total,
    heartbeat_interval_seconds,timeout_seconds,
    started_at,last_heartbeat_at,raw_payload
  ) values (
    v_job_id,v_session_id,md5(v_session_token),'KINOJO_SERVER_CHARACTER_QUEUE','LEGION_TREE_WEB',
    v_actor_name,v_actor_role,v_actor_level,
    'running','LOCK_ACQUIRED','레기온 트리 캐릭터 추가 조회 준비 중',0,1,
    15,180,now(),now(),v_payload
  );

  insert into public.updater_runtime_events(
    session_id,job_id,event_type,stage,progress_current,progress_total,message,payload
  ) values (
    v_session_id,v_job_id,'start','LOCK_ACQUIRED',0,1,
    '레기온 트리 캐릭터 추가 조회 시작',v_payload
  );

  v_prepare := public.kinojo_prepare_lookup_queue_from_list_v296(
    v_session_id,
    v_session_token,
    jsonb_build_array(jsonb_build_object(
      'row',null,
      'name',v_target,
      'characterName',v_target,
      'mainCharacterName',v_main,
      'serverId',p_server_id,
      'serverName',v_server.server_name
    )),
    jsonb_build_object('lookupMode','all','characterName',v_target,'servers',jsonb_build_array(p_server_id::text))
  );

  if coalesce((v_prepare->>'ok')::boolean,false) is not true then
    raise exception 'LEGION_TREE_QUEUE_PREPARE_FAILED:%',coalesce(v_prepare->>'code','UNKNOWN') using errcode='P0001';
  end if;

  select count(*)::integer,min(id)
    into v_queue_count,v_target_id
    from public.lookup_session_targets
   where session_id=v_session_id;

  if v_queue_count <> 1 or v_target_id is null then
    raise exception 'LEGION_TREE_QUEUE_TARGET_COUNT_INVALID:%',v_queue_count using errcode='P0001';
  end if;

  update public.lookup_session_targets
     set list_row=null,
         list_original_name=v_target,
         target_source=v_target_source,
         lookup_order=1,
         target_status='queued',
         attempt_count=0,
         max_attempts=3,
         last_error=null,
         last_failure_code=null,
         last_failure_retryable=null,
         final_failed_at=null,
         claimed_at=null,
         queued_at=now(),
         updated_at=now()
   where id=v_target_id;

  if v_dedupe_code='NEW_CHARACTER' then
    update public.character_master cm
       set bootstrap_source='legion_tree_character_add_v368',
           list_row=null,
           main_character_name=v_main,
           is_main=(v_mode='MAIN'),
           sync_status='lookup_queued',
           updated_at=now()
     where cm.server_id=p_server_id
       and public.kinojo_character_identity_key_v298(cm.character_name)=public.kinojo_character_identity_key_v298(v_target)
       and coalesce(cm.status,'')='WAIT_LOOKUP'
       and coalesce(cm.sync_status,'')='lookup_queued'
       and cm.list_row is null;
  end if;

  update public.lookup_batches
     set source='legion_tree_character_add',
         status='running',
         total_count=1,
         done_count=0,
         stage='SERVER_QUEUE_READY',
         message='레기온 트리 캐릭터 추가 Target Queue 준비 완료',
         last_heartbeat_at=now(),
         expires_at=now()+interval '15 minutes',
         worker_id=null,
         worker_lease_until=null,
         worker_batch_no=0,
         worker_last_summary='{}'::jsonb,
         postprocess_status='pending',
         postprocess_stage='MASTER_SYNC',
         postprocess_attempt_count=0,
         postprocess_master_done=false,
         postprocess_review_done=false,
         postprocess_ranking_done=false,
         postprocess_last_error=null,
         postprocess_started_at=null,
         postprocess_finished_at=null,
         postprocess_summary='{}'::jsonb,
         list_sync_status='pending',
         list_sync_attempt_count=0,
         list_sync_started_at=null,
         list_sync_finished_at=null,
         list_sync_last_error=null,
         list_sync_summary='{}'::jsonb,
         updated_at=now()
   where session_id=v_session_id;

  update public.updater_sessions
     set status='running',
         stage='SERVER_QUEUE_READY',
         message='Server Worker 인계 준비 완료',
         progress_current=0,
         progress_total=1,
         last_heartbeat_at=now(),
         expires_at=now()+interval '15 minutes',
         raw_payload=coalesce(raw_payload,'{}'::jsonb) || v_payload || jsonb_build_object(
           'queueTargetId',v_target_id,
           'queueCount',1,
           'targetSource',v_target_source,
           'serverQueueContract','276'
         ),
         updated_at=now()
   where session_id=v_session_id;

  update public.updater_runtime_jobs
     set status='running',
         current_stage='SERVER_QUEUE_READY',
         current_character=null,
         message='Server Worker 인계 준비 완료',
         progress_current=0,
         progress_total=1,
         last_heartbeat_at=now(),
         raw_payload=coalesce(raw_payload,'{}'::jsonb) || v_payload || jsonb_build_object(
           'queueTargetId',v_target_id,
           'queueCount',1,
           'targetSource',v_target_source,
           'serverQueueContract','276'
         ),
         updated_at=now()
   where session_id=v_session_id;

  update public.updater_lock_state
     set status='running',
         stage='SERVER_QUEUE_READY',
         message='레기온 트리 캐릭터 추가 Target Queue 준비 완료',
         progress_current=0,
         progress_total=1,
         last_heartbeat_at=now(),
         expires_at=now()+interval '15 minutes',
         updated_at=now()
   where id='global' and session_id=v_session_id and session_token=v_session_token;

  perform public.kinojo_lookup_step_upsert(
    v_session_id,'CHARACTER_LOOKUP',2,'active',0,1,
    'Server Worker 단일 캐릭터 공식 조회 대기',
    jsonb_build_object(
      'source','LEGION_TREE_CHARACTER_ADD',
      'queueCount',1,
      'batchLimit',1,
      'targetId',v_target_id,
      'targetSource',v_target_source,
      'databaseContract','368'
    )
  );

  insert into public.updater_runtime_events(
    session_id,job_id,event_type,stage,progress_current,progress_total,message,payload
  ) values (
    v_session_id,v_job_id,'server_queue_ready','SERVER_QUEUE_READY',0,1,
    '레기온 트리 캐릭터 추가 Target Queue 준비 완료',
    jsonb_build_object(
      'actor',v_actor_name,
      'targetId',v_target_id,
      'targetCharacterName',v_target,
      'mainCharacterName',v_main,
      'mode',v_mode,
      'dedupeCode',v_dedupe_code,
      'existingCharacterId',v_existing_character_id,
      'queueContract','368'
    )
  );

  return jsonb_build_object(
    'ok',true,
    'code','QUEUE_READY',
    'databaseContract','368',
    'serverQueueContract','276',
    'workerContract','295',
    'sessionId',v_session_id,
    'sessionToken',v_session_token,
    'targetId',v_target_id,
    'queueCount',1,
    'queueCreated',true,
    'workerStartNeeded',true,
    'resume',false,
    'dedupeCode',v_dedupe_code,
    'existingCharacterId',v_existing_character_id,
    'targetSource',v_target_source,
    'message','단일 캐릭터 Server Queue를 준비했습니다.'
  );
end;
$function$
