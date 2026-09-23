CREATE OR REPLACE FUNCTION private.kinojo_json_find_text_v321(p_doc jsonb, p_keys text[], p_depth integer DEFAULT 0)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'private'
AS $function$
declare
  v_key text;
  v_value jsonb;
  v_result text;
begin
  if p_doc is null or p_depth > 8 then
    return null;
  end if;

  if jsonb_typeof(p_doc) = 'object' then
    foreach v_key in array p_keys loop
      if p_doc ? v_key then
        v_value := p_doc -> v_key;
        if jsonb_typeof(v_value) in ('string', 'number', 'boolean') then
          return nullif(trim(both '"' from v_value::text), '');
        end if;
      end if;
    end loop;

    for v_value in select value from jsonb_each(p_doc) loop
      v_result := private.kinojo_json_find_text_v321(v_value, p_keys, p_depth + 1);
      if nullif(v_result, '') is not null then
        return v_result;
      end if;
    end loop;
  elsif jsonb_typeof(p_doc) = 'array' then
    for v_value in select value from jsonb_array_elements(p_doc) loop
      v_result := private.kinojo_json_find_text_v321(v_value, p_keys, p_depth + 1);
      if nullif(v_result, '') is not null then
        return v_result;
      end if;
    end loop;
  end if;

  return null;
end;
$function$

;
