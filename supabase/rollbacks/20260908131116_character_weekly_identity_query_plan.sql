-- Preserve the existing weekly API and Wednesday 06:00 KST window.
-- Group validated historical events by stable Master ID; project current labels.
begin;
set local lock_timeout='2s';
CREATE OR REPLACE FUNCTION public.kinojo_hof_weekly_gear_deltas(p_at timestamp with time zone DEFAULT now())
 RETURNS TABLE(server_id integer, character_name text, gear_type text, baseline_power integer, latest_power integer, power_delta integer, baseline_item_level integer, latest_item_level integer, item_level_delta integer, period_start timestamp with time zone, period_end timestamp with time zone, baseline_at timestamp with time zone, latest_at timestamp with time zone, baseline_payload_id bigint, latest_payload_id bigint, sample_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with bounds as (
    select w.start_at, w.end_at
    from public.kinojo_aion_week_window(coalesce(p_at, now())) w
  ), raw_events as (
    select
      cm.id as character_master_id,
      cm.server_id,
      cm.character_name,
      upper(coalesce(
        nullif(trim(p.gear_type), ''),
        nullif(trim(m.raw_payload #>> '{gearDiagnosis,detectedGearType}'), '')
      )) as gear_type,
      m.after_data,
      m.created_at,
      m.id as event_id,
      m.payload_id
    from public.master_sync_events m
    join public.extension_character_payloads p
      on p.id = m.payload_id and p.session_id = m.session_id
    join public.character_master cm
      on cm.id::text = m.after_data->>'id'
     and cm.char_key = p.char_key
     and p.char_key ~ '^[0-9]+$'
     and jsonb_typeof(m.after_data->'char_key') = 'string'
     and m.after_data->>'char_key' = p.char_key
     and m.after_data->>'latest_payload_id' = p.id::text
     and m.after_data->>'server_id' = p.server_id::text
     and public.kinojo_normalize_character_name(m.after_data->>'character_name')
       = public.kinojo_normalize_character_name(p.character_name)
     and public.kinojo_normalize_character_name(m.character_name)
       = public.kinojo_normalize_character_name(p.character_name)
    cross join bounds b
    where m.created_at >= b.start_at
      and m.created_at < b.end_at
      and m.status = 'synced'
      and coalesce(p.master_sync_status, '') = 'synced'
      and m.after_data is not null
      and m.after_data <> '{}'::jsonb
      and nullif(public.kinojo_normalize_character_name(m.character_name), '') is not null
  ), metric_events as (
    select
      r.server_id,
      r.character_master_id,
      r.character_name,
      r.gear_type,
      case r.gear_type
        when 'PVE' then public.kinojo_json_int(r.after_data, 'latest_pve_combat_power')
        when 'PVP' then public.kinojo_json_int(r.after_data, 'latest_pvp_combat_power')
      end::int as power_value,
      case r.gear_type
        when 'PVE' then public.kinojo_json_int(r.after_data, 'latest_pve_item_level')
        when 'PVP' then public.kinojo_json_int(r.after_data, 'latest_pvp_item_level')
      end::int as item_level_value,
      r.created_at,
      r.event_id,
      r.payload_id
    from raw_events r
    where r.server_id is not null
      and r.gear_type in ('PVE', 'PVP')
  ), valid_events as (
    select *
    from metric_events e
    where e.power_value is not null
      and e.item_level_value is not null
  ), gear_bounds as (
    select
      e.server_id,
      e.character_master_id,
      e.gear_type,
      (array_agg(e.character_name order by e.created_at desc, e.event_id desc))[1] as character_name,
      (array_agg(e.power_value order by e.created_at asc, e.event_id asc))[1]::int as baseline_power,
      (array_agg(e.power_value order by e.created_at desc, e.event_id desc))[1]::int as latest_power,
      (array_agg(e.item_level_value order by e.created_at asc, e.event_id asc))[1]::int as baseline_item_level,
      (array_agg(e.item_level_value order by e.created_at desc, e.event_id desc))[1]::int as latest_item_level,
      min(e.created_at) as baseline_at,
      max(e.created_at) as latest_at,
      (array_agg(e.payload_id order by e.created_at asc, e.event_id asc))[1]::bigint as baseline_payload_id,
      (array_agg(e.payload_id order by e.created_at desc, e.event_id desc))[1]::bigint as latest_payload_id,
      count(*)::int as sample_count
    from valid_events e
    group by e.character_master_id, e.server_id, e.gear_type
  )
  select
    g.server_id,
    g.character_name,
    g.gear_type,
    g.baseline_power,
    g.latest_power,
    (g.latest_power - g.baseline_power)::int as power_delta,
    g.baseline_item_level,
    g.latest_item_level,
    (g.latest_item_level - g.baseline_item_level)::int as item_level_delta,
    b.start_at as period_start,
    b.end_at as period_end,
    g.baseline_at,
    g.latest_at,
    g.baseline_payload_id,
    g.latest_payload_id,
    g.sample_count
  from gear_bounds g
  cross join bounds b;
$function$;

commit;
