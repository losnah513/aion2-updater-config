// Hash guarded maintenance SQL; rows come only from a verified private backup.
module.exports=function batch(rows,number){
 if(!rows.length||rows.length>500||!Number.isSafeInteger(number))throw Error('Invalid batch');
 for(const r of rows)if(!Number.isSafeInteger(r.id)||!['before','after'].every(k=>/^[a-f0-9]{32}$/.test(r[k])))throw Error('Invalid manifest');
 return `BEGIN READ WRITE;
SET LOCAL lock_timeout='500ms';SET LOCAL statement_timeout='15s';SET LOCAL timezone='UTC';
LOCK TABLE public.extension_character_payloads IN SHARE MODE NOWAIT;
LOCK TABLE public.snapshot_intake_events IN SHARE ROW EXCLUSIVE MODE NOWAIT;
CREATE TEMP TABLE approved_intake_rows(id bigint primary key,before_hash text,after_hash text) ON COMMIT DROP;
INSERT INTO approved_intake_rows VALUES ${rows.map(r=>`(${r.id},'${r.before}','${r.after}')`).join(',')};
DO $verify$
DECLARE n integer;
BEGIN
 IF (WITH matched AS MATERIALIZED (SELECT e.* FROM public.snapshot_intake_events e JOIN approved_intake_rows a USING(id)) SELECT count(*) FROM matched e JOIN approved_intake_rows a USING(id) JOIN public.extension_character_payloads p ON p.id=private.kinojo_intake_payload_id_v503(e.raw_payload) WHERE md5(to_jsonb(e)::text)=a.before_hash AND e.event_type='submit' AND e.status='received' AND e.raw_payload ? 'gearEvidence' AND p.session_id=e.session_id AND p.snapshot_uid=e.snapshot_uid AND p.master_sync_status='synced' AND p.gear_evidence=e.raw_payload->'gearEvidence')<>${rows.length} THEN
  RAISE EXCEPTION 'INTAKE_SOURCE_OR_AUTHORITATIVE_COPY_CHANGED';
 END IF;
 UPDATE public.snapshot_intake_events e SET raw_payload=e.raw_payload-'gearEvidence' FROM approved_intake_rows a WHERE e.id=a.id;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>${rows.length} OR (WITH matched AS MATERIALIZED (SELECT e.* FROM public.snapshot_intake_events e JOIN approved_intake_rows a USING(id)) SELECT count(*) FROM matched e JOIN approved_intake_rows a USING(id) WHERE md5(to_jsonb(e)::text)=a.after_hash)<>${rows.length} THEN
  RAISE EXCEPTION 'INTAKE_COMPACTION_RESULT_CHANGED';
 END IF;
END $verify$;
SELECT jsonb_build_object('batch',${number},'rows',${rows.length},'verified',true) result;
COMMIT;
`;
};
