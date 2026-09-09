const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('../.codex-test-runtime/node_modules/@electric-sql/pglite');
const read=p=>fs.readFileSync(p,'utf8');
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(read('tests/fixtures/character-refresh-policy-schema.sql'));
  await db.exec(`
   alter table character_master add column lookup_policy text default 'INHERIT',add column lookup_group_policy text default 'AUTO',
   add column lookup_policy_updated_at timestamptz,add column lookup_policy_actor_id bigint,add column relation_review_attempted_at timestamptz;
   create function private.kinojo_sm_rule_occurrences_v437(bigint,date,date) returns table(end_at timestamptz) language sql as $$select now()+interval '1 hour'$$;
   insert into character_master(id,character_name,server_id,legion_name,main_character_id,last_lookup_success_at) values
   (1,'root',2002,'깡',null,now()),(2,'external',2008,'other',1,now()),
   (3,'rootB',2008,'other',null,now()),(4,'altB',2002,'키나노동조합',3,now()),
   (5,'rootC',2002,null,null,now()),(6,'altC',2002,'낮',5,now()),
   (7,'rootD',2002,'밤',7,now()),(8,'altD',2002,null,7,now()),
   (9,'same-name-legion',2008,'깡',null,now()),(10,'stranger',2002,null,null,now()),
   (11,'excluded',2002,'깡',1,now()),(12,'deleted_D',2002,'깡',1,now()),
   (13,'deletion-marker',2002,'깡',1,now()),(14,'duplicate',2002,'깡',1,now()),
   (15,'sanctuary',2008,'other',null,now()),(16,'sanctuary-alt',2008,'other',15,now());
   update character_master set lookup_excluded=true where id=11;
   update character_master set exclusion_reason='삭제후보' where id=13;
   update character_master set inactive_reason='중복' where id=14;
   insert into private.sanctuary_management_teams_v412(team_id,status) values(1,'ACTIVE');
   insert into private.sanctuary_management_slots_v412(team_id,character_id) values(1,15);
   insert into private.sanctuary_management_schedule_rules_v412(schedule_id,team_id,status) values(1,1,'ACTIVE');
   insert into private.sanctuary_management_schedule_versions_v437(schedule_id,status,effective_from,effective_to,schedule_kind,starts_on,timezone_name)
   values(1,'ACTIVE',current_date-1,null,'WEEKLY',current_date-1,'UTC');
  `);
  const q=async(s,a=[])=> (await db.query(s,a)).rows;
  const policy=async id=>(await q('select private.kinojo_character_lookup_policy($1) p',[id]))[0].p;
  // Establish old behavior using the exact rollback before testing the patch.
  const rollback=read('supabase/rollbacks/20260909060134_character_family_lookup_eligibility_rollback.sql');
  await db.exec(rollback);
  assert.equal((await policy(2)).eligible,false);
  assert.equal((await policy(4)).eligible,false);
  const rowsBefore=await q('select * from character_master order by id');
  await db.exec(read('supabase/migrations/20260909060134_character_family_lookup_eligibility.sql'));
  assert.deepEqual(await q('select * from character_master order by id'),rowsBefore);
  for(const id of [1,4,6,7])assert.equal((await policy(id)).reason,'MANAGED_LEGION');
  for(const id of [2,3,5,8])assert.equal((await policy(id)).reason,'MANAGED_LEGION_FAMILY');
  for(const id of [9,10,16])assert.equal((await policy(id)).eligible,false);
  assert.equal((await policy(15)).reason,'CURRENT_SANCTUARY');
  for(const id of [11,12,13,14])assert.equal((await policy(id)).eligible,false);
  await db.exec("update character_master set lookup_group_policy='EXCLUDE' where id=1");
  assert.equal((await policy(2)).reason,'ADMIN_EXCLUDED');
  await db.exec("update character_master set lookup_policy='INCLUDE' where id=2");
  assert.equal((await policy(2)).reason,'ADMIN_INCLUDED');
  await db.exec("update character_master set lookup_policy='EXCLUDE' where id=4");
  assert.equal((await policy(3)).eligible,false); // excluded witness cannot resurrect a family
  await db.exec("update character_master set lookup_policy='INHERIT',lookup_excluded=true where id=4");
  assert.equal((await policy(3)).eligible,false);
  await db.exec("update character_master set lookup_excluded=false,character_name='altB_D' where id=4");
  assert.equal((await policy(3)).eligible,false);
  await db.exec("update character_master set character_name='altB',inactive_reason='헤더' where id=4");
  assert.equal((await policy(3)).eligible,false);
  await db.exec("update character_master set inactive_reason=null,server_id=2008 where id=4");
  assert.equal((await policy(3)).eligible,false);
  await db.exec("update character_master set server_id=2002,main_character_id=null where id=4");
  assert.equal((await policy(3)).eligible,false); // relationship change is immediately effective
  await db.exec("update character_master set last_lookup_success_at=now()-interval '8 days' where id=10");
  assert.equal((await policy(10)).reason,'ACTIVITY_REVIEW_DUE');
  assert.equal((await policy(999)).reason,'CHARACTER_NOT_FOUND');
  for(const role of ['anon','authenticated','service_role']){
   assert.equal((await q("select has_function_privilege($1,'private.kinojo_character_lookup_policy(bigint,timestamptz)','EXECUTE') ok",[role]))[0].ok,role==='service_role');
  }
  await db.exec(rollback);
  assert.equal((await policy(8)).eligible,false);
  console.log('PASS: old omission reproduced; four legions, canonical families, exclusions/deletion, Sanctuary isolation, relationship changes, ACL, no row writes, rollback');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
