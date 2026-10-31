-- SQL553: 280MB pressure -> bounded cleanup and physical reclaim; no numeric-history purge.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
ALTER TABLE private.kinojo_storage_budget_control_v549
 ADD CONSTRAINT storage_reclaim_thresholds_v553 CHECK(warning_bytes=280000000 AND steady_bytes=270000000),
 ADD COLUMN reclaim_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN reclaim_latched boolean NOT NULL DEFAULT false,
 ADD COLUMN reclaim_status text NOT NULL DEFAULT 'IDLE',
 ADD COLUMN reclaim_lease uuid,
 ADD COLUMN reclaim_lease_until timestamptz,
 ADD COLUMN reclaim_dispatched_at timestamptz,
 ADD COLUMN reclaim_request_id bigint,
 ADD COLUMN reclaim_retry_at timestamptz,
 ADD COLUMN reclaim_cycle_started_at timestamptz,
 ADD COLUMN reclaim_tables_done text[] NOT NULL DEFAULT '{}',
 ADD COLUMN reclaim_had_deferred boolean NOT NULL DEFAULT false,
 ADD COLUMN reclaim_planned text[] NOT NULL DEFAULT '{}',
 ADD COLUMN reclaim_canary_requested boolean NOT NULL DEFAULT false,
 ADD COLUMN reclaim_mode text,
 ADD COLUMN last_reclaim_at timestamptz,
 ADD COLUMN last_reclaim_result jsonb,
 ADD COLUMN last_reclaim_error text;
ALTER TABLE private.kinojo_storage_budget_control_v549
 ADD CONSTRAINT storage_reclaim_tables_bounded_v553 CHECK(cardinality(reclaim_tables_done)<=14 AND cardinality(reclaim_planned)<=2),
 ADD CONSTRAINT storage_reclaim_result_bounded_v553 CHECK(last_reclaim_result IS NULL OR pg_column_size(last_reclaim_result)<=8192);

CREATE FUNCTION private.kinojo_storage_reclaim_due_v553(p_bytes bigint,p_latched boolean)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='pg_catalog' AS $fn$
 SELECT coalesce(p_bytes>=280000000 OR(p_latched AND p_bytes>270000000),false)
$fn$;
CREATE FUNCTION private.kinojo_storage_reclaim_relations_v553()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='pg_catalog' AS $fn$
 SELECT ARRAY['public.lookup_snapshots','public.extension_character_payloads','public.master_sync_events',
 'public.growth_reviews','public.updater_runtime_events','public.snapshot_intake_events',
 'public.updater_session_progress_current','public.lookup_session_targets','public.character_history',
 'public.google_list_sheet_sync_queue','public.kinojo_page_view_events',
 'private.kinojo_ranking_snapshot_items_v390','private.kinojo_ranking_snapshot_owner_metrics_v390',
 'private.kinojo_ranking_snapshot_scopes_v390']::text[]
$fn$;
CREATE FUNCTION private.kinojo_storage_reclaim_active_v553()
RETURNS boolean LANGUAGE sql STABLE SET search_path='pg_catalog' AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.updater_runtime_jobs WHERE coalesce(status,'') NOT IN('completed','failed','cancelled','expired','error'))
 OR EXISTS(SELECT 1 FROM public.lookup_batches WHERE coalesce(status,'') NOT IN('completed','failed','cancelled','expired','error'))
