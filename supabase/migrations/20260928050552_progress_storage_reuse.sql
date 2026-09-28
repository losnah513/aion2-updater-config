-- SQL521: store phase details once, reuse unchanged JSON storage, and reclaim dead tuples earlier.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='30s';
-- Verify every stored session's complete RPC contract inside the same locked transaction.
lock table public.updater_session_progress_current in access exclusive mode;
create temporary table progress_contract_v521 on commit drop as
select c.session_id, a.member_id, a.level,
  md5(private.kinojo_admin_server_queue_status_cached_v422(a.member_id,a.level,c.session_id)::text) response_hash
from public.updater_session_progress_current c
cross join lateral (values (c.requested_by_member_id,4),(null::bigint,4),(null::bigint,5)) a(member_id,level);
alter table public.updater_session_progress_current add column phase_details_v521 jsonb;
create function private.kinojo_queue_phase_headers_v521(p_phases jsonb)
returns jsonb language sql immutable set search_path to 'pg_catalog' as $fn$
  select coalesce(jsonb_agg(case
    when jsonb_typeof(value->'details')='object' then value || jsonb_build_object('details',
      coalesce((select jsonb_object_agg(key,v) from jsonb_each(value->'details') d(key,v)
        where pg_column_size(v)<=1024),'{}'::jsonb))
    when pg_column_size(value->'details')>1024 then value-'details'
    else value end order by ordinal),'[]'::jsonb)
  from jsonb_array_elements(p_phases) with ordinality as p(value,ordinal);
$fn$;
create function private.kinojo_queue_phase_details_v521(p_phases jsonb)
returns jsonb language sql immutable set search_path to 'pg_catalog' as $fn$
  select coalesce(jsonb_agg(case
    when jsonb_typeof(value->'details')='object' then
      case when exists(select 1 from jsonb_each(value->'details') d(key,v) where pg_column_size(v)>1024)
        then jsonb_build_object('merge',true,'details',
          (select jsonb_object_agg(key,v) from jsonb_each(value->'details') d(key,v) where pg_column_size(v)>1024))
        else '{}'::jsonb end
    when pg_column_size(value->'details')>1024 then jsonb_build_object('merge',false,'details',value->'details')
    else '{}'::jsonb end
    order by ordinal),'[]'::jsonb)
  from jsonb_array_elements(p_phases) with ordinality as p(value,ordinal);
$fn$;
create function private.kinojo_queue_phase_restore_v521(p_phases jsonb,p_details jsonb)
returns jsonb language sql immutable set search_path to 'pg_catalog' as $fn$
  select coalesce(jsonb_agg(case when p_details->(ordinal::integer-1) ? 'details'
    then value || jsonb_build_object('details',
      case when (p_details->(ordinal::integer-1)->>'merge')::boolean
        then (value->'details') || (p_details->(ordinal::integer-1)->'details')
        else p_details->(ordinal::integer-1)->'details' end)
    else value end order by ordinal),'[]'::jsonb)
  from jsonb_array_elements(p_phases) with ordinality as p(value,ordinal);
$fn$;

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

  select count(*) = 7 and bool_and((p->>'status') in ('done','skipped'))
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

