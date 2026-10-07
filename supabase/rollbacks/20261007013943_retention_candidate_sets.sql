-- SQL527 rollback: restore candidate queries; keep data, locks, limits, cron and ACLs.
begin read write;
set local lock_timeout='500ms';
set local statement_timeout='15s';
CREATE OR REPLACE FUNCTION private.kinojo_snapshot_raw_candidates_v514(p_after_id bigint DEFAULT 0,p_limit integer DEFAULT 50)
RETURNS TABLE(id bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
  select s.id from public.lookup_snapshots s
  join public.updater_sessions u on u.session_id=s.session_id
  where s.id>coalesce(p_after_id,0)
    and s.created_at<statement_timestamp()-interval '7 days'
    and s.status='OK'
    and s.raw_payload is not null
    and s.raw_payload->>'retainedSummaryVersion' is distinct from '514'
    and u.status in ('completed','failed','cancelled','expired','error')
    and u.finished_at is not null
    and exists(select 1 from public.lookup_snapshots newer
      where newer.server_id=s.server_id and newer.character_name=s.character_name
        and (newer.created_at,newer.id)>(s.created_at,s.id))
    and not exists(select 1 from public.character_master m
      where m.latest_snapshot_uid=s.snapshot_uid or m.legion_source_snapshot_id=s.id)
    and not exists(select 1 from public.character_skill_current_state c where c.snapshot_id=s.id)
    and not exists(select 1 from public.character_stat_sources c where c.snapshot_id=s.id)
    and not exists(select 1 from private.character_snapshot_requests r where r.snapshot_id=s.id)
    and not exists(select 1 from public.extension_character_payloads p where p.source_snapshot_id=s.id
      and (p.master_sync_status is distinct from 'synced'
        or exists(select 1 from public.character_master m
          where p.id in(m.latest_payload_id,m.latest_pve_payload_id,m.latest_pvp_payload_id))
        or exists(select 1 from public.character_stat_sources c where c.payload_id=p.id)
        or exists(select 1 from public.ranking_entries r where r.latest_payload_id=p.id)))
    and not exists(select 1 from public.extension_character_payloads p
      where p.session_id=s.session_id and p.source_snapshot_id is null
        and p.master_sync_status is distinct from 'synced')
    and not exists(select 1 from public.updater_runtime_jobs j where j.session_id=s.session_id
      and coalesce(j.status,'') not in ('completed','failed','cancelled','expired','error'))
    and not exists(select 1 from public.lookup_batches b where b.session_id=s.session_id
      and coalesce(b.status,'') not in ('completed','failed','cancelled','expired','error'))
    and not exists(select 1 from public.google_list_sheet_sync_queue q
      where q.session_id=s.session_id and q.sync_status not in ('synced','obsolete'))
  order by s.id limit least(50,greatest(1,coalesce(p_limit,50)));
$function$;

CREATE OR REPLACE FUNCTION private.kinojo_payload_seven_day_candidates_v515(p_after_id bigint DEFAULT 0,p_limit integer DEFAULT 50)
RETURNS TABLE(id bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
  with latest as materialized (
    -- Keep the same latest-per-identity ordering as the reprocess RPC.
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
  )
  select p.id from public.extension_character_payloads p
  join public.updater_sessions s on s.session_id=p.session_id
  where p.id>coalesce(p_after_id,0)
    and p.received_at<statement_timestamp()-interval '7 days'
    and p.master_sync_status='synced'
    and p.growth_review_status='reviewed'
    and s.status in ('completed','failed','cancelled','expired','error')
    and s.finished_at is not null
    and s.finished_at<statement_timestamp()-interval '30 days'
    and not exists(select 1 from protected x where x.id=p.id)
    and not exists(select 1 from public.character_master m
      where m.legion_source_snapshot_id=p.source_snapshot_id
        or exists(select 1 from public.lookup_snapshots sn
          where sn.id=p.source_snapshot_id and sn.snapshot_uid=m.latest_snapshot_uid))
    and not exists(select 1 from public.character_skill_current_state c
      where c.snapshot_id=p.source_snapshot_id)
    and not exists(select 1 from public.character_stat_sources c
      where c.snapshot_id=p.source_snapshot_id)
    and not exists(select 1 from private.character_snapshot_requests r
      where r.snapshot_id=p.source_snapshot_id)
    and not exists(select 1 from public.lookup_session_targets t
      where t.session_id=p.session_id and t.lookup_order=p.lookup_order
        and t.target_status is distinct from 'lookup_done')
    and not exists(select 1 from public.updater_runtime_jobs j
      where j.session_id=p.session_id and coalesce(j.status,'')
        not in ('completed','failed','cancelled','expired','error'))
    and not exists(select 1 from public.lookup_batches b
      where b.session_id=p.session_id and coalesce(b.status,'')
        not in ('completed','failed','cancelled','expired','error'))
    and not exists(select 1 from public.google_list_sheet_sync_queue q
      where q.session_id=p.session_id and q.sync_status not in ('synced','obsolete'))
  order by p.id limit least(50,greatest(1,coalesce(p_limit,50)));
$function$;

DROP INDEX public.idx_lookup_snapshot_pending_summary_v527;
commit;
