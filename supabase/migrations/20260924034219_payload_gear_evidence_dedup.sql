-- SQL505: remove only the exact duplicate of the authoritative gear_evidence.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='15s';
CREATE FUNCTION private.kinojo_payload_evidence_raw_v505(p_raw jsonb,p_evidence jsonb)
 RETURNS jsonb LANGUAGE sql IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
 select case when jsonb_typeof(p_raw)='object' and p_raw ? 'gearEvidence'
   and p_raw->'gearEvidence'=p_evidence then p_raw-'gearEvidence' else p_raw end;
$function$;
REVOKE ALL ON FUNCTION private.kinojo_payload_evidence_raw_v505(jsonb,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.kinojo_payload_compact_v500()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 new.raw_payload := private.kinojo_payload_evidence_raw_v505(
   private.kinojo_payload_raw_v500(new.raw_payload),new.gear_evidence);
 return new;
end;
$function$;
commit;
