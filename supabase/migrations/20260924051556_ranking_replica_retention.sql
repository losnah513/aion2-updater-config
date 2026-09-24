-- SQL507: retain current and previous ranking replicas, plus all non-superseded work.
begin read write;
set local lock_timeout='2s';
create function private.kinojo_ranking_replica_cleanup_v507(p_dry_run boolean default true,p_limit integer default 4)
returns jsonb language plpgsql security definer set search_path=pg_catalog
set statement_timeout='15s' set lock_timeout='500ms' as $fn$
declare v_ids bigint[];v_items integer:=0;v_owners integer:=0;v_scopes integer:=0;
begin
 if not pg_try_advisory_xact_lock(hashtext('kinojo_ranking_snapshot_build_v390')::bigint) then return jsonb_build_object('ok',true,'busy',true);end if;
 begin
  lock table private.kinojo_ranking_snapshots_v390,private.kinojo_ranking_snapshot_pointer_v390 in share mode nowait;
  lock table private.kinojo_ranking_snapshot_items_v390,private.kinojo_ranking_snapshot_owner_metrics_v390,private.kinojo_ranking_snapshot_scopes_v390 in share row exclusive mode nowait;
 exception when lock_not_available then return jsonb_build_object('ok',true,'busy',true);end;
 -- A missing current/rollback pointer is not permission to remove every replica.
 if not exists(select 1 from private.kinojo_ranking_snapshot_pointer_v390 p
   join private.kinojo_ranking_snapshots_v390 c on c.snapshot_id=p.snapshot_id
   join private.kinojo_ranking_snapshots_v390 b on b.snapshot_id=p.previous_snapshot_id
   where p.singleton and c.status='PUBLISHED' and b.status in ('PUBLISHED','SUPERSEDED')) then
  return jsonb_build_object('ok',false,'code','VALID_CURRENT_AND_PREVIOUS_REQUIRED');
 end if;
 select array_agg(snapshot_id order by snapshot_id) into v_ids from (
  select s.snapshot_id from private.kinojo_ranking_snapshots_v390 s
  where s.status='SUPERSEDED'
  and not exists(select 1 from private.kinojo_ranking_snapshot_pointer_v390 p where s.snapshot_id in(p.snapshot_id,p.previous_snapshot_id))
  and (exists(select 1 from private.kinojo_ranking_snapshot_items_v390 i where i.snapshot_id=s.snapshot_id)
    or exists(select 1 from private.kinojo_ranking_snapshot_owner_metrics_v390 o where o.snapshot_id=s.snapshot_id)
    or exists(select 1 from private.kinojo_ranking_snapshot_scopes_v390 c where c.snapshot_id=s.snapshot_id))
  order by s.snapshot_id limit greatest(1,least(coalesce(p_limit,4),4))
 ) q;
 if not coalesce(p_dry_run,true) and v_ids is not null then
  delete from private.kinojo_ranking_snapshot_items_v390 where snapshot_id=any(v_ids);get diagnostics v_items=row_count;
  delete from private.kinojo_ranking_snapshot_owner_metrics_v390 where snapshot_id=any(v_ids);get diagnostics v_owners=row_count;
  delete from private.kinojo_ranking_snapshot_scopes_v390 where snapshot_id=any(v_ids);get diagnostics v_scopes=row_count;
 end if;
 return jsonb_build_object('ok',true,'dryRun',coalesce(p_dry_run,true),'snapshotIds',coalesce(to_jsonb(v_ids),'[]'::jsonb),'itemsDeleted',v_items,'ownersDeleted',v_owners,'scopesDeleted',v_scopes);
