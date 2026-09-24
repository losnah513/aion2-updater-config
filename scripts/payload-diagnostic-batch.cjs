// Apply only manifests verified against a complete external encrypted backup.
module.exports=function(rows,batch){
 if(!Number.isSafeInteger(batch)||batch<1||!Array.isArray(rows)||!rows.length||rows.length>250)throw Error('invalid batch');
 if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('duplicate id');
 for(const r of rows)if(!Number.isSafeInteger(r.id)||r.id<1||!(/^[a-f0-9]{32}$/.test(r.before))||!(/^[a-f0-9]{32}$/.test(r.after)))throw Error('invalid manifest');
 const values=rows.map(r=>`(${r.id},'${r.before}','${r.after}')`).join(',');
 return `BEGIN READ WRITE;
SET LOCAL lock_timeout='500ms';SET LOCAL statement_timeout='15s';SET LOCAL timezone='UTC';
DO $$BEGIN IF NOT pg_try_advisory_xact_lock(501,501) THEN RAISE EXCEPTION 'PAYLOAD_DIAGNOSTIC_BUSY';END IF;END$$;
LOCK TABLE public.extension_character_payloads IN SHARE ROW EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.character_master,public.character_stat_sources,public.updater_sessions,public.updater_runtime_jobs,public.lookup_session_targets IN SHARE MODE NOWAIT;
CREATE TEMP TABLE approved_payload_diagnostics(id bigint primary key,before_hash text,after_hash text) ON COMMIT DROP;
INSERT INTO approved_payload_diagnostics VALUES ${values};
DO $$BEGIN
 IF (SELECT count(*) FROM approved_payload_diagnostics a JOIN private.kinojo_payload_evidence_candidates_v509(${Math.min(...rows.map(r=>r.id))-1},${rows.length}) c USING(id))<>${rows.length} THEN RAISE EXCEPTION 'PAYLOAD_DIAGNOSTIC_PROTECTION_CHANGED';END IF;
 IF (SELECT count(*) FROM approved_payload_diagnostics a JOIN public.extension_character_payloads p USING(id) WHERE md5(to_jsonb(p)::text)=a.before_hash)<>${rows.length} THEN RAISE EXCEPTION 'PAYLOAD_DIAGNOSTIC_SOURCE_CHANGED';END IF;
END$$;
UPDATE public.extension_character_payloads p SET gear_evidence=private.kinojo_payload_evidence_v509(p.gear_evidence) FROM approved_payload_diagnostics a WHERE p.id=a.id;
DO $$BEGIN IF (SELECT count(*) FROM approved_payload_diagnostics a JOIN public.extension_character_payloads p USING(id) WHERE md5(to_jsonb(p)::text)=a.after_hash)<>${rows.length} THEN RAISE EXCEPTION 'PAYLOAD_DIAGNOSTIC_RESULT_CHANGED';END IF;END$$;
SELECT jsonb_build_object('batch',${batch},'count',${rows.length},'hash',md5(string_agg(md5(to_jsonb(p)::text),'' ORDER BY p.id))) receipt FROM public.extension_character_payloads p JOIN approved_payload_diagnostics a USING(id);
COMMIT;`;
};
