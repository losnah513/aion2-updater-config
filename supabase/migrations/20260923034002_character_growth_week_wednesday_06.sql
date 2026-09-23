-- SQL497. Preserve legacy midnight summaries; active weekly contract is Wednesday 06:00 KST.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='15s';
lock table public.character_history in share row exclusive mode;
lock table private.character_growth_rollups in access exclusive mode;
alter table private.character_growth_rollups add column week_start_hour smallint not null default 0;
alter table private.character_growth_rollups add constraint character_growth_rollups_week_hour_check
 check (week_start_hour=0 or (granularity='WEEK' and week_start_hour=6));
comment on column private.character_growth_rollups.week_start_hour is
 'WEEK: 0=legacy midnight archive, never compare as 06h; 6=Wednesday06 KST. DAY/MONTH=0. Source IDs are provenance and can outlive raw cleanup.';
alter table private.character_growth_rollups drop constraint character_growth_rollups_pkey;
alter table private.character_growth_rollups add primary key
 (granularity,period_start,server_id,character_key,gear_type,week_start_hour);
drop index private.character_growth_rollups_identity_key;
create unique index character_growth_rollups_identity_key
 on private.character_growth_rollups(granularity,period_start,character_master_id,gear_type,week_start_hour)
 where character_master_id is not null;
CREATE OR REPLACE FUNCTION private.kinojo_growth_rollup_history_insert_v424()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_local_date date;
  v_week_start timestamptz;
  v_week_end timestamptz;
  v_bucket_date date;
  v_character_key text;
  v_gear_type text;
  v_power integer;
  v_item_level integer;
  v_granularity text;
  v_period_start date;
  v_period_end date;
