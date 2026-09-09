'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
// Real production v454 eligibility/difficulty wrapper and v446 atomic save body.
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
  let request=0;
  const payload={teamId:100,title:'fixture team',activity:'raid',mode:'PARTICIPATION',joinPolicy:'APPROVAL',sanctuaryCode:'fixture',schedule:{kind:'WEEKLY',startsOn:'2026-09-09',weekdays:[3],startsAt:'21:00',durationMinutes:30},composition:[{sourceForceId:10,difficulty:'NORMAL',slots:Array.from({length:10},(_,i)=>({partyNo:Math.floor(i/5)+1,slotNo:i%5+1,characterId:i===0?101:null}))}]};
  const call=(member,p)=>db.query('select public.kinojo_sanctuary_management_command_v2($1,$2,$3,$4::jsonb,1) result',['fixture-'+member,'fixture-real-save-'+(++request),'SAVE_COMPOSITION',JSON.stringify(p)]);
  await call(3,{...payload,title:'info-only'});
  assert.equal((await db.query('select title from private.sanctuary_management_teams_v412')).rows[0].title,'info-only');
  const before=(await db.query('select private.kinojo_sm_permission_snapshot(100) value')).rows[0].value;
  await assert.rejects(call(3,{...payload,title:'forbidden',schedule:{...payload.schedule,startsAt:'22:00'}}),/권한/);
  assert.deepEqual((await db.query('select private.kinojo_sm_permission_snapshot(100) value')).rows[0].value,before,'real save updates atomically roll back');
  await call(2,{...payload,title:'info-only',schedule:{...payload.schedule,startsAt:'22:00'}});
  await db.exec('insert into private.sanctuary_management_support_batches_v412(support_batch_id,team_id) values(1,100);insert into private.sanctuary_management_support_items_v412(support_batch_id,force_id) values(1,10);');
  await assert.rejects(call(3,{...payload,mode:'FIXED',schedule:{...payload.schedule,startsAt:'22:00'}}),/권한/);
  assert.equal((await db.query('select status from private.sanctuary_management_support_batches_v412')).rows[0].status,'PENDING');
  await call(1,{...payload,mode:'FIXED'});
  assert.equal((await db.query('select status from private.sanctuary_management_support_batches_v412')).rows[0].status,'CANCELLED');
  console.log('PASS: real v446 save / v454 wrapper, info-only, assigned schedule, rollback, pending-support mode change');
 }finally{await db.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