$fn$;
CREATE FUNCTION private.kinojo_storage_reclaim_fence_v553(p_lease uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='pg_catalog' AS $fn$
 SELECT coalesce((SELECT b.enabled AND (b.reclaim_enabled OR b.reclaim_mode='CANARY')
 AND b.reclaim_lease=p_lease AND b.reclaim_lease_until>clock_timestamp()
 AND NOT private.kinojo_storage_reclaim_active_v553()
 AND (b.reclaim_mode='CANARY' OR pg_database_size(current_database())>b.steady_bytes)
 FROM private.kinojo_storage_budget_control_v549 b WHERE singleton),false)
$fn$;

CREATE FUNCTION public.kinojo_storage_maintenance_v553(p_cron_token text,p_step text,p_lease uuid DEFAULT NULL,p_result jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog' SET TimeZone='UTC'
SET lock_timeout='300ms' SET statement_timeout='10s' AS $fn$
DECLARE b private.kinojo_storage_budget_control_v549%rowtype;v_now timestamptz:=clock_timestamp();v_bytes bigint;
 v_tables text[];v_items jsonb:='[]';v_item jsonb;v_done text[];v_error text;v_status text;v_mode text;v_lease uuid;
BEGIN
 IF nullif(p_cron_token,'') IS NULL OR p_cron_token IS DISTINCT FROM(
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='kinojo_server_automation_cron_token' ORDER BY created_at DESC LIMIT 1)
 THEN RETURN jsonb_build_object('ok',false,'code','STORAGE_MAINTENANCE_DENIED');END IF;
 IF p_step NOT IN('probe','claim','finish') OR p_step IS NULL OR octet_length(coalesce(p_result::text,''))>8192
 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_MAINTENANCE_ACTION');END IF;
 v_bytes:=pg_database_size(current_database());
 IF p_step='probe' THEN RETURN jsonb_build_object('ok',true,'operation','PROBE','databaseBytes',v_bytes);END IF;
 BEGIN SELECT * INTO STRICT b FROM private.kinojo_storage_budget_control_v549 WHERE singleton FOR UPDATE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RETURN jsonb_build_object('ok',true,'operation','BUSY');END;
 IF p_step='finish' THEN
  IF p_lease IS NULL OR b.reclaim_lease IS DISTINCT FROM p_lease OR b.reclaim_lease_until<=v_now
  THEN RETURN jsonb_build_object('ok',false,'code','STALE_RECLAIM_LEASE');END IF;
  v_error:=p_result->>'errorCode';
  IF v_error IS NOT NULL AND v_error NOT IN('BUSY','ACTIVE_WORK','QUERY_TIMEOUT','CONNECTION_UNAVAILABLE','CONFIGURATION_MISSING','UNVERIFIED_CONNECTION','RECLAIM_FAILED','LEASE_LOST','WORKER_TIMEOUT','PROTECTED_STATE_CHANGED')
  THEN v_error:='RECLAIM_FAILED';END IF;
  IF jsonb_typeof(p_result->'tables')='array' THEN
   FOR v_item IN SELECT value FROM jsonb_array_elements(p_result->'tables') LIMIT 2 LOOP
    IF NOT coalesce(v_item->>'relation'=ANY(b.reclaim_planned),false)
    OR coalesce(v_item->>'status','') NOT IN('REWRITTEN','BUSY','QUERY_TIMEOUT','FAILED')
    THEN RETURN jsonb_build_object('ok',false,'code','INVALID_RECLAIM_RESULT');END IF;
    v_items:=v_items||jsonb_build_array(jsonb_build_object('relation',v_item->>'relation','status',v_item->>'status'));
   END LOOP;
  END IF;
  SELECT coalesce(array_agg(DISTINCT x),'{}'::text[]) INTO v_done FROM unnest(b.reclaim_tables_done||ARRAY(SELECT x->>'relation' FROM jsonb_array_elements(v_items)x))x;
  v_status:=CASE WHEN v_error='PROTECTED_STATE_CHANGED' THEN 'PROTECTED_STATE_CHANGED'
    WHEN b.reclaim_mode='AUTOMATIC' AND v_bytes<=b.steady_bytes THEN 'IDLE'
    WHEN v_error IS NOT NULL OR(b.reclaim_mode='CANARY' AND jsonb_array_length(v_items)=0) THEN 'RETRY'
    WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(v_items)x WHERE x->>'status'<>'REWRITTEN') THEN 'DEFERRED'
    WHEN b.reclaim_mode='CANARY' THEN 'CANARY_OK'
    WHEN v_bytes<=b.steady_bytes THEN 'IDLE' ELSE 'RECLAIMING' END;
  UPDATE private.kinojo_storage_budget_control_v549 SET reclaim_lease=NULL,reclaim_lease_until=NULL,reclaim_planned='{}',
   reclaim_status=v_status,reclaim_dispatched_at=NULL,reclaim_latched=CASE WHEN b.reclaim_mode='CANARY' THEN reclaim_latched ELSE v_bytes>steady_bytes END,
   reclaim_had_deferred=reclaim_had_deferred OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_items)x WHERE x->>'status'<>'REWRITTEN'),
   reclaim_tables_done=CASE WHEN v_bytes<=steady_bytes THEN '{}'::text[] ELSE v_done END,
   reclaim_retry_at=CASE WHEN v_status='IDLE' THEN NULL WHEN v_error='PROTECTED_STATE_CHANGED' THEN v_now+interval '1hour'
    WHEN v_error IN('CONFIGURATION_MISSING','UNVERIFIED_CONNECTION','CONNECTION_UNAVAILABLE') THEN v_now+interval '5minutes'
    WHEN v_error IS NOT NULL OR v_status='DEFERRED' THEN v_now+interval '1minute' ELSE NULL END,
   last_reclaim_at=v_now,last_reclaim_error=CASE WHEN v_status='IDLE' THEN NULL ELSE v_error END,
   last_reclaim_result=jsonb_build_object('mode',b.reclaim_mode,'databaseBytes',v_bytes,'tables',v_items,'errorCode',v_error),
   reclaim_canary_requested=false WHERE singleton;
  RETURN jsonb_build_object('ok',v_status NOT IN('RETRY','PROTECTED_STATE_CHANGED'),'operation',v_status,'databaseBytes',v_bytes,
   'goalMet',v_bytes<=b.steady_bytes,'reclaimSucceeded',EXISTS(SELECT 1 FROM jsonb_array_elements(v_items)x WHERE x->>'status'='REWRITTEN'),
   'code',CASE WHEN v_status IN('RETRY','PROTECTED_STATE_CHANGED') THEN coalesce(v_error,'RECLAIM_FAILED') ELSE NULL END);
 END IF;
 IF b.reclaim_lease IS NOT NULL AND b.reclaim_lease_until>v_now THEN RETURN jsonb_build_object('ok',true,'operation','RUNNING');END IF;
 IF NOT b.enabled OR (NOT b.reclaim_enabled AND NOT b.reclaim_canary_requested)
 THEN RETURN jsonb_build_object('ok',true,'operation','DISABLED');END IF;
 IF b.reclaim_retry_at>v_now THEN RETURN jsonb_build_object('ok',true,'operation','COOLDOWN');END IF;
 IF private.kinojo_storage_reclaim_active_v553() THEN RETURN jsonb_build_object('ok',true,'operation','ACTIVE_WORK');END IF;
 v_mode:=CASE WHEN b.reclaim_canary_requested THEN 'CANARY' ELSE 'AUTOMATIC' END;
 IF v_mode='AUTOMATIC' AND NOT private.kinojo_storage_reclaim_due_v553(v_bytes,b.reclaim_latched)
 THEN
  UPDATE private.kinojo_storage_budget_control_v549 SET reclaim_latched=false,reclaim_status='IDLE',reclaim_lease=NULL,
   reclaim_lease_until=NULL,reclaim_tables_done='{}',reclaim_had_deferred=false,reclaim_planned='{}' WHERE singleton;
  RETURN jsonb_build_object('ok',true,'operation','BELOW_THRESHOLD','databaseBytes',v_bytes);
 END IF;
 IF v_mode='CANARY' THEN v_tables:=ARRAY['public.snapshot_intake_events'];
 ELSE
  SELECT coalesce(array_agg(rel),'{}'::text[]) INTO v_tables FROM(
   SELECT rel FROM unnest(private.kinojo_storage_reclaim_relations_v553())rel
   WHERE NOT(rel=ANY(b.reclaim_tables_done)) AND to_regclass(rel) IS NOT NULL
    AND pg_total_relation_size(to_regclass(rel))>=1000000
   ORDER BY pg_total_relation_size(to_regclass(rel)) DESC,rel LIMIT 2)q;
 END IF;
 IF cardinality(v_tables)=0 THEN
  v_status:=CASE WHEN b.reclaim_had_deferred THEN 'DEFERRED' ELSE 'NO_RECLAIMABLE_SPACE' END;
  UPDATE private.kinojo_storage_budget_control_v549 SET reclaim_status=v_status,reclaim_latched=true,
   reclaim_retry_at=v_now+CASE WHEN b.reclaim_had_deferred THEN interval '1minute' ELSE interval '1hour' END,
   reclaim_tables_done='{}',reclaim_had_deferred=false,reclaim_planned='{}',
   reclaim_lease=NULL,reclaim_lease_until=NULL,last_reclaim_error=v_status WHERE singleton;
  RETURN jsonb_build_object('ok',true,'operation',v_status,'databaseBytes',v_bytes);
 END IF;
 v_lease:=gen_random_uuid();
 UPDATE private.kinojo_storage_budget_control_v549 SET reclaim_mode=v_mode,reclaim_status='RECLAIMING',reclaim_lease=v_lease,
  reclaim_lease_until=v_now+interval '90seconds',reclaim_canary_requested=false,reclaim_planned=v_tables,
  reclaim_latched=CASE WHEN v_mode='CANARY' THEN reclaim_latched ELSE true END,
  reclaim_cycle_started_at=coalesce(reclaim_cycle_started_at,v_now),last_reclaim_error=NULL WHERE singleton;
 RETURN jsonb_build_object('ok',true,'operation','RECLAIM','mode',v_mode,'lease',v_lease,'tables',to_jsonb(v_tables),'databaseBytes',v_bytes);
