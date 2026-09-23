const fs=require('fs'),assert=require('assert/strict');
const {PGlite}=require('../.codex-test-runtime/node_modules/@electric-sql/pglite');
const migration='supabase/migrations/20260923090420_historical_snapshot_text_retention.sql';
(async()=>{const db=new PGlite();try{
 await require('./helpers/snapshot-retention-db.cjs')(db);
 await db.exec(fs.readFileSync('tests/fixtures/historical-snapshot-audit-helpers.sql','utf8'));
 await db.exec("alter table character_master add column if not exists latest_pve_payload_id bigint;alter table character_master add column if not exists latest_pvp_payload_id bigint;create table character_stat_sources(snapshot_id bigint,payload_id bigint);create table private.character_snapshot_requests(snapshot_id bigint)");
 await db.exec(fs.readFileSync('supabase/migrations/20260923060706_character_snapshot_raw_retention.sql','utf8'));
 await db.exec(fs.readFileSync(migration,'utf8'));
 await db.exec("insert into updater_sessions(session_id,status) values('done','completed'),('running','running');insert into character_master(id,server_id,character_name) values(1,2002,'Hero')");
 await db.exec('alter table lookup_snapshots disable trigger trg_kinojo_character_skill_snapshot_sync_v415;alter table lookup_snapshots disable trigger trg_kinojo_sync_character_legion_v296');
 const raw={characterName:'Hero',className:'class',charKey:'1234',combatPower:100,itemLevel:10,profileHtml:'<div class="profile__info-power-level"><span>100</span></div><div class="profile__info-item-level"><span>10</span></div>',pageText:'large original '.repeat(100),visibleText:'original',profileImageUrl:'keep',officialRaw:{info:{profile:{regionName:'legion'}}}};
 for(let i=1;i<=40;i++){await db.query("insert into lookup_snapshots(id,session_id,server_id,character_name,status,raw_payload,created_at,snapshot_uid) values($1::bigint,'done',2002,'Hero','OK',$2,now()-interval '10 days'+$1::bigint*interval '1 second','uid'||$1::bigint)",[i,raw]);await db.query("insert into extension_character_payloads(id,session_id,source_snapshot_id,server_id,character_name,master_sync_status) values($1,'done',$1,2002,'Hero','synced')",[i]);await db.query("insert into lookup_session_targets(id,snapshot_id,target_status) values($1,$1,'lookup_done')",[i]);}
 await db.exec("update character_master set latest_snapshot_uid='uid1',legion_source_snapshot_id=2,latest_pve_payload_id=3,latest_pvp_payload_id=4;insert into character_skill_current_state(character_master_id,snapshot_id) values(1,5);insert into character_stat_sources values(6,6);insert into private.character_snapshot_requests values(7);update lookup_session_targets set target_status='retry' where id=8;update extension_character_payloads set master_sync_status='failed' where id=9;update extension_character_payloads set character_name='Other' where id=10;update lookup_snapshots set session_id='running' where id=11;update lookup_snapshots set created_at=now() where id=12");
 await db.exec('alter table lookup_snapshots enable trigger trg_kinojo_character_skill_snapshot_sync_v415;alter table lookup_snapshots enable trigger trg_kinojo_sync_character_legion_v296');
 const candidates=async()=>(await db.query('select * from private.kinojo_snapshot_text_candidates_v504(0,5000)')).rows.map(r=>Number(r.id));
 const ids=await candidates();assert.deepEqual(ids,Array.from({length:19},(_,i)=>i+13));
 const diag=async()=>(await db.query('select id,kinojo_payload_gear_diagnosis(id) d from extension_character_payloads order by id')).rows;
 const beforeDiag=await diag();
 const audit=async()=>(await db.query("select private.kinojo_character_refresh_target_audit_v321('done',13,13,13,'{\"characterName\":\"Hero\",\"serverId\":2002,\"className\":\"class\",\"charKey\":\"1234\",\"combatPower\":100,\"itemLevel\":10}') v")).rows[0].v;
 const beforeAudit=await audit();
 const approved=(await db.query("select id,md5(to_jsonb(s)::text) before,md5(jsonb_set(jsonb_set(to_jsonb(s),'{raw_payload}',private.kinojo_snapshot_text_v504(raw_payload)),'{retained_parser_stats_v504}',jsonb_build_object('characterName',character_name,'stats',kinojo_extract_aion_stats_from_text(kinojo_snapshot_parser_text(raw_payload),character_name,null)))::text) after from lookup_snapshots s where id=13")).rows.map(r=>({...r,id:Number(r.id)}));
 const batch=require('../scripts/historical-snapshot-batch.cjs')(approved,1);
 await assert.rejects(db.exec(batch.replace(approved[0].before,'0'.repeat(32))),/HISTORICAL_SOURCE_CHANGED/);await db.exec('rollback');
 await db.exec(batch.replace(/COMMIT;\s*$/,'ROLLBACK;'));assert.deepEqual(await candidates(),ids);
 const state=async()=>(await db.query('select to_jsonb(m) j from character_master m')).rows;
 const before=await state();
 assert.equal((await db.query('select private.kinojo_snapshot_raw_cleanup_v501(true,50) v')).rows[0].v.compacted,0);
 await db.exec('begin');await db.query('select private.kinojo_snapshot_raw_cleanup_v501(false,2)');await db.exec('rollback');assert.deepEqual(await candidates(),ids);
 assert.equal((await db.query('select private.kinojo_snapshot_raw_cleanup_v501(false,50) v')).rows[0].v.compacted,19);
 assert.deepEqual(await diag(),beforeDiag);assert.deepEqual(await state(),before);assert.deepEqual(await candidates(),[]);
 assert.deepEqual(await audit(),beforeAudit);
 await assert.rejects(db.exec(batch),/HISTORICAL_PROTECTION_CHANGED/);await db.exec('rollback');
 const rows=(await db.query('select id,raw_payload,retained_parser_stats_v504 from lookup_snapshots order by id')).rows;
 for(const r of rows){if(ids.includes(Number(r.id))){assert.ok(r.retained_parser_stats_v504);for(const k of ['officialRaw','pageText','profileHtml','visibleText'])assert.ok(!(k in r.raw_payload));assert.equal(r.raw_payload.profileImageUrl,'keep');}else assert.deepEqual(r.raw_payload,raw);}
 for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'private.kinojo_snapshot_text_cleanup_v504(boolean,integer)','execute') v",[role])).rows[0].v,false);
 await db.exec(fs.readFileSync(migration.replace('/migrations/','/rollbacks/'),'utf8'));assert.deepEqual(await diag(),beforeDiag);
 console.log('PASS historical text removal, cached diagnosis parity, current/skill/PVE/PVP/source/request/retry/identity guards, rollback compatibility');
}finally{await db.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