begin
  if new.character_master_id is null then return new; end if;
  if tg_op = 'UPDATE' then
    if old.growth_identity_rolled_up then
      if new.character_master_id is distinct from old.character_master_id then
        raise exception 'ROLLUP_IDENTITY_CORRECTION_REQUIRED';
      end if;
      return new;
    end if;
  end if;
  if new.record_type is distinct from 'POWER' or new.status is distinct from 'OK' then
    return new;
  end if;

  v_character_key := 'MASTER:' || new.character_master_id::text;
  if coalesce(v_character_key, '') = '' or new.history_date is null then
    return new;
  end if;

  v_local_date := to_date(lpad(new.history_date::text, 6, '0'), 'YYMMDD');

  v_gear_type := case
    when upper(coalesce(new.gear_type, '')) in ('PVE', 'PVP') then upper(new.gear_type)
    when new.pve_item_level is not null and new.pve_combat_power is not null
      and new.pvp_item_level is null and new.pvp_combat_power is null then 'PVE'
    when new.pvp_item_level is not null and new.pvp_combat_power is not null
      and new.pve_item_level is null and new.pve_combat_power is null then 'PVP'
    else null
  end;

  if v_gear_type = 'PVE' then
    v_power := new.pve_combat_power;
    v_item_level := new.pve_item_level;
  elsif v_gear_type = 'PVP' then
    v_power := new.pvp_combat_power;
    v_item_level := new.pvp_item_level;
  end if;

  if v_gear_type is null or v_power is null or v_item_level is null then
    return new;
  end if;

  if new.created_at is null then
    raise exception 'GROWTH_OBSERVED_AT_REQUIRED';
  end if;
  select w.start_at, w.end_at into strict v_week_start, v_week_end
    from public.kinojo_aion_week_window(new.created_at) w;

  -- Claim only after the row exists: INSERT ON CONFLICT DO NOTHING cannot count.
  update public.character_history set growth_identity_rolled_up=true
   where id=new.id and growth_identity_rolled_up=false;
  if not found then return new; end if;

  foreach v_granularity in array array['DAY', 'WEEK', 'MONTH'] loop
    if v_granularity = 'WEEK' then
      v_period_start := (v_week_start at time zone 'Asia/Seoul')::date;
      -- Boundary flags mean the first/last 24 hours of the Wednesday 06h week.
      v_bucket_date := ((new.created_at at time zone 'Asia/Seoul') - interval '6 hours')::date;
    else
      v_period_start := private.kinojo_growth_rollup_period_start_v424(v_granularity, v_local_date);
      v_bucket_date := v_local_date;
    end if;
    v_period_end := private.kinojo_growth_rollup_period_end_v424(v_granularity, v_period_start);

    insert into private.character_growth_rollups as r (
      character_master_id, granularity, period_start, period_end_exclusive, week_start_hour,
      server_id, character_key, character_name, gear_type,
      opening_source_id, opening_local_date, opening_observed_at,
      opening_power, opening_item_level,
      closing_source_id, closing_local_date, closing_observed_at,
      closing_power, closing_item_level,
      source_count, opening_boundary_hit, closing_boundary_hit
    ) values (
      new.character_master_id, v_granularity, v_period_start, v_period_end, case when v_granularity='WEEK' then 6 else 0 end,
      coalesce(new.server_id, 2002), v_character_key, new.character_name, v_gear_type,
      case when v_granularity = 'DAY' then null else new.id end,
      case when v_granularity = 'DAY' then null else v_local_date end,
      case when v_granularity = 'DAY' then null else new.created_at end,
      case when v_granularity = 'DAY' then null else v_power end,
      case when v_granularity = 'DAY' then null else v_item_level end,
      new.id, v_local_date, new.created_at, v_power, v_item_level,
      1,
      case when v_granularity = 'DAY' then true else v_bucket_date = v_period_start end,
      case when v_granularity = 'DAY' then true else v_bucket_date = v_period_end - 1 end
    )
    on conflict (granularity, period_start, character_master_id, gear_type, week_start_hour) where character_master_id is not null
    do update set
      period_end_exclusive = excluded.period_end_exclusive,
      server_id = case when (excluded.closing_observed_at, excluded.closing_source_id)
        > (r.closing_observed_at, r.closing_source_id) then excluded.server_id else r.server_id end,
      character_name = case
        when (excluded.closing_observed_at, excluded.closing_source_id)
          > (r.closing_observed_at, r.closing_source_id)
        then excluded.character_name else r.character_name end,
      opening_source_id = case
        when excluded.opening_source_id is not null and (
          r.opening_source_id is null
          or (excluded.opening_observed_at, excluded.opening_source_id)
            < (r.opening_observed_at, r.opening_source_id)
        ) then excluded.opening_source_id else r.opening_source_id end,
      opening_local_date = case
        when excluded.opening_source_id is not null and (
          r.opening_source_id is null
          or (excluded.opening_observed_at, excluded.opening_source_id)
            < (r.opening_observed_at, r.opening_source_id)
        ) then excluded.opening_local_date else r.opening_local_date end,
      opening_observed_at = case
        when excluded.opening_source_id is not null and (
          r.opening_source_id is null
          or (excluded.opening_observed_at, excluded.opening_source_id)
            < (r.opening_observed_at, r.opening_source_id)
        ) then excluded.opening_observed_at else r.opening_observed_at end,
      opening_power = case
        when excluded.opening_source_id is not null and (
          r.opening_source_id is null
          or (excluded.opening_observed_at, excluded.opening_source_id)
            < (r.opening_observed_at, r.opening_source_id)
        ) then excluded.opening_power else r.opening_power end,
      opening_item_level = case
        when excluded.opening_source_id is not null and (
          r.opening_source_id is null
          or (excluded.opening_observed_at, excluded.opening_source_id)
            < (r.opening_observed_at, r.opening_source_id)
        ) then excluded.opening_item_level else r.opening_item_level end,
      closing_source_id = case
        when (excluded.closing_observed_at, excluded.closing_source_id)
          > (r.closing_observed_at, r.closing_source_id)
        then excluded.closing_source_id else r.closing_source_id end,
      closing_local_date = case
        when (excluded.closing_observed_at, excluded.closing_source_id)
          > (r.closing_observed_at, r.closing_source_id)
        then excluded.closing_local_date else r.closing_local_date end,
      closing_observed_at = case
        when (excluded.closing_observed_at, excluded.closing_source_id)
          > (r.closing_observed_at, r.closing_source_id)
        then excluded.closing_observed_at else r.closing_observed_at end,
      closing_power = case
        when (excluded.closing_observed_at, excluded.closing_source_id)
          > (r.closing_observed_at, r.closing_source_id)
        then excluded.closing_power else r.closing_power end,
      closing_item_level = case
        when (excluded.closing_observed_at, excluded.closing_source_id)
          > (r.closing_observed_at, r.closing_source_id)
        then excluded.closing_item_level else r.closing_item_level end,
      source_count = r.source_count + 1,
      opening_boundary_hit = r.opening_boundary_hit or excluded.opening_boundary_hit,
      closing_boundary_hit = r.closing_boundary_hit or excluded.closing_boundary_hit,
      updated_at = now();
  end loop;

  return new;