END
$fn$;

CREATE FUNCTION private.kinojo_storage_capacity_tick_v553()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog' SET TimeZone='UTC'
SET statement_timeout='5s' SET lock_timeout='300ms' AS $fn$
DECLARE b private.kinojo_storage_budget_control_v549%rowtype;v_bytes bigint;v_id bigint;v_token text;v_now timestamptz:=clock_timestamp();
BEGIN
 IF NOT pg_try_advisory_xact_lock(553,553) THEN RETURN jsonb_build_object('ok',true,'operation','BUSY');END IF;
 BEGIN SELECT * INTO STRICT b FROM private.kinojo_storage_budget_control_v549 WHERE singleton FOR UPDATE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RETURN jsonb_build_object('ok',true,'operation','BUSY');END;
 IF NOT b.enabled OR NOT b.reclaim_enabled THEN RETURN jsonb_build_object('ok',true,'operation','DISABLED');END IF;
 v_bytes:=pg_database_size(current_database());
 IF NOT private.kinojo_storage_reclaim_due_v553(v_bytes,b.reclaim_latched) AND NOT b.reclaim_latched
 THEN RETURN jsonb_build_object('ok',true,'operation','BELOW_THRESHOLD');END IF;
 IF v_bytes<=b.steady_bytes THEN
  UPDATE private.kinojo_storage_budget_control_v549 SET reclaim_latched=false,reclaim_status='IDLE',reclaim_tables_done='{}',reclaim_had_deferred=false,reclaim_retry_at=NULL WHERE singleton;
  RETURN jsonb_build_object('ok',true,'operation','BELOW_THRESHOLD');END IF;
 IF b.reclaim_lease_until>v_now OR b.reclaim_retry_at>v_now OR b.reclaim_dispatched_at>v_now-interval '90seconds'
 THEN RETURN jsonb_build_object('ok',true,'operation','WAITING');END IF;
 IF private.kinojo_storage_reclaim_active_v553() THEN RETURN jsonb_build_object('ok',true,'operation','ACTIVE_WORK');END IF;
 SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name='kinojo_server_automation_cron_token' ORDER BY created_at DESC LIMIT 1;
 IF nullif(v_token,'') IS NULL THEN RETURN jsonb_build_object('ok',false,'code','CONFIGURATION_MISSING');END IF;
 SELECT net.http_post(url:='https://josvoltpktvwysrasffq.supabase.co/functions/v1/kinojo-storage-maintenance',
  headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('action','maintain','cronToken',v_token),timeout_milliseconds:=60000) INTO v_id;
 UPDATE private.kinojo_storage_budget_control_v549 SET reclaim_dispatched_at=v_now,reclaim_request_id=v_id,
  reclaim_status='QUEUED',reclaim_latched=true WHERE singleton;
 RETURN jsonb_build_object('ok',true,'operation','QUEUED');
