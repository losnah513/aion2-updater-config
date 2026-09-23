// Historical use requires a full encrypted backup and independent restore/projection verification.
module.exports=function batch(rows,n){
 if(!Number.isSafeInteger(n)||n<1||!rows.length||rows.length>250||rows.some(r=>!Number.isSafeInteger(r.id)||r.id<1||! /^[a-f0-9]{32}$/.test(r.before)||! /^[a-f0-9]{32}$/.test(r.after)))throw Error('INVALID_APPROVED_SNAPSHOT_BATCH');
 return `BEGIN READ WRITE;
SET LOCAL statement_timeout='15s';SET LOCAL lock_timeout='500ms';SET LOCAL timezone='UTC';
SELECT pg_advisory_xact_lock(501,501);
LOCK TABLE public.character_master,public.character_skill_current_state,public.updater_sessions,
 public.lookup_session_targets,public.extension_character_payloads IN SHARE MODE NOWAIT;
CREATE TEMP TABLE approved_snapshot_rows(id bigint primary key,before_hash text,after_hash text) ON COMMIT DROP;
INSERT INTO approved_snapshot_rows VALUES ${rows.map(r=>`(${r.id},'${r.before}','${r.after}')`).join(',')};
DO $check$ BEGIN
 PERFORM s.id FROM public.lookup_snapshots s JOIN approved_snapshot_rows a ON a.id=s.id FOR UPDATE OF s NOWAIT;
 IF (SELECT count(*) FROM private.kinojo_snapshot_raw_candidates_v501(${rows[0].id-1},250) c JOIN approved_snapshot_rows a ON a.id=c.id)<>${rows.length} THEN RAISE EXCEPTION 'SNAPSHOT_PROTECTION_CHANGED'; END IF;
 IF (WITH matched AS MATERIALIZED (SELECT s.id,to_jsonb(s) data FROM public.lookup_snapshots s JOIN approved_snapshot_rows a ON a.id=s.id) SELECT count(*) FROM matched s JOIN approved_snapshot_rows a ON a.id=s.id AND md5(s.data::text)=a.before_hash)<>${rows.length} THEN RAISE EXCEPTION 'SNAPSHOT_BACKUP_SOURCE_CHANGED'; END IF;
 UPDATE public.lookup_snapshots s SET raw_payload=private.kinojo_snapshot_raw_v501(s.raw_payload) FROM approved_snapshot_rows a WHERE a.id=s.id;
 IF (WITH matched AS MATERIALIZED (SELECT s.id,to_jsonb(s) data FROM public.lookup_snapshots s JOIN approved_snapshot_rows a ON a.id=s.id) SELECT count(*) FROM matched s JOIN approved_snapshot_rows a ON a.id=s.id AND md5(s.data::text)=a.after_hash)<>${rows.length} THEN RAISE EXCEPTION 'SNAPSHOT_COMPACT_RESULT_CHANGED'; END IF;
END $check$;
SELECT jsonb_build_object('batch',${n},'rows',${rows.length},'first_id',${rows[0].id},'last_id',${rows.at(-1).id},'verified',true) result;
COMMIT;
`;
};
