-- Disable physical reclaim; retain regular retention and diagnostic state.
SET LOCAL lock_timeout='2s';
UPDATE private.kinojo_storage_budget_control_v549 SET reclaim_enabled=false,reclaim_canary_requested=false,reclaim_lease=null,reclaim_lease_until=null,reclaim_latched=false WHERE singleton;
SELECT cron.unschedule('kinojo-storage-capacity-watch-v553') WHERE EXISTS(SELECT 1 FROM cron.job WHERE jobname='kinojo-storage-capacity-watch-v553');
CREATE OR REPLACE FUNCTION private.kinojo_storage_budget_status_v549()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='pg_catalog' AS $fn$
 SELECT jsonb_build_object('databaseBytes',s.bytes,'targetBytes',c.target_bytes,'warningBytes',c.warning_bytes,
  'steadyBytes',c.steady_bytes,'enabled',c.enabled,'lastCleanupAt',c.last_checked_at,'lastCleanup',c.last_compaction,
  'status',CASE WHEN NOT c.enabled THEN 'DISABLED' WHEN s.bytes>c.target_bytes THEN 'TARGET_EXCEEDED'
    WHEN s.bytes>=c.warning_bytes THEN 'WARNING' ELSE 'NORMAL' END,
  'headroomBytes',greatest(0,c.target_bytes-s.bytes))
 FROM private.kinojo_storage_budget_control_v549 c CROSS JOIN LATERAL(SELECT pg_database_size(current_database()) bytes)s WHERE c.singleton
$fn$;
REVOKE ALL ON FUNCTION private.kinojo_storage_budget_status_v549() FROM PUBLIC,anon,authenticated,service_role;
