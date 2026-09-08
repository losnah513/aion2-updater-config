create table private.character_growth_rollups(granularity text not null,period_start date not null,period_end_exclusive date not null,server_id integer not null,character_key text not null,character_name text not null,gear_type text not null,opening_source_id bigint,opening_local_date date,opening_observed_at timestamp with time zone,opening_power integer,opening_item_level integer,closing_source_id bigint not null,closing_local_date date not null,closing_observed_at timestamp with time zone not null,closing_power integer not null,closing_item_level integer not null,source_count integer default 1 not null,opening_boundary_hit boolean default false not null,closing_boundary_hit boolean default false not null,boundary_complete boolean generated always as (((granularity = 'DAY'::text) OR (opening_boundary_hit AND closing_boundary_hit))) stored,power_delta integer generated always as (
CASE
    WHEN (opening_power IS NULL) THEN NULL::integer
    ELSE (closing_power - opening_power)
END) stored,item_level_delta integer generated always as (
CASE
    WHEN (opening_item_level IS NULL) THEN NULL::integer
    ELSE (closing_item_level - opening_item_level)
END) stored,source_checksum text generated always as (md5(((((((((((COALESCE((opening_source_id)::text, ''::text) || '|'::text) || COALESCE((opening_power)::text, ''::text)) || '|'::text) || COALESCE((opening_item_level)::text, ''::text)) || '|'::text) || (closing_source_id)::text) || '|'::text) || (closing_power)::text) || '|'::text) || (closing_item_level)::text))) stored,created_at timestamp with time zone default now() not null,updated_at timestamp with time zone default now() not null,primary key(granularity,period_start,server_id,character_key,gear_type));
CREATE OR REPLACE FUNCTION private.kinojo_growth_rollup_period_start_v424(p_granularity text, p_local_date date)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
  select case upper(p_granularity)
    when 'DAY' then p_local_date
    when 'WEEK' then p_local_date - mod(extract(dow from p_local_date)::integer - 3 + 7, 7)
    when 'MONTH' then date_trunc('month', p_local_date)::date
    else null
  end;
$function$;
CREATE OR REPLACE FUNCTION private.kinojo_growth_rollup_period_end_v424(p_granularity text, p_period_start date)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
  select case upper(p_granularity)
    when 'DAY' then p_period_start + 1
    when 'WEEK' then p_period_start + 7
    when 'MONTH' then (p_period_start + interval '1 month')::date
    else null
  end;
$function$;
CREATE OR REPLACE FUNCTION private.kinojo_growth_rollup_history_insert_v424()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_local_date date;
  v_character_key text;
  v_gear_type text;
  v_power integer;
  v_item_level integer;
  v_granularity text;
  v_period_start date;
  v_period_end date;
begin
  if new.record_type is distinct from 'POWER' or new.status is distinct from 'OK' then
    return new;
  end if;

  v_character_key := public.kinojo_character_identity_key_v298(new.character_name);
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

  foreach v_granularity in array array['DAY', 'WEEK', 'MONTH'] loop
    v_period_start := private.kinojo_growth_rollup_period_start_v424(v_granularity, v_local_date);
    v_period_end := private.kinojo_growth_rollup_period_end_v424(v_granularity, v_period_start);

    insert into private.character_growth_rollups as r (
      granularity, period_start, period_end_exclusive,
      server_id, character_key, character_name, gear_type,
      opening_source_id, opening_local_date, opening_observed_at,
      opening_power, opening_item_level,
      closing_source_id, closing_local_date, closing_observed_at,
      closing_power, closing_item_level,
      source_count, opening_boundary_hit, closing_boundary_hit
    ) values (
      v_granularity, v_period_start, v_period_end,
      coalesce(new.server_id, 2002), v_character_key, new.character_name, v_gear_type,
      case when v_granularity = 'DAY' then null else new.id end,
      case when v_granularity = 'DAY' then null else v_local_date end,
      case when v_granularity = 'DAY' then null else new.created_at end,
      case when v_granularity = 'DAY' then null else v_power end,
      case when v_granularity = 'DAY' then null else v_item_level end,
      new.id, v_local_date, new.created_at, v_power, v_item_level,
      1,
      case when v_granularity = 'DAY' then true else v_local_date = v_period_start end,
      case when v_granularity = 'DAY' then true else v_local_date = v_period_end - 1 end
    )
    on conflict (granularity, period_start, server_id, character_key, gear_type)
    do update set
      period_end_exclusive = excluded.period_end_exclusive,
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
