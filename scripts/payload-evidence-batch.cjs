// Only use after full encrypted-backup restore and independent projection checks.
module.exports=function(rows,batch){
 if(!Number.isSafeInteger(batch)||batch<1||!rows.length||rows.length>250||rows.some(r=>!Number.isSafeInteger(r.id)||r.id<1||!['before','after'].every(k=>/^[a-f0-9]{32}$/.test(r[k]))))throw Error('INVALID_APPROVED_BATCH');
 return `BEGIN READ WRITE;
SET LOCAL lock_timeout='500ms';SET LOCAL statement_timeout='15s';SET LOCAL timezone='UTC';
LOCK TABLE public.extension_character_payloads IN ACCESS EXCLUSIVE MODE NOWAIT;
CREATE TEMP TABLE approved_payload_evidence(id bigint primary key,before_hash text,after_hash text) ON COMMIT DROP;
INSERT INTO approved_payload_evidence VALUES ${rows.map(r=>`(${r.id},'${r.before}','${r.after}')`).join(',')};
DO $verify$ BEGIN
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.extension_character_payloads'::regclass AND tgname IN ('trg_extension_payload_gear_meta','trg_kinojo_official_name_case_sync_v298','zz_kinojo_payload_compact_v500') AND tgenabled='O')<>3 THEN RAISE EXCEPTION 'PAYLOAD_TRIGGER_STATE_CHANGED'; END IF;
 IF (WITH matched AS MATERIALIZED(SELECT p.* FROM public.extension_character_payloads p JOIN approved_payload_evidence a USING(id)) SELECT count(*) FROM matched p JOIN approved_payload_evidence a USING(id) WHERE md5(to_jsonb(p)::text)=a.before_hash AND jsonb_typeof(p.raw_payload)='object' AND p.raw_payload ? 'gearEvidence' AND p.raw_payload->'gearEvidence'=p.gear_evidence)<>${rows.length} THEN RAISE EXCEPTION 'PAYLOAD_EVIDENCE_SOURCE_CHANGED'; END IF;
END $verify$;
-- The transaction's exclusive lock isolates these two historical side-effect guards.
ALTER TABLE public.extension_character_payloads DISABLE TRIGGER trg_extension_payload_gear_meta;
ALTER TABLE public.extension_character_payloads DISABLE TRIGGER trg_kinojo_official_name_case_sync_v298;
UPDATE public.extension_character_payloads p SET raw_payload=private.kinojo_payload_evidence_raw_v505(p.raw_payload,p.gear_evidence) FROM approved_payload_evidence a WHERE p.id=a.id;
ALTER TABLE public.extension_character_payloads ENABLE TRIGGER trg_extension_payload_gear_meta;
ALTER TABLE public.extension_character_payloads ENABLE TRIGGER trg_kinojo_official_name_case_sync_v298;
DO $verify$ BEGIN
 IF (WITH matched AS MATERIALIZED(SELECT p.* FROM public.extension_character_payloads p JOIN approved_payload_evidence a USING(id)) SELECT count(*) FROM matched p JOIN approved_payload_evidence a USING(id) WHERE md5(to_jsonb(p)::text)=a.after_hash)<>${rows.length} THEN RAISE EXCEPTION 'PAYLOAD_EVIDENCE_RESULT_CHANGED'; END IF;
END $verify$;
SELECT jsonb_build_object('batch',${batch},'rows',${rows.length},'verified',true) result;
COMMIT;`;
};
