BEGIN READ WRITE;
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='15s';
-- SQL498: retain current/previous completed ranking runs and all live references.
-- Historical ranking_runs metadata is preserved; no CASCADE and no current raw JSON rewrite.
CREATE OR REPLACE FUNCTION private.kinojo_ranking_entries_cleanup_v498(p_limit integer DEFAULT 20000,p_dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $cleanup$
DECLARE v_count integer; v_limit integer:=greatest(1,least(coalesce(p_limit,20000),20000));
BEGIN
 IF NOT pg_try_advisory_xact_lock(498,1) THEN
  RETURN jsonb_build_object('ok',false,'code','RANKING_RETENTION_BUSY');
 END IF;
 -- Protect all sources of the keep set until the transaction commits.
 BEGIN
  LOCK TABLE public.ranking_runs,public.ranking_entries,public.hall_of_fame_current,public.mvp_candidates_current IN SHARE ROW EXCLUSIVE MODE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN
  RETURN jsonb_build_object('ok',false,'code','RANKING_RETENTION_BUSY');
 END;
 WITH keep AS MATERIALIZED (
  SELECT run_id FROM (SELECT run_id FROM public.ranking_runs WHERE status='completed' ORDER BY created_at DESC,id DESC LIMIT 2) latest
  UNION SELECT run_id FROM public.ranking_runs WHERE status IS DISTINCT FROM 'completed'
  UNION SELECT run_id FROM public.hall_of_fame_current WHERE run_id IS NOT NULL
  UNION SELECT run_id FROM public.mvp_candidates_current WHERE run_id IS NOT NULL
 ), candidates AS MATERIALIZED (
  SELECT e.id FROM public.ranking_entries e
  JOIN public.ranking_runs r ON r.run_id=e.run_id AND r.status='completed'
  WHERE NOT EXISTS (SELECT 1 FROM keep k WHERE k.run_id=e.run_id)
  ORDER BY e.id LIMIT v_limit
 ), removed AS (
  DELETE FROM public.ranking_entries e USING candidates c
  WHERE e.id=c.id AND NOT coalesce(p_dry_run,true) RETURNING e.id
 )
 SELECT CASE WHEN coalesce(p_dry_run,true) THEN (SELECT count(*) FROM candidates) ELSE (SELECT count(*) FROM removed) END INTO v_count;
 RETURN jsonb_build_object('ok',true,'dryRun',coalesce(p_dry_run,true),'count',v_count,'batchLimit',v_limit);
END;
$cleanup$;
REVOKE ALL ON FUNCTION private.kinojo_ranking_entries_cleanup_v498(integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.kinojo_ranking_entries_cleanup_v498(integer,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.kinojo_rebuild_ranking(p_session_id text DEFAULT NULL::text, p_session_token text DEFAULT NULL::text, p_limit integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_valid jsonb;
  v_run_id text := 'rank_' || replace(gen_random_uuid()::text, '-', '');
  v_date int := to_char(now() at time zone 'Asia/Seoul', 'YYMMDD')::int;
  v_limit int := greatest(1, least(coalesce(p_limit, 300), 1000));
  v_total int := 0;
  v_hof_count int := 0;
  v_mvp_count int := 0;
begin
  if not pg_try_advisory_xact_lock(498,1) then
    return jsonb_build_object('ok',false,'code','RANKING_RETENTION_BUSY');
  end if;
  if p_session_id is not null then
    v_valid := public.kinojo_validate_updater_session(p_session_id, p_session_token);
    if coalesce((v_valid ->> 'ok')::boolean, false) is not true then
      return v_valid;
    end if;

    update public.updater_lock_state
       set status = 'running',
           stage = 'RANKING_REBUILD',
           message = '랭킹/명예의 전당 계산 중',
           last_heartbeat_at = now(),
           expires_at = now() + interval '5 minutes'
     where id = 'global';

    update public.updater_sessions
       set status = 'running',
           stage = 'RANKING_REBUILD',
           message = '랭킹/명예의 전당 계산 중',
           last_heartbeat_at = now(),
           expires_at = now() + interval '5 minutes'
     where session_id = p_session_id;
  end if;

  insert into public.ranking_runs (
    run_id,
    session_id,
    ranking_date,
    server_id,
    server_name,
    run_type,
    status,
    message
  ) values (
    v_run_id,
    p_session_id,
    v_date,
    2002,
    '지켈',
    case when p_session_id is null then 'FULL' else 'SESSION' end,
    'running',
    '랭킹 계산 시작'
  );

  with latest_reviews as (
    select distinct on (h.character_master_id)
      gr.*, h.character_master_id
    from public.growth_reviews gr
    join public.character_history h on h.id=gr.current_history_id
    left join public.character_history ph on ph.id=gr.previous_history_id
    where h.character_master_id is not null
      and (gr.previous_history_id is null or ph.character_master_id=h.character_master_id)
      and (p_session_id is null or gr.session_id = p_session_id)
    order by h.character_master_id, gr.created_at desc, gr.id desc
  ), ranking_source_raw as (
    select
      coalesce(cm.server_id, 2002) as server_id,
      coalesce(cm.server_name, '지켈') as server_name,
      public.kinojo_hof_clean_character_name(cm.character_name) as character_name,
      coalesce(public.kinojo_hof_clean_character_name(cm.main_character_name), public.kinojo_hof_clean_character_name(cm.character_name)) as main_character_name,
      (public.kinojo_hof_clean_character_name(cm.character_name) = coalesce(public.kinojo_hof_clean_character_name(cm.main_character_name), public.kinojo_hof_clean_character_name(cm.character_name))) as is_main,
      cm.class_name,
      cm.profile_image_url,
      cm.detail_url,
      cm.latest_power_total as power_total,
      cm.latest_item_level_total as item_level_total,
      lr.power_delta,
      lr.item_level_delta,
      lr.growth_status,
      lr.growth_label,
      lr.review_text,
      cm.latest_payload_id,
      lr.current_history_id as latest_history_id,
      lr.id as growth_review_id,
      to_jsonb(cm) || jsonb_build_object('growthReview', coalesce(to_jsonb(lr), '{}'::jsonb)) as raw_data
    from public.character_master cm
    left join latest_reviews lr
      on lr.character_master_id = cm.id
    where public.kinojo_hof_clean_character_name(cm.character_name) is not null
      and coalesce(cm.status, 'OK') <> 'DELETED'
      and (p_session_id is null or cm.latest_session_id = p_session_id)
  ), ranking_source as (
    select distinct on (server_id, character_name) *
    from ranking_source_raw
    order by server_id, character_name, is_main desc, power_total desc nulls last, item_level_total desc nulls last
  ), ranked as (
    select
      row_number() over (order by power_total desc nulls last, is_main desc, character_name asc)::int as rank_no,
      count(*) over ()::int as rank_total,
      public.kinojo_rank_tier_for_count(row_number() over (order by power_total desc nulls last, is_main desc, character_name asc)::int, count(*) over ()::int) as rank_tier,
      *
    from ranking_source
    where power_total is not null
  )
  insert into public.ranking_entries (
    run_id,
    session_id,
    ranking_date,
    server_id,
    server_name,
    rank_scope,
    rank_no,
    rank_total,
    rank_tier,
    character_name,
    main_character_name,
    is_main,
    class_name,
    profile_image_url,
    detail_url,
    power_total,
    item_level_total,
    power_delta,
    item_level_delta,
    growth_status,
    growth_label,
    review_text,
    latest_payload_id,
    latest_history_id,
    growth_review_id,
    raw_data
  )
  select
    v_run_id,
    p_session_id,
    v_date,
    server_id,
    server_name,
    'OVERALL',
    rank_no,
    rank_total,
    rank_tier,
    character_name,
    main_character_name,
    is_main,
    class_name,
    profile_image_url,
    detail_url,
    power_total,
    item_level_total,
    power_delta,
    item_level_delta,
    growth_status,
    growth_label,
    review_text,
    latest_payload_id,
    latest_history_id,
    growth_review_id,
    raw_data
  from ranked
  where rank_no <= v_limit;

  -- Server-first ranking materialization.
  -- 034 is the single source of truth for ranking/order/tier.
  -- GitHub must only render these rows and must not recalculate sort/rank/emblem.
  with latest_reviews as (
    select distinct on (h.character_master_id)
      gr.*, h.character_master_id
    from public.growth_reviews gr
    join public.character_history h on h.id=gr.current_history_id
    left join public.character_history ph on ph.id=gr.previous_history_id
    where h.character_master_id is not null
      and (gr.previous_history_id is null or ph.character_master_id=h.character_master_id)
      and (p_session_id is null or gr.session_id = p_session_id)
    order by h.character_master_id, gr.created_at desc, gr.id desc
  ), base_raw as (
    select
      coalesce(cm.server_id, 2002) as server_id,
      coalesce(cm.server_name, '지켈') as server_name,
      public.kinojo_hof_clean_character_name(cm.character_name) as character_name,
      coalesce(public.kinojo_hof_clean_character_name(cm.main_character_name), public.kinojo_hof_clean_character_name(cm.character_name)) as main_character_name,
      coalesce(cm.is_main, public.kinojo_hof_clean_character_name(cm.character_name) = coalesce(public.kinojo_hof_clean_character_name(cm.main_character_name), public.kinojo_hof_clean_character_name(cm.character_name)), false) as is_main,
      cm.class_name,
      cm.profile_image_url,
      cm.detail_url,
      cm.latest_pve_combat_power::int as pve_power,
      cm.latest_pve_item_level::int as pve_item,
      cm.latest_pvp_combat_power::int as pvp_power,
      cm.latest_pvp_item_level::int as pvp_item,
      cm.latest_power_total::int as total_power,
      cm.latest_item_level_total::int as total_item,
      lr.power_delta,
      lr.item_level_delta,
      lr.growth_status,
      lr.growth_label,
      lr.review_text,
      cm.latest_payload_id,
      lr.current_history_id as latest_history_id,
      lr.id as growth_review_id,
      to_jsonb(cm) || jsonb_build_object('growthReview', coalesce(to_jsonb(lr), '{}'::jsonb)) as raw_data
    from public.character_master cm
    left join latest_reviews lr
      on lr.character_master_id = cm.id
    where public.kinojo_hof_clean_character_name(cm.character_name) is not null
      and coalesce(cm.status, 'OK') <> 'DELETED'
      and (p_session_id is null or cm.latest_session_id = p_session_id)
  ), base as (
    select distinct on (server_id, character_name) *
    from base_raw
    order by server_id, character_name, is_main desc, total_power desc nulls last
  ), expanded as (
    select 'PVE_POWER'::text as ranking_type, false::boolean as include_subs, null::text as rank_class, pve_power as ranking_power, pve_item as ranking_item, * from base where is_main is true and pve_power is not null
    union all
    select 'PVP_POWER'::text as ranking_type, false::boolean as include_subs, null::text as rank_class, pvp_power as ranking_power, pvp_item as ranking_item, * from base where is_main is true and pvp_power is not null
    union all
    select 'PVE_POWER'::text as ranking_type, true::boolean as include_subs, null::text as rank_class, pve_power as ranking_power, pve_item as ranking_item, * from base where pve_power is not null
    union all
    select 'PVP_POWER'::text as ranking_type, true::boolean as include_subs, null::text as rank_class, pvp_power as ranking_power, pvp_item as ranking_item, * from base where pvp_power is not null
    union all
    select 'PVE_POWER'::text as ranking_type, false::boolean as include_subs, coalesce(class_name,'직업 미확인')::text as rank_class, pve_power as ranking_power, pve_item as ranking_item, * from base where is_main is true and pve_power is not null
    union all
    select 'PVP_POWER'::text as ranking_type, false::boolean as include_subs, coalesce(class_name,'직업 미확인')::text as rank_class, pvp_power as ranking_power, pvp_item as ranking_item, * from base where is_main is true and pvp_power is not null
    union all
    select 'PVE_POWER'::text as ranking_type, true::boolean as include_subs, coalesce(class_name,'직업 미확인')::text as rank_class, pve_power as ranking_power, pve_item as ranking_item, * from base where pve_power is not null
    union all
    select 'PVP_POWER'::text as ranking_type, true::boolean as include_subs, coalesce(class_name,'직업 미확인')::text as rank_class, pvp_power as ranking_power, pvp_item as ranking_item, * from base where pvp_power is not null
  ), ranked_server as (
    select
      row_number() over (partition by ranking_type, include_subs, rank_class order by ranking_power desc nulls last, ranking_item desc nulls last, character_name asc)::int as rank_no,
      count(*) over (partition by ranking_type, include_subs, rank_class)::int as rank_total,
      *
    from expanded
  )
  insert into public.ranking_entries (
    run_id, session_id, ranking_date, server_id, server_name, rank_scope, rank_no, rank_total, rank_tier,
    ranking_type, include_subs, rank_class,
    character_name, main_character_name, is_main, class_name, profile_image_url, detail_url,
    power_total, item_level_total, power_delta, item_level_delta, growth_status, growth_label, review_text,
    latest_payload_id, latest_history_id, growth_review_id, raw_data
  )
  select
    v_run_id, p_session_id, v_date, server_id, server_name,
    ranking_type || case when include_subs then '_ALL' else '_MAIN' end || coalesce('_CLASS_' || rank_class, '') as rank_scope,
    rank_no, rank_total, public.kinojo_rank_tier_for_count(rank_no, rank_total),
    ranking_type, include_subs, rank_class,
    character_name, main_character_name, is_main, class_name, profile_image_url, detail_url,
    ranking_power, ranking_item, power_delta, item_level_delta, growth_status, growth_label, review_text,
    latest_payload_id, latest_history_id, growth_review_id,
    raw_data || jsonb_build_object('rankingType', ranking_type, 'includeSubs', include_subs, 'rankClass', rank_class, 'pvePower', pve_power, 'pvpPower', pvp_power, 'pveItemLevel', pve_item, 'pvpItemLevel', pvp_item)
  from ranked_server
  where rank_no <= v_limit;

  select count(*) into v_total
  from public.ranking_entries
  where run_id = v_run_id;


  -- Rebuild current hall across all servers for the latest run.
  -- Do not restrict to the main server; otherwise 타서버 rows from a previous run remain and hit uq_hof_current_scope_character.
  delete from public.hall_of_fame_current where hall_scope = 'OVERALL';

  insert into public.hall_of_fame_current (
    ranking_date,
    server_id,
    server_name,
    hall_scope,
    rank_no,
    rank_total,
    rank_tier,
    character_name,
    main_character_name,
    is_main,
    class_name,
    profile_image_url,
    detail_url,
    power_total,
    item_level_total,
    power_delta,
    growth_status,
    growth_label,
    review_text,
    run_id,
    session_id
  )
  select
    ranking_date,
    server_id,
    server_name,
    'OVERALL',
    main_rank_no,
    main_rank_total,
    public.kinojo_rank_tier_for_count(main_rank_no, main_rank_total),
    character_name,
    main_character_name,
    is_main,
    class_name,
    profile_image_url,
    detail_url,
    power_total,
    item_level_total,
    power_delta,
    growth_status,
    growth_label,
    review_text,
    run_id,
    session_id
  from (
    select
      re.*,
      row_number() over (order by power_total desc nulls last, character_name asc)::int as main_rank_no,
      count(*) over ()::int as main_rank_total
    from public.ranking_entries re
    where run_id = v_run_id
      and rank_scope = 'OVERALL'
      and coalesce(is_main, false) is true
  ) main_ranked
  where main_rank_no <= 100
  order by main_rank_no;

  get diagnostics v_hof_count = row_count;

  -- Rebuild current MVP candidates across all servers for the latest run.
  delete from public.mvp_candidates_current where candidate_scope = 'GROWTH';

  insert into public.mvp_candidates_current (
    ranking_date,
    server_id,
    candidate_scope,
    rank_no,
    rank_total,
    rank_tier,
    character_name,
    main_character_name,
    class_name,
    profile_image_url,
    power_total,
    power_delta,
    item_level_delta,
    growth_status,
    growth_label,
    review_text,
    run_id,
    session_id
  )
  select
    ranking_date,
    server_id,
    'GROWTH',
    mvp_rank_no,
    mvp_rank_total,
    public.kinojo_rank_tier_for_count(mvp_rank_no, mvp_rank_total),
    character_name,
    main_character_name,
    class_name,
    profile_image_url,
    power_total,
    power_delta,
    item_level_delta,
    growth_status,
    growth_label,
    review_text,
    run_id,
    session_id
  from (
    select
      re.*,
      row_number() over (order by power_delta desc nulls last, power_total desc nulls last, character_name asc)::int as mvp_rank_no,
      count(*) over ()::int as mvp_rank_total
    from public.ranking_entries re
    where run_id = v_run_id
      and rank_scope = 'OVERALL'
      and coalesce(is_main, false) is true
      and coalesce(power_delta, 0) > 0
  ) mvp_ranked
  where mvp_rank_no <= 20
  order by mvp_rank_no;

  get diagnostics v_mvp_count = row_count;

  update public.ranking_runs
     set status = 'completed',
         total_count = v_total,
         message = '랭킹 계산 완료: ' || v_total || '건, 명예의 전당 ' || v_hof_count || '건, MVP 후보 ' || v_mvp_count || '건'
   where run_id = v_run_id;

  if p_session_id is not null then
    update public.updater_lock_state
       set status = 'running',
           stage = 'RANKING_DONE',
           message = '랭킹/명예의 전당 계산 완료',
           progress_current = greatest(progress_current, progress_total),
           last_heartbeat_at = now(),
           expires_at = now() + interval '5 minutes'
     where id = 'global';

    update public.updater_sessions
       set status = 'running',
           stage = 'RANKING_DONE',
           message = '랭킹/명예의 전당 계산 완료',
           progress_current = greatest(progress_current, progress_total),
           last_heartbeat_at = now(),
           expires_at = now() + interval '5 minutes'
     where session_id = p_session_id;
  end if;

  -- Once publication succeeds, replace past copies within the same transaction.
  -- A busy external writer delays cleanup; it does not fail the newly computed ranking.
  perform private.kinojo_ranking_entries_cleanup_v498(20000,false);

  return jsonb_build_object(
    'ok', true,
    'runId', v_run_id,
    'sessionId', p_session_id,
    'rankingDate', v_date,
    'rankingCount', v_total,
    'hallOfFameCount', v_hof_count,
    'mvpCandidateCount', v_mvp_count,
    'status', public.kinojo_updater_get_status()
  );
exception when others then
  update public.ranking_runs
     set status = 'failed',
         message = sqlerrm
   where run_id = v_run_id;
  return jsonb_build_object('ok', false, 'code', 'RANKING_REBUILD_EXCEPTION', 'message', sqlerrm, 'runId', v_run_id);
end;
$function$;

COMMIT;
