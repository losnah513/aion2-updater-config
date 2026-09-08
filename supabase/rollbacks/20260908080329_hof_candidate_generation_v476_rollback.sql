-- Restores prior definitions only; does not delete or rewrite snapshots.
BEGIN;
SET LOCAL lock_timeout = '2s';
CREATE OR REPLACE FUNCTION private.kinojo_ranking_snapshot_scope_payload_v426(p_include_subs boolean, p_include_all_legions boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with params as (
    select
      coalesce(p_include_subs, false)::boolean as include_subs,
      coalesce(p_include_all_legions, false)::boolean as include_all_legions
  ),
  source_all as (
    select
      s.server_id,
      s.server_name,
      s.character_name,
      s.main_character_name,
      s.is_main,
      s.class_name,
      s.profile_image_url,
      s.detail_url,
      s.legion_name,
      s.ranking_legion_name,
      s.ranking_owner_character_id,
      s.ranking_owner_character_name,
      s.latest_pve_combat_power as pve_power_total,
      s.latest_pve_item_level as pve_item_level,
      s.latest_pvp_combat_power as pvp_power_total,
      s.latest_pvp_item_level as pvp_item_level,
      s.latest_power_total as power_total,
      s.latest_item_level_total as item_level_total,
      s.last_synced_at as updated_at
    from public.v_kinojo_ranking_character_scope_v296 s, params p
    where (p.include_subs is true or s.is_main is true)
      and (p.include_all_legions is true or s.is_default_ranking_legion is true)
  ),
  history_state as (
    select hs.*
    from private.kinojo_ranking_history_state_v426 hs
    join source_all s
      on s.server_id = hs.server_id
     and s.character_name = hs.character_name
  ),
  previous_pivot as (
    select
      hs.server_id,
      hs.character_name,
      max(hs.previous_history_date) filter (where hs.gear_type = 'PVE') as previous_pve_date,
      max(hs.previous_power) filter (where hs.gear_type = 'PVE') as previous_pve_power,
      max(hs.previous_item_level) filter (where hs.gear_type = 'PVE') as previous_pve_item,
      max(hs.previous_history_date) filter (where hs.gear_type = 'PVP') as previous_pvp_date,
      max(hs.previous_power) filter (where hs.gear_type = 'PVP') as previous_pvp_power,
      max(hs.previous_item_level) filter (where hs.gear_type = 'PVP') as previous_pvp_item
    from history_state hs
    group by hs.server_id, hs.character_name
  ),
  review_pivot as (
    select
      rr.server_id,
      rr.character_name,
      max(rr.growth_label) filter (where rr.review_mode = 'PVE') as pve_growth_label,
      max(rr.growth_status) filter (where rr.review_mode = 'PVE') as pve_growth_status,
      max(rr.review_text) filter (where rr.review_mode = 'PVE') as pve_review_text,
      max(rr.growth_label) filter (where rr.review_mode = 'PVP') as pvp_growth_label,
      max(rr.growth_status) filter (where rr.review_mode = 'PVP') as pvp_growth_status,
      max(rr.review_text) filter (where rr.review_mode = 'PVP') as pvp_review_text,
      max(rr.source_updated_at) as review_updated_at
    from private.kinojo_ranking_review_state_v426 rr
    group by rr.server_id, rr.character_name
  ),
  reactions as (
    select
      rs.character_name,
      coalesce(rs.like_count, 0)::integer as like_count,
      coalesce(rs.dislike_count, 0)::integer as dislike_count,
      coalesce(rs.total_count, 0)::integer as reaction_total,
      rs.comments
    from public.v_reaction_summary rs
  ),
  class_scoped as (
    select
      s.*,
      coalesce(r.like_count, 0)::integer as like_count,
      coalesce(r.dislike_count, 0)::integer as dislike_count,
      coalesce(r.reaction_total, 0)::integer as reaction_total,
      coalesce(r.comments, array[]::text[]) as reaction_comments,
      rp.pve_growth_label, rp.pve_growth_status, rp.pve_review_text,
      rp.pvp_growth_label, rp.pvp_growth_status, rp.pvp_review_text,
      rp.review_updated_at,
      pp.previous_pve_date, pp.previous_pve_power, pp.previous_pve_item,
      pp.previous_pvp_date, pp.previous_pvp_power, pp.previous_pvp_item
    from source_all s
    left join reactions r on r.character_name = s.character_name
    left join review_pivot rp
      on rp.server_id = s.server_id and rp.character_name = s.character_name
    left join previous_pivot pp
      on pp.server_id = s.server_id and pp.character_name = s.character_name
  ),
  previous_pve_ranked as (
    select
      row_number() over (
        order by cs.previous_pve_power desc nulls last,
                 cs.is_main desc, cs.character_name asc
      )::integer as previous_rank_no,
      cs.server_id, cs.character_name
    from class_scoped cs
    where coalesce(cs.previous_pve_power, 0) > 0
  ),
  previous_pvp_ranked as (
    select
      row_number() over (
        order by cs.previous_pvp_power desc nulls last,
                 cs.is_main desc, cs.character_name asc
      )::integer as previous_rank_no,
      cs.server_id, cs.character_name
    from class_scoped cs
    where coalesce(cs.previous_pvp_power, 0) > 0
  ),
  pve_ranked as (
    select
      row_number() over (
        order by cs.pve_power_total desc nulls last,
                 cs.is_main desc, cs.character_name asc
      )::integer as rank_no,
      'PVE'::text as rank_mode,
      coalesce(cs.pve_power_total, 0) as rank_power,
      count(*) over ()::integer as rank_total,
      cs.*,
      ppr.previous_rank_no,
      case
        when ppr.previous_rank_no is null then null
        else ppr.previous_rank_no - row_number() over (
          order by cs.pve_power_total desc nulls last,
                   cs.is_main desc, cs.character_name asc
        )::integer
      end as rank_change,
      case
        when ppr.previous_rank_no is null then 'NEW'
        when ppr.previous_rank_no - row_number() over (
          order by cs.pve_power_total desc nulls last,
                   cs.is_main desc, cs.character_name asc
        )::integer > 0 then 'UP'
        when ppr.previous_rank_no - row_number() over (
          order by cs.pve_power_total desc nulls last,
                   cs.is_main desc, cs.character_name asc
        )::integer < 0 then 'DOWN'
        else 'SAME'
      end as rank_change_status,
      cs.previous_pve_date as rank_baseline_date,
      case when cs.previous_pve_power is null then null
           else cs.pve_power_total - cs.previous_pve_power end as rank_power_delta,
      case when cs.previous_pve_item is null then null
           else cs.pve_item_level - cs.previous_pve_item end as rank_item_level_delta,
      cs.pve_growth_label as rank_growth_label,
      cs.pve_growth_status as rank_growth_status,
      cs.pve_review_text as rank_review_text
    from class_scoped cs
    left join previous_pve_ranked ppr
      on ppr.server_id = cs.server_id and ppr.character_name = cs.character_name
    where coalesce(cs.pve_power_total, 0) > 0
  ),
  pvp_ranked as (
    select
      row_number() over (
        order by cs.pvp_power_total desc nulls last,
                 cs.is_main desc, cs.character_name asc
      )::integer as rank_no,
      'PVP'::text as rank_mode,
      coalesce(cs.pvp_power_total, 0) as rank_power,
      count(*) over ()::integer as rank_total,
      cs.*,
      ppr.previous_rank_no,
      case
        when ppr.previous_rank_no is null then null
        else ppr.previous_rank_no - row_number() over (
          order by cs.pvp_power_total desc nulls last,
                   cs.is_main desc, cs.character_name asc
        )::integer
      end as rank_change,
      case
        when ppr.previous_rank_no is null then 'NEW'
        when ppr.previous_rank_no - row_number() over (
          order by cs.pvp_power_total desc nulls last,
                   cs.is_main desc, cs.character_name asc
        )::integer > 0 then 'UP'
        when ppr.previous_rank_no - row_number() over (
          order by cs.pvp_power_total desc nulls last,
                   cs.is_main desc, cs.character_name asc
        )::integer < 0 then 'DOWN'
        else 'SAME'
      end as rank_change_status,
      cs.previous_pvp_date as rank_baseline_date,
      case when cs.previous_pvp_power is null then null
           else cs.pvp_power_total - cs.previous_pvp_power end as rank_power_delta,
      case when cs.previous_pvp_item is null then null
           else cs.pvp_item_level - cs.previous_pvp_item end as rank_item_level_delta,
      cs.pvp_growth_label as rank_growth_label,
      cs.pvp_growth_status as rank_growth_status,
      cs.pvp_review_text as rank_review_text
    from class_scoped cs
    left join previous_pvp_ranked ppr
      on ppr.server_id = cs.server_id and ppr.character_name = cs.character_name
    where coalesce(cs.pvp_power_total, 0) > 0
  ),
  class_counts as (
    select coalesce(jsonb_object_agg(class_name, cnt order by class_name), '{}'::jsonb) counts
    from (
      select coalesce(nullif(s.class_name, ''), '직업 미확인') class_name,
             count(*)::integer cnt
      from source_all s
      group by coalesce(nullif(s.class_name, ''), '직업 미확인')
    ) c
  )
  select jsonb_build_object(
    'ok', true,
    'source', 'snapshot_390_candidate',
    'comparisonRule', 'PREVIOUS_LOOKUP_DAY_LAST_SUCCESS',
    'page', 1,
    'pageSize', greatest(
      (select count(*)::integer from pve_ranked),
      (select count(*)::integer from pvp_ranked),
      1
    ),
    'includeSubs', (select include_subs from params),
    'includeAllLegions', (select include_all_legions from params),
    'defaultLegions', jsonb_build_array('깡','낮','밤','키나노동조합'),
    'className', '전체',
    'search', '',
    'classCounts', (select counts from class_counts),
    'pveTotalCount', (select count(*)::integer from pve_ranked),
    'pvpTotalCount', (select count(*)::integer from pvp_ranked),
    'pveItems', coalesce(
      (select jsonb_agg(to_jsonb(x) order by x.rank_no) from pve_ranked x),
      '[]'::jsonb
    ),
    'pvpItems', coalesce(
      (select jsonb_agg(to_jsonb(x) order by x.rank_no) from pvp_ranked x),
      '[]'::jsonb
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION private.kinojo_ranking_snapshot_build_step_v390(p_snapshot_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private', 'public'
 SET statement_timeout TO '40s'
 SET lock_timeout TO '2s'
AS $function$
declare
  v_snapshot private.kinojo_ranking_snapshots_v390%rowtype;
  v_scope_index smallint;
  v_include_subs boolean;
  v_include_all_legions boolean;
  v_ranking jsonb;
  v_hof jsonb;
  v_started timestamptz;
  v_duration_ms integer;
  v_pve_count integer;
  v_pvp_count integer;
  v_owner_count integer;
  v_owner_counts jsonb;
  v_state text;
  v_message text;
begin
  if pg_try_advisory_xact_lock(hashtext('kinojo_ranking_snapshot_build_v390')::bigint) is not true then
    return jsonb_build_object('ok', false, 'code', 'SNAPSHOT_BUILD_BUSY');
  end if;

  select * into v_snapshot
  from private.kinojo_ranking_snapshots_v390
  where snapshot_id = p_snapshot_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'SNAPSHOT_NOT_FOUND');
  end if;
  if v_snapshot.status <> 'BUILDING' then
    return jsonb_build_object(
      'ok', false, 'code', 'SNAPSHOT_NOT_BUILDING',
      'snapshotId', p_snapshot_id, 'status', v_snapshot.status
    );
  end if;
  if v_snapshot.next_scope >= 4 then
    return jsonb_build_object(
      'ok', true, 'code', 'SNAPSHOT_SCOPES_COMPLETE',
      'snapshotId', p_snapshot_id, 'nextAction', 'VALIDATE'
    );
  end if;

  v_scope_index := v_snapshot.next_scope;
  v_include_subs := v_scope_index in (2, 3);
  v_include_all_legions := v_scope_index in (1, 3);
  v_started := clock_timestamp();

  begin
    v_ranking := private.kinojo_ranking_snapshot_scope_payload_v426(
      v_include_subs, v_include_all_legions
    );
    v_hof := public.kinojo_web_get_hof_display_v296(
      v_include_subs, v_include_all_legions, null
    );

    if coalesce((v_ranking ->> 'ok')::boolean, false) is not true then
      raise exception using errcode = 'P0001', message = 'SNAPSHOT_RANKING_PAYLOAD_FAILED';
    end if;
    if coalesce((v_hof ->> 'ok')::boolean, false) is not true then
      raise exception using errcode = 'P0001', message = 'SNAPSHOT_HOF_PAYLOAD_FAILED';
    end if;

    v_pve_count := jsonb_array_length(coalesce(v_ranking -> 'pveItems', '[]'::jsonb));
    v_pvp_count := jsonb_array_length(coalesce(v_ranking -> 'pvpItems', '[]'::jsonb));

    delete from private.kinojo_ranking_snapshot_scopes_v390
    where snapshot_id = p_snapshot_id
      and include_subs = v_include_subs
      and include_all_legions = v_include_all_legions;

    insert into private.kinojo_ranking_snapshot_scopes_v390(
      snapshot_id, include_subs, include_all_legions,
      ranking_payload, hof_payload, pve_count, pvp_count,
      ranking_md5, hof_md5, duration_ms
    ) values (
      p_snapshot_id, v_include_subs, v_include_all_legions,
      v_ranking, v_hof, v_pve_count, v_pvp_count,
      md5(v_ranking::text), md5(v_hof::text), 0
    );

    insert into private.kinojo_ranking_snapshot_items_v390(
      snapshot_id, include_subs, include_all_legions,
      rank_mode, rank_no, server_id, character_name, class_name,
      ranking_owner_character_id, ranking_owner_name_key, search_text, item
    )
    select
      p_snapshot_id, v_include_subs, v_include_all_legions,
      src.rank_mode,
      (src.item ->> 'rank_no')::integer,
      nullif(src.item ->> 'server_id', '')::bigint,
      coalesce(src.item ->> 'character_name', ''),
      nullif(src.item ->> 'class_name', ''),
      nullif(src.item ->> 'ranking_owner_character_id', '')::bigint,
      coalesce(public.kinojo_normalize_character_name(
        src.item ->> 'ranking_owner_character_name'
      ), ''),
      lower(
        coalesce(src.item ->> 'character_name', '') || ' ' ||
        coalesce(src.item ->> 'main_character_name', '') || ' ' ||
        coalesce(src.item ->> 'server_name', '') || ' ' ||
        coalesce(src.item ->> 'class_name', '') || ' ' ||
        coalesce(src.item ->> 'legion_name', '') || ' ' ||
        coalesce(src.item ->> 'ranking_legion_name', '')
      ),
      src.item
    from (
      select 'PVE'::text rank_mode, value item
      from jsonb_array_elements(v_ranking -> 'pveItems')
      union all
      select 'PVP'::text rank_mode, value item
      from jsonb_array_elements(v_ranking -> 'pvpItems')
    ) src;

    insert into private.kinojo_ranking_snapshot_owner_metrics_v390(
      snapshot_id, include_subs, include_all_legions,
      owner_name_key, owner_display_name, metric, rank_no, score, row_data
    )
    select
      p_snapshot_id, v_include_subs, v_include_all_legions,
      o.owner_name_key, o.owner_display_name,
      o.metric, o.rank_no, o.score, o.row_data
    from private.kinojo_ranking_snapshot_owner_rows_v390(
      v_include_subs, v_include_all_legions
    ) o;

    select coalesce(sum(coalesce(counts.metric_count, 0)), 0)::integer,
           jsonb_object_agg(metrics.metric, coalesce(counts.metric_count, 0) order by metrics.metric)
    into v_owner_count, v_owner_counts
    from (
      values
        ('enhance'::text),
        ('pve'::text),
        ('pvp'::text),
        ('like'::text),
        ('dislike'::text),
        ('growth'::text)
    ) metrics(metric)
    left join (
      select metric, count(*)::integer metric_count
      from private.kinojo_ranking_snapshot_owner_metrics_v390
      where snapshot_id = p_snapshot_id
        and include_subs = v_include_subs
        and include_all_legions = v_include_all_legions
      group by metric
    ) counts using (metric);

    v_duration_ms := greatest(
      0,
      round(extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer
    );

    update private.kinojo_ranking_snapshot_scopes_v390
    set owner_metric_count = coalesce(v_owner_count, 0),
        owner_metric_counts = coalesce(v_owner_counts, '{}'::jsonb),
        duration_ms = v_duration_ms,
        built_at = pg_catalog.statement_timestamp()
    where snapshot_id = p_snapshot_id
      and include_subs = v_include_subs
      and include_all_legions = v_include_all_legions;

    update private.kinojo_ranking_snapshots_v390
    set next_scope = v_scope_index + 1,
        attempt_count = attempt_count + 1,
        build_completed_at = case when v_scope_index = 3
          then pg_catalog.statement_timestamp() else build_completed_at end,
        updated_at = pg_catalog.statement_timestamp(),
        last_error_code = null,
        last_error_message = null,
        build_stats = jsonb_set(
          build_stats,
          array[format('scope_%s', v_scope_index)],
          jsonb_build_object(
            'includeSubs', v_include_subs,
            'includeAllLegions', v_include_all_legions,
            'pveCount', v_pve_count,
            'pvpCount', v_pvp_count,
            'ownerMetricCount', coalesce(v_owner_count, 0),
            'durationMs', v_duration_ms
          ),
          true
        )
    where snapshot_id = p_snapshot_id;

    return jsonb_build_object(
      'ok', true,
      'snapshotId', p_snapshot_id,
      'scopeIndex', v_scope_index,
      'includeSubs', v_include_subs,
      'includeAllLegions', v_include_all_legions,
      'pveCount', v_pve_count,
      'pvpCount', v_pvp_count,
      'ownerMetricCount', coalesce(v_owner_count, 0),
      'durationMs', v_duration_ms,
      'nextScope', v_scope_index + 1,
      'nextAction', case when v_scope_index = 3 then 'VALIDATE' else 'BUILD_SCOPE' end
    );
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
    update private.kinojo_ranking_snapshots_v390
    set attempt_count = attempt_count + 1,
        updated_at = pg_catalog.statement_timestamp(),
        last_error_code = v_state,
        last_error_message = left(v_message, 1000)
    where snapshot_id = p_snapshot_id;
    return jsonb_build_object(
      'ok', false,
      'code', 'SNAPSHOT_SCOPE_BUILD_FAILED',
      'sqlstate', v_state,
      'message', v_message,
      'snapshotId', p_snapshot_id,
      'scopeIndex', v_scope_index
    );
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.kinojo_ranking_snapshot_validate_v390(p_snapshot_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private', 'public'
 SET statement_timeout TO '15s'
 SET lock_timeout TO '2s'
AS $function$
declare
  v_snapshot private.kinojo_ranking_snapshots_v390%rowtype;
  v_errors text[] := array[]::text[];
  v_scope_count integer;
  v_item_mismatch integer;
  v_duplicate_identity integer;
  v_rank_gap integer;
  v_bad_payload integer;
  v_bad_metrics integer;
  v_report jsonb;
begin
  if pg_try_advisory_xact_lock(hashtext('kinojo_ranking_snapshot_build_v390')::bigint) is not true then
    return jsonb_build_object('ok', false, 'code', 'SNAPSHOT_BUILD_BUSY');
  end if;

  select * into v_snapshot
  from private.kinojo_ranking_snapshots_v390
  where snapshot_id = p_snapshot_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'SNAPSHOT_NOT_FOUND');
  end if;
  if v_snapshot.status <> 'BUILDING' then
    return jsonb_build_object(
      'ok', false, 'code', 'SNAPSHOT_NOT_BUILDING',
      'snapshotId', p_snapshot_id, 'status', v_snapshot.status
    );
  end if;
  if v_snapshot.next_scope <> 4 then
    v_errors := array_append(v_errors, 'SCOPE_BUILD_INCOMPLETE');
  end if;

  select count(*)::integer into v_scope_count
  from private.kinojo_ranking_snapshot_scopes_v390
  where snapshot_id = p_snapshot_id;
  if v_scope_count <> 4 then
    v_errors := array_append(v_errors, 'SCOPE_COUNT_INVALID');
  end if;

  select count(*)::integer into v_bad_payload
  from private.kinojo_ranking_snapshot_scopes_v390 s
  where s.snapshot_id = p_snapshot_id
    and (
      coalesce((s.ranking_payload ->> 'ok')::boolean, false) is not true
      or coalesce((s.hof_payload ->> 'ok')::boolean, false) is not true
      or jsonb_typeof(s.ranking_payload -> 'pveItems') <> 'array'
      or jsonb_typeof(s.ranking_payload -> 'pvpItems') <> 'array'
      or jsonb_typeof(s.hof_payload -> 'summarySections') <> 'object'
      or not (s.hof_payload ? 'pveTop')
      or not (s.hof_payload ? 'pvpTop')
      or not (s.hof_payload ? 'weeklyAwards')
      or not (s.hof_payload ? 'rankingPeriod')
      or coalesce((s.ranking_payload ->> 'includeSubs')::boolean, false) <> s.include_subs
      or coalesce((s.ranking_payload ->> 'includeAllLegions')::boolean, false) <> s.include_all_legions
      or coalesce((s.hof_payload ->> 'includeSubs')::boolean, false) <> s.include_subs
      or coalesce((s.hof_payload ->> 'includeAllLegions')::boolean, false) <> s.include_all_legions
    );
  if v_bad_payload > 0 then
    v_errors := array_append(v_errors, 'PAYLOAD_CONTRACT_INVALID');
  end if;

  select count(*)::integer into v_item_mismatch
  from private.kinojo_ranking_snapshot_scopes_v390 s
  where s.snapshot_id = p_snapshot_id
    and (
      s.pve_count <> (
        select count(*) from private.kinojo_ranking_snapshot_items_v390 i
        where i.snapshot_id = s.snapshot_id
          and i.include_subs = s.include_subs
          and i.include_all_legions = s.include_all_legions
          and i.rank_mode = 'PVE'
      )
      or s.pvp_count <> (
        select count(*) from private.kinojo_ranking_snapshot_items_v390 i
        where i.snapshot_id = s.snapshot_id
          and i.include_subs = s.include_subs
          and i.include_all_legions = s.include_all_legions
          and i.rank_mode = 'PVP'
      )
    );
  if v_item_mismatch > 0 then
    v_errors := array_append(v_errors, 'RANK_ITEM_COUNT_MISMATCH');
  end if;

  select count(*)::integer into v_rank_gap
  from (
    select include_subs, include_all_legions, rank_mode,
           min(rank_no) min_rank, max(rank_no) max_rank, count(*) item_count
    from private.kinojo_ranking_snapshot_items_v390
    where snapshot_id = p_snapshot_id
    group by include_subs, include_all_legions, rank_mode
  ) ranked
  where min_rank <> 1 or max_rank <> item_count;
  if v_rank_gap > 0 then
    v_errors := array_append(v_errors, 'RANK_SEQUENCE_INVALID');
  end if;

  select count(*)::integer into v_duplicate_identity
  from (
    select include_subs, include_all_legions, rank_mode, server_id,
           public.kinojo_normalize_character_name(character_name), count(*)
    from private.kinojo_ranking_snapshot_items_v390
    where snapshot_id = p_snapshot_id
    group by include_subs, include_all_legions, rank_mode, server_id,
             public.kinojo_normalize_character_name(character_name)
    having count(*) > 1
  ) duplicates;
  if v_duplicate_identity > 0 then
    v_errors := array_append(v_errors, 'DUPLICATE_SERVER_CHARACTER');
  end if;

  select count(*)::integer into v_bad_metrics
  from private.kinojo_ranking_snapshot_scopes_v390 s
  where s.snapshot_id = p_snapshot_id
    and not (
      s.owner_metric_counts ?& array['enhance','pve','pvp','like','dislike','growth']
    );
  if v_bad_metrics > 0 then
    v_errors := array_append(v_errors, 'OWNER_METRIC_CONTRACT_INCOMPLETE');
  end if;

  v_report := jsonb_build_object(
    'ok', cardinality(v_errors) = 0,
    'contractVersion', 390,
    'snapshotId', p_snapshot_id,
    'scopeCount', v_scope_count,
    'errors', to_jsonb(v_errors),
    'validatedAt', pg_catalog.statement_timestamp()
  );

  if cardinality(v_errors) > 0 then
    update private.kinojo_ranking_snapshots_v390
    set status = 'FAILED',
        validation_report = v_report,
        validated_at = pg_catalog.statement_timestamp(),
        updated_at = pg_catalog.statement_timestamp(),
        last_error_code = 'SNAPSHOT_VALIDATION_FAILED',
        last_error_message = array_to_string(v_errors, ',')
    where snapshot_id = p_snapshot_id;
    return v_report;
  end if;

  update private.kinojo_ranking_snapshots_v390
  set status = 'READY',
      validation_report = v_report,
      validated_at = pg_catalog.statement_timestamp(),
      updated_at = pg_catalog.statement_timestamp(),
      last_error_code = null,
      last_error_message = null
  where snapshot_id = p_snapshot_id;

  return v_report;
end;
$function$
;
DROP FUNCTION private.kinojo_ranking_hof_candidate_v476(jsonb,boolean,boolean,timestamptz);
COMMIT;
