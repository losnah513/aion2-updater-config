module.exports=function(rows,batch){
 if(!rows.length||rows.length>250||!Number.isSafeInteger(batch))throw Error('Invalid batch');
 for(const r of rows)if(!Number.isSafeInteger(r.id)||!['before','after'].every(k=>/^[a-f0-9]{32}$/.test(r[k])))throw Error('Invalid manifest');
 return `BEGIN READ WRITE;
SET LOCAL lock_timeout='500ms';SET LOCAL statement_timeout='20s';SET LOCAL timezone='UTC';
SELECT pg_advisory_xact_lock(501,501);
LOCK TABLE public.lookup_snapshots IN SHARE ROW EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.character_master,public.character_skill_current_state,public.character_stat_sources,private.character_snapshot_requests,public.updater_sessions,public.lookup_session_targets,public.extension_character_payloads IN SHARE MODE NOWAIT;
CREATE TEMP TABLE approved_historical_rows(id bigint primary key,before_hash text,after_hash text) ON COMMIT DROP;
INSERT INTO approved_historical_rows VALUES ${rows.map(r=>`(${r.id},'${r.before}','${r.after}')`).join(',')};
DO $verify$
DECLARE n integer;
BEGIN
 IF (SELECT count(*) FROM private.kinojo_snapshot_text_candidates_v504(${rows[0].id-1},5000) c JOIN approved_historical_rows a ON a.id=c.id)<>${rows.length} THEN RAISE EXCEPTION 'HISTORICAL_PROTECTION_CHANGED';END IF;
 IF (WITH matched AS MATERIALIZED (SELECT s.* FROM public.lookup_snapshots s JOIN approved_historical_rows a USING(id)) SELECT count(*) FROM matched s JOIN approved_historical_rows a USING(id) WHERE md5(to_jsonb(s)::text)=a.before_hash)<>${rows.length} THEN RAISE EXCEPTION 'HISTORICAL_SOURCE_CHANGED';END IF;
 UPDATE public.lookup_snapshots s SET raw_payload=private.kinojo_snapshot_text_v504(s.raw_payload),retained_parser_stats_v504=jsonb_build_object('characterName',s.character_name,'stats',public.kinojo_extract_aion_stats_from_text(public.kinojo_snapshot_parser_text(s.raw_payload),s.character_name,null)) FROM approved_historical_rows a WHERE s.id=a.id;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>${rows.length} OR (WITH matched AS MATERIALIZED (SELECT s.* FROM public.lookup_snapshots s JOIN approved_historical_rows a USING(id)) SELECT count(*) FROM matched s JOIN approved_historical_rows a USING(id) WHERE md5(to_jsonb(s)::text)=a.after_hash)<>${rows.length} THEN RAISE EXCEPTION 'HISTORICAL_RESULT_CHANGED';END IF;
END $verify$;
SELECT jsonb_build_object('batch',${batch},'rows',${rows.length},'verified',true) result;
COMMIT;
`;
};
