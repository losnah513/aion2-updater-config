CREATE OR REPLACE FUNCTION private.kinojo_normalize_compare_text_v321(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select lower(regexp_replace(coalesce(p_value, ''), '\s+', '', 'g'));
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_numeric_equal_v321(p_expected text, p_actual text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_expected numeric;
  v_actual numeric;
begin
  if nullif(trim(coalesce(p_expected, '')), '') is null then
    return true;
  end if;
  if nullif(trim(coalesce(p_actual, '')), '') is null then
    return false;
  end if;
  begin
    v_expected := replace(trim(p_expected), ',', '')::numeric;
    v_actual := replace(trim(p_actual), ',', '')::numeric;
  exception when others then
    return false;
  end;
  return v_expected = v_actual;
end;
$function$
;
