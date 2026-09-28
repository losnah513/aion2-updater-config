-- SQL522: bounded numeric comparison state keyed by permanent character identity.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='30s';
lock table public.character_history,public.character_master,public.growth_reviews in share row exclusive mode;
create temporary table ranking_contract_v522 on commit drop as
select a,b,md5(private.kinojo_ranking_snapshot_scope_payload_v426(a,b)::text) hash
from (values(false),(true)) x(a) cross join (values(false),(true)) y(b);
create table private.kinojo_ranking_comparison_current_v522(
  character_master_id bigint not null references public.character_master(id) on delete cascade,
  gear_type text not null check(gear_type in('PVE','PVP')),
  slot smallint not null check(slot in(1,2)),
  history_date integer not null,source_id bigint not null,observed_at timestamptz,
  combat_power integer not null,item_level integer not null,
  primary key(character_master_id,gear_type,slot)
);
alter table private.kinojo_ranking_comparison_current_v522 enable row level security;
revoke all on private.kinojo_ranking_comparison_current_v522 from public,anon,authenticated,service_role;
comment on column private.kinojo_ranking_comparison_current_v522.source_id is
  'Historical provenance only; raw history may expire. Never resolve as a required live reference.';
create function private.kinojo_ranking_comparison_refresh_v522(p_character_id bigint,p_replaced_id bigint default null)
returns void language plpgsql security definer set search_path to 'pg_catalog'
set lock_timeout to '250ms' set statement_timeout to '2s' as $fn$
declare v_rows jsonb;
begin
  if p_character_id is null or not exists(select 1 from public.character_master where id=p_character_id) then return; end if;
  perform pg_advisory_xact_lock(522,hashint8(p_character_id));
  with raw as (
    select h.id source_id,h.history_date,h.created_at observed_at,
      case when upper(coalesce(h.gear_type,'')) in ('PVE','PVP') then upper(h.gear_type)
        when h.pve_item_level is not null and h.pve_combat_power is not null and h.pvp_item_level is null and h.pvp_combat_power is null then 'PVE'
        when h.pvp_item_level is not null and h.pvp_combat_power is not null and h.pve_item_level is null and h.pve_combat_power is null then 'PVP' end gear_type,
      h.pve_combat_power,h.pve_item_level,h.pvp_combat_power,h.pvp_item_level
    from public.character_history h
    where h.character_master_id=p_character_id and h.record_type='POWER' and h.status='OK'
      and h.history_date is not null
  ), candidates as (
    select gear_type,history_date,source_id,observed_at,
      case when gear_type='PVE' then pve_combat_power else pvp_combat_power end combat_power,
      case when gear_type='PVE' then pve_item_level else pvp_item_level end item_level,0 priority
    from raw where gear_type is not null
    union all
    select gear_type,history_date,source_id,observed_at,combat_power,item_level,1
    from private.kinojo_ranking_comparison_current_v522
    where character_master_id=p_character_id and source_id is distinct from p_replaced_id
  ), days as (
    select distinct on(gear_type,history_date) gear_type,history_date,source_id,observed_at,combat_power,item_level
    from candidates where combat_power is not null and item_level is not null
    order by gear_type,history_date,observed_at desc,source_id desc,priority
  ), numbered as (
    select *,row_number() over(partition by gear_type order by history_date desc)::smallint slot from days
  )
  select coalesce(jsonb_agg(to_jsonb(n)),'[]'::jsonb) into v_rows from numbered n where slot<=2;

  -- At most two days per identity and mode; unchanged slots do not get rewritten.
  delete from private.kinojo_ranking_comparison_current_v522 c
  where character_master_id=p_character_id and not exists(
    select 1 from jsonb_to_recordset(v_rows) as r(gear_type text,slot smallint)
    where r.gear_type=c.gear_type and r.slot=c.slot);
  insert into private.kinojo_ranking_comparison_current_v522 as c
    (character_master_id,gear_type,slot,history_date,source_id,observed_at,combat_power,item_level)
  select p_character_id,gear_type,slot,history_date,source_id,observed_at,combat_power,item_level
  from jsonb_to_recordset(v_rows) as r(gear_type text,slot smallint,history_date integer,source_id bigint,
    observed_at timestamptz,combat_power integer,item_level integer)
  on conflict(character_master_id,gear_type,slot) do update set
    history_date=excluded.history_date,source_id=excluded.source_id,observed_at=excluded.observed_at,
    combat_power=excluded.combat_power,item_level=excluded.item_level
  where (c.history_date,c.source_id,c.observed_at,c.combat_power,c.item_level) is distinct from
    (excluded.history_date,excluded.source_id,excluded.observed_at,excluded.combat_power,excluded.item_level);
end;
$fn$;
create function private.kinojo_ranking_comparison_write_v522()
returns trigger language plpgsql security definer set search_path to 'pg_catalog' as $fn$
declare v_id bigint; v_old_character bigint; v_old_id bigint;
begin
  if tg_op='UPDATE' then v_old_character:=old.character_master_id;v_old_id:=old.id;end if;
  -- Lock both identities in the same order when correcting an identity assignment.
  for v_id in select distinct hashint8(x) from unnest(array[v_old_character,new.character_master_id]) x
    where x is not null order by 1 loop
    perform pg_advisory_xact_lock(522,v_id::integer);
  end loop;
  if v_old_character is not null and v_old_character is distinct from new.character_master_id then
    perform private.kinojo_ranking_comparison_refresh_v522(v_old_character,v_old_id);
  end if;
  perform private.kinojo_ranking_comparison_refresh_v522(new.character_master_id,coalesce(v_old_id,new.id));
  return new;
end;
$fn$;
create trigger trg_character_history_comparison_v522
after insert or update of id,character_master_id,history_date,record_type,gear_type,
  pve_item_level,pve_combat_power,pvp_item_level,pvp_combat_power,status,created_at
on public.character_history for each row execute function private.kinojo_ranking_comparison_write_v522();
-- Retention DELETE intentionally preserves the last two numeric observations.
-- source_id is provenance, not a live foreign key to retained raw history.
revoke all on function private.kinojo_ranking_comparison_refresh_v522(bigint,bigint),
  private.kinojo_ranking_comparison_write_v522() from public,anon,authenticated,service_role;

do $seed$ declare r record;begin
for r in select distinct h.character_master_id from public.character_history h
join public.character_master m on m.id=h.character_master_id
where h.record_type='POWER' and h.status='OK' loop
  perform private.kinojo_ranking_comparison_refresh_v522(r.character_master_id);
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
if exists(select 1 from ranking_contract_v522 where hash is distinct from
  md5(private.kinojo_ranking_snapshot_scope_payload_v426(a,b)::text)) then
  raise exception 'SQL522: ranking response changed; transaction rolled back';
end if;end;$verify$;
commit;
