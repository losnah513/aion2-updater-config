-- Existing execution boundaries only. No operating job is started or stopped.
begin;
CREATE OR REPLACE FUNCTION public.kinojo_automation_finish_v377(p_job_type text, p_run_id text, p_status text, p_message text, p_session_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_key text := lower(trim(coalesce(p_job_type, '')));
  v_setting public.kinojo_server_automation_settings%rowtype;
  v_session_status text;
  v_batch_status text;
  v_status text := lower(trim(coalesce(p_status, 'completed')));
begin
  select * into v_setting from public.kinojo_server_automation_settings
  where automation_key = v_key for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'AUTOMATION_NOT_FOUND'); end if;

  if p_run_id is not null and v_setting.active_run_id is distinct from p_run_id then
    return jsonb_build_object('ok', true, 'ignored', true, 'message', '다른 자동 실행의 종료 요청을 무시했습니다.');
  end if;
  if p_session_id is not null and v_setting.active_session_id is distinct from p_session_id then
    return jsonb_build_object('ok', true, 'ignored', true, 'message', '다른 자동 세션의 종료 요청을 무시했습니다.');
  end if;

  if v_key='character_refresh' then
    if p_session_id is null then
      return jsonb_build_object('ok',false,'code','AUTOMATION_SESSION_REQUIRED');
    end if;
    select status into v_session_status from public.updater_sessions where session_id=p_session_id for update;
    select status into v_batch_status from public.lookup_batches where session_id=p_session_id for update;
    if v_session_status not in ('completed','failed','cancelled','expired')
       or v_batch_status not in ('completed','failed','cancelled','expired')
       or v_session_status is null or v_batch_status is null
       or (v_session_status='completed') is distinct from (v_batch_status='completed') then
      return jsonb_build_object('ok',false,'code','AUTOMATION_SESSION_NOT_TERMINAL');
    end if;
    -- Callback delivery outcome is not the job outcome.
    v_status:=case when v_session_status='completed' then 'completed' else 'failed' end;
  end if;

  if v_key = 'character_refresh' and v_setting.active_session_id is not null then
    update public.updater_sessions
    set status = case when v_status = 'completed' then 'completed' else 'failed' end,
        stage = case when v_status = 'completed' then coalesce(stage, 'COMPLETED') else coalesce(stage, 'AUTOMATION_FAILED') end,
        message = left(coalesce(p_message, ''), 1000),
        finished_at = coalesce(finished_at, now()), updated_at = now()
    where session_id = v_setting.active_session_id
      and status not in ('completed', 'failed', 'cancelled', 'expired');

    update public.lookup_batches
    set status = case when v_status = 'completed' then 'completed' else 'failed' end,
        message = left(coalesce(p_message, ''), 1000),
        finished_at = coalesce(finished_at, now()), updated_at = now()
    where session_id = v_setting.active_session_id
      and status not in ('completed', 'failed', 'cancelled', 'expired');

    update public.updater_lock_state
    set is_locked = false, status = case when v_status = 'completed' then 'completed' else 'failed' end,
        stage = case when v_status = 'completed' then 'AUTOMATION_COMPLETED' else 'AUTOMATION_FAILED' end,
        message = left(coalesce(p_message, ''), 1000), released_at = now(),
        release_reason = 'scheduled_automation_' || v_status, expires_at = null, session_token = null, updated_at = now()
    where id = 'global' and session_id = v_setting.active_session_id;
  end if;

  update public.kinojo_server_automation_settings
  set running = false, active_run_id = null, active_session_id = null,
      running_since = null, last_finished_at = now(), last_status = v_status,
      last_message = left(coalesce(p_message, ''), 1000), updated_by = 'SYSTEM:CRON', updated_at = now()
  where automation_key = v_key;

  return jsonb_build_object('ok', true, 'jobType', v_key, 'status', v_status, 'finishedAt', now());
end;
$function$;

revoke all on function public.kinojo_automation_finish_v377(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.kinojo_automation_finish_v377(text,text,text,text,text) to service_role;
create or replace function public.kinojo_character_detail_dispatch_failed_v1(p_job_id uuid,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public'
set statement_timeout='5s' set lock_timeout='1s' as $fn$
declare v_id uuid;
begin
  -- Compare-and-set: an accepted receiver or any newer progress wins.
  update public.character_detail_refresh_jobs
  set status='failed',phase='COMPLETE',completed_at=now(),cooldown_until=now()+interval '30 minutes',
      resume_at=null,last_error_code='DETAIL_DISPATCH_UNCONFIRMED',
      last_error_message='다음 실행 인계를 확인하지 못했습니다. 성공한 상세 항목은 보존됩니다.',
      current_label='상세 갱신 인계 확인 실패',updated_at=now()
  where id=p_job_id and updated_at=p_expected_updated_at
    and status in ('queued','waiting') and worker_id is null
  returning id into v_id;
  return jsonb_build_object('ok',true,'recorded',v_id is not null);
end;
$fn$;
revoke all on function public.kinojo_character_detail_dispatch_failed_v1(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.kinojo_character_detail_dispatch_failed_v1(uuid,timestamptz) to service_role;
CREATE OR REPLACE FUNCTION public.kinojo_server_queue_handoff_update_v276(p_session_id text, p_session_token text, p_worker_id text, p_state text, p_message text DEFAULT NULL::text, p_error text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
  v_status text;
begin
  v_result:=public.kinojo_validate_updater_session(p_session_id,p_session_token);
  if coalesce((v_result->>'ok')::boolean,false) is not true then return v_result; end if;
  select status into v_status from public.lookup_batches where session_id=p_session_id for update;
  if v_status in ('completed','failed','cancelled','expired') then
    return jsonb_build_object('ok',true,'ignored',true,'status',v_status,'reason','TERMINAL_HANDOFF_PRESERVED');
  end if;
  v_result := public.kinojo_server_queue_handoff_update_v275(
    p_session_id,p_session_token,p_worker_id,p_state,p_message,p_error
  );
  if coalesce((v_result->>'ok')::boolean,false) is true then
    update public.updater_sessions
       set raw_payload=coalesce(raw_payload,'{}'::jsonb)||jsonb_build_object('serverQueueContract','276'),
           updated_at=now()
     where session_id=p_session_id;
  end if;
  return v_result||jsonb_build_object('databaseContract','276');
end;
$function$;
commit;
