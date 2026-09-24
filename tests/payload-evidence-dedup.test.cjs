const fs=require('fs'),assert=require('assert/strict');
const {PGlite}=require('../.codex-test-runtime/node_modules/@electric-sql/pglite');
const batch=require('../scripts/payload-evidence-batch.cjs');
const migration='supabase/migrations/20260924034219_payload_gear_evidence_dedup.sql';
(async()=>{const db=new PGlite();try{
 await db.exec("set time zone 'UTC';create schema private;create role anon;create role authenticated;create role service_role;grant usage on schema private to anon,authenticated,service_role");
 const cols=JSON.parse(fs.readFileSync('tests/fixtures/master-event-schema.json'));
 for(const t of new Set(cols.map(c=>c.table_name)))await db.exec('create table '+t+'('+cols.filter(c=>c.table_name===t).map(c=>'"'+c.name+'" '+c.type).join(',')+')');
 await db.exec('create table lookup_snapshots(id bigint,raw_payload jsonb,character_name text);create table member_codes(main_character_name text,updated_at timestamptz)');
 await db.exec(fs.readFileSync('tests/fixtures/character-payload-helpers.sql','utf8'));
 await db.exec(fs.readFileSync('tests/fixtures/character-payload-triggers.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20260923052947_character_payload_compaction.sql','utf8'));
 await db.exec("insert into character_master(id,server_id,character_name,char_key,is_main,main_character_id,is_active) values(1,2002,'Hero','key',true,1,true);insert into lookup_snapshots values(9,'{\"characterName\":\"Hero\"}','Hero');insert into lookup_session_targets(id,session_id,server_id,character_name,main_character_name) values(7,'session',2002,'Hero','Hero')");
 const evidence={gearReasonCode:'PVE',visibleEquipmentSlotCount:12,populatedEquipmentSlotCount:12,abyssEquipmentSlotCount:0,titlePvpOptionText:'large original',equipmentNames:['sword']};
 const raw={targetId:7,snapshotId:9,mainCharacterName:'Hero',gearEvidence:evidence,gearParseStatus:'VERIFIED',status:'OK'};
 const insert=()=>db.query("insert into extension_character_payloads(id,session_id,server_id,character_name,char_key,main_character_name,pve_item_level,pve_combat_power,raw_payload,tool_name,schema_version) values(1,'session',2002,'hero','key','hero',123,456,$1,'KINOJO_SERVER_CHARACTER_QUEUE','kinojo-crawl-v2')",[raw]);
 const state=async()=>Promise.all(['character_master','lookup_session_targets','lookup_snapshots','member_codes'].map(t=>db.query('select to_jsonb(p) j from '+t+' p')));
 await db.exec('begin');await insert();const old=(await db.query('select to_jsonb(p) j from extension_character_payloads p')).rows[0].j;const oldState=await state();await db.exec('rollback');
 await db.exec(fs.readFileSync(migration,'utf8'));await insert();const now=(await db.query('select to_jsonb(p) j from extension_character_payloads p')).rows[0].j;
 const expected=structuredClone(old);delete expected.raw_payload.gearEvidence;assert.deepEqual(now,expected);
 // Separate inserts legitimately receive different transaction timestamps.
 const withoutInsertTimes=x=>JSON.parse(JSON.stringify(x,(k,v)=>['identity_verified_at','updated_at','looked_up_at'].includes(k)?null:v));
 assert.deepEqual(withoutInsertTimes(await state()),withoutInsertTimes(oldState));assert.deepEqual(now.gear_evidence,evidence);
 for(const [r,e,out] of [[raw,evidence,Object.fromEntries(Object.entries(raw).filter(([k])=>k!=='gearEvidence'))],[raw,{different:1},raw],[raw,null,raw],[{gearEvidence:null},null,{}],[{gearEvidence:[]},[],{}],[{gearEvidence:7},7,{}],[[],evidence,[]],[42,evidence,42],[null,evidence,null]]){
  assert.deepEqual((await db.query('select private.kinojo_payload_evidence_raw_v505($1::jsonb,$2::jsonb) v',[JSON.stringify(r),JSON.stringify(e)])).rows[0].v,out);
 }
 assert.deepEqual((await db.query('select private.kinojo_payload_evidence_raw_v505($1::jsonb,null) v',[raw])).rows[0].v,raw);
 for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'private.kinojo_payload_evidence_raw_v505(jsonb,jsonb)','execute') v",[role])).rows[0].v,false);
 // An UPDATE with unequal evidence must keep both versions.
 await db.query('update extension_character_payloads set raw_payload=$1',[{...raw,gearEvidence:{different:1}}]);
 assert.deepEqual((await db.query('select raw_payload,gear_evidence from extension_character_payloads')).rows[0].raw_payload.gearEvidence,{different:1});
 await db.exec('alter table extension_character_payloads disable trigger zz_kinojo_payload_compact_v500');await db.query('update extension_character_payloads set raw_payload=$1',[raw]);await db.exec('alter table extension_character_payloads enable trigger zz_kinojo_payload_compact_v500');
 const hashes=async()=>(await db.query("select id,md5(to_jsonb(p)::text) before,md5(jsonb_set(to_jsonb(p),'{raw_payload}',raw_payload-'gearEvidence')::text) after from extension_character_payloads p")).rows;
 const approved=await hashes(),protectedState=await state();
 await assert.rejects(db.exec(batch(approved.map(r=>({...r,after:'0'.repeat(32)})),1)),/PAYLOAD_EVIDENCE_RESULT_CHANGED/);await db.exec('rollback');assert.deepEqual(await hashes(),approved);
 await db.exec(batch(approved,1));assert.deepEqual(await state(),protectedState);
 await assert.rejects(db.exec(batch(approved,1)),/PAYLOAD_EVIDENCE_SOURCE_CHANGED/);await db.exec('rollback');
 assert.equal((await db.query("select count(*)::int n from pg_trigger where tgrelid='extension_character_payloads'::regclass and tgenabled<>'O'")).rows[0].n,0);
 await db.exec(fs.readFileSync(migration.replace('/migrations/','/rollbacks/'),'utf8'));
 await db.query('update extension_character_payloads set raw_payload=$1',[raw]);assert.deepEqual((await db.query('select raw_payload from extension_character_payloads')).rows[0].raw_payload.gearEvidence,evidence);
 console.log('PASS exact duplicate/new insert/update/null/mismatch semantics, original trigger parity, protected state, ACL, atomic failure, stale replay and rollback');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
