-- SQL523: bounded current review text without a ranking-time raw history join.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='30s';
lock table public.character_history,public.character_master,public.growth_reviews in share row exclusive mode;
create temporary table ranking_contract_v523 on commit drop as
select a,b,md5(private.kinojo_ranking_snapshot_scope_payload_v426(a,b)::text) hash
from (values(false),(true)) x(a) cross join (values(false),(true)) y(b);
create table private.kinojo_ranking_review_current_v523(
 character_master_id bigint not null references public.character_master(id) on delete cascade,
 review_mode text not null check(review_mode in('PVE','PVP','UNKNOWN')),
 review_id bigint not null,current_history_id bigint not null,previous_history_id bigint,
 growth_label text,growth_status text,review_text text,source_created_at timestamptz,source_updated_at timestamptz,
 primary key(character_master_id,review_mode)
);
alter table private.kinojo_ranking_review_current_v523 enable row level security;
revoke all on private.kinojo_ranking_review_current_v523 from public,anon,authenticated,service_role;
comment on table private.kinojo_ranking_review_current_v523 is
 'Latest verified review per permanent identity/mode. Review/history IDs are historical provenance, not live raw references.';
create index growth_reviews_current_history_v523_idx on public.growth_reviews(current_history_id);
create index growth_reviews_previous_history_v523_idx on public.growth_reviews(previous_history_id);
create function private.kinojo_ranking_review_candidates_v523(p_character_id bigint,p_replaced_ids bigint[] default '{}')
returns table(character_master_id bigint,review_mode text,review_id bigint,current_history_id bigint,
  previous_history_id bigint,growth_label text,growth_status text,review_text text,
  source_created_at timestamptz,source_updated_at timestamptz,priority integer)
language sql stable security definer set search_path to 'pg_catalog' as $fn$
with saved as materialized (select * from private.kinojo_ranking_review_current_v523),
inputs as (
  select gr.id review_id,gr.current_history_id,gr.previous_history_id,gr.growth_label,gr.growth_status,
    gr.review_text,gr.created_at source_created_at,gr.updated_at source_updated_at,
    c.character_master_id frozen_id,c.review_mode frozen_mode,c.previous_history_id frozen_previous,0 priority
  from public.growth_reviews gr
  left join lateral (select s.* from saved s where s.current_history_id=gr.current_history_id
    order by s.source_created_at desc,s.review_id desc limit 1) c on true
  where gr.current_history_id in (select id from public.character_history where character_master_id=p_character_id)
     or gr.current_history_id in (select current_history_id from saved where character_master_id=p_character_id)
  union all
  select review_id,current_history_id,previous_history_id,growth_label,growth_status,review_text,
    source_created_at,source_updated_at,character_master_id,review_mode,previous_history_id,1
  from saved where not(review_id=any(coalesce(p_replaced_ids,'{}'::bigint[])))
), resolved as (
  select i.*,
    case when h.id is not null then h.character_master_id else i.frozen_id end resolved_id,
    case when h.id is null then i.frozen_mode
      when upper(coalesce(h.gear_type,'')) in ('PVE','PVP') then upper(h.gear_type)
      when h.pve_item_level is not null and h.pve_combat_power is not null
        and h.pvp_item_level is null and h.pvp_combat_power is null then 'PVE'
      when h.pvp_item_level is not null and h.pvp_combat_power is not null
        and h.pve_item_level is null and h.pve_combat_power is null then 'PVP'
      else 'UNKNOWN' end resolved_mode,
    ph.id previous_live_id,ph.character_master_id previous_live_identity
  from inputs i left join public.character_history h on h.id=i.current_history_id
    left join public.character_history ph on ph.id=i.previous_history_id
)
select resolved_id,resolved_mode,review_id,current_history_id,previous_history_id,growth_label,growth_status,
  review_text,source_created_at,source_updated_at,priority
from resolved where resolved_id=p_character_id and resolved_mode is not null and current_history_id is not null
  and (previous_history_id is null
    or (previous_live_id is not null and previous_live_identity=resolved_id)
    or (previous_live_id is null and previous_history_id=frozen_previous and frozen_id=resolved_id));
$fn$;

