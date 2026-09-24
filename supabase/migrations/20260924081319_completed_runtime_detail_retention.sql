-- SQL511: expire completed administrator detail after 30 days, retaining session summaries.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='30s';

create table private.kinojo_completed_runtime_archive_v511 (
  session_id text primary key,
  archived_at timestamptz not null default now(),
  finished_at timestamptz not null,
  event_count integer not null default 0,
  target_count integer not null default 0,
  step_count integer not null default 0,
  queue_count integer not null default 0
);
revoke all on private.kinojo_completed_runtime_archive_v511 from public, anon, authenticated, service_role;

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
      if exists(select 1 from private.kinojo_completed_runtime_archive_v511 a where a.session_id=v_session_id) then
        continue;
      end if;
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
      if exists(select 1 from private.kinojo_completed_runtime_archive_v511 a where a.session_id=v_session_id) then
        continue;
      end if;
      perform private.kinojo_queue_summary_refresh_progress_v422(v_session_id);
    end loop;
  end if;
  return null;
end;
$function$;


create function private.kinojo_completed_runtime_cleanup_v511(
  p_dry_run boolean default true,
  p_limit integer default 5,
  p_cutoff timestamptz default null
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog'
  set statement_timeout to '15s' set lock_timeout to '500ms'
as $function$
declare
  v_cutoff timestamptz := coalesce(p_cutoff, statement_timestamp()-interval '30 days');
  v_limit integer := least(5,greatest(1,coalesce(p_limit,5)));
  v_ids text[];
  v_session text;
  v_events integer := 0;
  v_targets integer := 0;
  v_steps integer := 0;
  v_queue integer := 0;
  v_count integer;
  v_row record;
begin
  if v_cutoff > statement_timestamp()-interval '30 days' then
    raise exception 'RETENTION_CUTOFF_MUST_BE_AT_LEAST_30_DAYS';
  end if;
  if not pg_try_advisory_xact_lock(511,511) then
    return jsonb_build_object('ok',true,'busy',true,'sessions',0);
  end if;
  select coalesce(array_agg(x.session_id),'{}'::text[]) into v_ids
  from (
    select s.session_id
    from public.updater_sessions s
    where s.status in ('completed','failed','cancelled','expired','error')
      and s.finished_at < v_cutoff
      and not exists(select 1 from private.kinojo_completed_runtime_archive_v511 a where a.session_id=s.session_id)
      and not exists(select 1 from public.updater_runtime_jobs j where j.session_id=s.session_id
        and coalesce(j.status,'') not in ('completed','failed','cancelled','expired','error'))
      and not exists(select 1 from public.lookup_batches b where b.session_id=s.session_id
        and coalesce(b.status,'') not in ('completed','failed','cancelled','expired','error'))
      and (
        exists(select 1 from public.updater_runtime_events e where e.session_id=s.session_id)
        or exists(select 1 from public.lookup_session_targets t where t.session_id=s.session_id)
        or exists(select 1 from public.lookup_session_steps st where st.session_id=s.session_id)
        or exists(select 1 from public.google_list_sheet_sync_queue q where q.session_id=s.session_id
          and q.sync_status in ('synced','obsolete'))
      )
    order by s.finished_at,s.session_id
    limit v_limit
    for update of s skip locked
  ) x;
  if cardinality(v_ids)=0 then
    return jsonb_build_object('ok',true,'dryRun',coalesce(p_dry_run,true),'sessions',0,
      'events',0,'targets',0,'steps',0,'queue',0);
  end if;
  if coalesce(p_dry_run,true) then
    select count(*) into v_events from public.updater_runtime_events where session_id=any(v_ids);
    select count(*) into v_targets from public.lookup_session_targets where session_id=any(v_ids);
    select count(*) into v_steps from public.lookup_session_steps where session_id=any(v_ids);
    select count(*) into v_queue from public.google_list_sheet_sync_queue
      where session_id=any(v_ids) and sync_status in ('synced','obsolete');
    return jsonb_build_object('ok',true,'dryRun',true,'sessions',cardinality(v_ids),
      'events',v_events,'targets',v_targets,'steps',v_steps,'queue',v_queue);
  end if;
  foreach v_session in array v_ids loop
    select s.finished_at into v_row from public.updater_sessions s where s.session_id=v_session;
    insert into private.kinojo_completed_runtime_archive_v511(session_id,finished_at)
      values(v_session,v_row.finished_at);
    delete from public.google_list_sheet_sync_queue q where q.session_id=v_session
      and q.sync_status in ('synced','obsolete');
    get diagnostics v_count=row_count; v_queue:=v_queue+v_count;
    update private.kinojo_completed_runtime_archive_v511 set queue_count=v_count where session_id=v_session;
    delete from public.lookup_session_steps st where st.session_id=v_session;
    get diagnostics v_count=row_count; v_steps:=v_steps+v_count;
    update private.kinojo_completed_runtime_archive_v511 set step_count=v_count where session_id=v_session;
    delete from public.updater_runtime_events e where e.session_id=v_session;
    get diagnostics v_count=row_count; v_events:=v_events+v_count;
    update private.kinojo_completed_runtime_archive_v511 set event_count=v_count where session_id=v_session;
    delete from public.lookup_session_targets t where t.session_id=v_session;
    get diagnostics v_count=row_count; v_targets:=v_targets+v_count;
    update private.kinojo_completed_runtime_archive_v511 set target_count=v_count where session_id=v_session;
  end loop;
  return jsonb_build_object('ok',true,'dryRun',false,'sessions',cardinality(v_ids),
    'events',v_events,'targets',v_targets,'steps',v_steps,'queue',v_queue,
    'retentionDays',30);
end;
$function$;
revoke all on function private.kinojo_completed_runtime_cleanup_v511(boolean,integer,timestamptz)
  from public,anon,authenticated,service_role;

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
  v_detail_expired boolean := false;
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

  select exists(select 1 from private.kinojo_completed_runtime_archive_v511 a
    where a.session_id = v_session_id) into v_detail_expired;

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
    if v_detail_expired then
      v_profile := '{"detailExpired":true}'::jsonb;
    else
      v_profile := public.kinojo_character_refresh_profile_v321(v_session_id);
    end if;
    return jsonb_build_object(
      'ok', true,
      'databaseContract', '422',
      'detailRetentionDays', 30,
      'detailExpired', v_detail_expired,
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
    'detailRetentionDays', 30,
    'detailExpired', v_detail_expired,
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
  v_status jsonb;
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

  v_status := private.kinojo_admin_server_queue_status_cached_v422(
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
  return v_status || jsonb_build_object(
    'detailRetentionDays', 30,
    'detailExpired', exists(select 1 from private.kinojo_completed_runtime_archive_v511 a
      where a.session_id = v_status->>'sessionId')
  );
end;
$function$
;

-- The four-column index serves the identical leading-key scans and keeps id as a tie-breaker.
drop index if exists public.idx_lookup_session_targets_status;

select cron.schedule('kinojo-completed-runtime-retention-v511','50 20 * * *',
  'set statement_timeout=''15s''; select private.kinojo_completed_runtime_cleanup_v511(false,5);');
commit;
