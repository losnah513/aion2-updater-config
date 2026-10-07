-- SQL527: preserve retention predicates; compute protected sets once and skip already summarized JSON by index.
begin read write;
set local lock_timeout='500ms';
set local statement_timeout='30s';
CREATE INDEX idx_lookup_snapshot_pending_summary_v527 ON public.lookup_snapshots(id)
WHERE status='OK' AND raw_payload IS NOT NULL
  AND raw_payload->>'retainedSummaryVersion' IS DISTINCT FROM '514';

CREATE OR REPLACE FUNCTION private.kinojo_snapshot_raw_candidates_v514(p_after_id bigint DEFAULT 0,p_limit integer DEFAULT 50)
RETURNS TABLE(id bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
with protected_payloads as materialized (
  select latest_payload_id id from public.character_master
  union select latest_pve_payload_id from public.character_master
  union select latest_pvp_payload_id from public.character_master
  union select payload_id from public.character_stat_sources
  union select latest_payload_id from public.ranking_entries
), protected_snapshots as materialized (
  select s.id from public.lookup_snapshots s join public.character_master m on m.latest_snapshot_uid=s.snapshot_uid
  union select legion_source_snapshot_id from public.character_master
  union select snapshot_id from public.character_skill_current_state
  union select snapshot_id from public.character_stat_sources
  union select snapshot_id from private.character_snapshot_requests
  union select p.source_snapshot_id from public.extension_character_payloads p
    where p.master_sync_status is distinct from 'synced'
      or exists(select 1 from protected_payloads k where k.id=p.id)
), protected_sessions as materialized (
  select session_id from public.extension_character_payloads
    where source_snapshot_id is null and master_sync_status is distinct from 'synced'
  union select session_id from public.updater_runtime_jobs
    where coalesce(status,'') not in ('completed','failed','cancelled','expired','error')
  union select session_id from public.lookup_batches
    where coalesce(status,'') not in ('completed','failed','cancelled','expired','error')
  union select session_id from public.google_list_sheet_sync_queue
    where sync_status not in ('synced','obsolete')
), eligible as materialized (
  select s.id from public.lookup_snapshots s
  join public.updater_sessions u on u.session_id=s.session_id
  where s.id>coalesce(p_after_id,0)
    and s.created_at<statement_timestamp()-interval '7 days' and s.status='OK'
    and s.raw_payload is not null
    and s.raw_payload->>'retainedSummaryVersion' is distinct from '514'
    and u.status in ('completed','failed','cancelled','expired','error') and u.finished_at is not null
    and not exists(select 1 from protected_snapshots k where k.id=s.id)
    and not exists(select 1 from protected_sessions k where k.session_id=s.session_id)
    and exists(select 1 from public.lookup_snapshots newer
      where newer.server_id=s.server_id and newer.character_name=s.character_name
        and (newer.created_at,newer.id)>(s.created_at,s.id))
)
select e.id from eligible e
order by e.id limit least(50,greatest(1,coalesce(p_limit,50)));
$function$;

CREATE OR REPLACE FUNCTION private.kinojo_payload_seven_day_candidates_v515(p_after_id bigint DEFAULT 0,p_limit integer DEFAULT 50)
RETURNS TABLE(id bigint)
LANGUAGE sql STABLE SECURITY DEFINER
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
  union select snapshot_id from private.character_snapshot_requests
), protected_sessions as materialized (
  select session_id from public.updater_runtime_jobs
    where coalesce(status,'') not in ('completed','failed','cancelled','expired','error')
  union select session_id from public.lookup_batches
    where coalesce(status,'') not in ('completed','failed','cancelled','expired','error')
  union select session_id from public.google_list_sheet_sync_queue
    where sync_status not in ('synced','obsolete')
)
select p.id from eligible p
where not exists(select 1 from protected k where k.id=p.id)
  and not exists(select 1 from protected_snapshots k where k.id=p.source_snapshot_id)
  and not exists(select 1 from protected_sessions k where k.session_id=p.session_id)
  and not exists(select 1 from public.lookup_session_targets t
    where t.session_id=p.session_id and t.lookup_order=p.lookup_order
      and t.target_status is distinct from 'lookup_done')
order by p.id limit least(50,greatest(1,coalesce(p_limit,50)));
$function$;

commit;