create function private.kinojo_ranking_review_refresh_v523(p_character_id bigint,p_replaced_ids bigint[] default '{}')
returns void language plpgsql security definer set search_path to 'pg_catalog'
set lock_timeout to '250ms' set statement_timeout to '2s' as $fn$
declare v_rows jsonb;
begin
  if p_character_id is null or not exists(select 1 from public.character_master where id=p_character_id) then return;end if;
  perform pg_advisory_xact_lock(523,hashint8(p_character_id));
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into v_rows
  from (select distinct on(review_mode) * from private.kinojo_ranking_review_candidates_v523(p_character_id,p_replaced_ids)
    order by review_mode,source_created_at desc,review_id desc,priority) r;
  delete from private.kinojo_ranking_review_current_v523 c
  where character_master_id=p_character_id and not exists(select 1 from jsonb_to_recordset(v_rows) r(review_mode text)
    where r.review_mode=c.review_mode);
  insert into private.kinojo_ranking_review_current_v523 as c
    (character_master_id,review_mode,review_id,current_history_id,previous_history_id,growth_label,
      growth_status,review_text,source_created_at,source_updated_at)
  select character_master_id,review_mode,review_id,current_history_id,previous_history_id,growth_label,
      growth_status,review_text,source_created_at,source_updated_at
  from jsonb_to_recordset(v_rows) r(character_master_id bigint,review_mode text,review_id bigint,
    current_history_id bigint,previous_history_id bigint,growth_label text,growth_status text,review_text text,
    source_created_at timestamptz,source_updated_at timestamptz)
  on conflict(character_master_id,review_mode) do update set
    review_id=excluded.review_id,current_history_id=excluded.current_history_id,
    previous_history_id=excluded.previous_history_id,growth_label=excluded.growth_label,
    growth_status=excluded.growth_status,review_text=excluded.review_text,
    source_created_at=excluded.source_created_at,source_updated_at=excluded.source_updated_at
  where (c.review_id,c.current_history_id,c.previous_history_id,c.growth_label,c.growth_status,c.review_text,
    c.source_created_at,c.source_updated_at) is distinct from
    (excluded.review_id,excluded.current_history_id,excluded.previous_history_id,excluded.growth_label,
    excluded.growth_status,excluded.review_text,excluded.source_created_at,excluded.source_updated_at);
end;
$fn$;

create function private.kinojo_ranking_review_write_v523()
returns trigger language plpgsql security definer set search_path to 'pg_catalog'
set lock_timeout to '250ms' set statement_timeout to '2s' as $fn$
declare v_review_ids bigint[];v_history_ids bigint[];v_ids bigint[];v_id bigint;v_old_id bigint;v_new_identity bigint;
begin
  if tg_op='UPDATE' then v_old_id:=old.id;end if;
  if tg_table_name='growth_reviews' then
    v_review_ids:=array[v_old_id,new.id];
    v_history_ids:=array[new.current_history_id];
    if tg_op='UPDATE' then v_history_ids:=array_append(v_history_ids,old.current_history_id);end if;
  else
    v_history_ids:=array[v_old_id,new.id];
    select array_agg(distinct x.id) into v_review_ids from (
      select id from public.growth_reviews where current_history_id=any(v_history_ids) or previous_history_id=any(v_history_ids)
      union select review_id from private.kinojo_ranking_review_current_v523
        where current_history_id=any(v_history_ids) or previous_history_id=any(v_history_ids)) x;
    if v_review_ids is null then return new;end if;
    v_new_identity:=new.character_master_id;
  end if;
  select array_agg(distinct x.id) into v_ids from (
    select character_master_id id from private.kinojo_ranking_review_current_v523 where review_id=any(v_review_ids)
      or current_history_id=any(v_history_ids)
    union select h.character_master_id from public.growth_reviews r join public.character_history h on h.id=r.current_history_id
      where r.id=any(v_review_ids)
    union select character_master_id from public.character_history where id=any(v_history_ids)) x where x.id is not null;
  -- Match SQL522's lock order before taking review locks, including review-only writes.
  for v_id in select distinct hashint8(x) from unnest(v_ids) x order by 1 loop
    perform pg_advisory_xact_lock(522,v_id::integer);
  end loop;
  for v_id in select distinct hashint8(x) from unnest(v_ids) x order by 1 loop
    perform pg_advisory_xact_lock(523,v_id::integer);
  end loop;
  -- Copy a moved current identity before removing its old frozen state.
  if v_new_identity is not null then perform private.kinojo_ranking_review_refresh_v523(v_new_identity);end if;
  for v_id in select x from unnest(v_ids) x where x is distinct from v_new_identity order by x loop
    perform private.kinojo_ranking_review_refresh_v523(v_id,
      case when tg_table_name='growth_reviews' then array_remove(v_review_ids,null) else '{}'::bigint[] end);
  end loop;
  return new;
end;
$fn$;
create trigger trg_growth_reviews_current_v523 after insert or update of id,current_history_id,previous_history_id,
  growth_label,growth_status,review_text,created_at,updated_at
on public.growth_reviews for each row execute function private.kinojo_ranking_review_write_v523();
create trigger trg_character_history_review_current_v523 after insert or update of id,character_master_id,gear_type,
  pve_item_level,pve_combat_power,pvp_item_level,pvp_combat_power
on public.character_history for each row execute function private.kinojo_ranking_review_write_v523();
-- Retention deletes preserve the verified latest review; no raw FK is required.
revoke all on function private.kinojo_ranking_review_candidates_v523(bigint,bigint[]),
  private.kinojo_ranking_review_refresh_v523(bigint,bigint[]),private.kinojo_ranking_review_write_v523()
from public,anon,authenticated,service_role;

do $seed$ declare r record;begin
for r in select distinct h.character_master_id from public.growth_reviews gr
 join public.character_history h on h.id=gr.current_history_id
 join public.character_master m on m.id=h.character_master_id loop
 perform private.kinojo_ranking_review_refresh_v523(r.character_master_id);
end loop;end;$seed$;
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
      select s.server_id,s.character_name,r.review_mode,
        r.growth_label,r.growth_status,r.review_text,r.source_updated_at
      from source_all s join private.kinojo_ranking_review_current_v523 r
        on r.character_master_id=s.character_id
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
commit;
