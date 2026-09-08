-- DB476: repair DB416 generation/read feedback; preserve public APIs.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '40s';
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
      s.character_id,
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
                 cs.is_main desc, cs.character_name asc, cs.server_id asc
      )::integer as previous_rank_no,
      cs.server_id, cs.character_name
    from class_scoped cs
    where coalesce(cs.previous_pve_power, 0) > 0
  ),
  previous_pvp_ranked as (
    select
      row_number() over (
        order by cs.previous_pvp_power desc nulls last,
                 cs.is_main desc, cs.character_name asc, cs.server_id asc
      )::integer as previous_rank_no,
      cs.server_id, cs.character_name
    from class_scoped cs
    where coalesce(cs.previous_pvp_power, 0) > 0
  ),
  pve_ranked as (
    select
      row_number() over (
        order by cs.pve_power_total desc nulls last,
                 cs.is_main desc, cs.character_name asc, cs.server_id asc
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
                   cs.is_main desc, cs.character_name asc, cs.server_id asc
        )::integer
      end as rank_change,
      case
        when ppr.previous_rank_no is null then 'NEW'
        when ppr.previous_rank_no - row_number() over (
          order by cs.pve_power_total desc nulls last,
                   cs.is_main desc, cs.character_name asc, cs.server_id asc
        )::integer > 0 then 'UP'
        when ppr.previous_rank_no - row_number() over (
          order by cs.pve_power_total desc nulls last,
                   cs.is_main desc, cs.character_name asc, cs.server_id asc
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
                 cs.is_main desc, cs.character_name asc, cs.server_id asc
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
                   cs.is_main desc, cs.character_name asc, cs.server_id asc
        )::integer
      end as rank_change,
      case
        when ppr.previous_rank_no is null then 'NEW'
        when ppr.previous_rank_no - row_number() over (
          order by cs.pvp_power_total desc nulls last,
                   cs.is_main desc, cs.character_name asc, cs.server_id asc
        )::integer > 0 then 'UP'
        when ppr.previous_rank_no - row_number() over (
          order by cs.pvp_power_total desc nulls last,
                   cs.is_main desc, cs.character_name asc, cs.server_id asc
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
-- Internal generation only. Never call published readers from this function.
CREATE OR REPLACE FUNCTION private.kinojo_ranking_hof_candidate_v476(
  p_ranking jsonb, p_include_subs boolean, p_include_all_legions boolean, p_at timestamptz
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
  with raw as (
    select (
with params as (
    select
      coalesce(p_include_subs, false)::boolean as include_subs,
      coalesce(p_include_all_legions, false)::boolean as include_all_legions
  ), period as (
    select * from public.kinojo_aion_week_window(p_at)
  ), active_characters as (
    select
      s.character_id,
      s.server_id, s.server_name, s.character_name, s.main_character_name,
      s.is_main, s.class_name, s.profile_image_url,
      s.detail_url, s.legion_name, s.ranking_legion_name,
      s.ranking_owner_character_id, s.ranking_owner_character_name,
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
  ), weekly as (
    select * from public.kinojo_hof_weekly_deltas(p_at)
  ), reactions as (
    select
      rs.character_name,
      coalesce(rs.like_count, 0)::int as like_count,
      coalesce(rs.dislike_count, 0)::int as dislike_count,
      coalesce(rs.total_count, 0)::int as reaction_total,
      rs.comments
    from public.v_reaction_summary rs
  ), base as (
    select
      ac.*,
      coalesce(r.like_count, 0)::int as like_count,
      coalesce(r.dislike_count, 0)::int as dislike_count,
      coalesce(r.reaction_total, 0)::int as reaction_total,
      coalesce(r.comments, array[]::text[]) as reaction_comments,
      coalesce(w.power_delta, 0)::int as power_delta,
      coalesce(w.item_level_delta, 0)::int as item_level_delta,
      case when coalesce(w.power_delta, 0) > 0 then 'GROWTH' else 'STABLE' end::text as growth_status,
      case when coalesce(w.power_delta, 0) > 0 then '주간 성장' else '변화 없음' end::text as growth_label,
      case when coalesce(w.power_delta, 0) > 0 then '이번 아이온 주간 전투력 증가량 +' || w.power_delta::text else '' end::text as review_text
    from active_characters ac
    left join reactions r
      on public.kinojo_normalize_character_name(r.character_name)
       = public.kinojo_normalize_character_name(ac.character_name)
    left join weekly w
      on w.server_id = coalesce(ac.server_id, 2002)
     and public.kinojo_normalize_character_name(w.character_name)
       = public.kinojo_normalize_character_name(ac.character_name)
  ), likes_top as (
    select row_number() over(order by b.like_count desc nulls last, b.pve_power_total desc nulls last, b.character_name asc)::int as rank_no, 'LIKE_TOP'::text as award_type, b.*
    from base b where coalesce(b.like_count, 0) > 0
    order by b.like_count desc nulls last, b.pve_power_total desc nulls last, b.character_name asc limit 3
  ), dislikes_top as (
    select row_number() over(order by b.dislike_count desc nulls last, b.pve_power_total desc nulls last, b.character_name asc)::int as rank_no, 'DISLIKE_TOP'::text as award_type, b.*
    from base b where coalesce(b.dislike_count, 0) > 0
    order by b.dislike_count desc nulls last, b.pve_power_total desc nulls last, b.character_name asc limit 3
  ), pve_top as (
    -- Preserve the already-ranked candidate, including main/sub and tie ordering.
    select (j.value->>'rank_no')::integer rank_no,
           j.value || jsonb_build_object('award_type','PVE_TOP',
             'power_delta',b.power_delta,'item_level_delta',b.item_level_delta,
             'growth_status',b.growth_status,'growth_label',b.growth_label,
             'review_text',b.review_text) as row_data
    from jsonb_array_elements(p_ranking->'pveItems') j(value)
    join base b on b.character_id = (j.value->>'character_id')::bigint
    where (j.value->>'rank_no')::integer between 1 and 3
    order by (j.value->>'rank_no')::integer
  ), pvp_top as (
    -- Preserve the already-ranked candidate, including main/sub and tie ordering.
    select (j.value->>'rank_no')::integer rank_no,
           j.value || jsonb_build_object('award_type','PVP_TOP',
             'power_delta',b.power_delta,'item_level_delta',b.item_level_delta,
             'growth_status',b.growth_status,'growth_label',b.growth_label,
             'review_text',b.review_text) as row_data
    from jsonb_array_elements(p_ranking->'pvpItems') j(value)
    join base b on b.character_id = (j.value->>'character_id')::bigint
    where (j.value->>'rank_no')::integer between 1 and 3
    order by (j.value->>'rank_no')::integer
  ), growth_god as (
    select 1::int as rank_no, 'GROWTH_GOD'::text as award_type, b.*
    from base b where coalesce(b.power_delta, 0) > 0
    order by b.power_delta desc nulls last, b.pve_power_total desc nulls last, b.character_name asc limit 1
  ), enhance_god as (
    select 1::int as rank_no, 'ENHANCE_GOD'::text as award_type, b.*
    from base b where coalesce(b.item_level_delta, 0) > 0
    order by b.item_level_delta desc nulls last, b.pve_power_total desc nulls last, b.character_name asc limit 1
  )
  select jsonb_build_object(
    'ok', true,
    'source', 'server_296_hof_legion_scope',
    'updatedAt', p_at,
    'includeSubs', (select include_subs from params),
    'includeAllLegions', (select include_all_legions from params),
    'defaultLegions', jsonb_build_array('깡','낮','밤','키나노동조합'),
    'rankingPeriod', jsonb_build_object(
      'startAt', (select start_at from period),
      'endAt', (select end_at from period),
      'timezone', 'Asia/Seoul',
      'endExclusive', true
    ),
    'myRanking', '{}'::jsonb,
    'sections', jsonb_build_object(
      'likesTop3', coalesce((select jsonb_agg(to_jsonb(x) order by x.rank_no) from likes_top x), '[]'::jsonb),
      'dislikesTop3', coalesce((select jsonb_agg(to_jsonb(x) order by x.rank_no) from dislikes_top x), '[]'::jsonb),
      'pveTop3', coalesce((select jsonb_agg(x.row_data order by x.rank_no) from pve_top x), '[]'::jsonb),
      'pvpTop3', coalesce((select jsonb_agg(x.row_data order by x.rank_no) from pvp_top x), '[]'::jsonb),
      'growthGod', coalesce((select to_jsonb(x) from growth_god x limit 1), '{}'::jsonb),
      'enhanceGod', coalesce((select to_jsonb(x) from enhance_god x limit 1), '{}'::jsonb)
    )
  )
    ) as data
  ),
  raw_parts as (
    select
      data,
      coalesce(data #> '{sections,likesTop3}', '[]'::jsonb) as likes_top_raw,
      coalesce(data #> '{sections,dislikesTop3}', '[]'::jsonb) as dislikes_top_raw,
      coalesce(data #> '{sections,pveTop3}', '[]'::jsonb) as pve_top_raw,
      coalesce(data #> '{sections,pvpTop3}', '[]'::jsonb) as pvp_top_raw,
      nullif(data #> '{sections,growthGod}', '{}'::jsonb) as growth_god_raw,
      nullif(data #> '{sections,enhanceGod}', '{}'::jsonb) as enhance_god_raw
    from raw
  ),
  parts as (
    select
      rp.data,
      coalesce((select jsonb_agg(public.kinojo_hof_display_item_v343(x.value) order by x.ordinality) from jsonb_array_elements(rp.likes_top_raw) with ordinality x(value, ordinality)), '[]'::jsonb) as likes_top,
      coalesce((select jsonb_agg(public.kinojo_hof_display_item_v343(x.value) order by x.ordinality) from jsonb_array_elements(rp.dislikes_top_raw) with ordinality x(value, ordinality)), '[]'::jsonb) as dislikes_top,
      coalesce((select jsonb_agg(public.kinojo_hof_display_item_v343(x.value) order by x.ordinality) from jsonb_array_elements(rp.pve_top_raw) with ordinality x(value, ordinality)), '[]'::jsonb) as pve_top,
      coalesce((select jsonb_agg(public.kinojo_hof_display_item_v343(x.value) order by x.ordinality) from jsonb_array_elements(rp.pvp_top_raw) with ordinality x(value, ordinality)), '[]'::jsonb) as pvp_top,
      public.kinojo_hof_display_item_v343(rp.growth_god_raw) as growth_god,
      public.kinojo_hof_display_item_v343(rp.enhance_god_raw) as enhance_god
    from raw_parts rp
  ),
  all_items as (
    select item
    from parts p
    cross join lateral jsonb_array_elements(
      p.likes_top || p.dislikes_top || p.pve_top || p.pvp_top
      || case when p.growth_god is null then '[]'::jsonb else jsonb_build_array(p.growth_god) end
      || case when p.enhance_god is null then '[]'::jsonb else jsonb_build_array(p.enhance_god) end
    ) item
  ),
  reactions as (
    select coalesce(
      jsonb_object_agg(
        item->>'name',
        jsonb_build_object(
          'like', coalesce((item->>'like')::int, 0),
          'dislike', coalesce((item->>'dislike')::int, 0),
          'comments', coalesce(item->'reactionComments', '[]'::jsonb)
        )
      ) filter (where coalesce(item->>'name', '') <> ''),
      '{}'::jsonb
    ) as by_name
    from all_items
  ),
  my_ranking as (
    select coalesce(
      jsonb_object_agg(
        metric,
        jsonb_build_object(
          'item', public.kinojo_hof_display_item_v343(row_value),
          'rank', coalesce((row_value->>'rank_no')::int, (row_value->>'rankNo')::int, 0),
          'score', coalesce(row_value->>'score', '-')
        )
      ) filter (
        where jsonb_typeof(row_value) = 'object'
          and coalesce((row_value->>'rank_no')::int, (row_value->>'rankNo')::int, 0) > 0
      ),
      '{}'::jsonb
    ) as value
    from parts p
    cross join lateral jsonb_each(coalesce(p.data->'myRanking', '{}'::jsonb)) e(metric, row_value)
  ),
  combined as (
    select
      p.*,
      p.likes_top || p.dislikes_top || p.pve_top || p.pvp_top
      || case when p.growth_god is null then '[]'::jsonb else jsonb_build_array(p.growth_god) end
      || case when p.enhance_god is null then '[]'::jsonb else jsonb_build_array(p.enhance_god) end as overall_items
    from parts p
  )
  select jsonb_build_object(
    'ok', coalesce((c.data->>'ok')::boolean, true),
    'source', 'server_476_hof_candidate',
    'hofBuildContract', 476,
    'candidateRankingHash', md5(p_ranking::text),
    'candidateAt', p_at,
    'updatedAt', coalesce(c.data->>'updatedAt', c.data->>'updated_at', ''),
    'includeSubs', coalesce(p_include_subs, false),
    'includeAllLegions', coalesce(p_include_all_legions, false),
    'defaultLegions', coalesce(c.data->'defaultLegions', jsonb_build_array('깡','낮','밤','키나노동조합')),
    'pveTop', c.pve_top,
    'pvpTop', c.pvp_top,
    'overallMain', c.overall_items,
    'overallAll', c.overall_items,
    'reactionSummary', jsonb_build_object(
      'likeTop', c.likes_top,
      'dislikeTop', c.dislikes_top,
      'byName', (select by_name from reactions)
    ),
    'weeklyAwards', jsonb_build_object(
      'growthKing', case when c.growth_god is null then '[]'::jsonb else jsonb_build_array(c.growth_god) end,
      'bulkUp', case when c.enhance_god is null then '[]'::jsonb else jsonb_build_array(c.enhance_god) end
    ),
    'summarySections', jsonb_build_object(
      'likesTop', c.likes_top,
      'dislikesTop', c.dislikes_top,
      'pveTop', c.pve_top,
      'pvpTop', c.pvp_top,
      'growthGod', coalesce(c.growth_god, 'null'::jsonb),
      'enhanceGod', coalesce(c.enhance_god, 'null'::jsonb)
    ),
    'myRanking', (select value from my_ranking),
    'rankingPeriod', coalesce(c.data->'rankingPeriod', c.data->'ranking_period', '{}'::jsonb),
    'profileImageContract', '342',
    'hofProfileIntegrationContract', '343',
    'mvp', null,
    'mvpCandidatesTop3', '[]'::jsonb,
    'mvpConfirmed', false,
    'newChicks', '[]'::jsonb,
    'demonFamily', '[]'::jsonb,
    'demonFamilyAll', '[]'::jsonb,
    'partyFriend', '[]'::jsonb,
    'partyFriendAll', '[]'::jsonb
  )
  from combined c;
$function$;
REVOKE ALL ON FUNCTION private.kinojo_ranking_hof_candidate_v476(jsonb,boolean,boolean,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.kinojo_ranking_hof_candidate_v476(jsonb,boolean,boolean,timestamptz) TO service_role;

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
    v_hof := private.kinojo_ranking_hof_candidate_v476(
      v_ranking, v_include_subs, v_include_all_legions, v_snapshot.created_at
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
  v_scope record;
  v_mode text;
  v_expected jsonb;
  v_actual jsonb;
  v_award jsonb;
  v_metric text;
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


  -- Compare content, not merely JSON shape or a newly stamped publication date.
  for v_scope in select * from private.kinojo_ranking_snapshot_scopes_v390
    where snapshot_id = p_snapshot_id loop
    if (v_scope.hof_payload->>'hofBuildContract') is distinct from '476'
       or (v_scope.hof_payload->>'candidateRankingHash') is distinct from md5(v_scope.ranking_payload::text)
       or (v_scope.hof_payload->>'candidateAt')::timestamptz is distinct from v_snapshot.created_at
       or (v_scope.hof_payload#>>'{rankingPeriod,startAt}')::timestamptz is distinct from
          (select start_at from public.kinojo_aion_week_window(v_snapshot.created_at))
       or (v_scope.hof_payload#>>'{rankingPeriod,endAt}')::timestamptz is distinct from
          (select end_at from public.kinojo_aion_week_window(v_snapshot.created_at)) then
      v_errors := array_append(v_errors, 'HOF_CANDIDATE_PROVENANCE_INVALID');
    end if;
    foreach v_mode in array array['pve','pvp'] loop
      select coalesce(jsonb_agg(jsonb_build_array(
        i.item->>'character_id', i.rank_no, i.character_name, i.server_id::text,
        i.item->>'legion_name', i.item->>'ranking_legion_name',
        (i.item->>(v_mode||'_power_total'))::numeric,
        (i.item->>(v_mode||'_item_level'))::numeric,
        i.item->>'updated_at'
      ) order by i.rank_no), '[]'::jsonb) into v_expected
      from private.kinojo_ranking_snapshot_items_v390 i
      where i.snapshot_id=p_snapshot_id and i.include_subs=v_scope.include_subs
        and i.include_all_legions=v_scope.include_all_legions
        and i.rank_mode=upper(v_mode) and i.rank_no <= 3;

      select coalesce(jsonb_agg(jsonb_build_array(
        j.value->>'characterId', (j.value->>'rank')::integer,
        j.value->>'name', j.value->>'serverId',
        j.value->>'legionName', j.value->>'rankingLegionName',
        (j.value->>(v_mode||'Power'))::numeric,
        (j.value->>(v_mode||'Item'))::numeric,
        j.value->>'updated_at'
      ) order by j.ordinality), '[]'::jsonb) into v_actual
      from jsonb_array_elements(v_scope.hof_payload->(v_mode||'Top'))
        with ordinality j(value,ordinality);
      if v_actual is distinct from v_expected
         or v_scope.hof_payload->(v_mode||'Top') is distinct from
            v_scope.hof_payload#>array['summarySections',v_mode||'Top'] then
        v_errors := array_append(v_errors, 'HOF_TOP3_CANDIDATE_MISMATCH_'||upper(v_mode));
      end if;
    end loop;

    -- Winner rank 1 survives the existing owner projection; never use its
    -- owner-deduplicated rows as the source of a character TOP3.
    foreach v_metric in array array['growth','enhance'] loop
      select jsonb_build_array(row_data->>'character_id',score) into v_expected
      from private.kinojo_ranking_snapshot_owner_metrics_v390 o
      where o.snapshot_id=p_snapshot_id and o.include_subs=v_scope.include_subs
        and o.include_all_legions=v_scope.include_all_legions
        and o.metric=v_metric and o.rank_no=1;
      v_award := v_scope.hof_payload#>array['summarySections',v_metric||'God'];
      v_actual := case when v_award is null or v_award='null'::jsonb then null else
        jsonb_build_array(v_award->>'characterId',
          (v_award->>case when v_metric='growth' then 'powerDelta' else 'itemLevelDelta' end)::numeric) end;
      if v_actual is distinct from v_expected
         or (v_scope.hof_payload#>array['weeklyAwards',case when v_metric='growth' then 'growthKing' else 'bulkUp' end])
           is distinct from (case when v_actual is null then '[]'::jsonb else jsonb_build_array(v_award) end) then
        v_errors := array_append(v_errors, 'HOF_WEEKLY_CANDIDATE_MISMATCH_'||upper(v_metric));
      end if;
    end loop;
  end loop;

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
COMMIT;
