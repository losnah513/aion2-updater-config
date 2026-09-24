begin read write;
set local lock_timeout='2s';
set local statement_timeout='30s';
select cron.unschedule('kinojo-completed-runtime-retention-v511');
create index idx_lookup_session_targets_status on public.lookup_session_targets using btree(session_id,target_status,lookup_order);
CREATE OR REPLACE FUNCTION public.kinojo_admin_server_queue_detail_v422(p_pass_key text, p_session_id text, p_section text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '5s'
 SET lock_timeout TO '250ms'
AS $function$
declare
  v_actor record;
  v_session_id text := nullif(trim(coalesce(p_session_id, '')), '');
  v_section text := lower(trim(coalesce(p_section, '')));
  v_offset integer := greatest(0, least(coalesce(p_offset, 0), 10000));
  v_limit integer;
  v_total integer := 0;
  v_items jsonb := '[]'::jsonb;
  v_profile jsonb := '{}'::jsonb;
begin
  select * into v_actor
  from public.kinojo_get_updater_actor(p_pass_key)
  limit 1;

  if not found or coalesce(v_actor.level, 0) < 3 then
    return jsonb_build_object(
      'ok', false,
      'code', 'LOOKUP_ADMIN_ACCESS_DENIED',
      'message', '관리자 권한이 필요합니다.'
    );
  end if;

  if v_session_id is null or not exists (
    select 1 from public.updater_session_progress_current c where c.session_id = v_session_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'LOOKUP_SESSION_NOT_FOUND',
      'message', '조회 세션 기록을 찾지 못했습니다.'
    );
  end if;

  if v_section = 'targets' then
    v_limit := greatest(1, least(coalesce(p_limit, 50), 200));
    select count(*)::integer into v_total
    from public.lookup_session_targets t
    where t.session_id = v_session_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'targetId', x.id,
      'lookupOrder', x.lookup_order,
      'row', x.list_row,
      'listRow', x.list_row,
      'characterName', x.character_name,
      'originalName', x.list_original_name,
      'serverId', x.server_id,
      'serverName', x.server_name,
      'mainCharacterName', x.main_character_name,
      'className', x.class_name,
      'targetStatus', x.target_status,
      'attemptCount', x.attempt_count,
      'maxAttempts', x.max_attempts,
      'lastFailureCode', x.last_failure_code,
      'lastError', x.last_error
    ) order by x.lookup_order nulls last, x.id), '[]'::jsonb)
    into v_items
    from (
      select t.*
      from public.lookup_session_targets t
      where t.session_id = v_session_id
      order by t.lookup_order nulls last, t.id
      offset v_offset
      limit v_limit
    ) x;
  elsif v_section = 'events' then
    v_limit := greatest(1, least(coalesce(p_limit, 40), 40));
    select count(*)::integer into v_total
    from public.updater_runtime_events e
    where e.session_id = v_session_id;

    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]'::jsonb)
    into v_items
    from (
      select e.id, e.event_type, e.stage, e.character_name,
             e.progress_current, e.progress_total, e.message, e.created_at
      from public.updater_runtime_events e
      where e.session_id = v_session_id
      order by e.created_at desc, e.id desc
      offset v_offset
      limit v_limit
    ) x;
  elsif v_section = 'steps' then
    v_limit := greatest(1, least(coalesce(p_limit, 20), 20));
    select count(*)::integer into v_total
    from public.lookup_session_steps s
    where s.session_id = v_session_id;

    select coalesce(jsonb_agg(to_jsonb(x) order by x.step_order, x.id), '[]'::jsonb)
    into v_items
    from (
      select s.id, s.step_key, s.step_order, s.status,
             s.progress_current, s.progress_total, s.message,
             s.detail, s.started_at, s.finished_at, s.updated_at
      from public.lookup_session_steps s
      where s.session_id = v_session_id
      order by s.step_order, s.id
      offset v_offset
      limit v_limit
    ) x;
  elsif v_section = 'performance' then
    v_limit := 1;
    v_total := 1;
    v_profile := public.kinojo_character_refresh_profile_v321(v_session_id);
    return jsonb_build_object(
      'ok', true,
      'databaseContract', '422',
      'sessionId', v_session_id,
      'section', v_section,
      'performanceProfile', v_profile,
      'total', 1,
      'offset', 0,
      'limit', 1,
      'hasMore', false
    );
  else
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_DETAIL_SECTION',
      'message', 'targets, events, steps, performance 중 하나를 선택해 주세요.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'databaseContract', '422',
    'sessionId', v_session_id,
    'section', v_section,
    'items', v_items,
    v_section, v_items,
    'total', v_total,
    'offset', v_offset,
    'limit', v_limit,
    'hasMore', v_offset + jsonb_array_length(v_items) < v_total
  );
