-- Stops future deduplication. Past copies require the verified encrypted backup.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='15s';
CREATE OR REPLACE FUNCTION private.kinojo_payload_compact_v500()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 new.raw_payload := private.kinojo_payload_raw_v500(new.raw_payload);
 return new;
end;
$function$;
DROP FUNCTION private.kinojo_payload_evidence_raw_v505(jsonb,jsonb);
commit;
