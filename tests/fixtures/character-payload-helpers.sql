CREATE OR REPLACE FUNCTION public.kinojo_character_identity_key_v298(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select lower(regexp_replace(coalesce(trim(p_name), ''), '\s+', '', 'g'));
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_identity_name_v285(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.kinojo_character_identity_key_v298(p_name);
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_json_int(p_payload jsonb, VARIADIC p_keys text[])
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  t text;
begin
  t := public.kinojo_json_text(p_payload, variadic p_keys);
  if t is null then
    return null;
  end if;
  t := regexp_replace(t, '[^0-9-]', '', 'g');
  if t is null or t = '' or t = '-' then
    return null;
  end if;
  return t::int;
exception when others then
  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_json_text(p_payload jsonb, VARIADIC p_keys text[])
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  k text;
  v text;
begin
  if p_payload is null then
    return null;
  end if;
  foreach k in array p_keys loop
    v := nullif(trim(both from p_payload ->> k), '');
    if v is not null then
      return v;
    end if;
  end loop;
  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_strip_server_suffix(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select nullif(trim(regexp_replace(coalesce(p_value, ''), '\[[^\]]+\]\s*$', '', 'g')), '');
$function$
;
