-- Refuse rollback when expired raw would change the public ranking response.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='30s';
lock table public.character_history,public.character_master,public.growth_reviews in share row exclusive mode;
create temporary table ranking_contract_v523 on commit drop as
select a,b,md5(private.kinojo_ranking_snapshot_scope_payload_v426(a,b)::text) hash
from (values(false),(true)) x(a) cross join (values(false),(true)) y(b);
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
    select s.server_id,s.character_name,g.gear_type,
      c.history_date as previous_history_date,
      c.combat_power as previous_power,c.item_level as previous_item_level
    from source_all s cross join (values('PVE'),('PVP')) g(gear_type)
    left join private.kinojo_ranking_comparison_current_v522 c
      on c.character_master_id=s.character_id and c.gear_type=g.gear_type and c.slot=2
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
    from (
      select distinct on (h.character_master_id,(case when upper(coalesce(h.gear_type,'')) in ('PVE','PVP') then upper(h.gear_type)
 when h.pve_item_level is not null and h.pve_combat_power is not null and h.pvp_item_level is null and h.pvp_combat_power is null then 'PVE'
 when h.pvp_item_level is not null and h.pvp_combat_power is not null and h.pve_item_level is null and h.pve_combat_power is null then 'PVP' end))
        s.server_id,s.character_name,(case when upper(coalesce(h.gear_type,'')) in ('PVE','PVP') then upper(h.gear_type)
 when h.pve_item_level is not null and h.pve_combat_power is not null and h.pvp_item_level is null and h.pvp_combat_power is null then 'PVE'
 when h.pvp_item_level is not null and h.pvp_combat_power is not null and h.pve_item_level is null and h.pve_combat_power is null then 'PVP' end) as review_mode,
        gr.growth_label,gr.growth_status,gr.review_text,gr.updated_at as source_updated_at
      from public.growth_reviews gr
      join public.character_history h on h.id=gr.current_history_id
      join source_all s on s.character_id=h.character_master_id
      left join public.character_history ph on ph.id=gr.previous_history_id
      where h.character_master_id is not null
        and (gr.previous_history_id is null or ph.character_master_id=h.character_master_id)
      order by h.character_master_id,(case when upper(coalesce(h.gear_type,'')) in ('PVE','PVP') then upper(h.gear_type)
 when h.pve_item_level is not null and h.pve_combat_power is not null and h.pvp_item_level is null and h.pvp_combat_power is null then 'PVE'
 when h.pvp_item_level is not null and h.pvp_combat_power is not null and h.pve_item_level is null and h.pve_combat_power is null then 'PVP' end),gr.created_at desc,gr.id desc
    ) rr
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
$function$;
do $verify$ begin
if exists(select 1 from ranking_contract_v523 where hash is distinct from
  md5(private.kinojo_ranking_snapshot_scope_payload_v426(a,b)::text)) then
  raise exception 'SQL523: ranking response changed; transaction rolled back';
end if;end;$verify$;
drop trigger trg_growth_reviews_current_v523 on public.growth_reviews;
drop trigger trg_character_history_review_current_v523 on public.character_history;
drop function private.kinojo_ranking_review_write_v523();
drop function private.kinojo_ranking_review_refresh_v523(bigint,bigint[]);
drop function private.kinojo_ranking_review_candidates_v523(bigint,bigint[]);
drop table private.kinojo_ranking_review_current_v523;
drop index public.growth_reviews_current_history_v523_idx;
drop index public.growth_reviews_previous_history_v523_idx;
commit;

