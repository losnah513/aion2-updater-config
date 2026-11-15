-- Complete settled character lookups with zero eligible list rows.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
DO $guard$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('public.kinojo_legion_tree_listless_policy_v455(text,text)','ef6a969e95ec043d2ae5ad0e7c37ef1e'),
    ('public.kinojo_legion_tree_listless_complete_v455(text,text,text,jsonb)','842ffb0e35c7cbb67317ae207d0a26f1'),
    ('private.kinojo_queue_summary_refresh_progress_v422(text)','b7ac050a74a6b4e68be880d76c1c5219'),
    ('public.kinojo_lookup_progress_summary(text)','287b756775c19445e6dc9eea04eafdf1')
  ) AS baseline(signature,body_hash)
  LOOP
    IF (SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10))) FROM pg_proc WHERE oid=to_regprocedure(item.signature))
       IS DISTINCT FROM item.body_hash THEN
      RAISE EXCEPTION 'Character list completion source changed: %',item.signature;
    END IF;
  END LOOP;
END
$guard$;

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
  v_no_list_targets boolean := false;
  v_skip_reason text;
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

  -- Use the same completed-target selection as the list queue. An existing
  -- queue or a pending DB stage must still go through its normal lifecycle.
  if not v_allowed and v_session.list_sheet_sync_enabled and v_list_queue_count=0
     and v_session.raw_payload->'serverQueue'='true'::jsonb then
    select exists (
      select 1 from public.lookup_batches b
      where b.session_id=p_session_id
        and (
          (b.status='completed' and b.list_sync_status='skipped'
            and b.list_sync_summary->>'listSkipReason'='NO_LIST_TARGETS')
          or (b.status not in ('cancelled','failed','completed','expired')
            and coalesce(b.list_sync_attempt_count,0)=0
            and b.postprocess_master_done and b.postprocess_review_done and b.postprocess_ranking_done
            and (not b.postprocess_snapshot_required or b.postprocess_snapshot_publish_done)
            and exists (
              select 1 from public.lookup_session_targets t
              where t.session_id=p_session_id and t.target_status='lookup_done'
            )
            and not exists (
              select 1 from public.lookup_session_targets t
              where t.session_id=p_session_id
                and (lower(coalesce(t.target_source,'')) like 'server:legion_tree_character_add_v%'
                  or (t.target_status='lookup_done' and coalesce(t.character_name,'')<>''
                    and (t.list_row is not null or private.kinojo_db_only_list_restore_allowed(t.id))))
            )
          )
        )
    ) into v_no_list_targets;
  end if;

  v_skip_reason:=case when v_allowed then 'LEGION_TREE_CHARACTER_ADD'
    when not v_session.list_sheet_sync_enabled then 'USER_DISABLED'
    when v_no_list_targets then 'NO_LIST_TARGETS' end;

  return jsonb_build_object(
    'ok',true,
    'skipListWrite',v_skip_reason is not null,
    'listSheetSyncEnabled',v_session.list_sheet_sync_enabled,
    'scheduledCharacterScope',case when v_session.tool_name='KINOJO_SERVER_AUTOMATION'
      and v_session.raw_payload->>'scheduledAutomation'='true'
      then coalesce(v_session.raw_payload->>'scheduledCharacterScope','ALL') else 'ALL' end,
    'listSkipReason',v_skip_reason,
    'listlessCharacterAdd',v_allowed,
    'targetCount',v_target_count,
    'exactTargetCount',v_exact_target_count,
    'listQueueCount',v_list_queue_count,
    'targetSource',case when v_allowed then 'server:legion_tree_character_add_v455' else null end,
    'terminalStage',case when v_skip_reason is not null then 'SERVER_QUEUE_CHARACTER_MASTER_DONE' else null end,
    'databaseContract','455',
    'message',case when v_allowed
      then '레기온 트리 캐릭터 추가 세션 · Google list 쓰기·readback 생략'
      when not v_session.list_sheet_sync_enabled then '실행 설정에 따라 Google list 쓰기·readback 생략'
      when v_no_list_targets then '조회 완료 · 시트 반영 대상 없음'
      else '기존 Server Queue Google list 계약 유지' end
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
      'message',case when v_policy->>'listSkipReason'='NO_LIST_TARGETS' then v_batch.message
        else '캐릭터 Master 반영과 관계 확정이 이미 완료되었습니다.' end
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

  if v_policy->>'listSkipReason'='NO_LIST_TARGETS' then
    perform pg_advisory_xact_lock(hashtextextended('character-list-queue:'||p_session_id,0));
    v_policy:=public.kinojo_legion_tree_listless_policy_v455(p_session_id,p_session_token);
    if (v_policy->>'listSkipReason') is distinct from 'NO_LIST_TARGETS' then
      return jsonb_build_object('ok',false,'code','LIST_ELIGIBILITY_CHANGED');
    end if;
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
  if v_policy->>'listSkipReason'='NO_LIST_TARGETS' then
    v_message:=case when v_partial then '조회 부분 완료 · 시트 반영 대상 없음'
      else '조회 완료 · 시트 반영 대상 없음' end;
  elsif not v_legacy then
    v_message:=v_message||' · list 반영 생략(OFF)';
  end if;
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
    p_session_id,'LIST_SHEET_EXPORT',7,'skipped',0,0,
    case when v_policy->>'listSkipReason'='NO_LIST_TARGETS' then '시트 반영 대상 없음' else 'list 쓰기·readback 생략' end,
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
        when d.phase_id='list_sheet_export' and ls.status='skipped'
          and v_row.batch_payload->>'list_sync_status'='skipped' then 'skipped'
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
        when n.status in ('done','skipped') then 100::numeric
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
      when bool_or((p->>'id') = 'list_sheet_export' and (p->>'status') in ('done','skipped')) then 'done'
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

  select (v_row.batch_payload->>'status'='completed'
          and v_row.batch_payload->>'list_sync_status'='skipped'
          and v_row.batch_payload->'list_sync_summary'->>'listSkipReason'='NO_LIST_TARGETS') is true
         or (count(*) = 7 and bool_and((p->>'status') in ('done','skipped')))
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
      phases = private.kinojo_queue_phase_headers_v521(v_phases),
      phase_details_v521 = private.kinojo_queue_phase_details_v521(v_phases),
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
        'listSheetSyncEnabled',coalesce((c.session_payload->>'list_sheet_sync_enabled')::boolean,true),
        'listWriteSkipped',coalesce(c.batch_payload->>'list_sync_status'='skipped',false),
        'listSkipReason',c.batch_payload->'list_sync_summary'->>'listSkipReason',
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
  v_list_skip_reason text;
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

  select b.list_sync_summary->>'listSkipReason' into v_list_skip_reason
  from public.lookup_batches b
  where b.session_id=p_session_id and b.status='completed' and b.list_sync_status='skipped';
  if v_list_skip_reason='NO_LIST_TARGETS' then
    v_overall:=100;
  end if;

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
    'listSkipReason',v_list_skip_reason,
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
$function$;
