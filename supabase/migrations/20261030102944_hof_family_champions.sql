-- SQL540: two single-person family champions in the existing HOF snapshot.
-- Reuses canonical family/legion scope, PVE current values, profile resolver and
-- existing candidate/build/validate/publish path. No new table, RPC or cron.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
CREATE OR REPLACE FUNCTION private.kinojo_ranking_hof_candidate_v476(p_ranking jsonb, p_include_subs boolean, p_include_all_legions boolean, p_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with
  -- Families always include their alts, independently of the individual-card sub toggle.
  family_scope as materialized (
    select * from public.v_kinojo_ranking_character_scope_v296
  ), family_totals as (
    select root.character_id,
      sum(case when member.latest_pve_combat_power > 0 then member.latest_pve_combat_power::bigint else 0 end)::bigint family_power,
      count(*) filter(where member.character_id <> root.character_id)::integer alt_count,
      count(*)::integer family_count,
      count(*) filter(where member.latest_pve_combat_power > 0)::integer known_power_count
    from family_scope root
    join family_scope member on member.ranking_owner_character_id = root.character_id
    where root.is_main is true
      and (coalesce(p_include_all_legions,false) or root.is_default_ranking_legion is true)
    group by root.character_id
  ), family_items as (
    select root.character_name,root.server_id,totals.*,
      public.kinojo_hof_display_item_v343(to_jsonb(root)) || jsonb_build_object(
        'familyPower',totals.family_power,'altCount',totals.alt_count,
        'familyCharacterCount',totals.family_count,'knownPowerCount',totals.known_power_count,
        'familyMetricContract',540
      ) item
    from family_totals totals join family_scope root on root.character_id=totals.character_id
  ), family_champions as (
    select
      (select item from family_items where known_power_count > 0
       order by family_power desc,character_name asc,server_id asc,character_id asc limit 1) all_for_one,
      (select item from family_items
       order by alt_count desc,character_name asc,server_id asc,character_id asc limit 1) one_for_all
  ),
  raw as (
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
      'allForOne', f.all_for_one,
      'oneForAll', f.one_for_all,
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
  from combined c cross join family_champions f;
$function$;
commit;
