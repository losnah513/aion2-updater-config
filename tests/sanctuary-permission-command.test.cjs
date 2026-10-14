'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create schema private;create role anon;create role authenticated;create role service_role;
   create table public.member_codes(id bigint primary key,is_active boolean,role text,level int,permissions text[]);
   create function public.kinojo_normalize_role(text,int) returns text language sql as 'select $1';
   create function private.kinojo_sm_actor_v412(text) returns jsonb language sql as 'select jsonb_build_object(''memberId'',case when $1 ~ ''^fixture-[0-9]+$'' then substring($1 from 9)::bigint end)';
   create table private.sanctuary_management_teams_v412(team_id bigint primary key,creator_member_id bigint,status text,sanctuary_id bigint,title text,activity text,team_mode text,join_policy text,published_at timestamptz);
   create table public.sanctuary_role_permissions(role_key text,permission_key text,enabled boolean not null,primary key(role_key,permission_key));
   create table private.sanctuary_management_forces_v412(force_id bigint primary key,team_id bigint,force_no int,capacity int,difficulty text);
   create table private.sanctuary_management_slots_v412(slot_id bigint primary key,team_id bigint,force_id bigint,character_id bigint,required_class_code text,placement_locked boolean,revision bigint,updated_at timestamptz);
   create table private.sanctuary_management_composition_rules_v449(composition_rule_id bigint,team_id bigint,force_id bigint,rule_type text,minimum_count int,revision bigint);
   create table private.sanctuary_management_schedule_rules_v412(schedule_id bigint primary key,team_id bigint,starts_at time,revision bigint);
   create table private.sanctuary_management_schedule_versions_v437(schedule_version_id bigint,team_id bigint,starts_at time);
   create table private.sanctuary_management_schedule_exceptions_v412(exception_id bigint,schedule_id bigint,exception_type text);
   create table private.sanctuary_management_support_batches_v412(support_batch_id bigint primary key,team_id bigint,status text);
   create table private.sanctuary_management_support_items_v412(support_item_id bigint primary key,support_batch_id bigint,status text);
   create table private.fixture_receipts(action text);
   insert into public.member_codes values(1,true,'MEMBER',0,'{}'),(2,true,'STAFF',1,'{}'),(3,true,'MANAGER',2,'{}'),(5,true,'MASTER',4,'{}');
   insert into private.sanctuary_management_teams_v412 values(100,1,'ACTIVE',1,'팀','활동','PARTICIPATION','APPROVAL',now()),(200,5,'ACTIVE',1,'다른 팀','활동','PARTICIPATION','APPROVAL',now());
   insert into public.sanctuary_role_permissions values('STAFF','sanctuary_schedule_manage_assigned',true),('MANAGER','sanctuary_info_manage_all',true),('MANAGER','sanctuary_support_manage_all',false),('MANAGER','sanctuary_archive_manage_all',false);
   insert into private.sanctuary_management_forces_v412 values(10,100,1,10,'NORMAL'),(20,200,1,10,'NORMAL');
   insert into private.sanctuary_management_slots_v412 values(11,100,10,101,null,false,1,now());
   insert into private.sanctuary_management_schedule_rules_v412 values(1,100,'21:00',1);
   insert into private.sanctuary_management_support_batches_v412 values(1,100,'PENDING');
   insert into private.sanctuary_management_support_items_v412 values(1,1,'PENDING');
   -- Deliberately permissive synthetic delegate: tests the real wrapper's rollback boundary.
   -- Actual legacy-command/lease integration is a separate cutover regression requirement.
   create function public.kinojo_sanctuary_management_command_v454(text,text,text,jsonb,bigint) returns jsonb language plpgsql as $$
   begin
    insert into private.fixture_receipts values($3);
    if $4 ? 'title' then update private.sanctuary_management_teams_v412 set title=$4->>'title' where team_id=100; end if;
    if $4 ? 'time' then update private.sanctuary_management_schedule_rules_v412 set starts_at=($4->>'time')::time where team_id=100; end if;
    if $4 ? 'character' then update private.sanctuary_management_slots_v412 set character_id=($4->>'character')::bigint where team_id=100; end if;
    if $4 ? 'difficulty' then update private.sanctuary_management_forces_v412 set difficulty=$4->>'difficulty' where team_id=100; end if;
    if $4 ? 'locked' then update private.sanctuary_management_slots_v412 set placement_locked=($4->>'locked')::boolean where team_id=100; end if;
    if $4 ? 'cancel' then update private.sanctuary_management_support_batches_v412 set status='CANCELLED' where team_id=100; end if;
    if $4 ? 'approveItem' then update private.sanctuary_management_support_items_v412 set status='APPROVED' where support_item_id=1; end if;
    update private.sanctuary_management_slots_v412 set revision=revision+1,updated_at=now();
    return jsonb_build_object('ok',true,'teamId',100);
   end; $$;`);
  for(const f of ['20260909111151_sanctuary_permission_foundation.sql','20260909113427_sanctuary_permission_command_contract.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',f),'utf8'));
  await db.exec('insert into private.sanctuary_team_operators(team_id,member_id,assigned_by_member_id) values(100,2,5)');
  const command=async(member,action,payload)=>db.query('select public.kinojo_sanctuary_management_command_v2($1,$2,$3,$4::jsonb,1) d',['fixture-'+member,'fixture-request',action,JSON.stringify(payload)]);
  const receipts=async()=>(await db.query('select count(*)::int n from private.fixture_receipts')).rows[0].n;
  const unchanged=await receipts();
  for(const action of ['SET_SLOT','ADD_FORCE','DECIDE_SUPPORT','ARCHIVE_TEAM'])await assert.rejects(command(2,action,{teamId:100,forceId:10,supportBatchId:1}),/권한/);
  assert.equal(await receipts(),unchanged,'deny before delegate');
  await command(2,'SAVE_COMPOSITION',{teamId:100,time:'22:00',changedFields:[]});
  const before=await receipts();
  await assert.rejects(command(2,'SAVE_COMPOSITION',{teamId:100,title:'권한 우회',time:'23:00',character:999,changedFields:['schedule']}),/권한/);
  assert.equal(await receipts(),before,'all writes and receipt rolled back');
  assert.equal((await db.query('select title from private.sanctuary_management_teams_v412 where team_id=100')).rows[0].title,'팀');
  assert.equal((await db.query('select starts_at from private.sanctuary_management_schedule_rules_v412 where team_id=100')).rows[0].starts_at,'22:00:00');
  for(const change of [{difficulty:'HARD'},{locked:true},{character:888}])await assert.rejects(command(3,'SAVE_COMPOSITION',{teamId:100,...change}),/권한/);
  await command(3,'SAVE_COMPOSITION',{teamId:100,title:'정보 변경'});
  await assert.rejects(command(3,'SAVE_COMPOSITION',{teamId:100,cancel:true}),/권한/);
  await assert.rejects(command(3,'SAVE_COMPOSITION',{teamId:100,approveItem:true}),/권한/);
  assert.equal((await db.query('select status from private.sanctuary_management_support_batches_v412 where support_batch_id=1')).rows[0].status,'PENDING');
  await command(1,'SAVE_COMPOSITION',{teamId:100,title:'생성자',difficulty:'HARD',locked:true,cancel:true});
  await assert.rejects(command(2,'EDIT_SCHEDULE',{teamId:200}),/권한/);
  await assert.rejects(command(1,'SET_SLOT',{teamId:100,forceId:20}),/다시 확인/);
  await assert.rejects(command(5,'UNKNOWN',{teamId:100}),/지원하지/);
  await db.exec('update private.sanctuary_team_operators set active=false where member_id=2');
  await assert.rejects(command(2,'EDIT_SCHEDULE',{teamId:100}),/권한/);
  assert.equal((await db.query("select has_function_privilege('anon','public.kinojo_sanctuary_management_command_v2(text,text,text,jsonb,bigint)','execute') v")).rows[0].v,false);
  await db.exec(`create table private.sanctuary_management_edit_leases_v412(team_id bigint primary key,actor_member_id bigint,lease_token_hash text,acquired_at timestamptz,expires_at timestamptz);
    create function private.kinojo_sm_assert_pilot_write_v439(text,text) returns void language sql as 'select';
    create function private.kinojo_sm_assert_write_enabled_v412() returns void language sql as 'select';
    create function private.kinojo_sm_permission_revision() returns text language sql as 'select ''fixture-revision''';
    create function public.kinojo_sanctuary_management_bootstrap_v456(text,text) returns jsonb language sql as $$
      select jsonb_build_object('actor',private.kinojo_sm_actor_v412($1),'teams',jsonb_build_array(
        jsonb_build_object('teamId',100,'status','ACTIVE','canEdit',true,'supportBatches',jsonb_build_array(jsonb_build_object('requesterMemberId',1),jsonb_build_object('requesterMemberId',2))),
        jsonb_build_object('teamId',200,'status','DRAFT','canEdit',true,'supportBatches','[]'::jsonb)))
    $$;`);
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260909113943_sanctuary_permission_entrypoint_cutover.sql'),'utf8'));
  const tokenA='fixture-only-non-secret-lease-one-0000000000',tokenB='fixture-only-non-secret-lease-two-0000000000';
  const lease=(member,action,token=tokenA)=>db.query('select public.kinojo_sanctuary_management_lease_v2($1,100,$2,$3)',['fixture-'+member,action,token]);
  await assert.rejects(lease(2,'ACQUIRE'),/권한/);
  await db.exec('update private.sanctuary_team_operators set active=true where member_id=2');
  await lease(2,'ACQUIRE');await assert.rejects(lease(1,'ACQUIRE',tokenB),/다른 사용자/);
  await lease(2,'RENEW');await lease(1,'RELEASE',tokenA);
  assert.equal((await db.query('select count(*)::int n from private.sanctuary_management_edit_leases_v412')).rows[0].n,1,'another user cannot release');
  await db.exec('update private.sanctuary_team_operators set active=false where member_id=2');
  await assert.rejects(lease(2,'RENEW'),/권한/);
  await lease(2,'RELEASE');
  assert.equal((await db.query('select count(*)::int n from private.sanctuary_management_edit_leases_v412')).rows[0].n,0,'revoked operator can release own lease');
  await assert.rejects(lease(1,'RENEW'),/만료/);
  const view=(await db.query("select public.kinojo_sanctuary_management_bootstrap_v2('fixture-2',null) d")).rows[0].d;
  assert.equal(view.teams.length,1,'unassigned Staff cannot read draft');assert.equal(view.teams[0].canEdit,false);
  assert.deepEqual(view.teams[0].supportBatches,[{requesterMemberId:2}],'private applications limited to owner without support permission');
  assert.equal(view.actor.canCreateTeam,true);
  const scopeTargets=[{"name":"kinojo_sanctuary_management_balance_proposal_v451","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_balance_proposal_v452","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_balance_proposal_v454","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_character_search_v432","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_character_search_v452","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_character_search_v457","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_character_search_v480","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_linked_alts_v450","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_linked_alts_v452","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_linked_alts_v453","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_linked_alts_v454","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_linked_alts_v457","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_official_gate_v432","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_official_gate_v457","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_official_materialize_v432","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_official_materialize_v439","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_official_materialize_v445","lang":"sql"},{"name":"kinojo_sanctuary_management_official_materialize_v446","lang":"sql"},{"name":"kinojo_sanctuary_management_official_materialize_v452","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_official_materialize_v457","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_official_materialize_v480","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_official_prepare_all_v458","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_official_prepare_v432","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_official_prepare_v457","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_official_record_v432","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_official_record_v452","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_official_record_v457","lang":"plpgsql"},{"name":"kinojo_sanctuary_management_official_record_v480","lang":"plpgsql"}];
  for(const target of scopeTargets){
    const body=target.lang==='sql'?"select '{}'::jsonb":"\nbegin\n return '{}'::jsonb;\nend;";
    await db.exec(`create function public.${target.name}(p_credential text,p_team_id bigint) returns jsonb language ${target.lang} as $body$${body}$body$`);
  }
  await db.exec(`create function public.kinojo_sanctuary_management_archive_preview_v437(p_credential text,p_team_id bigint) returns boolean language plpgsql as $$
    begin return private.kinojo_sm_can_manage_team_v412(private.kinojo_sm_actor_v412(p_credential),p_team_id); end; $$;`);
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260909114651_sanctuary_permission_legacy_boundary.sql'),'utf8'));
  assert.equal((await db.query("select public.kinojo_sanctuary_management_archive_preview_v437('fixture-3',100) v")).rows[0].v,false,'info-only cannot inspect archive operation');
  assert.equal((await db.query("select has_function_privilege('service_role','public.kinojo_sanctuary_management_command_v454(text,text,text,jsonb,bigint)','execute') v")).rows[0].v,false,'old command cannot bypass v2');
  await assert.rejects(db.query("select public.kinojo_sanctuary_management_official_materialize_v480('fixture-2',100)"),/권한/);
  await assert.rejects(db.query("select public.kinojo_sanctuary_management_balance_proposal_v454('fixture-3',100)"),/권한/);
  await db.query("select public.kinojo_sanctuary_management_official_materialize_v480('fixture-1',100)");
  await command(1,'SAVE_COMPOSITION',{teamId:100,title:'보호된 저장'});
  // SQL536: actual permission wrapper + storage helper/constraints. Delegate remains synthetic.
  await db.exec(`set check_function_bodies=off;create function private.kinojo_sm_audit_v412(bigint,bigint,text,bigint,text,jsonb,jsonb,text) returns void language sql as 'select';create table public.character_master(id bigint primary key);
   insert into public.character_master select generate_series(101,110);
   alter table private.sanctuary_management_slots_v412 add column assignment_kind text default 'ACTUAL_CHARACTER';
   update private.sanctuary_management_slots_v412 set character_id=101 where slot_id=11;
   insert into private.sanctuary_management_slots_v412(slot_id,team_id,force_id,character_id,revision) values(12,100,10,102,1),(13,100,10,103,1),(14,100,10,104,1);
  `);
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261014152354_sanctuary_boss_roles_v536.sql'),'utf8'));
  const roleSave=(member,entries)=>command(member,'SAVE_COMPOSITION',{teamId:100,composition:[{slots:entries.map(([characterId,boss1,boss2])=>({characterId,bossRoles:{boss1,boss2}}))}]});
  const getRoles=async id=>(await db.query('select private.kinojo_sm_boss_roles_v536(100,1,$1) v',[id])).rows[0].v;
  await roleSave(1,[[101,'3>3',[1,12]],[102,'6>6',[2,3]],[103,'9>12',[4,5]],[104,'12>9',[6,7]]]);
  assert.deepEqual(await getRoles(101),{boss1:'3>3',boss2:[1,12]});
  const roleState=async()=>(await db.query("select jsonb_agg(to_jsonb(b) order by force_no,character_id,boss,ordinal) v from private.sanctuary_boss_roles_v536 b")).rows[0].v;
  const rolesBefore=await roleState();
  for(const entries of [[[102,'3>3',[2,3]]],[[102,'6>6',[1,3]]],[[101,'3>3',[1,2,3]]],[[101,'3>3',[1,1]]],[[101,'3>3',[0]]],[[101,'3>3',[13]]],[[101,'3>3',['1']]],[[101,'3>3',[1.5]]],[[101,'invalid',[1]]],[[null,'3>3',[1]]],[[110,'3>3',[1]]]]){
   await assert.rejects(roleSave(1,entries));assert.deepEqual(await roleState(),rolesBefore,'invalid request must roll back roles');
  }
  await assert.rejects(roleSave(3,[[101,'3>3',[8,9]]]),/권한/);assert.deepEqual(await roleState(),rolesBefore,'info-only cannot edit roles');
  await roleSave(1,[[101,'6>6',[2,3]],[102,'3>3',[1,12]]]); // atomic swap
  assert.deepEqual(await getRoles(102),{boss1:'3>3',boss2:[1,12]});
  await roleSave(1,[[101,null,[]]]);assert.deepEqual(await getRoles(101),{boss1:null,boss2:[]});
  await command(1,'SAVE_COMPOSITION',{teamId:100,title:'old client'});assert.equal((await getRoles(102)).boss1,'3>3','omitted roles preserve existing assignments');
  await db.exec('update private.sanctuary_management_slots_v412 set character_id=110 where slot_id=12');
  await roleSave(1,[[110,'3>3',[1,12]]]);assert.equal((await getRoles(102)).boss1,null,'replacement releases old role');
  assert.equal((await getRoles(110)).boss1,'3>3');
  for(const role of ['anon','authenticated','service_role']){
   assert.equal((await db.query("select has_table_privilege($1,'private.sanctuary_boss_roles_v536','INSERT') v",[role])).rows[0].v,false);
   assert.equal((await db.query("select has_function_privilege($1,'private.kinojo_sm_save_boss_roles_v536(bigint,bigint,jsonb,text)','execute') v",[role])).rows[0].v,false);
  }
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/rollbacks/20261014152354_sanctuary_boss_roles_v536_rollback.sql'),'utf8'));
  assert.equal((await getRoles(110)).boss1,'3>3','rollback preserves assignment data');
  console.log('PASS SQL536: actual command permissions, roles 4 unique/2 per character/1..12, swap/release/replacement/old client, atomic rejection, ACL and rollback');
  console.log('PASS legacy boundary: 26 scoped delegates / old RPC execute revoked / internal v2 delegate remains callable');
  console.log('PASS command guard: actual DB diff / forged change flags / atomic rollback / support side effect / class-lock-difficulty roster / exact team / revocation / ACL');
  console.log('PASS entrypoint contract: lease ownership / renew / revoked release / private draft and application filtering');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