end;
$function$;


CREATE OR REPLACE FUNCTION private.kinojo_queue_summary_target_statement_v422()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_session_id text;
begin
  if tg_op = 'INSERT' then
    for v_session_id in select distinct n.session_id from new_rows n loop
      perform private.kinojo_queue_summary_refresh_targets_v422(v_session_id);
    end loop;
  elsif tg_op = 'UPDATE' then
    for v_session_id in
      select distinct q.session_id
      from (
        select n.session_id from new_rows n
        union all
        select o.session_id from old_rows o
      ) q
    loop
      perform private.kinojo_queue_summary_refresh_targets_v422(v_session_id);
    end loop;
  else
    for v_session_id in select distinct o.session_id from old_rows o loop
      perform private.kinojo_queue_summary_refresh_targets_v422(v_session_id);
    end loop;
  end if;
  return null;
end;
$function$;


CREATE OR REPLACE FUNCTION private.kinojo_queue_summary_step_statement_v422()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_session_id text;
begin
  if tg_op = 'INSERT' then
    for v_session_id in select distinct n.session_id from new_rows n loop
      perform private.kinojo_queue_summary_refresh_progress_v422(v_session_id);
    end loop;
  elsif tg_op = 'UPDATE' then
    for v_session_id in
      select distinct q.session_id
      from (
        select n.session_id from new_rows n
        union all
        select o.session_id from old_rows o
      ) q
    loop
      perform private.kinojo_queue_summary_refresh_progress_v422(v_session_id);
    end loop;
  else
    for v_session_id in select distinct o.session_id from old_rows o loop
      perform private.kinojo_queue_summary_refresh_progress_v422(v_session_id);
    end loop;
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_admin_server_queue_status_v289(p_pass_key text, p_session_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '1s'
 SET lock_timeout TO '250ms'
AS $function$
declare
  v_actor record;
begin
  select * into v_actor
  from public.kinojo_get_updater_actor(p_pass_key)
  limit 1;

  if not found or coalesce(v_actor.level, 0) < 3 then
    return jsonb_build_object(
      'ok', false,
      'code', 'LOOKUP_ADMIN_ACCESS_DENIED',
      'message', '관리자 권한이 필요합니다.'
    );
  end if;

  return private.kinojo_admin_server_queue_status_cached_v422(
    v_actor.member_id,
    v_actor.level,
    p_session_id
  ) || jsonb_build_object('publicSnapshot', (
    select jsonb_build_object(
      'state', case
        when not d.enabled then 'DISABLED'
        when q.pending=0 then 'IDLE'
        when d.retry_at>now() then 'RETRY_WAIT'
        when exists(select 1 from public.updater_sessions where status in ('starting','running','paused'))
          or exists(select 1 from public.character_detail_refresh_jobs where status in ('queued','running','waiting','processing')) then 'WAIT_REFRESH'
        when q.due_at>now() then 'WAIT_30_MINUTES'
        when c.status='READY' then 'READY'
        when c.status='BUILDING' and c.next_scope>=4 then 'VERIFY'
        when c.status='BUILDING' then 'BUILDING'
        else 'QUEUED' end,
      'pendingCount', q.pending, 'dueAt', q.due_at,
      'candidateId', d.candidate_id, 'completedScopes', coalesce(c.next_scope,0),
      'attempts', d.attempts, 'retryAt', d.retry_at,
      'lastErrorCode', case when d.last_result->>'ok'='false' then d.last_result->>'code' end,
      'publishedSnapshotId', p.snapshot_id, 'publishedAt', p.published_at
    )
    from private.character_snapshot_dispatch d
    cross join (select count(*) as pending,max(due_at) as due_at
      from private.character_snapshot_requests where completed_at is null) q
    left join private.kinojo_ranking_snapshots_v390 c on c.snapshot_id=d.candidate_id
    left join private.kinojo_ranking_snapshot_pointer_v390 p on p.singleton
    where d.singleton
  ));
end;
$function$
;
drop function private.kinojo_completed_runtime_cleanup_v511(boolean,integer,timestamptz);
drop table private.kinojo_completed_runtime_archive_v511;
commit;
