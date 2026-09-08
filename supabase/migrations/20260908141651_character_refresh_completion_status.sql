-- Authenticated, read-only snapshot status on the existing cached lookup endpoint.
begin;
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
commit;
