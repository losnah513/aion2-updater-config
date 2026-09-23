// Run only after encrypted backup restoration and independent projection verification.
// No credentials or operating data. Caller supplies the verified per-row hashes.
module.exports=function batchSql(rows,batch){
 if(!Number.isSafeInteger(batch)||batch<1||!rows.length||rows.length>250||rows.some(r=>!Number.isSafeInteger(r.id)||r.id<1||! /^[a-f0-9]{32}$/.test(r.before)||! /^[a-f0-9]{32}$/.test(r.after)))throw Error('INVALID_APPROVED_BATCH');
 return `BEGIN READ WRITE;
SET LOCAL lock_timeout='500ms';SET LOCAL statement_timeout='10s';SET LOCAL timezone='UTC';
LOCK TABLE public.extension_character_payloads IN ACCESS EXCLUSIVE MODE NOWAIT;
CREATE TEMP TABLE approved_payload_rows(id bigint primary key,before_hash text,after_hash text) ON COMMIT DROP;
INSERT INTO approved_payload_rows VALUES ${rows.map(r=>`(${r.id},'${r.before}','${r.after}')`).join(',')};
DO $verify$ BEGIN
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.extension_character_payloads'::regclass AND tgname IN ('trg_extension_payload_gear_meta','trg_kinojo_official_name_case_sync_v298','zz_kinojo_payload_compact_v500') AND tgenabled='O')<>3 THEN
  RAISE EXCEPTION 'PAYLOAD_TRIGGER_STATE_CHANGED';
 END IF;
 IF (SELECT count(*) FROM public.extension_character_payloads e JOIN approved_payload_rows a ON a.id=e.id AND md5(to_jsonb(e)::text)=a.before_hash)<>${rows.length} THEN
  RAISE EXCEPTION 'PAYLOAD_BACKUP_SOURCE_CHANGED';
 END IF;
END $verify$;
-- Transactional trigger DDL is hidden from other writers by the exclusive table lock.
ALTER TABLE public.extension_character_payloads DISABLE TRIGGER trg_extension_payload_gear_meta;
ALTER TABLE public.extension_character_payloads DISABLE TRIGGER trg_kinojo_official_name_case_sync_v298;
UPDATE public.extension_character_payloads e SET raw_payload=private.kinojo_payload_raw_v500(e.raw_payload)
 FROM approved_payload_rows a WHERE a.id=e.id;
ALTER TABLE public.extension_character_payloads ENABLE TRIGGER trg_extension_payload_gear_meta;
ALTER TABLE public.extension_character_payloads ENABLE TRIGGER trg_kinojo_official_name_case_sync_v298;
DO $verify$ BEGIN
 IF (SELECT count(*) FROM public.extension_character_payloads e JOIN approved_payload_rows a ON a.id=e.id AND md5(to_jsonb(e)::text)=a.after_hash)<>${rows.length} THEN
  RAISE EXCEPTION 'PAYLOAD_COMPACT_RESULT_CHANGED';
 END IF;
END $verify$;
SELECT jsonb_build_object('batch',${batch},'rows',${rows.length},'first_id',${rows[0].id},'last_id',${rows.at(-1).id},'verified',true) result;
COMMIT;
`;
};
