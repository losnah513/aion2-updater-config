// Only externally restored rows are accepted; recheck source and authoritative link under locks.
module.exports=function(rows,number){
 if(!rows.length||rows.length>500||!Number.isSafeInteger(number))throw Error('Invalid batch');
 for(const r of rows)if(!Number.isSafeInteger(r.id)||!Number.isSafeInteger(r.payloadId)||!['before','after'].every(k=>/^[a-f0-9]{32}$/.test(r[k])))throw Error('Invalid manifest');
 return `BEGIN READ WRITE;
SET LOCAL lock_timeout='500ms';SET LOCAL statement_timeout='15s';SET LOCAL timezone='UTC';
LOCK TABLE public.extension_character_payloads IN SHARE MODE NOWAIT;
LOCK TABLE public.snapshot_intake_events IN SHARE ROW EXCLUSIVE MODE NOWAIT;
CREATE TEMP TABLE approved_intake_rows(id bigint primary key,payload_id bigint,before_hash text,after_hash text) ON COMMIT DROP;
INSERT INTO approved_intake_rows VALUES ${rows.map(r=>`(${r.id},${r.payloadId},'${r.before}','${r.after}')`).join(',')};
DO $verify$
DECLARE n integer;
BEGIN
 IF (SELECT count(*) FROM public.snapshot_intake_events e JOIN approved_intake_rows a USING(id)
 WHERE md5(to_jsonb(e)::text)=a.before_hash AND private.kinojo_intake_synced_payload_v506(e)=a.payload_id
 AND e.created_at<statement_timestamp()-interval '24 hours')<>${rows.length} THEN RAISE EXCEPTION 'INTAKE_SOURCE_OR_LINK_CHANGED';END IF;
 UPDATE public.snapshot_intake_events e SET raw_payload=private.kinojo_intake_summary_v506(e.raw_payload,a.payload_id) FROM approved_intake_rows a WHERE e.id=a.id;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>${rows.length} OR (SELECT count(*) FROM public.snapshot_intake_events e JOIN approved_intake_rows a USING(id) WHERE md5(to_jsonb(e)::text)=a.after_hash)<>${rows.length} THEN RAISE EXCEPTION 'INTAKE_RESULT_CHANGED';END IF;
END $verify$;
SELECT jsonb_build_object('batch',${number},'rows',${rows.length},'verified',true) result;
COMMIT;`;
};

