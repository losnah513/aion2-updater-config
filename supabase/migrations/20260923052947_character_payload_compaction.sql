-- SQL500: retain structured character observations; remove duplicate raw payload fields.
-- Full detailed raw data remains in lookup_snapshots. Historical cleanup is separately backed up.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='15s';
CREATE FUNCTION private.kinojo_payload_raw_v500(p_raw jsonb)
 RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
 select case when jsonb_typeof(p_raw) <> 'object' then p_raw
 else coalesce((select jsonb_object_agg(key,value) from jsonb_each(p_raw)
 where key=any(array['targetId','target_id','mainCharacterName','main_character_name',
 'owner','main','status','crawlStatus','snapshotId','gearParseStatus','parseStatus',
 'gearEvidence','characterName'])),'{}'::jsonb) end;
$function$;
CREATE FUNCTION private.kinojo_payload_compact_v500()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 new.raw_payload := private.kinojo_payload_raw_v500(new.raw_payload);
 return new;
end;
$function$;
REVOKE ALL ON FUNCTION private.kinojo_payload_raw_v500(jsonb),private.kinojo_payload_compact_v500()
 FROM PUBLIC,anon,authenticated,service_role;
-- Alphabetical order is intentional: existing metadata/identity triggers see the original input.
CREATE TRIGGER zz_kinojo_payload_compact_v500
 BEFORE INSERT OR UPDATE OF raw_payload ON public.extension_character_payloads
 FOR EACH ROW EXECUTE FUNCTION private.kinojo_payload_compact_v500();
commit;
