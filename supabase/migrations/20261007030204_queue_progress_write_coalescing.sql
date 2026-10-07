-- SQL528: coalesce Worker state summary writes within each successful RPC.
-- Function-local SET restores the caller setting on return and exception.
CREATE OR REPLACE FUNCTION private.kinojo_queue_summary_core_trigger_v422()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if current_setting('kinojo.defer_queue_summary_v528', true) = 'on' then
    return new;
  end if;
  perform private.kinojo_queue_summary_refresh_core_v422(new.session_id);
  perform private.kinojo_queue_summary_refresh_progress_v422(new.session_id);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.kinojo_queue_summary_lock_trigger_v422()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if current_setting('kinojo.defer_queue_summary_v528', true) = 'on' then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.session_id, '') <> '' then
    perform private.kinojo_queue_summary_refresh_core_v422(old.session_id);
  end if;
  if coalesce(new.session_id, '') <> '' then
    perform private.kinojo_queue_summary_refresh_core_v422(new.session_id);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_server_queue_worker_claim_v270(p_session_id text, p_session_token text, p_worker_id text, p_batch_limit integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "kinojo.defer_queue_summary_v528" TO 'off'
AS $function$
declare
  v_valid jsonb;
  v_session public.updater_sessions%rowtype;
  v_batch public.lookup_batches%rowtype;
  v_worker text := left(coalesce(nullif(trim(p_worker_id),''),gen_random_uuid()::text),160);
  v_limit integer := greatest(1,least(coalesce(p_batch_limit,5),5));
  v_control text := 'running';
begin
  v_valid := public.kinojo_validate_updater_session(p_session_id,p_session_token);
  if coalesce((v_valid->>'ok')::boolean,false) is not true then return v_valid; end if;

  select * into v_session from public.updater_sessions where session_id=p_session_id for update;
  if not found then return jsonb_build_object('ok',false,'code','SERVER_QUEUE_SESSION_NOT_FOUND','message','Server Queue 세션을 찾지 못했습니다.'); end if;

  if coalesce(v_session.raw_payload->>'serverQueue','false') <> 'true' then
    return jsonb_build_object('ok',false,'code','NOT_SERVER_QUEUE_SESSION','message','Server 대량 Queue 세션이 아닙니다.');
  end if;

  v_control := lower(coalesce(nullif(v_session.raw_payload->>'adminControlState',''),'running'));
  if v_control in ('paused','cancelled') then
    return jsonb_build_object('ok',true,'acquired',false,'controlState',v_control,'paused',v_control='paused','cancelled',v_control='cancelled','message',case when v_control='paused' then '관리자 일시정지 중입니다.' else '관리자가 작업을 중단했습니다.' end);
  end if;

  select * into v_batch from public.lookup_batches where session_id=p_session_id for update;
  if not found then return jsonb_build_object('ok',false,'code','SERVER_QUEUE_BATCH_NOT_FOUND','message','Server Queue Batch를 찾지 못했습니다.'); end if;

  if nullif(v_batch.worker_id,'') is not null
     and v_batch.worker_id <> v_worker
     and coalesce(v_batch.worker_lease_until,'epoch'::timestamptz) > now() then
    return jsonb_build_object('ok',true,'acquired',false,'busy',true,'workerId',v_batch.worker_id,'leaseUntil',v_batch.worker_lease_until,'message','다른 Server Worker가 현재 Queue를 처리 중입니다.');
  end if;

  -- Validation may expire a different session: defer only the four writes below.
  perform set_config('kinojo.defer_queue_summary_v528', 'on', true);
  update public.lookup_batches
     set worker_id=v_worker,
         worker_lease_until=now()+interval '2 minutes',
         worker_batch_no=coalesce(worker_batch_no,0)+1,
         worker_last_started_at=now(),
         status='running',
         stage='SERVER_QUEUE_RUNNING',
         message='Server Worker 순차 조회 중',
         last_heartbeat_at=now(),
         expires_at=now()+interval '15 minutes',
         updated_at=now()
   where session_id=p_session_id
   returning * into v_batch;

  update public.updater_sessions
     set stage='SERVER_QUEUE_RUNNING',message='Server Worker 순차 조회 중',last_heartbeat_at=now(),expires_at=now()+interval '15 minutes'
   where session_id=p_session_id;
  update public.updater_runtime_jobs
     set current_stage='SERVER_QUEUE_RUNNING',message='Server Worker 순차 조회 중',last_heartbeat_at=now()
   where session_id=p_session_id;
  update public.updater_lock_state
     set stage='SERVER_QUEUE_RUNNING',message='Server Worker 순차 조회 중',last_heartbeat_at=now(),expires_at=now()+interval '15 minutes'
   where id='global' and session_id=p_session_id;

  perform private.kinojo_queue_summary_refresh_core_v422(p_session_id);
  perform private.kinojo_queue_summary_refresh_progress_v422(p_session_id);

  return jsonb_build_object('ok',true,'acquired',true,'workerId',v_worker,'batchNo',v_batch.worker_batch_no,'batchLimit',v_limit,'leaseUntil',v_batch.worker_lease_until,'controlState','running');
end;
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_server_queue_worker_update_v270(p_session_id text, p_session_token text, p_worker_id text, p_stage text, p_message text, p_release boolean DEFAULT false, p_summary jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "kinojo.defer_queue_summary_v528" TO 'off'
AS $function$
declare
  v_valid jsonb;
  v_progress jsonb;
  v_stage text := left(coalesce(nullif(trim(p_stage),''),'SERVER_QUEUE_RUNNING'),120);
  v_message text := left(coalesce(nullif(trim(p_message),''),'Server Worker 상태 갱신'),1000);
  v_updated integer := 0;
begin
  v_valid := public.kinojo_validate_updater_session(p_session_id,p_session_token);
  if coalesce((v_valid->>'ok')::boolean,false) is not true then return v_valid; end if;

  if jsonb_typeof(coalesce(p_summary->'progress','null'::jsonb)) = 'object'
     and coalesce((p_summary->'progress'->>'ok')::boolean,false) is true then
    v_progress := p_summary->'progress';
  else
    v_progress := public.kinojo_lookup_progress_summary(p_session_id);
  end if;

  -- Validation may expire a different session: defer only the four writes below.
  perform set_config('kinojo.defer_queue_summary_v528', 'on', true);
  update public.lookup_batches
     set worker_id=case when coalesce(p_release,false) then null else worker_id end,
         worker_lease_until=case when coalesce(p_release,false) then null else now()+interval '2 minutes' end,
         worker_last_finished_at=case when coalesce(p_release,false) then now() else worker_last_finished_at end,
         worker_last_summary=case when jsonb_typeof(coalesce(p_summary,'{}'::jsonb))='object' then coalesce(p_summary,'{}'::jsonb) else '{}'::jsonb end,
         stage=v_stage,
         message=v_message,
         done_count=coalesce((v_progress->>'completedCount')::integer,done_count),
         total_count=coalesce((v_progress->>'total')::integer,total_count),
         last_heartbeat_at=now(),
         expires_at=now()+interval '15 minutes',
         updated_at=now()
   where session_id=p_session_id
     and (worker_id=left(coalesce(p_worker_id,''),160) or worker_id is null);
  get diagnostics v_updated=row_count;

  update public.updater_sessions
     set stage=v_stage,
         message=v_message,
         progress_current=coalesce((v_progress->>'completedCount')::integer,progress_current),
         progress_total=coalesce((v_progress->>'total')::integer,progress_total),
         last_heartbeat_at=now(),
         expires_at=now()+interval '15 minutes'
   where session_id=p_session_id;
  update public.updater_runtime_jobs
     set current_stage=v_stage,
         message=v_message,
         progress_current=coalesce((v_progress->>'completedCount')::integer,progress_current),
         progress_total=coalesce((v_progress->>'total')::integer,progress_total),
         last_heartbeat_at=now()
   where session_id=p_session_id;
  update public.updater_lock_state
     set stage=v_stage,
         message=v_message,
         progress_current=coalesce((v_progress->>'completedCount')::integer,progress_current),
         progress_total=coalesce((v_progress->>'total')::integer,progress_total),
         last_heartbeat_at=now(),
         expires_at=now()+interval '15 minutes'
   where id='global' and session_id=p_session_id;

  perform private.kinojo_queue_summary_refresh_core_v422(p_session_id);
  perform private.kinojo_queue_summary_refresh_progress_v422(p_session_id);

  return jsonb_build_object('ok',true,'updated',v_updated>0,'released',coalesce(p_release,false),'stage',v_stage,'progress',v_progress);
end;
$function$;
