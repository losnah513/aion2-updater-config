-- SQL549: bounded raw/diagnostic lifecycle with current and numeric history protection.
-- Deploy disabled, verify the complete external backup and isolated restoration, then enable.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
CREATE TABLE private.kinojo_storage_budget_control_v549(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 backup_verified_at timestamptz,
 initial_highwater jsonb NOT NULL DEFAULT '{}'::jsonb,
 target_bytes bigint NOT NULL DEFAULT 300000000 CHECK(target_bytes=300000000),
 warning_bytes bigint NOT NULL DEFAULT 280000000,
 steady_bytes bigint NOT NULL DEFAULT 270000000,
 last_checked_at timestamptz,
 last_database_bytes bigint,
 last_compaction jsonb,
 installed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.kinojo_storage_budget_control_v549 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.kinojo_storage_budget_control_v549 FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO private.kinojo_storage_budget_control_v549(singleton,initial_highwater) SELECT true,jsonb_build_object(
 'snapshot',coalesce((select max(id) from public.lookup_snapshots),0),
 'review',coalesce((select max(id) from public.growth_reviews),0),
 'master',coalesce((select max(id) from public.master_sync_events),0),
 'runtime',coalesce((select max(id) from public.updater_runtime_events),0),
 'evidence',coalesce((select max(id) from public.extension_character_payloads),0));
CREATE FUNCTION private.kinojo_storage_review_summary_v549(p_raw jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='pg_catalog' AS $fn$
 SELECT CASE WHEN jsonb_typeof(p_raw)='object' THEN coalesce((select jsonb_object_agg(key,value) from jsonb_each(p_raw)
 WHERE key=ANY(ARRAY['id','character_master_id','history_date','record_type','status','gear_type','server_id','character_name','created_at','pve_item_level','pve_combat_power','pvp_item_level','pvp_combat_power'])),'{}'::jsonb) ELSE p_raw END
$fn$;
CREATE FUNCTION private.kinojo_storage_review_write_v549()
RETURNS trigger LANGUAGE plpgsql SET search_path='pg_catalog' AS $fn$
BEGIN
 NEW.raw_current:=private.kinojo_storage_review_summary_v549(NEW.raw_current);
 NEW.raw_previous:=private.kinojo_storage_review_summary_v549(NEW.raw_previous);
 -- Preserve ranking/review freshness on raw-only compaction, including set_updated_at().
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['raw_current','raw_previous','updated_at'])=(to_jsonb(OLD)-ARRAY['raw_current','raw_previous','updated_at'])
 AND (NEW.raw_current IS DISTINCT FROM OLD.raw_current OR NEW.raw_previous IS DISTINCT FROM OLD.raw_previous)
 THEN NEW.updated_at:=OLD.updated_at; END IF;
 RETURN NEW;
END
$fn$;
CREATE TRIGGER zz_growth_reviews_storage_v549 BEFORE INSERT OR UPDATE OF raw_current,raw_previous ON public.growth_reviews
 FOR EACH ROW EXECUTE FUNCTION private.kinojo_storage_review_write_v549();
CREATE FUNCTION private.kinojo_storage_runtime_summary_v549(p_raw jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='pg_catalog' AS $fn$
 SELECT CASE WHEN jsonb_typeof(p_raw)='object' THEN coalesce((select jsonb_object_agg(key,value) from jsonb_each(p_raw)
 WHERE key=ANY(ARRAY['targetId','status','code','durationMs','elapsedMs','lookupOrder','serverId','characterName'])),'{}'::jsonb) ELSE p_raw END
$fn$;
CREATE FUNCTION private.kinojo_storage_completed_sessions_v549(p_age interval)
RETURNS TABLE(session_id text) LANGUAGE sql STABLE SET search_path='pg_catalog' AS $fn$
 SELECT s.session_id FROM public.updater_sessions s
 WHERE s.status IN ('completed','failed','cancelled','expired','error')
 AND s.finished_at<statement_timestamp()-p_age
 AND NOT EXISTS(SELECT 1 FROM public.updater_runtime_jobs j WHERE j.session_id=s.session_id
   AND coalesce(j.status,'') NOT IN ('completed','failed','cancelled','expired','error'))
 AND NOT EXISTS(SELECT 1 FROM public.lookup_batches b WHERE b.session_id=s.session_id
   AND coalesce(b.status,'') NOT IN ('completed','failed','cancelled','expired','error'))
$fn$;
CREATE OR REPLACE FUNCTION private.kinojo_snapshot_raw_candidates_v514(p_after_id bigint DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS TABLE(id bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
with latest_payloads as materialized (
  select distinct on(coalesce(e.server_id,2002),public.kinojo_normalize_character_name(e.character_name)) e.id
  from public.extension_character_payloads e
  order by coalesce(e.server_id,2002),public.kinojo_normalize_character_name(e.character_name),e.received_at desc,e.id desc
), protected_payloads as materialized (
  select id from latest_payloads
  union select latest_payload_id id from public.character_master
  union select id from public.extension_character_payloads where growth_review_status is distinct from 'reviewed'
  union select payload_id from public.lookup_session_targets where target_status is distinct from 'lookup_done'
  union select latest_pve_payload_id from public.character_master
  union select latest_pvp_payload_id from public.character_master
  union select payload_id from public.character_stat_sources
  union select latest_payload_id from public.ranking_entries
), protected_snapshots as materialized (
  select s.id from public.lookup_snapshots s join public.character_master m on m.latest_snapshot_uid=s.snapshot_uid
  union select legion_source_snapshot_id from public.character_master
  union select snapshot_id from public.character_skill_current_state
  union select snapshot_id from public.character_stat_sources
  union select fallback.id from public.extension_character_payloads p
    join protected_payloads k on k.id=p.id
    cross join lateral(select s.id from public.lookup_snapshots s
      where s.session_id=p.session_id and coalesce(s.server_id,2002)=coalesce(p.server_id,2002)
        and public.kinojo_normalize_character_name(s.character_name)=public.kinojo_normalize_character_name(p.character_name)
      order by abs(extract(epoch from(s.created_at-p.received_at))),s.id desc limit 1) fallback
    where p.source_snapshot_id is null or not exists(select 1 from public.lookup_snapshots s where s.id=p.source_snapshot_id)
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
    and not exists(select 1 from public.lookup_session_targets t
      where t.snapshot_id=s.id and t.target_status is distinct from 'lookup_done')
    and not exists(select 1 from public.extension_character_payloads p
      where p.source_snapshot_id=s.id and p.growth_review_status is distinct from 'reviewed')
    and exists(select 1 from public.lookup_snapshots newer
      where newer.server_id=s.server_id and newer.character_name=s.character_name
        and (newer.created_at,newer.id)>(s.created_at,s.id))
)
select e.id from eligible e
order by e.id limit least(50,greatest(1,coalesce(p_limit,50)));
$function$
;

CREATE FUNCTION private.kinojo_storage_candidates_v549(p_kind text,p_after bigint DEFAULT 0,p_limit integer DEFAULT 100)
RETURNS TABLE(id bigint,row_hash text) LANGUAGE plpgsql STABLE SET search_path='pg_catalog' SET TimeZone='UTC' AS $fn$
BEGIN
 IF p_kind='snapshot' THEN RETURN QUERY
 SELECT s.id,md5(to_jsonb(s)::text) FROM public.lookup_snapshots s
 JOIN private.kinojo_snapshot_raw_candidates_v514(p_after,least(50,greatest(1,p_limit))) c ON c.id=s.id;
 ELSIF p_kind='review' THEN RETURN QUERY
 SELECT r.id,md5(to_jsonb(r)::text) FROM public.growth_reviews r
 WHERE r.id>p_after AND r.created_at<statement_timestamp()-interval '7 days'
 AND EXISTS(SELECT 1 FROM private.kinojo_storage_completed_sessions_v549(interval '7 days') c WHERE c.session_id=r.session_id)
 AND (r.raw_current IS DISTINCT FROM private.kinojo_storage_review_summary_v549(r.raw_current)
  OR r.raw_previous IS DISTINCT FROM private.kinojo_storage_review_summary_v549(r.raw_previous))
 ORDER BY r.id LIMIT least(500,greatest(1,p_limit));
 ELSIF p_kind='master' THEN RETURN QUERY
 SELECT m.id,md5(to_jsonb(m)::text) FROM public.master_sync_events m
 WHERE m.id>p_after AND m.created_at<statement_timestamp()-interval '30 days'
 AND m.status='synced' AND m.event_type IN ('insert_master','update_master')
 AND EXISTS(SELECT 1 FROM private.kinojo_storage_completed_sessions_v549(interval '30 days') c WHERE c.session_id=m.session_id)
 AND NOT EXISTS(SELECT 1 FROM public.character_history h WHERE h.source_payload_id=m.payload_id)
 AND NOT EXISTS(SELECT 1 FROM public.character_master c WHERE m.payload_id IN(c.latest_payload_id,c.latest_pve_payload_id,c.latest_pvp_payload_id))
 AND NOT EXISTS(SELECT 1 FROM public.character_stat_sources c WHERE c.payload_id=m.payload_id)
 ORDER BY m.id LIMIT least(500,greatest(1,p_limit));
 ELSIF p_kind='runtime' THEN RETURN QUERY
 SELECT e.id,md5(to_jsonb(e)::text) FROM public.updater_runtime_events e
 WHERE e.id>p_after AND e.created_at<statement_timestamp()-interval '7 days' AND e.event_type='progress'
 AND EXISTS(SELECT 1 FROM private.kinojo_storage_completed_sessions_v549(interval '7 days') c WHERE c.session_id=e.session_id)
 AND e.payload IS DISTINCT FROM private.kinojo_storage_runtime_summary_v549(e.payload)
 ORDER BY e.id LIMIT least(500,greatest(1,p_limit));
 ELSIF p_kind='evidence' THEN RETURN QUERY
 SELECT p.id,md5(to_jsonb(p)::text) FROM public.extension_character_payloads p
 JOIN private.kinojo_payload_evidence_candidates_v509(p_after,least(500,greatest(1,p_limit))) c ON c.id=p.id;
 ELSE RAISE EXCEPTION 'INVALID_STORAGE_KIND'; END IF;
END
$fn$;
CREATE FUNCTION private.kinojo_storage_compact_v549(p_dry_run boolean DEFAULT true,p_limit integer DEFAULT 50,p_expected jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog'
SET statement_timeout='15s' SET lock_timeout='500ms' SET TimeZone='UTC' AS $fn$
DECLARE v_kind text;v_row record;v_ids bigint[];v_count int;v_counts jsonb:='{}';v_control private.kinojo_storage_budget_control_v549%rowtype;v_protected jsonb;
BEGIN
 SELECT * INTO STRICT v_control FROM private.kinojo_storage_budget_control_v549 WHERE singleton;
 IF coalesce(p_dry_run,true)=false AND (NOT v_control.enabled OR v_control.backup_verified_at IS NULL)
 THEN RETURN jsonb_build_object('ok',false,'code','VERIFIED_EXTERNAL_BACKUP_REQUIRED');END IF;
 IF NOT pg_try_advisory_xact_lock(501,501) THEN RETURN jsonb_build_object('ok',true,'busy',true);END IF;
 BEGIN
 LOCK TABLE public.lookup_snapshots,public.extension_character_payloads,public.growth_reviews,
   public.master_sync_events,public.updater_runtime_events IN SHARE ROW EXCLUSIVE MODE NOWAIT;
 LOCK TABLE public.character_master,public.character_stat_sources,public.character_skill_current_state,
   public.updater_sessions,public.updater_runtime_jobs,public.lookup_batches,public.ranking_entries,
   public.lookup_session_targets,public.character_history,private.character_growth_rollups IN SHARE MODE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RETURN jsonb_build_object('ok',true,'busy',true);END;
 v_protected:=private.kinojo_storage_protected_digest_v549();
 FOREACH v_kind IN ARRAY ARRAY['snapshot','review','master','runtime','evidence'] LOOP
  SELECT coalesce(array_agg(c.id),'{}'::bigint[]) INTO v_ids
  FROM private.kinojo_storage_candidates_v549(v_kind,
   CASE WHEN NOT coalesce(p_dry_run,true) AND p_expected IS NULL
    THEN coalesce((v_control.initial_highwater->>v_kind)::bigint,0) ELSE 0 END,
   least(500,greatest(1,coalesce(p_limit,50)))) c
  WHERE (coalesce(p_dry_run,true)
    OR (c.id>coalesce((v_control.initial_highwater->>v_kind)::bigint,0))
    OR (p_expected->v_kind->>c.id::text=c.row_hash))
  AND (coalesce(p_dry_run,true) OR v_kind<>'snapshot' OR NOT EXISTS(
   SELECT 1 FROM public.lookup_snapshots s JOIN public.extension_character_payloads p
    ON p.source_snapshot_id=s.id OR (p.source_snapshot_id IS NULL AND p.session_id=s.session_id
     AND coalesce(p.server_id,2002)=coalesce(s.server_id,2002)
     AND public.kinojo_normalize_character_name(p.character_name)=public.kinojo_normalize_character_name(s.character_name))
   WHERE s.id=c.id AND p.master_sync_status='synced' AND p.retained_diagnosis_v512 IS NULL
    AND p.id<=coalesce((v_control.initial_highwater->>'evidence')::bigint,0)
    AND coalesce(p_expected->'evidence'->>p.id::text,'')<>md5(to_jsonb(p)::text)
  ));
  v_count:=0;
  IF NOT coalesce(p_dry_run,true) THEN
   IF v_kind='snapshot' THEN
    FOR v_row IN SELECT s.* FROM public.lookup_snapshots s WHERE s.id=ANY(v_ids) ORDER BY s.id LOOP
     UPDATE public.extension_character_payloads p SET retained_diagnosis_v512=private.kinojo_payload_diagnosis_summary_v512(p.id)
      WHERE (p.source_snapshot_id=v_row.id OR (p.source_snapshot_id IS NULL AND p.session_id=v_row.session_id
       AND coalesce(p.server_id,2002)=coalesce(v_row.server_id,2002)
       AND public.kinojo_normalize_character_name(p.character_name)=public.kinojo_normalize_character_name(v_row.character_name)))
       AND p.master_sync_status='synced' AND p.retained_diagnosis_v512 IS NULL;
     UPDATE public.lookup_snapshots s SET raw_payload=private.kinojo_snapshot_raw_summary_v514(s.raw_payload) WHERE s.id=v_row.id;
     v_count:=v_count+1;
    END LOOP;
   ELSIF v_kind='review' THEN
    UPDATE public.growth_reviews r SET raw_current=private.kinojo_storage_review_summary_v549(r.raw_current),
     raw_previous=private.kinojo_storage_review_summary_v549(r.raw_previous) WHERE r.id=ANY(v_ids);
    GET DIAGNOSTICS v_count=ROW_COUNT;
   ELSIF v_kind='master' THEN
    DELETE FROM public.master_sync_events m WHERE m.id=ANY(v_ids);GET DIAGNOSTICS v_count=ROW_COUNT;
   ELSIF v_kind='runtime' THEN
    UPDATE public.updater_runtime_events e SET payload=private.kinojo_storage_runtime_summary_v549(e.payload)
     WHERE e.id=ANY(v_ids);GET DIAGNOSTICS v_count=ROW_COUNT;
   ELSIF v_kind='evidence' THEN
    UPDATE public.extension_character_payloads p SET gear_evidence=private.kinojo_payload_evidence_v509(p.gear_evidence)
     WHERE p.id=ANY(v_ids);GET DIAGNOSTICS v_count=ROW_COUNT;
   END IF;
  END IF;
  v_counts:=v_counts||jsonb_build_object(v_kind,jsonb_build_object('candidates',cardinality(v_ids),'changed',v_count));
 END LOOP;
 IF v_protected IS DISTINCT FROM private.kinojo_storage_protected_digest_v549()
 THEN RAISE EXCEPTION 'STORAGE_PROTECTED_STATE_CHANGED';END IF;
 IF NOT coalesce(p_dry_run,true) THEN
  UPDATE private.kinojo_storage_budget_control_v549 SET last_checked_at=clock_timestamp(),
   last_database_bytes=pg_database_size(current_database()),last_compaction=v_counts WHERE singleton;
 END IF;
 RETURN jsonb_build_object('ok',true,'dryRun',coalesce(p_dry_run,true),'counts',v_counts,'databaseBytes',pg_database_size(current_database()),'targetBytes',v_control.target_bytes);
END
$fn$;
REVOKE ALL ON FUNCTION private.kinojo_storage_review_summary_v549(jsonb),
 private.kinojo_storage_review_write_v549(),private.kinojo_storage_runtime_summary_v549(jsonb),
 private.kinojo_storage_completed_sessions_v549(interval),private.kinojo_storage_candidates_v549(text,bigint,integer),
 private.kinojo_storage_compact_v549(boolean,integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.kinojo_snapshot_raw_cleanup_v501(p_dry_run boolean DEFAULT true, p_limit integer DEFAULT 2000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '15s'
 SET lock_timeout TO '500ms'
AS $function$
declare v_budget integer:=least(50,greatest(1,coalesce(p_limit,50)));v_snapshot jsonb;v_payload jsonb;v_storage jsonb;
begin
 v_storage:=private.kinojo_storage_compact_v549(p_dry_run,v_budget,NULL);
 v_snapshot:=private.kinojo_snapshot_diagnostic_cleanup_v508(p_dry_run,greatest(1,v_budget/2));
 if v_budget>1 then v_payload:=private.kinojo_payload_evidence_cleanup_v509(p_dry_run,v_budget-greatest(1,v_budget/2));end if;
 return v_snapshot||jsonb_build_object('payload',v_payload,'storageBudget',v_storage);
end;$function$
;
-- Existing ten-minute job owns this bounded work; no additional Cron or Edge.
ALTER TABLE public.master_sync_events SET(autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=100);
ALTER TABLE public.growth_reviews SET(autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=100);
ALTER TABLE private.kinojo_storage_budget_control_v549 SET(autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=10);

CREATE FUNCTION private.kinojo_storage_budget_status_v549()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='pg_catalog' AS $fn$
 SELECT jsonb_build_object('databaseBytes',s.bytes,'targetBytes',c.target_bytes,'warningBytes',c.warning_bytes,
  'steadyBytes',c.steady_bytes,'enabled',c.enabled,'lastCleanupAt',c.last_checked_at,'lastCleanup',c.last_compaction,
  'status',CASE WHEN NOT c.enabled THEN 'DISABLED' WHEN s.bytes>c.target_bytes THEN 'TARGET_EXCEEDED'
    WHEN s.bytes>=c.warning_bytes THEN 'WARNING' ELSE 'NORMAL' END,
  'headroomBytes',greatest(0,c.target_bytes-s.bytes))
 FROM private.kinojo_storage_budget_control_v549 c CROSS JOIN LATERAL(SELECT pg_database_size(current_database()) bytes)s WHERE c.singleton
$fn$;
REVOKE ALL ON FUNCTION private.kinojo_storage_budget_status_v549() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.kinojo_admin_server_routines_v533(p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'cron'
 SET statement_timeout TO '5s'
AS $function$
declare v_actor jsonb; v_now timestamptz:=clock_timestamp(); v_rows jsonb;
begin
  v_actor:=public.kinojo_web_admin_actor_v323(p_session_token);
  if coalesce((v_actor->>'level')::integer,0)<3 then
    return jsonb_build_object('ok',false,'code','ADMIN_ACCESS_REQUIRED','message','관리자 권한이 필요합니다.');
  end if;
  -- Bound the read by the most recent 20,000 scheduler records; never select return_message/command.
  with recent as materialized (
    select r.jobid,r.runid,r.status,r.start_time,r.end_time
      from cron.job_run_details r order by r.runid desc limit 20000
  ), latest as (
    select distinct on(r.jobid) r.* from recent r order by r.jobid,r.runid desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',j.jobid,
    'name',case j.jobname
      when 'kinojo-character-refresh-6h-v377' then '캐릭터 공식 조회'
      when 'kinojo-sanctuary-sheet-sync-12h-v377' then '성역 시트 동기화'
      when 'kinojo-member-image-cleanup-v364' then '회원 이미지 정리'
      when 'kinojo-ranking-snapshot-cleanup-v401' then '이전 순위 스냅샷 정리'
      when 'kinojo-updater-run-report-cleanup-v421' then '조회 실행 보고서 정리'
      when 'kinojo-character-growth-rollup-cleanup-v425' then '성장 요약 기록 정리'
      when 'kinojo-character-growth-raw-cleanup-v443' then '성장 원본 기록 정리'
      when 'kinojo-deferred-ranking-hof' then '순위·명예의 전당 공개 대기 확인'
      when 'kinojo-snapshot-raw-retention-v501' then '조회 원본 보관 정리'
      when 'kinojo-completed-runtime-retention-v511' then '완료된 실행 기록 정리'
      when 'kinojo-superseded-snapshot-retention-v512' then '대체된 조회 원본 정리'
      when 'kinojo-snapshot-seven-day-summary-v514' then '7일 지난 조회 원본 요약'
      when 'kinojo-payload-post-detail-cleanup-v515' then '상세 저장 후 수집 자료 정리'
      when 'kinojo-intake-post-detail-cleanup-v516' then '상세 저장 후 수집 접수 기록 정리'
      when 'kinojo-cron-run-history-retention-v520' then '서버 예약 실행 기록 정리'
      else '기타 서버 작업 #'||j.jobid::text end,
    'description',case when j.jobname='kinojo-character-refresh-6h-v377'
      then '본캐 10:00·22:00 / 부캐 15:00' when j.jobname='kinojo-deferred-ranking-hof'
      then '공개 조건을 확인하며, 매번 순위를 새로 만드는 작업은 아닙니다.' else null end,
    'active',j.active,'scheduleKst',p.preview->>'label',
    'frequency',p.preview->>'frequency',
    'scheduleEntries',(
      select coalesce(jsonb_agg(e||jsonb_build_object('description',
        case when j.jobname='kinojo-character-refresh-6h-v377'
          then case when e->>'timeKst'='15:00' then '부캐 공식 조회' else '본캐 공식 조회' end else null end
      ) order by (e->>'minuteOfDay')::int),'[]'::jsonb)
      from jsonb_array_elements(coalesce(p.preview->'entries','[]'::jsonb)) e
    ),
    'nextRunAt',case when j.active then p.preview->'nextRunAt' else 'null'::jsonb end,
    'lastStatus',l.status,'lastStartedAt',l.start_time,'lastFinishedAt',l.end_time
  ) order by case when j.jobname='kinojo-character-refresh-6h-v377' then 0 else 1 end,j.jobid),'[]'::jsonb)
    into v_rows from cron.job j
    left join latest l on l.jobid=j.jobid
    cross join lateral (select private.kinojo_cron_preview_v533(j.schedule,v_now) preview) p
   where j.jobname like 'kinojo-%';
  return jsonb_build_object('ok',true,'storageBudget',private.kinojo_storage_budget_status_v549(),'timezone','Asia/Seoul','generatedAt',v_now,
    'characterScheduleSummary','본캐 10:00·22:00 / 부캐 15:00 (매일, 한국 시간)',
    'historyNote','최근 실행은 각 작업 전체의 최신 예약 호출 결과입니다. 캐릭터별 조회 결과는 캐릭터 관리에서 확인하세요.',
    'routines',v_rows);
end;
$function$
;
-- Existing 30-source-date history policy stays intact; daily execution prevents weekly batch backlog.
CREATE OR REPLACE FUNCTION private.kinojo_snapshot_raw_cleanup_v514(p_dry_run boolean DEFAULT true, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '15s'
 SET lock_timeout TO '500ms'
AS $function$
declare v_ids bigint[];v_cached integer:=0;v_compacted integer:=0;v_id bigint;v_n integer;
begin
  if coalesce(p_dry_run,true) is false and not exists(
    select 1 from private.kinojo_snapshot_retention_control_v512
    where singleton and enabled and backup_waived_at is not null) then
    return jsonb_build_object('ok',false,'code','RETENTION_NOT_ENABLED','compacted',0);
  end if;
  if not pg_try_advisory_xact_lock(501,501) then
    return jsonb_build_object('ok',true,'busy',true,'compacted',0);
  end if;
  begin
    lock table public.lookup_snapshots in share row exclusive mode nowait;
    lock table public.character_master,public.character_skill_current_state,
      public.character_stat_sources,
      public.updater_sessions,public.updater_runtime_jobs,public.lookup_batches,
      public.extension_character_payloads,public.ranking_entries,
      public.google_list_sheet_sync_queue in share mode nowait;
  exception when lock_not_available then
    return jsonb_build_object('ok',true,'busy',true,'compacted',0);
  end;
  select coalesce(array_agg(c.id),'{}'::bigint[]) into v_ids
  from private.kinojo_snapshot_raw_candidates_v514(0,p_limit) c
  where exists(select 1 from private.kinojo_storage_budget_control_v549 b where b.singleton and b.enabled
    and b.backup_verified_at is not null and c.id>coalesce((b.initial_highwater->>'snapshot')::bigint,0));
  if coalesce(p_dry_run,true) is false then
    foreach v_id in array v_ids loop
      update public.extension_character_payloads p
      set retained_diagnosis_v512=private.kinojo_payload_diagnosis_summary_v512(p.id)
      from public.lookup_snapshots s
      where s.id=v_id and p.master_sync_status='synced'
        and p.retained_diagnosis_v512 is null
        and (p.source_snapshot_id=v_id or (p.source_snapshot_id is null
          and p.session_id=s.session_id
          and coalesce(p.server_id,2002)=coalesce(s.server_id,2002)
          and public.kinojo_normalize_character_name(p.character_name)
            =public.kinojo_normalize_character_name(s.character_name)));
      get diagnostics v_n=row_count;v_cached:=v_cached+v_n;
      update public.lookup_snapshots s
      set raw_payload=private.kinojo_snapshot_raw_summary_v514(s.raw_payload)
      where s.id=v_id;
      get diagnostics v_n=row_count;v_compacted:=v_compacted+v_n;
    end loop;
  end if;
  return jsonb_build_object('ok',true,'dryRun',coalesce(p_dry_run,true),
    'candidates',cardinality(v_ids),'compacted',v_compacted,'cachedPayloads',v_cached,
    'retentionDays',7);
end;
$function$
;

CREATE FUNCTION private.kinojo_storage_protected_digest_v549()
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='pg_catalog' SET TimeZone='UTC' AS $fn$
 SELECT jsonb_object_agg(name,hash) FROM (
  SELECT 'master' name,md5(coalesce(string_agg(to_jsonb(x)::text,E'\n' ORDER BY x.id),'')) hash FROM public.character_master x
  UNION ALL SELECT 'stats',md5(coalesce(string_agg(to_jsonb(x)::text,E'\n' ORDER BY x.character_id,x.gear_type),'')) FROM public.character_stat_sources x
  UNION ALL SELECT 'skills',md5(coalesce(string_agg(to_jsonb(x)::text,E'\n' ORDER BY x.character_master_id),'')) FROM public.character_skill_current_state x
  UNION ALL SELECT 'growth',md5(coalesce(string_agg(to_jsonb(x)::text,E'\n' ORDER BY x.granularity,x.period_start,x.character_master_id,x.gear_type),'')) FROM private.character_growth_rollups x
 ) protected
$fn$;
REVOKE ALL ON FUNCTION private.kinojo_storage_protected_digest_v549() FROM PUBLIC,anon,authenticated,service_role;
