-- Recovery freeze only: preserve all data/06h expiry/cron. DAY/MONTH continue.
-- Keep raw history during freeze and rebuild verified 06h weeks before resuming.
begin;
set local lock_timeout='2s';
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
    if v_granularity='WEEK' then continue; end if;
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
commit;