end;
$function$;

-- Only verified, retained sources seed the new contract. No name-based identity guesses.
-- Legacy rows remain byte-for-byte equivalent in their original columns.
with source as materialized (
 select h.*, g.mode,
  (w.start_at at time zone 'Asia/Seoul')::date week_start,
  ((h.created_at at time zone 'Asia/Seoul')-interval '6 hours')::date week_day,
  case when g.mode='PVE' then h.pve_combat_power else h.pvp_combat_power end power,
  case when g.mode='PVE' then h.pve_item_level else h.pvp_item_level end item_level
 from public.character_history h
 cross join lateral (select case
  when upper(coalesce(h.gear_type,'')) in ('PVE','PVP') then upper(h.gear_type)
  when h.pve_item_level is not null and h.pve_combat_power is not null and h.pvp_item_level is null and h.pvp_combat_power is null then 'PVE'
  when h.pvp_item_level is not null and h.pvp_combat_power is not null and h.pve_item_level is null and h.pve_combat_power is null then 'PVP'
  else null end mode) g
 cross join lateral public.kinojo_aion_week_window(h.created_at) w
 where h.character_master_id is not null and h.record_type='POWER' and h.status='OK'
 and h.created_at is not null and h.history_date is not null
), ranked as (
 select s.*,
  row_number() over(partition by character_master_id,mode,week_start order by created_at,id) first_rank,
  row_number() over(partition by character_master_id,mode,week_start order by created_at desc,id desc) last_rank,
  count(*) over(partition by character_master_id,mode,week_start)::integer samples
 from source s where mode is not null and power is not null and item_level is not null
)
insert into private.character_growth_rollups (
 character_master_id,granularity,period_start,period_end_exclusive,week_start_hour,
 server_id,character_key,character_name,gear_type,
 opening_source_id,opening_local_date,opening_observed_at,opening_power,opening_item_level,
 closing_source_id,closing_local_date,closing_observed_at,closing_power,closing_item_level,
 source_count,opening_boundary_hit,closing_boundary_hit
)
select f.character_master_id,'WEEK',f.week_start,f.week_start+7,6,
 coalesce(l.server_id,2002),'MASTER:'||f.character_master_id::text,l.character_name,f.mode,
 f.id,to_date(lpad(f.history_date::text,6,'0'),'YYMMDD'),f.created_at,f.power,f.item_level,
 l.id,to_date(lpad(l.history_date::text,6,'0'),'YYMMDD'),l.created_at,l.power,l.item_level,
 f.samples,f.week_day=f.week_start,l.week_day=l.week_start+6
from ranked f join ranked l on l.character_master_id=f.character_master_id
 and l.mode=f.mode and l.week_start=f.week_start and l.last_rank=1