END
$fn$;
REVOKE ALL ON FUNCTION private.kinojo_storage_reclaim_due_v553(bigint,boolean),private.kinojo_storage_reclaim_relations_v553(),private.kinojo_storage_reclaim_active_v553(),
 private.kinojo_storage_reclaim_fence_v553(uuid),private.kinojo_storage_capacity_tick_v553(),
 public.kinojo_storage_maintenance_v553(text,text,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.kinojo_storage_maintenance_v553(text,text,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION private.kinojo_storage_budget_status_v549()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='pg_catalog' AS $fn$
 SELECT jsonb_build_object('databaseBytes',s.bytes,'targetBytes',c.target_bytes,'warningBytes',c.warning_bytes,
  'steadyBytes',c.steady_bytes,'enabled',c.enabled,'lastCleanupAt',c.last_checked_at,'lastCleanup',c.last_compaction,
  'status',CASE WHEN NOT c.enabled THEN 'DISABLED' WHEN s.bytes>c.target_bytes THEN 'TARGET_EXCEEDED'
    WHEN s.bytes>=c.warning_bytes THEN 'WARNING' ELSE 'NORMAL' END,
  'headroomBytes',greatest(0,c.target_bytes-s.bytes),'autoReclaim',jsonb_build_object(
   'enabled',c.reclaim_enabled,'watchActive',EXISTS(SELECT 1 FROM cron.job WHERE jobname='kinojo-storage-capacity-watch-v553' AND active),
   'status',CASE WHEN c.reclaim_enabled AND private.kinojo_storage_reclaim_due_v553(s.bytes,c.reclaim_latched)
    AND private.kinojo_storage_reclaim_active_v553() THEN 'ACTIVE_WORK' ELSE c.reclaim_status END,'retryAt',c.reclaim_retry_at,
   'lastAt',c.last_reclaim_at,'lastResult',c.last_reclaim_result,'errorCode',c.last_reclaim_error,'checkIntervalSeconds',60))
 FROM private.kinojo_storage_budget_control_v549 c CROSS JOIN LATERAL(SELECT pg_database_size(current_database()) bytes)s WHERE c.singleton
$fn$;
SELECT cron.schedule('kinojo-storage-capacity-watch-v553','* * * * *','select private.kinojo_storage_capacity_tick_v553();');
