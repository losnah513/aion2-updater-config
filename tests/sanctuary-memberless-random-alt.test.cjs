'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
// Production function snapshot + real v2/v446-v454 save stack; synthetic actors and schedules.
// All intermediate command layers are real. Authentication, lease, owner lookup,
// eligibility, status/audit/conflicts are synthetic; not an operational write test.
(async()=>{
 const db=new PGlite();
 try{
  await db.exec('create schema private;create role anon;create role authenticated;create role service_role;set check_function_bodies=off;');
  await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/sanctuary-permission-legacy-save.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/sanctuary-permission-legacy-layers.sql'),'utf8'));
  await db.exec(`
   create function public.kinojo_normalize_role(text,int) returns text language sql as 'select $1';
   create function private.kinojo_sm_actor_v412(text) returns jsonb language sql as $$select jsonb_build_object('memberId',substring($1 from 9)::bigint)$$;
   create function private.kinojo_sm_assert_pilot_write_v439(text,text) returns void language sql as 'select';
   create function private.kinojo_sm_assert_lease_v433(bigint,bigint,text) returns void language sql as 'select';
   create function private.kinojo_sm_can_manage_team_v412(jsonb,bigint) returns boolean language sql as 'select true';
   create function private.kinojo_sm_recompute_status_v412(bigint) returns void language sql as 'select';
   create function private.kinojo_sm_recompute_status_v450(bigint) returns void language sql as 'select';
   create function private.kinojo_sm_team_conflicts_v437(bigint,date,date) returns jsonb language sql as $$select '[]'::jsonb$$;
   create function private.kinojo_sm_audit_v412(bigint,bigint,text,bigint,text,jsonb,jsonb,text) returns void language sql as 'select';
   create function private.kinojo_sm_difficulty_allowed_v464(bigint,text) returns boolean language sql as $$select $2 in ('NORMAL','HARD')$$;
   create function private.kinojo_sm_min_item_level_v452(bigint,text) returns integer language sql as 'select 2700';
   create function private.kinojo_sm_team_min_item_level_v452(bigint) returns integer language sql as 'select 2700';
   create function private.kinojo_sm_character_eligible_v452(bigint,integer) returns boolean language sql as 'select true';
   create function private.kinojo_sm_resolve_character_owner_v412(bigint) returns table(character_id bigint,owner_member_id bigint,root_character_id bigint,relation text) language sql as $$select $1,1::bigint,$1,'MAIN'::text$$;
   insert into public.member_codes(id,is_active,role,level) values(1,true,'MEMBER',1),(2,true,'STAFF',2),(3,true,'MANAGER',3),(5,true,'MASTER',5);
   insert into public.sanctuary_master(id,code,management_visible) values(1,'fixture',true);
   insert into private.sanctuary_management_teams_v412(team_id,creator_member_id,sanctuary_id,title,activity,team_mode,join_policy,status,published_at)
     values(100,1,1,'fixture team','raid','PARTICIPATION','APPROVAL','ACTIVE',now());
   insert into private.sanctuary_management_forces_v412(force_id,team_id,force_no) values(10,100,1);
   insert into private.sanctuary_management_parties_v412(party_id,team_id,force_id,party_no) values(11,100,10,1),(12,100,10,2);
   insert into private.sanctuary_management_slots_v412(team_id,force_id,party_id,slot_no) select 100,10,p,n from unnest(array[11,12]) p cross join generate_series(1,5) n;
   update private.sanctuary_management_slots_v412 set character_id=101,owner_member_id=1,owner_root_character_id=101,character_relation='MAIN' where party_id=11 and slot_no=1;
   insert into private.sanctuary_management_schedule_rules_v412(schedule_id,team_id,schedule_kind,starts_on,weekdays,starts_at) values(1,100,'WEEKLY','2026-09-09',array[3]::smallint[],'21:00');
   insert into public.sanctuary_role_permissions(role_key,permission_key,enabled) values('MANAGER','sanctuary_info_manage_all',true),('MANAGER','sanctuary_roster_manage_all',false),('MANAGER','sanctuary_schedule_manage_all',false),('MANAGER','sanctuary_support_manage_all',false);
  `);
  for(const f of ['20260909111151_sanctuary_permission_foundation.sql','20260909113427_sanctuary_permission_command_contract.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',f),'utf8'));
  await db.exec("insert into private.sanctuary_team_operators(team_id,member_id,assigned_by_member_id) values(100,2,5);insert into public.sanctuary_role_permissions(role_key,permission_key,enabled) values('STAFF','sanctuary_schedule_manage_assigned',true)");

  function definition(file,name){
   const source=fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8');
   const start=source.toLowerCase().search(new RegExp('create (?:or replace )?function '+name.toLowerCase().replaceAll('.','\\.')+'\\('));
   assert(start>=0,name);const rest=source.slice(start),match=/\bas\s+(\$\w*\$)/i.exec(rest);
   assert(match,name);const end=rest.indexOf(match[1]+';',match.index+match[0].length);
   return rest.slice(0,end+match[1].length+1);
  }
  await db.exec(`
   create table private.sanctuary_character_owners_v412(character_id bigint,owner_member_id bigint,root_character_id bigint,relation text);
   create function private.kinojo_sm_conflicts_for_participant_v412(bigint,bigint,bigint) returns jsonb language sql as $$select '[]'::jsonb$$;
   create function private.kinojo_sm_force_min_item_level_v454(bigint) returns integer language sql as 'select 2700';
   create function private.kinojo_sm_class_code_v450(text) returns text language sql as $$select case when $1='치유성' then 'CLERIC' else 'TEMPLAR' end$$;
   create function private.kinojo_sm_class_label_v450(text) returns text language sql as 'select $1';
   create function private.kinojo_sm_rule_occurrences_v437(bigint,date,date) returns table(start_at timestamptz,end_at timestamptz) language sql as $$
    select (starts_on+starts_at) at time zone 'Asia/Seoul',((starts_on+starts_at) at time zone 'Asia/Seoul')+make_interval(mins=>duration_minutes)
    from private.sanctuary_management_schedule_rules_v412 where schedule_id=$1 and status='ACTIVE'$$;
   update public.member_codes set main_character_name='member-main' where id=1;
   insert into public.character_master(id,character_name,main_character_id,is_main,server_id,server_name,class_name,latest_pve_item_level)
    values(101,'member-main',101,true,2002,'지켈','수호성',5000),(201,'nonmember-main',201,true,2002,'지켈','수호성',5000),
      (202,'nonmember-alt',201,false,2002,'지켈','치유성',5000),(301,'zero-alt-main',301,true,2002,'지켈','수호성',5000),
      (401,'excluded',401,true,2002,'지켈','수호성',5000),(501,'inactive',501,true,2002,'지켈','수호성',5000);
   update public.character_master set lookup_excluded=true where id=401;
   update public.character_master set is_active=false where id=501;
  `);
  await db.exec(definition('20260909114651_sanctuary_permission_legacy_boundary.sql','private.kinojo_sm_require_roster_scope'));
  await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/sanctuary-memberless-random-alt.sql'),'utf8'));
  await db.exec(definition('20260831050524_sanctuary_force_difficulty_v454.sql','public.kinojo_sanctuary_management_linked_alts_v454'));
  await db.exec(definition('20260901052026_sanctuary_roster_character_family_identity.sql','private.kinojo_sm_same_force_character_family_guard_v461'));
  await db.exec(`
   alter table private.sanctuary_management_slots_v412 add constraint sanctuary_management_slots_v453_occupancy_ck check(
    assignment_kind<>'RANDOM_ALT' or owner_member_id is not null);
   create constraint trigger sanctuary_management_slot_assignment_guard_v450 after insert or update on private.sanctuary_management_slots_v412
    deferrable initially deferred for each row execute function private.kinojo_sm_slot_assignment_guard_v450();
   create constraint trigger sanctuary_management_same_force_character_family_guard_v461 after insert or update on private.sanctuary_management_slots_v412
    deferrable initially deferred for each row execute function private.kinojo_sm_same_force_character_family_guard_v461();
  `);
  const lookup=async(id,team=100,member=1)=>(await db.query('select public.kinojo_sanctuary_management_linked_alts_v457($1,$2,$3,null) result',['fixture-'+member,team,id])).rows[0].result;
  assert.equal((await lookup(201)).randomCandidate,null,'baseline reproduces missing random card');
  const baselineAcl=(await db.query("select proname,proacl::text,proconfig from pg_proc where proname in ('kinojo_sanctuary_management_linked_alts_v453','kinojo_sanctuary_management_command_v453') order by proname")).rows;
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261030095726_sanctuary_memberless_random_alt.sql'),'utf8'));
  assert.deepEqual((await db.query("select proname,proacl::text,proconfig from pg_proc where proname in ('kinojo_sanctuary_management_linked_alts_v453','kinojo_sanctuary_management_command_v453') order by proname")).rows,baselineAcl);
  for(const team of [null,100])for(const id of [201,301]){
   const result=await lookup(id,team);assert.equal(result.randomCandidate.mainCharacterId,id);assert.equal(result.randomCandidate.ownerMemberId,null);
   assert.equal(result.characterCount,id===201?1:0);
  }
  assert.equal((await lookup(101)).randomCandidate.ownerMemberId,1,'member path preserved');
  assert.equal((await lookup(401)).randomCandidate,null,'excluded root receives no reservation');
  await assert.rejects(lookup(501),/본캐/);
  await assert.rejects(lookup(201,100,3),/권한/,'info-only manager cannot edit roster');
  const payload={teamId:100,title:'fixture team',activity:'raid',mode:'PARTICIPATION',joinPolicy:'APPROVAL',sanctuaryCode:'fixture',schedule:{kind:'WEEKLY',startsOn:'2026-09-09',weekdays:[3],startsAt:'21:00',durationMinutes:30},composition:[{sourceForceId:10,difficulty:'NORMAL',slots:Array.from({length:10},(_,i)=>({partyNo:Math.floor(i/5)+1,slotNo:i%5+1,characterId:i===0?101:null,...(i===1?{assignmentKind:'RANDOM_ALT',mainCharacterId:201,requiredClassCode:'CLERIC'}:{})}))}]};
  let request=0;
  const call=(p=payload,member=1,revision=1)=>db.query('select public.kinojo_sanctuary_management_command_v2($1,$2,$3,$4::jsonb,$5) result',['fixture-'+member,'fixture-memberless-'+(++request),'SAVE_COMPOSITION',JSON.stringify(p),revision]);
  await call();
  const replay=await db.query('select public.kinojo_sanctuary_management_command_v2($1,$2,$3,$4::jsonb,1) result',['fixture-1','fixture-memberless-1','SAVE_COMPOSITION',JSON.stringify(payload)]);
  assert.equal(replay.rows[0].result.replayed,true,'identical request remains idempotent');
  let saved=(await db.query("select * from private.sanctuary_management_slots_v412 where assignment_kind='RANDOM_ALT'")).rows;
  assert.equal(saved.length,1);assert.equal(saved[0].owner_member_id,null);assert.equal(saved[0].owner_root_character_id,201);assert.equal(saved[0].required_class_code,'CLERIC');
  const before=(await db.query('select private.kinojo_sm_permission_snapshot(100) value')).rows[0].value;
  const bad=structuredClone(payload);bad.composition[0].slots[2].characterId=202;
  await assert.rejects(call(bad),/이 포스/,'same-family real+random rejected');
  assert.deepEqual((await db.query('select private.kinojo_sm_permission_snapshot(100) value')).rows[0].value,before,'late duplicate failure is atomic');
  const duplicate=structuredClone(payload);Object.assign(duplicate.composition[0].slots[2],{assignmentKind:'RANDOM_ALT',mainCharacterId:201});
  await assert.rejects(call(duplicate),/이 포스/);
  for(const id of [202,401,501,999]){const bad=structuredClone(payload);bad.composition[0].slots[1].mainCharacterId=id;await assert.rejects(call(bad),/본캐|부캐/);}
  await db.exec('update public.character_master set lookup_excluded=true where id=201');
  await assert.rejects(call(),/본캐/,'excluded root rejected even with eligible linked alts');
  await db.exec('update public.character_master set lookup_excluded=false,is_active=false where id=201');
  await assert.rejects(call(),/본캐/,'inactive root rejected even with eligible linked alts');
  await db.exec('update public.character_master set is_active=true where id=201');
  const unauthorized=structuredClone(payload);unauthorized.composition[0].slots[1].requiredClassCode='ALL';
  await assert.rejects(call(unauthorized,3),/권한/);
  await assert.rejects(call(payload,1,999),/먼저|수정|revision/);
  await db.exec("insert into private.sanctuary_management_teams_v412(team_id,creator_member_id,sanctuary_id,title,status) values(200,2,1,'conflicting','ACTIVE');insert into private.sanctuary_management_schedule_rules_v412(schedule_id,team_id,starts_on,starts_at) values(2,200,'2026-09-09','21:00');insert into private.sanctuary_management_slots_v412(team_id,force_id,party_id,slot_no,character_id,owner_root_character_id,character_relation) values(200,20,21,1,202,201,'ALT')");
  await assert.rejects(call(),/일정.*충돌/,'memberless random conflicts with actual family in another team');
  await db.exec("update private.sanctuary_management_slots_v412 set character_id=null,assignment_kind='RANDOM_ALT' where team_id=200");
  await assert.rejects(call(),/일정.*충돌/,'memberless random conflicts with another random reservation');
  await db.exec("delete from private.sanctuary_management_slots_v412 where team_id=200;delete from private.sanctuary_management_schedule_rules_v412 where team_id=200;delete from private.sanctuary_management_teams_v412 where team_id=200");
  assert.equal((await db.query('select count(*)::int n from public.character_master')).rows[0].n,6,'no fake master rows');
  assert.equal((await db.query('select count(*)::int n from public.member_codes')).rows[0].n,4,'no fake member rows');
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/rollbacks/20261030095726_sanctuary_memberless_random_alt_rollback.sql'),'utf8'));
  assert.equal((await lookup(201)).randomCandidate,null,'rollback restores candidate policy');
  assert.equal((await db.query("select count(*)::int n from private.sanctuary_management_slots_v412 where assignment_kind='RANDOM_ALT' and owner_member_id is null")).rows[0].n,1,'rollback preserves saved data');
  console.log('PASS: memberless/owned/zero-alt lookup; real v2 save/class/root checks; family, schedule, permissions, revision, atomic rollback; ACL/config and data-preserving code rollback');
 }finally{await db.close();}
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
