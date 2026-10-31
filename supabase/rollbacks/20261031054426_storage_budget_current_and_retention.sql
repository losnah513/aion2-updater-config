-- Stop new lifecycle work; do not recreate deleted JSON or loosen public ACLs.
SET LOCAL lock_timeout='2s';
UPDATE private.kinojo_storage_budget_control_v549 SET enabled=false;
DROP TRIGGER zz_growth_reviews_storage_v549 ON public.growth_reviews;
CREATE OR REPLACE FUNCTION private.kinojo_snapshot_raw_cleanup_v501(p_dry_run boolean DEFAULT true, p_limit integer DEFAULT 2000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '15s'
 SET lock_timeout TO '500ms'
AS $function$
declare v_budget integer:=least(50,greatest(1,coalesce(p_limit,50)));v_snapshot jsonb;v_payload jsonb;
begin
 v_snapshot:=private.kinojo_snapshot_diagnostic_cleanup_v508(p_dry_run,greatest(1,v_budget/2));
 if v_budget>1 then v_payload:=private.kinojo_payload_evidence_cleanup_v509(p_dry_run,v_budget-greatest(1,v_budget/2));end if;
 return v_snapshot||jsonb_build_object('payload',v_payload);
end;$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_snapshot_raw_candidates_v514(p_after_id bigint DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS TABLE(id bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
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
$function$
;
-- Keep private backup/control information and compacted rows for restoration.
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
  from private.kinojo_snapshot_raw_candidates_v514(0,p_limit) c;
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
  return jsonb_build_object('ok',true,'timezone','Asia/Seoul','generatedAt',v_now,
    'characterScheduleSummary','본캐 10:00·22:00 / 부캐 15:00 (매일, 한국 시간)',
    'historyNote','최근 실행은 각 작업 전체의 최신 예약 호출 결과입니다. 캐릭터별 조회 결과는 캐릭터 관리에서 확인하세요.',
    'routines',v_rows);
end;
$function$
;
