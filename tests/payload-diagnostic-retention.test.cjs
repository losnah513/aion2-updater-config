const fs=require('fs'),assert=require('assert/strict');
const {PGlite}=require('../.codex-test-runtime/node_modules/@electric-sql/pglite');
const migration='supabase/migrations/20260924070203_payload_diagnostic_retention.sql';
(async()=>{const db=new PGlite();try{
 await require('./helpers/payload-diagnostic-db.cjs')(db);
 await db.exec(fs.readFileSync(migration,'utf8'));
 await db.exec("insert into updater_sessions values('done','completed'),('active','running'),('runtime','completed');insert into updater_runtime_jobs(session_id,status) values('runtime','running');insert into character_master(id,server_id,character_name,latest_payload_id,latest_pve_payload_id,latest_pvp_payload_id) values(1,2002,'Hero',1,2,3);insert into character_stat_sources values(4)");
 const evidence={gearReasonCode:'PVE_CONFIRMED',visibleEquipmentSlotCount:10,populatedEquipmentSlotCount:9,namedEquipmentSlotCount:8,abyssEquipmentSlotCount:0,gearType:'PVE',detectedGearType:'PVE',gearParseStatus:'CONFIRMED',equipment:[{name:'large detail'}],other:'discard'};
 for(let id=1;id<=20;id++){
  await db.query("insert into extension_character_payloads(id,session_id,server_id,character_name,received_at,master_sync_status,gear_evidence,gear_type,parsed_item_level,parsed_combat_power,lookup_order) values($1::bigint,'done',2002,'Hero',now()-interval '10 days'+$1::bigint*interval '1 second','synced',$2,'PVE',10,100,$1::bigint::integer)",[id,evidence]);
  await db.query("insert into lookup_session_targets(id,session_id,payload_id,server_id,character_name,target_status,lookup_order) values($1::bigint,'done',$1::bigint,2002,'Hero','lookup_done',$1::bigint::integer)",[id]);
 }
 await db.exec("update extension_character_payloads set master_sync_status='failed' where id=5;update extension_character_payloads set session_id='active' where id=6;update extension_character_payloads set session_id='runtime' where id=7;update extension_character_payloads set received_at=now() where id=8;update lookup_session_targets set target_status='retry_queued' where id=9;update lookup_session_targets set character_name='Other' where id=10;update extension_character_payloads set received_at=null where id=11;update extension_character_payloads set session_id='missing' where id=12;update extension_character_payloads set gear_evidence='[]' where id=13;update extension_character_payloads set gear_evidence='null' where id=14;update extension_character_payloads set gear_evidence=null where id=15");
 // NULL sorts first in the actual latest reprocess reader: row 11 is protected.
 const ids=async()=>(await db.query('select * from private.kinojo_payload_evidence_candidates_v509(0,5000)')).rows.map(r=>Number(r.id));
 assert.deepEqual(await ids(),[16,17,18,19,20]);
 const report=async()=>(await db.query("select kinojo_lookup_session_detail_report('done','synthetic')-'generatedAt' v")).rows[0].v;
 const initialReport=await report();
 const state=async()=>(await db.query("select jsonb_build_object('master',(select jsonb_agg(to_jsonb(m)) from character_master m),'targets',(select jsonb_agg(to_jsonb(t) order by id) from lookup_session_targets t),'other',(select jsonb_agg(to_jsonb(p)-'gear_evidence' order by id) from extension_character_payloads p)) v")).rows[0].v;
 const before=await state();
 const manifest=(await db.query("select id,md5(to_jsonb(p)::text) before,md5(jsonb_set(to_jsonb(p),'{gear_evidence}',private.kinojo_payload_evidence_v509(gear_evidence))::text) after from extension_character_payloads p where id=16")).rows.map(r=>({...r,id:Number(r.id)}));
 const batch=require('../scripts/payload-diagnostic-batch.cjs')(manifest,1);
 await assert.rejects(db.exec(batch.replace(manifest[0].before,'0'.repeat(32))),/SOURCE_CHANGED/);await db.exec('rollback');
 await assert.rejects(db.exec(batch.replace(manifest[0].after,'0'.repeat(32))),/RESULT_CHANGED/);await db.exec('rollback');assert.deepEqual(await ids(),[16,17,18,19,20]);
 await db.exec(batch.replace(/COMMIT;$/,'ROLLBACK;'));assert.deepEqual(await ids(),[16,17,18,19,20]);
 assert.equal((await db.query('select private.kinojo_payload_evidence_cleanup_v509(true,50) v')).rows[0].v.compacted,0);
 await db.exec(batch);assert.deepEqual(await ids(),[17,18,19,20]);
 await assert.rejects(db.exec(batch),/PROTECTION_CHANGED/);await db.exec('rollback');
 const result=(await db.query('select private.kinojo_snapshot_raw_cleanup_v501(false,4) v')).rows[0].v;assert.equal(result.budget,2);assert.equal(result.payload.compacted,2);
 await db.query('select private.kinojo_payload_evidence_cleanup_v509(false,50)');assert.deepEqual(await ids(),[]);
 assert.deepEqual(await report(),initialReport);assert.deepEqual(await state(),before);
 for(const value of [null,[],3,'text',{},{gearReasonCode:null,visibleEquipmentSlotCount:'10',equipment:['detail']}]){
  const expected=value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).filter(([k])=>k!=='equipment')):value;
  assert.deepEqual((await db.query('select private.kinojo_payload_evidence_v509($1::jsonb) v',[JSON.stringify(value)])).rows[0].v,expected);
 }
 for(const role of ['anon','authenticated','service_role'])for(const fn of ['kinojo_payload_evidence_v509(jsonb)','kinojo_payload_evidence_candidates_v509(bigint,integer)','kinojo_payload_evidence_cleanup_v509(boolean,integer)'])assert.equal((await db.query("select has_function_privilege($1,$2,'execute') v",[role,'private.'+fn])).rows[0].v,false);
 // Later terminal sessions become eligible; current, failed and recent rows do not.
 await db.exec("update updater_sessions set status='failed' where session_id='active';update lookup_session_targets set session_id='active' where id=6");assert.deepEqual(await ids(),[6]);
 const beforeRollbackReport=await report();
 await db.exec(fs.readFileSync(migration.replace('/migrations/','/rollbacks/'),'utf8'));
 assert.equal((await db.query('select private.kinojo_snapshot_raw_cleanup_v501(false,50) v')).rows[0].v.budget,50);
 assert.deepEqual(await report(),beforeRollbackReport);
 console.log('PASS payload diagnostics: real report parity, current/reprocess/active/retry/identity protections, bounded job, full row invariants, guarded atomic batch/replay/rollback and ACL');
}finally{await db.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});

