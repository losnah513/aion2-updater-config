begin read write;
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

  return jsonb_build_object(
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
drop function private.kinojo_ranking_replica_cleanup_v507(boolean,integer);
-- Deleted replica rows require external backup restoration. Snapshot metadata is preserved.
commit;
