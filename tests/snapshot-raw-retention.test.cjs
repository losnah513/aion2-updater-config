const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('../.codex-test-runtime/node_modules/@electric-sql/pglite');
const setup=require('./helpers/snapshot-retention-db.cjs');
const migration='supabase/migrations/20260923060706_character_snapshot_raw_retention.sql';
(async()=>{const db=new PGlite();try{
 await setup(db);await db.exec(fs.readFileSync(migration,'utf8'));
 const budget='supabase/migrations/20260923075912_snapshot_cleanup_execution_budget.sql';
 await db.exec(fs.readFileSync(budget,'utf8'));
 let job=(await db.query('select * from cron.test_jobs')).rows;assert.equal(job.length,1);assert.equal(job[0].schedule,'*/10 * * * *');assert.equal(job[0].command,"set statement_timeout='15s'; select private.kinojo_snapshot_raw_cleanup_v501(false,50);");
 await db.exec(fs.readFileSync(budget.replace('/migrations/','/rollbacks/'),'utf8'));
 assert.equal((await db.query('select * from cron.test_jobs')).rows[0].schedule,'40 21 * * *');await db.exec(fs.readFileSync(budget,'utf8'));
 const compact=async raw=>(await db.query('select private.kinojo_snapshot_raw_v501($1::jsonb) v',[JSON.stringify(raw)])).rows[0].v;
 for(const raw of [null,{},[],[1],1,'text'])assert.deepEqual(await compact(raw),raw);
 const raw={characterName:'Hero',className:'class',charKey:'key',profileHtml:'<div class="profile__info-power-level"><span>100</span></div><div class="profile__info-item-level"><span>10</span></div>',pageText:'unchanged',officialRaw:{info:{profile:{combatPower:100,itemLevel:10,regionName:'legion',className:'class'},large:'x'.repeat(5000)}}};
 const projected=await compact(raw);assert.equal(projected.officialRaw,undefined);assert.equal(projected.combatPower,'100');assert.equal(projected.itemLevel,'10');assert.equal(projected.profileHtml,raw.profileHtml);assert.deepEqual(await compact(projected),projected);
 for(const name of ['private.kinojo_snapshot_raw_v501(jsonb)','private.kinojo_snapshot_raw_candidates_v501(bigint,integer)','private.kinojo_snapshot_raw_cleanup_v501(boolean,integer)'])for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') v',[role,name])).rows[0].v,false);
 await db.exec("insert into updater_sessions(session_id,status) values('done','completed'),('pending','running');insert into character_master(id,server_id,character_name,is_active) values(1,2002,'Hero',true)");
 // Build historical fixtures without replaying past official observations into current state.
 await db.exec('alter table lookup_snapshots disable trigger trg_kinojo_character_skill_snapshot_sync_v415;alter table lookup_snapshots disable trigger trg_kinojo_sync_character_legion_v296');
 for(let id=1;id<=25;id++){
  await db.query("insert into lookup_snapshots(id,session_id,server_id,character_name,status,raw_payload,created_at,snapshot_uid) values($1::bigint,'done',2002,'Hero','OK',$2,now()-interval '10 days'+$1::bigint*interval '1 second','uid'||$1::bigint)",[id,raw]);
  await db.query("insert into extension_character_payloads(id,session_id,server_id,character_name,source_snapshot_id,master_sync_status) values($1,'done',2002,'Hero',$1,'synced')",[id]);
  await db.query("insert into lookup_session_targets(id,snapshot_id,target_status) values($1,$1,'lookup_done')",[id]);
 }
 await db.exec("update character_master set latest_snapshot_uid='uid1',legion_source_snapshot_id=2;insert into character_skill_current_state(character_master_id,snapshot_id) values(1,3);update lookup_session_targets set target_status='final_failed' where id=4;update extension_character_payloads set master_sync_status='failed' where id=5;update lookup_snapshots set session_id='pending' where id=6;update lookup_snapshots set created_at=now() where id=7;update lookup_snapshots set raw_payload=raw_payload-'officialRaw' where id=8");
 await db.exec("insert into lookup_snapshots(id,session_id,server_id,character_name,status,raw_payload,created_at,snapshot_uid) select 26,session_id,server_id,character_name,status,raw_payload,created_at,'uid26' from lookup_snapshots where id=17;insert into extension_character_payloads(id,source_snapshot_id,master_sync_status) values(26,26,'synced');insert into lookup_session_targets(id,snapshot_id,target_status) values(26,26,'lookup_done')");
 await db.exec('alter table lookup_snapshots enable trigger trg_kinojo_character_skill_snapshot_sync_v415;alter table lookup_snapshots enable trigger trg_kinojo_sync_character_legion_v296');
 const candidates=async()=>(await db.query('select * from private.kinojo_snapshot_raw_candidates_v501(0,5000)')).rows.map(x=>Number(x.id));
 assert.deepEqual(await candidates(),[9,10,11,12,13,14,15,16]);
 const protectedState=async()=>Promise.all(['character_master','character_skill_current_state','lookup_session_targets','updater_sessions','extension_character_payloads'].map(t=>db.query('select to_jsonb(e) j from '+t+' e')));
 const before=await protectedState();const diag=(await db.query('select id,kinojo_payload_gear_diagnosis(id) d from extension_character_payloads order by id')).rows;
 const all=(await db.query('select id,to_jsonb(s) j,kinojo_snapshot_parser_text(raw_payload) parser from lookup_snapshots s order by id')).rows;
 const dry=(await db.query('select private.kinojo_snapshot_raw_cleanup_v501(true,2000) v')).rows[0].v;assert.equal(dry.candidates,8);assert.equal(dry.compacted,0);
 await db.exec('begin');assert.equal((await db.query('select private.kinojo_snapshot_raw_cleanup_v501(false,2) v')).rows[0].v.compacted,2);await db.exec('rollback');assert.deepEqual(await candidates(),[9,10,11,12,13,14,15,16]);
 assert.equal((await db.query('select private.kinojo_snapshot_raw_cleanup_v501(false,2000) v')).rows[0].v.compacted,8);assert.deepEqual(await candidates(),[]);
 assert.deepEqual(await protectedState(),before);assert.deepEqual((await db.query('select id,kinojo_payload_gear_diagnosis(id) d from extension_character_payloads order by id')).rows,diag);
 const after=(await db.query('select id,to_jsonb(s) j,kinojo_snapshot_parser_text(raw_payload) parser from lookup_snapshots s order by id')).rows;
 for(let i=0;i<all.length;i++){assert.equal(after[i].parser,all[i].parser);assert.deepEqual({...after[i].j,raw_payload:null},{...all[i].j,raw_payload:null});if(![9,10,11,12,13,14,15,16].includes(Number(after[i].id)))assert.deepEqual(after[i],all[i]);}
 // Normal new observations still update legion state; an ordinary metadata change still runs triggers.
 await db.query("insert into lookup_snapshots(id,session_id,server_id,character_name,status,raw_payload,created_at) values(30,'pending',2002,'Hero','OK',$1,now())",[raw]);
 assert.equal((await db.query('select legion_source_snapshot_id from character_master')).rows[0].legion_source_snapshot_id,30);
 await db.exec(fs.readFileSync(migration.replace('/migrations/','/rollbacks/'),'utf8'));assert.equal((await db.query('select count(*)::int n from lookup_snapshots')).rows[0].n,27);
 assert.equal((await db.query('select count(*)::int n from cron.test_jobs')).rows[0].n,0);
 console.log('PASS current/detail/skill/terminal/retry/24h guards, parser and diagnosis parity, recursive audit scalar retention, bounded cleanup, dry run, no current-state side effects, ordinary trigger writes and rollback');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
