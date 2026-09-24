module.exports=function(versions,number){
 if(!versions.length||versions.length>4||!Number.isSafeInteger(number))throw Error('Invalid batch');
 const tables=['private.kinojo_ranking_snapshot_items_v390','private.kinojo_ranking_snapshot_owner_metrics_v390','private.kinojo_ranking_snapshot_scopes_v390'];
 for(const v of versions){if(!Number.isSafeInteger(v.id))throw Error('Invalid ID');for(const t of tables){const r=v.tables[t];if(!r||!Number.isSafeInteger(r.n)||!(/^[0-9a-f]{32}$/.test(r.hash)))throw Error('Invalid source hash');}}
 const ids=versions.map(v=>v.id);
 const checks=versions.flatMap(v=>tables.map(t=>`IF (SELECT count(*)=${v.tables[t].n} AND md5(string_agg(md5(to_jsonb(s)::text),'' ORDER BY md5(to_jsonb(s)::text)))='${v.tables[t].hash}' FROM ${t} s WHERE snapshot_id=${v.id}) IS DISTINCT FROM true THEN RAISE EXCEPTION 'REPLICA_SOURCE_CHANGED';END IF;`)).join('\n');
 return `BEGIN READ WRITE;SET LOCAL timezone='UTC';SET LOCAL statement_timeout='15s';SET LOCAL lock_timeout='500ms';
LOCK TABLE private.kinojo_ranking_snapshots_v390,private.kinojo_ranking_snapshot_pointer_v390 IN SHARE MODE NOWAIT;
LOCK TABLE ${tables.join(',')} IN SHARE ROW EXCLUSIVE MODE NOWAIT;
DO $guard$ DECLARE r jsonb;BEGIN
r:=private.kinojo_ranking_replica_cleanup_v507(true,4);
IF r->'snapshotIds' IS DISTINCT FROM '${JSON.stringify(ids)}'::jsonb THEN RAISE EXCEPTION 'REPLICA_PROTECTION_CHANGED';END IF;
${checks}
r:=private.kinojo_ranking_replica_cleanup_v507(false,4);
IF r->'snapshotIds' IS DISTINCT FROM '${JSON.stringify(ids)}'::jsonb OR (r->>'itemsDeleted')::int<>${versions.reduce((n,v)=>n+v.tables[tables[0]].n,0)} OR (r->>'ownersDeleted')::int<>${versions.reduce((n,v)=>n+v.tables[tables[1]].n,0)} OR (r->>'scopesDeleted')::int<>${versions.reduce((n,v)=>n+v.tables[tables[2]].n,0)} THEN RAISE EXCEPTION 'REPLICA_RESULT_CHANGED';END IF;
END $guard$;
SELECT jsonb_build_object('batch',${number},'versions','${JSON.stringify(ids)}'::jsonb,'verified',true) result;COMMIT;`;
};
