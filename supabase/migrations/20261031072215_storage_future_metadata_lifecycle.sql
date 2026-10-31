-- SQL552: release only future archived metadata from failed-sheet blanket pins.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION private.kinojo_superseded_snapshot_candidates_v512(p_after_id bigint DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS TABLE(id bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 WITH latest_success AS MATERIALIZED (
  -- Exact snapshot identity and tuple ordering; NULL never matches the original equality/greater-than predicates.
  SELECT DISTINCT ON (server_id,character_name) server_id,character_name,created_at,id
  FROM public.lookup_snapshots
  WHERE status='OK' AND server_id IS NOT NULL AND character_name IS NOT NULL AND created_at IS NOT NULL
  ORDER BY server_id,character_name,created_at DESC,id DESC
 ), protected_payloads AS MATERIALIZED (
  SELECT latest_payload_id id FROM public.character_master
  UNION SELECT latest_pve_payload_id FROM public.character_master
  UNION SELECT latest_pvp_payload_id FROM public.character_master
  UNION SELECT payload_id FROM public.character_stat_sources
  UNION SELECT latest_payload_id FROM public.ranking_entries
 ), protected_snapshots AS MATERIALIZED (
  SELECT legion_source_snapshot_id id FROM public.character_master
  UNION SELECT s.id FROM public.lookup_snapshots s JOIN public.character_master m ON m.latest_snapshot_uid=s.snapshot_uid
  UNION SELECT snapshot_id FROM public.character_skill_current_state
  UNION SELECT snapshot_id FROM public.character_stat_sources
  UNION SELECT snapshot_id FROM public.lookup_session_targets
  UNION SELECT p.source_snapshot_id FROM public.extension_character_payloads p
    WHERE p.master_sync_status IS DISTINCT FROM 'synced'
       OR p.growth_review_status IS DISTINCT FROM 'reviewed'
       OR EXISTS(SELECT 1 FROM protected_payloads x WHERE x.id=p.id)
  UNION SELECT resolved.id FROM public.extension_character_payloads p
    LEFT JOIN public.lookup_snapshots direct ON direct.id=p.source_snapshot_id
    CROSS JOIN LATERAL (SELECT s.id FROM public.lookup_snapshots s
      WHERE s.session_id=p.session_id AND coalesce(s.server_id,2002)=coalesce(p.server_id,2002)
       AND public.kinojo_normalize_character_name(s.character_name)=public.kinojo_normalize_character_name(p.character_name)
      ORDER BY abs(extract(epoch from(s.created_at-p.received_at))),s.id DESC LIMIT 1) resolved
    WHERE direct.id IS NULL AND (p.master_sync_status IS DISTINCT FROM 'synced'
      OR p.growth_review_status IS DISTINCT FROM 'reviewed'
      OR EXISTS(SELECT 1 FROM protected_payloads keep WHERE keep.id=p.id))
 ), blocked_sessions AS MATERIALIZED (
  SELECT session_id FROM public.updater_runtime_jobs WHERE coalesce(status,'') NOT IN ('completed','failed','cancelled','expired','error')
  UNION SELECT session_id FROM public.lookup_batches WHERE coalesce(status,'') NOT IN ('completed','failed','cancelled','expired','error')
  UNION SELECT session_id FROM public.extension_character_payloads WHERE source_snapshot_id IS NULL AND master_sync_status IS DISTINCT FROM 'synced'
  -- Preserve NOT IN's treatment of NULL queue status.
  UNION select q.session_id from public.google_list_sheet_sync_queue q where q.sync_status not in ('synced','obsolete')
 and not exists(select 1 from private.kinojo_completed_runtime_archive_v511 a
 join public.updater_sessions u on u.session_id=a.session_id
 cross join private.kinojo_storage_budget_control_v549 b
 where a.session_id=q.session_id and a.finished_at<statement_timestamp()-interval '30 days'
 and u.status in ('completed','failed','cancelled','expired','error')
 and u.finished_at<statement_timestamp()-interval '30 days'
 and b.singleton and b.enabled and b.backup_verified_at is not null
 and not exists(select 1 from public.lookup_snapshots initial where initial.session_id=q.session_id
  and initial.id<=coalesce((b.initial_highwater->>'snapshot')::bigint,0)))
 )
 SELECT s.id FROM public.lookup_snapshots s
 JOIN public.updater_sessions u ON u.session_id=s.session_id
 JOIN latest_success newer ON newer.server_id=s.server_id AND newer.character_name=s.character_name
   AND (newer.created_at,newer.id)>(s.created_at,s.id)
 WHERE s.id>coalesce(p_after_id,0)
  AND u.status IN ('completed','failed','cancelled','expired','error') AND u.finished_at IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM blocked_sessions x WHERE x.session_id=s.session_id)
  AND NOT EXISTS(SELECT 1 FROM protected_snapshots x WHERE x.id=s.id)
 ORDER BY s.id LIMIT least(50,greatest(1,coalesce(p_limit,50)));
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_payload_seven_day_candidates_v515(p_after_id bigint DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS TABLE(id bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
with eligible as materialized (
  select p.id,p.session_id,p.source_snapshot_id,p.lookup_order
  from public.extension_character_payloads p
  join public.updater_sessions s on s.session_id=p.session_id
  where p.id>coalesce(p_after_id,0)
    and p.received_at<statement_timestamp()-interval '7 days'
    and p.master_sync_status='synced' and p.growth_review_status='reviewed'
    and s.status in ('completed','failed','cancelled','expired','error')
    and s.finished_at<statement_timestamp()-interval '30 days'
), latest as materialized (
  select distinct on (coalesce(e.server_id,2002),
    public.kinojo_normalize_character_name(e.character_name)) e.id
  from public.extension_character_payloads e
  order by coalesce(e.server_id,2002),
    public.kinojo_normalize_character_name(e.character_name),e.received_at desc,e.id desc
), protected as materialized (
  select latest_payload_id id from public.character_master
  union select latest_pve_payload_id from public.character_master
  union select latest_pvp_payload_id from public.character_master
  union select payload_id from public.character_stat_sources
  union select latest_payload_id from public.ranking_entries
  union select payload_id from public.lookup_session_targets
  union select source_payload_id from public.character_history
  union select id from latest
), protected_snapshots as materialized (
  select s.id from public.lookup_snapshots s join public.character_master m on s.snapshot_uid=m.latest_snapshot_uid
  union select legion_source_snapshot_id from public.character_master
  union select snapshot_id from public.character_skill_current_state
  union select snapshot_id from public.character_stat_sources
), protected_sessions as materialized (
  select session_id from public.updater_runtime_jobs
    where coalesce(status,'') not in ('completed','failed','cancelled','expired','error')
  union select session_id from public.lookup_batches
    where coalesce(status,'') not in ('completed','failed','cancelled','expired','error')
  union select q.session_id from public.google_list_sheet_sync_queue q where q.sync_status not in ('synced','obsolete')
 and not exists(select 1 from private.kinojo_completed_runtime_archive_v511 a
 join public.updater_sessions u on u.session_id=a.session_id
 cross join private.kinojo_storage_budget_control_v549 b
 where a.session_id=q.session_id and a.finished_at<statement_timestamp()-interval '30 days'
 and u.status in ('completed','failed','cancelled','expired','error')
 and u.finished_at<statement_timestamp()-interval '30 days'
 and b.singleton and b.enabled and b.backup_verified_at is not null
 and not exists(select 1 from public.extension_character_payloads initial where initial.session_id=q.session_id
  and initial.id<=coalesce((b.initial_highwater->>'evidence')::bigint,0)))
)
select p.id from eligible p
where not exists(select 1 from protected k where k.id=p.id)
  and not exists(select 1 from protected_snapshots k where k.id=p.source_snapshot_id)
  and not exists(select 1 from protected_sessions k where k.session_id=p.session_id)
  and not exists(select 1 from public.lookup_session_targets t
    where t.session_id=p.session_id and t.lookup_order=p.lookup_order
      and t.target_status is distinct from 'lookup_done')
order by p.id limit least(50,greatest(1,coalesce(p_limit,50)));
$function$
;

-- Canonical complete primary-key order; physical row rewrites cannot change this digest.
CREATE OR REPLACE FUNCTION private.kinojo_storage_protected_digest_v549()
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='pg_catalog' SET TimeZone='UTC' AS $fn$
 SELECT jsonb_object_agg(name,hash) FROM (
  SELECT 'master' name,md5(coalesce(string_agg(to_jsonb(x)::text,E'\n' ORDER BY x.id),'')) hash FROM public.character_master x
  UNION ALL SELECT 'stats',md5(coalesce(string_agg(to_jsonb(x)::text,E'\n' ORDER BY x.character_id,x.gear_type),'')) FROM public.character_stat_sources x
  UNION ALL SELECT 'skills',md5(coalesce(string_agg(to_jsonb(x)::text,E'\n' ORDER BY x.character_master_id),'')) FROM public.character_skill_current_state x
  UNION ALL SELECT 'growth',md5(coalesce(string_agg(to_jsonb(x)::text,E'\n' ORDER BY x.granularity,x.period_start,x.server_id,x.character_key,x.gear_type,x.week_start_hour),'')) FROM private.character_growth_rollups x
 ) protected
$fn$;
REVOKE ALL ON FUNCTION private.kinojo_storage_protected_digest_v549() FROM PUBLIC,anon,authenticated,service_role;
