CREATE OR REPLACE FUNCTION private.kinojo_payload_diagnosis_summary_v512(p_payload_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 select case when d.value is null then null else
   (d.value-'gearEvidence') || jsonb_build_object('gearEvidence',
     private.kinojo_payload_evidence_v509(d.value->'gearEvidence')) end
 from (select public.kinojo_payload_gear_diagnosis(p_payload_id) value) d;
$function$
;
