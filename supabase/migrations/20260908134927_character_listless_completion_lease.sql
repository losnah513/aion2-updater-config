begin;
set local lock_timeout='2s';
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
  v_claim jsonb;
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
  v_legacy boolean;
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
      'message','이 세션은 list 생략 조건과 일치하지 않습니다.',
      'policy',v_policy
    );
  end if;

  v_legacy:=coalesce((v_policy->>'listlessCharacterAdd')::boolean,false);

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
      'listWriteSkipped',true,'listReadbackSkipped',true,'listlessCharacterAdd',v_legacy,
      'partialSuccess',coalesce((v_batch.postprocess_summary->>'partialSuccess')::boolean,false),
      'listSkipReason',v_policy->>'listSkipReason',
      'sessionId',p_session_id,'databaseContract','455',
      'message','캐릭터 Master 반영과 관계 확정이 이미 완료되었습니다.'
    );
  end if;

  if v_batch.status in ('cancelled','failed','completed','expired') then
    return jsonb_build_object('ok',false,'code','BATCH_NOT_RUNNING');
  end if;
  -- Each successful stage releases its lease. Reacquire through the normal
  -- claim contract while holding the batch lock, rather than bypassing ownership.
  if v_batch.worker_id is null then
    v_claim:=public.kinojo_server_queue_postprocess_claim_v271(p_session_id,p_session_token,p_worker_id);
    if coalesce((v_claim->>'ok')::boolean,false) is not true
       or coalesce((v_claim->>'acquired')::boolean,false) is not true then
      return v_claim;
    end if;
    select * into v_batch from public.lookup_batches where session_id=p_session_id;
  end if;
  if v_batch.worker_id is distinct from left(coalesce(p_worker_id,''),160) then
    return jsonb_build_object('ok',false,'code','POSTPROCESS_WORKER_MISMATCH','message','Server 후처리 Worker가 일치하지 않습니다.');
  end if;
  if (v_batch.postprocess_master_done and v_batch.postprocess_review_done and v_batch.postprocess_ranking_done) is not true then
    return jsonb_build_object('ok',false,'code','POSTPROCESS_NOT_COMPLETE','message','완료되지 않은 Server 후처리 단계가 있습니다.');
  end if;
  if v_batch.postprocess_snapshot_required and v_batch.postprocess_snapshot_publish_done is not true then
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

  v_relation:=case when v_legacy then private.kinojo_legion_tree_finalize_relation_v373(p_session_id)
    else jsonb_build_object('ok',true,'processedCount',0,'notApplicable',true) end;
  if coalesce((v_relation->>'ok')::boolean,false) is not true
     or (v_legacy and coalesce((v_relation->>'processedCount')::integer,0)<>1) then
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
  if not v_legacy and (v_total<=0 or v_success<=0 or v_total<>v_success+v_failed+v_skipped) then
    return jsonb_build_object('ok',false,'code','LOOKUP_NOT_SETTLED','progress',v_progress);
  end if;
  v_partial:=v_failed>0 and v_success>0;
  v_message:=case when v_partial
    then '공식 조회 부분 완료 · 성공 캐릭터의 Master·관계·랭킹 반영 완료'
    else '공식 조회와 캐릭터 Master·관계·랭킹 반영 완료' end;
  if not v_legacy then v_message:=v_message||' · list 반영 생략(OFF)'; end if;
  v_summary:=v_summary||jsonb_build_object(
    'listSheetSyncEnabled',coalesce((v_policy->>'listSheetSyncEnabled')::boolean,true),
    'listSkipReason',v_policy->>'listSkipReason',
    'source',case when v_legacy then 'LEGION_TREE_CHARACTER_ADD' else 'CHARACTER_REFRESH' end,
    'phase','CHARACTER_MASTER_COMPLETE',
    'databaseContract','455',
    'postprocessComplete',true,
    'listlessCharacterAdd',v_legacy,
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
    p_session_id,'CHARACTER_MASTER_CONFIRM',6,'done',v_success,v_total,
    '캐릭터 Master·본캐/부캐 관계 확인 완료',
    jsonb_build_object(
      'source',case when v_legacy then 'LEGION_TREE_CHARACTER_ADD' else 'CHARACTER_REFRESH' end,
      'databaseContract','455',
      'listlessCharacterAdd',v_legacy,
      'listWriteSkipped',true,
      'listReadbackSkipped',true
    )
  );

  perform public.kinojo_lookup_step_upsert(
    p_session_id,'LIST_SHEET_EXPORT',7,'skipped',0,0,'list 쓰기·readback 생략',
    jsonb_build_object('listWriteSkipped',true,'listSkipReason',v_policy->>'listSkipReason')
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
           'listSkipReason',v_policy->>'listSkipReason',
           'databaseContract','455',
           'listlessCharacterAdd',v_legacy,
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
           'listlessCharacterAdd',v_legacy,
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
           'listlessCharacterAdd',v_legacy,
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

  if coalesce((v_finish->>'ok')::boolean,false) is not true then
    raise exception 'RUNTIME_FINISH_FAILED';
  end if;
  return jsonb_build_object(
    'partialSuccess',v_partial,
    'listSkipReason',v_policy->>'listSkipReason',
    'ok',true,'done',true,'completed',true,
    'postprocessComplete',true,
    'listSheetComplete',false,
    'listWriteSkipped',true,
    'listReadbackSkipped',true,
    'listlessCharacterAdd',v_legacy,
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

commit;
