CREATE OR REPLACE FUNCTION public.kinojo_aion_week_window(p_at timestamp with time zone DEFAULT now())
 RETURNS TABLE(start_at timestamp with time zone, end_at timestamp with time zone, time_zone text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_local timestamp without time zone := coalesce(p_at, now()) at time zone 'Asia/Seoul';
  v_start_local timestamp without time zone;
  v_days_since_wednesday int;
begin
  v_days_since_wednesday := mod(extract(dow from v_local)::int - 3 + 7, 7);
  v_start_local := (v_local::date - v_days_since_wednesday) + time '06:00:00';

  if v_local < v_start_local then
    v_start_local := v_start_local - interval '7 days';
  end if;

  start_at := v_start_local at time zone 'Asia/Seoul';
  end_at := (v_start_local + interval '7 days') at time zone 'Asia/Seoul';
  time_zone := 'Asia/Seoul';
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_hof_weekly_deltas(p_at timestamp with time zone DEFAULT now())
 RETURNS TABLE(server_id integer, character_name text, power_delta integer, item_level_delta integer, period_start timestamp with time zone, period_end timestamp with time zone, first_event_at timestamp with time zone, last_event_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with gear_rows as (
    select *
    from public.kinojo_hof_weekly_gear_deltas(coalesce(p_at, now()))
  ), combined as (
    select
      g.server_id,
      public.kinojo_normalize_character_name(g.character_name) as normalized_name,
      (array_agg(g.character_name order by g.latest_at desc, g.latest_payload_id desc))[1] as character_name,
      sum(g.power_delta)::int as power_delta,
      sum(g.item_level_delta)::int as item_level_delta,
      min(g.period_start) as period_start,
      max(g.period_end) as period_end,
      min(g.baseline_at) as first_event_at,
      max(g.latest_at) as last_event_at
    from gear_rows g
    group by g.server_id, public.kinojo_normalize_character_name(g.character_name)
  )
  select
    c.server_id,
    c.character_name,
    c.power_delta,
    c.item_level_delta,
    c.period_start,
    c.period_end,
    c.first_event_at,
    c.last_event_at
  from combined c;
$function$;
