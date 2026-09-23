const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('../.codex-test-runtime/node_modules/@electric-sql/pglite');
const migration='supabase/migrations/20260923083749_snapshot_intake_evidence_compaction.sql';
(async()=>{const db=new PGlite();try{
 await db.exec(`create schema private;create role anon;create role authenticated;create role service_role;
 create table extension_character_payloads(id bigint primary key,session_id text,snapshot_uid text,master_sync_status text,gear_evidence jsonb);
 create table snapshot_intake_events(id bigint generated always as identity primary key,session_id text,snapshot_uid text,event_type text,status text,raw_payload jsonb);
 insert into extension_character_payloads values(1,'s','u','synced','{"evidence":[1,2,3]}'),(2,'s','u','failed','{"evidence":[1,2,3]}');`);
 await db.exec(fs.readFileSync(migration,'utf8'));
 const evidence={evidence:[1,2,3]},raw={payloadId:1,gearEvidence:evidence,serverId:2001,pageText:'preserved',other:{x:true}};
 const insert=async(r=raw,event='submit',status='received',session='s',uid='u')=>(await db.query('insert into snapshot_intake_events(session_id,snapshot_uid,event_type,status,raw_payload) values($1,$2,$3,$4,$5) returning raw_payload',[session,uid,event,status,JSON.stringify(r)])).rows[0].raw_payload;
 const expected={...raw};delete expected.gearEvidence;
 assert.deepEqual(await insert(),expected);
 assert.deepEqual(await insert(expected),expected);
 for(const args of [[raw,'parse_failed','parse_failed'],[raw,'duplicate','duplicate'],[raw,'submit','failed'],[raw,'submit','received','other'],[raw,'submit','received','s','other'],[{...raw,payloadId:2}],[{...raw,payloadId:3}],[{...raw,gearEvidence:{different:true}}],[{...raw,payloadId:'9223372036854775808'}],[{...raw,payloadId:'1.0'}],[{...raw,payloadId:null}],[{...raw,payloadId:'01'}],[[]],[null],[42]]){
  assert.deepEqual(await insert(...args),args[0]);
 }
 assert.deepEqual((await db.query('select gear_evidence from extension_character_payloads where id=1')).rows[0].gear_evidence,evidence);
 for(const role of ['anon','authenticated','service_role'])for(const fn of ['private.kinojo_intake_payload_id_v503(jsonb)','private.kinojo_intake_evidence_compact_v503()'])assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') v',[role,fn])).rows[0].v,false);
 await db.exec('begin');await insert();await db.exec('rollback');
 await db.query('update snapshot_intake_events set raw_payload=$1 where id=1',[JSON.stringify(raw)]);
 const manifest=(await db.query("select id,md5(to_jsonb(e)::text) before,md5(jsonb_set(to_jsonb(e),'{raw_payload}',raw_payload-'gearEvidence')::text) after from snapshot_intake_events e where id=1")).rows.map(r=>({...r,id:Number(r.id)}));
 const batch=require('../scripts/intake-evidence-batch.cjs')(manifest,1);
 await db.exec("update extension_character_payloads set master_sync_status='failed' where id=1");
 await assert.rejects(db.exec(batch),/INTAKE_SOURCE_OR_AUTHORITATIVE_COPY_CHANGED/);await db.exec('rollback');
 assert.deepEqual((await db.query('select raw_payload from snapshot_intake_events where id=1')).rows[0].raw_payload,raw);
 await db.exec("update extension_character_payloads set master_sync_status='synced' where id=1");
 await db.exec(batch);
 assert.deepEqual((await db.query('select raw_payload from snapshot_intake_events where id=1')).rows[0].raw_payload,expected);
 await assert.rejects(db.exec(batch),/INTAKE_SOURCE_OR_AUTHORITATIVE_COPY_CHANGED/);await db.exec('rollback');
 await db.exec(fs.readFileSync(migration.replace('/migrations/','/rollbacks/'),'utf8'));
 assert.deepEqual(await insert(),raw);
 console.log('PASS intake evidence: identical authoritative copy required; failed/missing/mismatched sources retained; other keys unchanged; ACL and rollback');
}finally{await db.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
