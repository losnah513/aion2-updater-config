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
$function$
;
