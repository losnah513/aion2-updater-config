-- SQL529: retain existing batch/lock/policy semantics while avoiding per-row protection scans.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
 IF NOT pg_try_advisory_xact_lock(501,501) THEN
  RAISE EXCEPTION 'RETENTION_BUSY_RETRY_BETWEEN_EXISTING_BATCHES';
 END IF;
END;
$guard$;

CREATE INDEX idx_payload_pending_evidence_v529 ON public.extension_character_payloads(id)
WHERE master_sync_status='synced'
  AND (CASE WHEN jsonb_typeof(gear_evidence)='object' THEN gear_evidence - ARRAY['gearReasonCode','visibleEquipmentSlotCount','populatedEquipmentSlotCount','namedEquipmentSlotCount','abyssEquipmentSlotCount','gearType','detectedGearType','gearParseStatus'] <> '{}'::jsonb ELSE false END);

CREATE OR REPLACE FUNCTION private.kinojo_payload_evidence_candidates_v509(p_after bigint DEFAULT 0,p_limit integer DEFAULT 50)
RETURNS TABLE(id bigint) LANGUAGE sql STABLE SET search_path TO 'pg_catalog'
AS $function$
 WITH latest AS MATERIALIZED (
  SELECT DISTINCT ON (coalesce(e.server_id,2002),public.kinojo_normalize_character_name(e.character_name)) e.id
  FROM public.extension_character_payloads e
  ORDER BY coalesce(e.server_id,2002),public.kinojo_normalize_character_name(e.character_name),e.received_at DESC,e.id DESC
 ), protected AS MATERIALIZED (
  SELECT latest_payload_id id FROM public.character_master
  UNION SELECT latest_pve_payload_id FROM public.character_master
  UNION SELECT latest_pvp_payload_id FROM public.character_master
  UNION SELECT payload_id FROM public.character_stat_sources
  UNION SELECT id FROM latest
 ), blocked_sessions AS MATERIALIZED (
  SELECT session_id FROM public.updater_runtime_jobs
  WHERE coalesce(status,'') NOT IN ('completed','failed','cancelled','expired','error')
 ), completed_targets AS MATERIALIZED (
  SELECT DISTINCT payload_id,session_id,server_id,public.kinojo_normalize_character_name(character_name) name
  FROM public.lookup_session_targets WHERE target_status='lookup_done'
 ), blocked_payloads AS MATERIALIZED (
  SELECT DISTINCT payload_id FROM public.lookup_session_targets WHERE target_status IS DISTINCT FROM 'lookup_done'
 ), blocked_slots AS MATERIALIZED (
  SELECT DISTINCT session_id,lookup_order FROM public.lookup_session_targets WHERE target_status IS DISTINCT FROM 'lookup_done'
 )
 SELECT p.id FROM public.extension_character_payloads p
 WHERE p.id>coalesce(p_after,0) AND p.master_sync_status='synced'
  AND (CASE WHEN jsonb_typeof(p.gear_evidence)='object' THEN p.gear_evidence - ARRAY['gearReasonCode','visibleEquipmentSlotCount','populatedEquipmentSlotCount','namedEquipmentSlotCount','abyssEquipmentSlotCount','gearType','detectedGearType','gearParseStatus'] <> '{}'::jsonb ELSE false END)
  AND p.received_at<now()-interval '24 hours'
  AND jsonb_typeof(p.gear_evidence)='object'
  AND p.gear_evidence IS DISTINCT FROM private.kinojo_payload_evidence_v509(p.gear_evidence)
  AND NOT EXISTS(SELECT 1 FROM protected x WHERE x.id=p.id)
  AND EXISTS(SELECT 1 FROM public.updater_sessions s WHERE s.session_id=p.session_id
    AND s.status IN ('completed','failed','cancelled','expired','error'))
  AND NOT EXISTS(SELECT 1 FROM blocked_sessions x WHERE x.session_id=p.session_id)
  AND EXISTS(SELECT 1 FROM completed_targets t WHERE t.payload_id=p.id AND t.session_id=p.session_id
    AND t.server_id IS NOT DISTINCT FROM p.server_id
    AND t.name=public.kinojo_normalize_character_name(p.character_name))
  AND NOT EXISTS(SELECT 1 FROM blocked_payloads t WHERE t.payload_id=p.id)
  AND NOT EXISTS(SELECT 1 FROM blocked_slots t WHERE t.session_id=p.session_id AND t.lookup_order=p.lookup_order)
 ORDER BY p.id LIMIT least(5000,greatest(1,coalesce(p_limit,50)));
$function$;
ALTER FUNCTION private.kinojo_payload_evidence_candidates_v509(bigint,integer) RESET enable_nestloop;

CREATE OR REPLACE FUNCTION private.kinojo_superseded_snapshot_candidates_v512(p_after_id bigint DEFAULT 0,p_limit integer DEFAULT 50)
RETURNS TABLE(id bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog'
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
  UNION SELECT snapshot_id FROM private.character_snapshot_requests
  UNION SELECT snapshot_id FROM public.lookup_session_targets
  UNION SELECT p.source_snapshot_id FROM public.extension_character_payloads p
    WHERE p.master_sync_status IS DISTINCT FROM 'synced'
       OR EXISTS(SELECT 1 FROM protected_payloads x WHERE x.id=p.id)
 ), blocked_sessions AS MATERIALIZED (
  SELECT session_id FROM public.updater_runtime_jobs WHERE coalesce(status,'') NOT IN ('completed','failed','cancelled','expired','error')
  UNION SELECT session_id FROM public.lookup_batches WHERE coalesce(status,'') NOT IN ('completed','failed','cancelled','expired','error')
  UNION SELECT session_id FROM public.extension_character_payloads WHERE source_snapshot_id IS NULL AND master_sync_status IS DISTINCT FROM 'synced'
  -- Preserve NOT IN's treatment of NULL queue status.
  UNION SELECT session_id FROM public.google_list_sheet_sync_queue WHERE sync_status NOT IN ('synced','obsolete')
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
$function$;