end $fn$;
revoke all on function private.kinojo_ranking_replica_cleanup_v507(boolean,integer) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.kinojo_ranking_snapshot_cleanup_v401(p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '15s'
 SET lock_timeout TO '2s'
AS $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_current_id bigint;
  v_previous_id bigint;
  v_retention_days integer := 90;
  v_orphan_after interval := interval '2 hours';
  v_today_start timestamptz;
  v_retention_cutoff timestamptz;
  v_orphan_ids bigint[] := array[]::bigint[];
  v_delete_ids bigint[] := array[]::bigint[];
  v_orphan_count integer := 0;
  v_deleted_count integer := 0;
  v_remaining_count integer := 0;
  v_replica_result jsonb;
begin
  if pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtext('kinojo_ranking_snapshot_build_v390')::bigint
  ) is not true then
    return jsonb_build_object('ok', false, 'code', 'SNAPSHOT_BUILD_BUSY');
  end if;

  if pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('kinojo-ranking-snapshot-maintenance-v401', 0)
  ) is not true then
    return jsonb_build_object('ok', false, 'code', 'SNAPSHOT_CLEANUP_BUSY');
  end if;

  select
    c.snapshot_retention_days,
    c.snapshot_orphan_after
  into v_retention_days, v_orphan_after
  from private.kinojo_ranking_snapshot_pipeline_control_v396 c
  where c.singleton is true;

  v_retention_days := coalesce(v_retention_days, 90);
  v_orphan_after := coalesce(v_orphan_after, interval '2 hours');
  v_today_start := pg_catalog.timezone(
    'Asia/Seoul',
    pg_catalog.date_trunc('day', pg_catalog.timezone('Asia/Seoul', v_now))
  );
  v_retention_cutoff := v_now - pg_catalog.make_interval(days => v_retention_days);

  select p.snapshot_id, p.previous_snapshot_id
  into v_current_id, v_previous_id
  from private.kinojo_ranking_snapshot_pointer_v390 p
  where p.singleton is true
  for share;

  select coalesce(pg_catalog.array_agg(s.snapshot_id order by s.snapshot_id), array[]::bigint[])
  into v_orphan_ids
  from private.kinojo_ranking_snapshots_v390 s
  where s.status in ('BUILDING', 'READY')
    and s.updated_at < v_now - v_orphan_after;

  v_orphan_count := coalesce(pg_catalog.array_length(v_orphan_ids, 1), 0);

  with effective as (
    select
      s.*,
      case when s.snapshot_id = any(v_orphan_ids) then 'FAILED' else s.status end
        as effective_status,
      (pg_catalog.timezone('Asia/Seoul', s.created_at))::date as local_day
    from private.kinojo_ranking_snapshots_v390 s
  ), daily_ranked as (
    select
      e.snapshot_id,
      pg_catalog.row_number() over (
        partition by e.local_day
        order by
          case e.effective_status
            when 'PUBLISHED' then 0
            when 'SUPERSEDED' then 1
            when 'READY' then 2
            when 'FAILED' then 3
            else 4
          end,
          coalesce(
            e.published_at,
            e.validated_at,
            e.build_completed_at,
            e.updated_at,
            e.created_at
          ) desc,
          e.snapshot_id desc
      ) as daily_rank
    from effective e
    where e.created_at >= v_retention_cutoff
      and e.created_at < v_today_start
      and e.effective_status in ('PUBLISHED', 'SUPERSEDED')
  ), protected as (
    select v_current_id as snapshot_id where v_current_id is not null
    union
    select v_previous_id where v_previous_id is not null
    union
    select e.snapshot_id
    from effective e
    where e.created_at >= v_today_start
    union
    select d.snapshot_id
    from daily_ranked d
    where d.daily_rank = 1
  )
  select coalesce(pg_catalog.array_agg(e.snapshot_id order by e.snapshot_id), array[]::bigint[])
  into v_delete_ids
  from effective e
  where e.effective_status not in ('BUILDING', 'READY')
    and not exists (
      select 1 from protected p where p.snapshot_id = e.snapshot_id
    );

  if not coalesce(p_dry_run, false) then
    update private.kinojo_ranking_snapshots_v390 s
    set status = 'FAILED',
        updated_at = v_now,
        validated_at = coalesce(s.validated_at, v_now),
        validation_report = jsonb_build_object(
          'ok', false,
          'errors', jsonb_build_array('ORPHAN_CANDIDATE_EXPIRED'),
          'cleanupContractVersion', 401,
          'expiredAt', v_now
        ),
        last_error_code = 'ORPHAN_CANDIDATE_EXPIRED',
        last_error_message = 'Stage-5 cleanup expired an abandoned snapshot candidate.'
    where s.snapshot_id = any(v_orphan_ids)
      and s.status in ('BUILDING', 'READY');

    delete from private.kinojo_ranking_snapshots_v390 s
    where s.snapshot_id = any(v_delete_ids);
    get diagnostics v_deleted_count = row_count;
  end if;

  select count(*)::integer into v_remaining_count
  from private.kinojo_ranking_snapshots_v390;

  v_replica_result := private.kinojo_ranking_replica_cleanup_v507(p_dry_run,4);
  return jsonb_build_object(
    'replicaCleanup',v_replica_result,
    'ok', true,
    'databaseContract', '401',
    'dryRun', coalesce(p_dry_run, false),
    'evaluatedAt', v_now,
    'timezone', 'Asia/Seoul',
    'retentionDays', v_retention_days,
    'orphanAfterSeconds', extract(epoch from v_orphan_after)::integer,
    'currentSnapshotId', v_current_id,
    'previousSnapshotId', v_previous_id,
    'orphanCandidateCount', v_orphan_count,
    'orphanCandidateIds', to_jsonb(v_orphan_ids),
    'deleteCandidateCount', coalesce(pg_catalog.array_length(v_delete_ids, 1), 0),
    'deleteCandidateIds', to_jsonb(v_delete_ids),
    'deletedCount', v_deleted_count,
    'remainingSnapshotCount', v_remaining_count
  );
end;
$function$;

commit;