where f.first_rank=1;
CREATE OR REPLACE FUNCTION public.kinojo_character_growth_rollup_cleanup_v425(p_dry_run boolean DEFAULT true, p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '10s'
 SET lock_timeout TO '500ms'
AS $function$
declare
  v_dry_run boolean := coalesce(p_dry_run, true);
  v_limit integer := greatest(1, least(coalesce(p_limit, 1000), 2000));
  v_today_kst date := (statement_timestamp() at time zone 'Asia/Seoul')::date;
  v_day_end_cutoff date;
  v_week_end_cutoff timestamp without time zone;
  v_eligible_day integer := 0;
  v_eligible_week integer := 0;
  v_deleted_day integer := 0;
  v_deleted_week integer := 0;
  v_remaining_day integer := 0;
  v_remaining_week integer := 0;
begin
  -- A period is eligible only after its end boundary is at least the retention age.
  -- Weekly expiry uses the same 06:00 KST boundary, including conservative expiry of legacy archives.
  v_day_end_cutoff := v_today_kst - 7;
  v_week_end_cutoff := (statement_timestamp() at time zone 'Asia/Seoul') - interval '1 year';

  select
    count(*) filter (
      where r.granularity = 'DAY'
        and r.period_end_exclusive <= v_day_end_cutoff
    )::integer,
    count(*) filter (
      where r.granularity = 'WEEK'
        and (r.period_end_exclusive::timestamp + interval '6 hours') <= v_week_end_cutoff
    )::integer
  into v_eligible_day, v_eligible_week
  from private.character_growth_rollups r
  where (r.granularity = 'DAY' and r.period_end_exclusive <= v_day_end_cutoff)
     or (r.granularity = 'WEEK' and (r.period_end_exclusive::timestamp + interval '6 hours') <= v_week_end_cutoff);

  if v_dry_run is false then
    with due as materialized (
      select
        r.granularity,
        r.period_start,
        r.server_id,
        r.character_key,
        r.gear_type,
        r.week_start_hour
      from private.character_growth_rollups r
      where (r.granularity = 'DAY' and r.period_end_exclusive <= v_day_end_cutoff)
         or (r.granularity = 'WEEK' and (r.period_end_exclusive::timestamp + interval '6 hours') <= v_week_end_cutoff)
      order by r.period_end_exclusive asc, r.granularity asc,
        r.period_start asc, r.server_id asc, r.character_key asc, r.gear_type asc
      limit v_limit
      for update skip locked
    ),
    deleted as (
      delete from private.character_growth_rollups r
      using due d
      where r.granularity = d.granularity
        and r.period_start = d.period_start
        and r.server_id = d.server_id
        and r.character_key = d.character_key
        and r.gear_type = d.gear_type
        and r.week_start_hour = d.week_start_hour
      returning r.granularity
    )
    select
      count(*) filter (where granularity = 'DAY')::integer,
      count(*) filter (where granularity = 'WEEK')::integer
    into v_deleted_day, v_deleted_week
    from deleted;
  end if;

  select
    count(*) filter (
      where r.granularity = 'DAY'
        and r.period_end_exclusive <= v_day_end_cutoff
    )::integer,
    count(*) filter (
      where r.granularity = 'WEEK'
        and (r.period_end_exclusive::timestamp + interval '6 hours') <= v_week_end_cutoff
    )::integer
  into v_remaining_day, v_remaining_week
  from private.character_growth_rollups r
  where (r.granularity = 'DAY' and r.period_end_exclusive <= v_day_end_cutoff)
     or (r.granularity = 'WEEK' and (r.period_end_exclusive::timestamp + interval '6 hours') <= v_week_end_cutoff);

  return jsonb_build_object(
    'ok', true,
    'dryRun', v_dry_run,
    'scope', 'CHARACTER_GROWTH_ROLLUPS_ONLY',
    'todayKst', v_today_kst,
    'batchLimit', v_limit,
    'policies', jsonb_build_object(
      'DAY', jsonb_build_object(
        'retentionCompletedDays', 7,
        'deleteWhenPeriodEndOnOrBefore', v_day_end_cutoff,
        'currentInProgressDayProtected', true
      ),
      'WEEK', jsonb_build_object(
        'retention', '1_YEAR',
        'weekBoundary', 'WEDNESDAY_06:00_TO_NEXT_WEDNESDAY_06:00_ASIA_SEOUL',
        'deleteWhenPeriodEndOnOrBefore', v_week_end_cutoff
      ),
      'MONTH', jsonb_build_object(
        'retention', 'KEEP_FOREVER',
        'deleteCondition', null
      )
    ),
    'eligible', jsonb_build_object('DAY', v_eligible_day, 'WEEK', v_eligible_week, 'MONTH', 0),
    'deleted', jsonb_build_object('DAY', v_deleted_day, 'WEEK', v_deleted_week, 'MONTH', 0),
    'remainingDue', jsonb_build_object('DAY', v_remaining_day, 'WEEK', v_remaining_week, 'MONTH', 0),
    'rawSourceRowsDeleted', 0
  );
end;
$function$;

-- The existing weekly expiry job moves from 05:20 to 06:20 KST. No new cron job.
do $cron$
declare v_jobid bigint;
begin
 select jobid into strict v_jobid from cron.job
 where jobname='kinojo-character-growth-rollup-cleanup-v425';
 perform cron.alter_job(v_jobid,schedule:='20 21 * * 2');
end $cron$;
commit;
