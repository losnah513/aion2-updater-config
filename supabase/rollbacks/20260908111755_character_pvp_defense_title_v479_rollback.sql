-- DB479: preserve equipment threshold and all existing branches/ACL.
-- Changes only the equipped title option predicate. No data rewrite.
DO $patch$
DECLARE
  v_definition text := pg_get_functiondef('public.kinojo_extract_aion_pvp_dom(text,jsonb)'::regprocedure);
  v_from text := 'PVP[[:space:]]*피해[[:space:]]*(증폭|내성)';
  v_to text := 'PVP[[:space:]]*피해[[:space:]]*증폭';
BEGIN
  IF strpos(v_definition, v_to) > 0 AND strpos(v_definition, v_from) = 0 THEN
    RETURN;
  END IF;
  IF (length(v_definition) - length(replace(v_definition, v_from, ''))) / length(v_from) <> 1 THEN
    RAISE EXCEPTION 'PVP title predicate source drift; refusing replacement';
  END IF;
  EXECUTE replace(v_definition, v_from, v_to);
END
$patch$;
