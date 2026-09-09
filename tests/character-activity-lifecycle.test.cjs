const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('../.codex-test-runtime/node_modules/@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 try{
 await db.exec(fs.readFileSync('tests/fixtures/character-refresh-policy-schema.sql','utf8'));
 await db.exec(`
 alter table character_master add primary key(id), add column lookup_policy text default 'INHERIT',
 add column lookup_group_policy text default 'AUTO',add column lookup_policy_updated_at timestamptz,
 add column lookup_policy_actor_id bigint,add column relation_review_attempted_at timestamptz;
 create function private.kinojo_sm_rule_occurrences_v437(bigint,date,date) returns table(end_at timestamptz)
 language sql as $$select '2026-12-01'::timestamptz$$;
 insert into character_master(id,character_name,server_id,legion_name,main_character_id,last_lookup_success_at,legion_updated_at,legion_source_snapshot_id)
 values(1,'renamed',2008,'external',1,'2026-09-09','2026-09-09',1),
 (2,'alt',2008,'external',1,'2026-09-09','2026-09-09',2),
 (3,'unknown',2008,null,3,null,null,null);
 insert into lookup_snapshots(id,server_id,character_name,status,raw_payload)
 select id,server_id,character_name,'OK',jsonb_build_object('officialRaw',jsonb_build_object('info',jsonb_build_object('profile',jsonb_build_object('serverId',server_id,'characterName',character_name,'regionName',legion_name))))
 from character_master where id<3;
 `);
 await db.exec(fs.readFileSync('supabase/migrations/20260909060134_character_family_lookup_eligibility.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20260909082438_character_activity_lifecycle.sql','utf8'));
 const q=async s=>(await db.query(s)).rows;
 const policy=async(id=1,t='2026-09-30T14:59:59Z')=>(await q(`select private.kinojo_character_lookup_policy(${id},'${t}') p`))[0].p;
 const reconcile=async(id=1,t='2026-09-30T14:59:59Z')=>(await q(`select private.kinojo_character_activity_reconcile(${id},'${t}') p`))[0].p;
 assert.equal((await policy()).reason,'AUTO_NO_ACTIVITY');
 assert.equal((await policy()).autoExcludedAt,null,'read must not assign exclusion date');
 await db.exec("update character_master set main_character_id=2 where id=1");
 assert.equal((await policy()).familyRelationValid,false,'cycle is not a canonical family');
 assert.notEqual((await policy()).reason,'AUTO_NO_ACTIVITY');
 await db.exec("update character_master set main_character_id=1 where id=1; update character_master set main_character_id=2 where id=3");
 assert.equal((await policy()).activityHoldCode,'FAMILY_RELATION_UNRESOLVED','nested child must not disappear from family evidence');
 await db.exec("update character_master set main_character_id=3 where id=3");
 assert.equal((await policy(3)).reason,'ACTIVITY_REVIEW_DUE');
 let p=await reconcile();assert.equal(p.eligible,false);assert.equal(Date.parse(p.cleanupCandidateAt),Date.parse('2026-09-30T15:00:00Z'));
 assert.equal((await reconcile()).changed,false);assert.equal((await q('select * from private.character_activity_events')).length,1);
 assert.equal((await reconcile(1,'2026-09-01')).code,'STALE_ACTIVITY_EVALUATION');
 await db.exec("update character_master set server_id=2002,legion_name='깡' where id=2");
 assert.equal((await reconcile(1,'2026-10-01')).reason,'MANAGED_LEGION_FAMILY');
 assert.equal((await q('select state from private.character_activity_lifecycle'))[0].state,'RESTORED');
 assert.equal((await policy(1,'2026-10-01')).cleanupCandidateAt,null);
 await db.exec("update character_master set server_id=2008,legion_name='external' where id=2");
 p=await reconcile(1,'2026-10-02');assert.equal(Date.parse(p.cleanupCandidateAt),Date.parse('2026-10-31T15:00:00Z'));
 assert.equal((await q('select episode from private.character_activity_lifecycle'))[0].episode,2);
 await db.exec("update character_master set last_lookup_failed_at='2026-09-10' where id=2");
 assert.notEqual((await reconcile(1,'2026-10-02T01:00:00Z')).reason,'AUTO_NO_ACTIVITY');
 assert.equal((await q('select state from private.character_activity_lifecycle'))[0].state,'HELD');
 assert.equal((await q('select cleanup_candidate_at from private.character_activity_lifecycle'))[0].cleanup_candidate_at,null);
 await db.exec("update character_master set last_lookup_failed_at=null where id=2");
 await reconcile(1,'2026-10-02T02:00:00Z');
 assert.equal((await q('select episode from private.character_activity_lifecycle'))[0].episode,2,'error hold is not a new exclusion episode');
 await db.exec(`
 insert into private.sanctuary_management_teams_v412(team_id,status) values(1,'ACTIVE');
 insert into private.sanctuary_management_slots_v412(team_id,character_id) values(1,2);
 insert into private.sanctuary_management_schedule_rules_v412(schedule_id,team_id,status) values(1,1,'ACTIVE');
 insert into private.sanctuary_management_schedule_versions_v437(schedule_id,status,effective_from,schedule_kind,starts_on,timezone_name)
 values(1,'ACTIVE','2026-09-01','WEEKLY','2026-09-01','Asia/Seoul');
 `);
 assert.equal((await reconcile(1,'2026-10-03')).reason,'CURRENT_SANCTUARY_FAMILY');
 assert.equal((await policy(2)).reason,'CURRENT_SANCTUARY');
 await db.exec("update character_master set lookup_excluded=true where id=1");
 assert.equal((await reconcile(1,'2026-10-04')).reason,'ADMIN_EXCLUDED');
 assert.equal((await q('select lookup_excluded from character_master where id=1'))[0].lookup_excluded,true);
 await db.exec("update character_master set lookup_excluded=false,lookup_policy='INCLUDE' where id=1");
 assert.equal((await policy()).reason,'ADMIN_INCLUDED');
 await db.exec("update character_master set lookup_policy='INHERIT' where id=1; update private.sanctuary_management_teams_v412 set status='ARCHIVED'");
 await db.exec("update character_master set last_lookup_failed_at='2026-09-10' where id=2");
 assert.notEqual((await policy()).reason,'AUTO_NO_ACTIVITY','failed family witness blocks exclusion');
 await db.exec("update character_master set last_lookup_failed_at=null where id=2; update lookup_snapshots set raw_payload=raw_payload#-'{officialRaw,info,profile,regionName}' where id=2");
 assert.notEqual((await policy()).reason,'AUTO_NO_ACTIVITY','missing region is not a confirmed departure');
 await db.exec("update character_master set character_name='renamed_D' where id=1");
 assert.equal((await policy()).reason,'DELETION_CANDIDATE');
 for(const role of ['anon','authenticated'])for(const fn of ['kinojo_character_current_sanctuary','kinojo_character_activity_evidence','kinojo_character_activity_reconcile']){
 assert.equal((await q(`select has_function_privilege('${role}','private.${fn}(bigint,timestamptz)','EXECUTE') ok`))[0].ok,false);
 }
 assert.equal((await q('select count(*)::int n from character_master'))[0].n,3,'no character deletion');
 const events=await q('select * from private.character_activity_events order by id');
 await db.exec(fs.readFileSync('supabase/rollbacks/20260909082438_character_activity_lifecycle_rollback.sql','utf8'));
 assert.deepEqual(await q('select * from private.character_activity_events order by id'),events,'rollback preserves audit records');
 console.log('PASS: automatic exclusion, canonical family restoration, Sanctuary family, manual guards, KST month boundary, re-exclusion, idempotency, missing/error evidence and ACL');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