CREATE OR REPLACE FUNCTION private.kinojo_admin_server_queue_status_cached_v422(p_member_id bigint, p_level integer, p_session_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '1s'
 SET lock_timeout TO '250ms'
AS $function$
declare
  v_session_id text := nullif(trim(coalesce(p_session_id, '')), '');
  v_row public.updater_session_progress_current%rowtype;
  v_owned boolean := false;
  v_active boolean := false;
  v_timeout_expired boolean := false;
  v_handoff jsonb := '{}'::jsonb;
  v_handoff_stale boolean := false;
  v_handoff_heartbeat timestamp with time zone;
  v_message text := '';
  v_phases jsonb;
  v_progress jsonb;
begin
  if v_session_id is null then
    select c.session_id into v_session_id
    from public.updater_session_progress_current c
    where c.active is true
    order by c.started_at desc nulls last, c.session_id desc
    limit 1;
  end if;

  if v_session_id is null then
    select c.session_id into v_session_id
    from public.updater_session_progress_current c
    where c.requested_by_member_id = p_member_id
    order by c.started_at desc nulls last, c.session_id desc
    limit 1;
  end if;

  if v_session_id is null then
    return jsonb_build_object(
      'ok', true,
      'active', false,
      'canControl', coalesce(p_level, 0) >= 4,
      'databaseContract', '422',
      'progressContract', 'server-worker-seven-phase-v3-materialized',
      'message', '조회 작업 기록이 없습니다.'
    );
  end if;

  select * into v_row
  from public.updater_session_progress_current c
  where c.session_id = v_session_id;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'active', false,
      'sessionId', v_session_id,
      'databaseContract', '422',
      'progressContract', 'server-worker-seven-phase-v3-materialized',
      'message', '조회 세션 기록을 찾지 못했습니다.'
    );
  end if;

  v_owned := coalesce(v_row.requested_by_member_id, -1) = coalesce(p_member_id, -2);
  v_timeout_expired := v_row.batch_expires_at is not null
    and v_row.batch_expires_at <= statement_timestamp()
    and (v_row.worker_lease_until is null or v_row.worker_lease_until <= statement_timestamp());
  v_active := v_row.active
    and not v_timeout_expired
    and v_row.session_status in ('starting', 'running', 'paused')
    and v_row.job_status in ('starting', 'running', 'paused')
    and v_row.batch_status in ('starting', 'running', 'paused');

  v_handoff := coalesce(v_row.handoff, '{}'::jsonb);
  begin
    v_handoff_heartbeat := nullif(v_handoff->>'heartbeatAt', '')::timestamp with time zone;
  exception when invalid_text_representation or datetime_field_overflow then
    v_handoff_heartbeat := null;
  end;
  v_handoff_stale := coalesce(v_handoff->>'safety', '') = 'safe'
    and v_active
    and (v_handoff_heartbeat is null or v_handoff_heartbeat < statement_timestamp() - interval '8 minutes');

  if v_handoff_stale then
    v_handoff := v_handoff || jsonb_build_object(
      'state', 'attention',
      'safety', 'attention',
      'message', '서버 Heartbeat가 지연되고 있습니다. 페이지를 유지하고 상태를 확인해 주세요.',
      'stale', true
    );
  elsif v_timeout_expired or v_row.session_status = 'expired' or v_row.batch_status = 'expired' then
    v_handoff := v_handoff || jsonb_build_object(
      'state', 'not_started',
      'safety', 'idle',
      'message', '이전 조회 세션의 Server 유효시간이 만료되었습니다. 새 조회를 시작할 수 있습니다.',
      'stale', v_timeout_expired
    );
  end if;

  v_message := coalesce(
    nullif(v_row.session_payload->>'message', ''),
    nullif(v_row.job_payload->>'message', ''),
    nullif(v_handoff->>'message', ''),
    ''
  );

  v_phases := v_row.phases;
  v_progress := v_row.progress_payload;
  if v_row.phase_details_v521 is not null then
    v_phases := private.kinojo_queue_phase_restore_v521(v_row.phases, v_row.phase_details_v521);
    v_progress := v_progress || jsonb_build_object('phases', v_phases);
  end if;

  return jsonb_build_object(
    'ok', true,
    'active', v_active,
    'sessionId', v_row.session_id,
    'ownedByMe', v_owned,
    'canControl', coalesce(p_level, 0) >= 4 and (v_owned or coalesce(p_level, 0) >= 5),
    'waitingExtension', coalesce((v_row.session_payload#>>'{raw_payload,awaitingExtension}')::boolean, false),
    'extensionClaimed', coalesce((v_row.session_payload#>>'{raw_payload,extensionClaimed}')::boolean, false),
    'controlState', v_row.control_state,
    'lookupFilter', coalesce(v_row.session_payload#>'{raw_payload,lookupFilter}', '{}'::jsonb),
    'lookupFilterSummary', coalesce(v_row.session_payload#>>'{raw_payload,lookupFilterSummary}', ''),
    'queueMeta', v_row.queue_meta,
    'session', v_row.session_payload,
    'job', v_row.job_payload,
    'progress', v_progress,
    'phases', v_phases,
    'etaSeconds', v_row.eta_seconds,
    'events', '[]'::jsonb,
    'latestEvent', v_row.latest_event,
    'failurePreview', v_row.failure_preview,
    'targets', '[]'::jsonb,
    'queueTargets', '[]'::jsonb,
    'serverQueue', coalesce((v_row.session_payload#>>'{raw_payload,serverQueue}')::boolean, false),
    'lookupOnlyPhase', false,
    'worker', jsonb_build_object(
      'workerId', v_row.batch_payload->>'worker_id',
      'leaseUntil', v_row.worker_lease_until,
      'batchNo', coalesce((v_row.batch_payload->>'worker_batch_no')::integer, 0),
      'busy', nullif(v_row.batch_payload->>'worker_id', '') is not null
        and coalesce(v_row.worker_lease_until, 'epoch'::timestamp with time zone) > statement_timestamp(),
      'lastStartedAt', v_row.batch_payload->'worker_last_started_at',
      'lastFinishedAt', v_row.batch_payload->'worker_last_finished_at',
      'lastSummary', coalesce(v_row.batch_payload->'worker_last_summary', '{}'::jsonb)
    ),
    'postprocessComplete', coalesce(v_row.postprocess->>'status', '') in ('completed', 'partial_success'),
    'postprocessRetryable', coalesce(v_row.postprocess->>'status', '') = 'failed'
      and coalesce((v_row.postprocess->>'attemptCount')::integer, 0) < 3
      and coalesce(v_row.postprocess->>'stage', '') <> 'NO_SUCCESS',
    'partialSuccess', coalesce(v_row.postprocess->>'status', '') = 'partial_success',
    'postprocess', v_row.postprocess,
    'sheetDeferred', false,
    'handoff', v_handoff,
    'playncRateGate', v_row.plaync_rate_gate,
    'queueMergeStrategy', 'global_lock_single_active',
    'officialRawReuseSeconds', 900,
    'sourceSummary', v_row.source_summary,
    'diagnosticContract', jsonb_build_object(
      'historyRpc', 'kinojo_updater_get_run_reports',
      'historyDetailRpc', 'kinojo_updater_get_run_report_detail',
      'statusDetailRpc', 'kinojo_admin_server_queue_detail_v422',
      'targetsLazy', true,
      'eventsLazy', true,
      'performanceLazy', true,
      'secretsRedactedByClient', true
    ),
    'performanceProfile', jsonb_build_object(
      'ok', false,
      'available', false,
      'lazy', true,
      'message', '성능 상세를 열면 계산합니다.'
    ),
    'databaseContract', '422',
    'performanceContract', '321-lazy',
    'progressContract', 'server-worker-seven-phase-v3-materialized',
    'executionSource', v_row.execution_source,
    'expiredByTimeout', v_timeout_expired,
    'summaryUpdatedAt', v_row.updated_at,
    'terminalAt', v_row.terminal_at,
    'message', v_message
  );
end;
$function$;

create function private.kinojo_queue_summary_reuse_json_v521()
returns trigger language plpgsql set search_path to 'pg_catalog' as $fn$
begin
  if new.progress_payload is not distinct from old.progress_payload then
    new.progress_payload := old.progress_payload;
  end if;
  if new.phases is not distinct from old.phases then
    new.phases := old.phases;
  end if;
  if new.phase_details_v521 is not distinct from old.phase_details_v521 then
    new.phase_details_v521 := old.phase_details_v521;
  end if;
  if new.failure_preview is not distinct from old.failure_preview then
    new.failure_preview := old.failure_preview;
  end if;
  if new.latest_event is not distinct from old.latest_event then
    new.latest_event := old.latest_event;
  end if;
  if new.session_payload is not distinct from old.session_payload then
    new.session_payload := old.session_payload;
  end if;
  if new.job_payload is not distinct from old.job_payload then
    new.job_payload := old.job_payload;
  end if;
  if new.batch_payload is not distinct from old.batch_payload then
    new.batch_payload := old.batch_payload;
  end if;
  if new.queue_meta is not distinct from old.queue_meta then
    new.queue_meta := old.queue_meta;
  end if;
  if new.source_summary is not distinct from old.source_summary then
    new.source_summary := old.source_summary;
  end if;
  if new.handoff is not distinct from old.handoff then
    new.handoff := old.handoff;
  end if;
  if new.postprocess is not distinct from old.postprocess then
    new.postprocess := old.postprocess;
  end if;
  if new.plaync_rate_gate is not distinct from old.plaync_rate_gate then
    new.plaync_rate_gate := old.plaync_rate_gate;
  end if;
  return new;
end;
$fn$;
create trigger trg_queue_summary_reuse_json_v521
before update on public.updater_session_progress_current
for each row execute function private.kinojo_queue_summary_reuse_json_v521();

revoke all on function private.kinojo_queue_phase_headers_v521(jsonb),
  private.kinojo_queue_phase_details_v521(jsonb),
  private.kinojo_queue_phase_restore_v521(jsonb,jsonb),
  private.kinojo_queue_summary_reuse_json_v521()
from public,anon,authenticated,service_role;

-- Existing rows are packed only when both historical copies are identical.
update public.updater_session_progress_current c
set phases=private.kinojo_queue_phase_headers_v521(c.phases),
    phase_details_v521=private.kinojo_queue_phase_details_v521(c.phases),
    progress_payload=c.progress_payload-'phases'
where jsonb_typeof(c.phases)='array'
  and jsonb_typeof(c.progress_payload)='object'
  and c.progress_payload->'phases'=c.phases
  and not exists(select 1 from jsonb_array_elements(c.phases) p where jsonb_typeof(p)<>'object');
alter table public.updater_session_progress_current add constraint queue_phase_storage_v521 check (
  case when phase_details_v521 is null then true
    when jsonb_typeof(phases)='array' and jsonb_typeof(phase_details_v521)='array'
      and jsonb_typeof(progress_payload)='object'
    then jsonb_array_length(phases)=jsonb_array_length(phase_details_v521)
      and not (progress_payload ? 'phases')
    else false end
);
alter table public.updater_session_progress_current set (autovacuum_vacuum_scale_factor=0.02, autovacuum_vacuum_threshold=50, autovacuum_analyze_scale_factor=0.05, toast.autovacuum_vacuum_scale_factor=0.02, toast.autovacuum_vacuum_threshold=50);
alter table public.lookup_snapshots set (autovacuum_vacuum_scale_factor=0.02, autovacuum_vacuum_threshold=50, autovacuum_analyze_scale_factor=0.05, toast.autovacuum_vacuum_scale_factor=0.02, toast.autovacuum_vacuum_threshold=50);
alter table public.extension_character_payloads set (autovacuum_vacuum_scale_factor=0.02, autovacuum_vacuum_threshold=50, autovacuum_analyze_scale_factor=0.05, toast.autovacuum_vacuum_scale_factor=0.02, toast.autovacuum_vacuum_threshold=50);
do $verify$
begin
  if exists(select 1 from progress_contract_v521 b where b.response_hash is distinct from
    md5(private.kinojo_admin_server_queue_status_cached_v422(b.member_id,b.level,b.session_id)::text)) then
    raise exception 'SQL521: cached response changed; rolling back';
  end if;
end;
$verify$;
commit;
