'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create schema private;create role anon;create role authenticated;create role service_role;
   create table public.member_codes(id bigint primary key,is_active boolean,role text,level int,permissions text[]);
   create function public.kinojo_normalize_role(text,int) returns text language sql as 'select case when $1=''ADMIN'' then ''MASTER'' else $1 end';
   create table private.sanctuary_management_teams_v412(team_id bigint primary key,creator_member_id bigint,status text);
   create table public.sanctuary_role_permissions(role_key text,permission_key text,enabled boolean not null,primary key(role_key,permission_key));
   insert into public.member_codes values (1,true,'MEMBER',0,'{}'),(2,true,'STAFF',1,'{}'),(3,true,'MANAGER',2,'{}'),(4,true,'SUB_MASTER',3,'{}'),(5,true,'MASTER',4,'{}'),(6,true,'ADMIN',4,'{}'),(7,false,'MASTER',4,'{}'),(8,true,'MEMBER',0,'{all,sanctuary_edit}');
   insert into private.sanctuary_management_teams_v412 values(100,1,'ACTIVE'),(200,3,'ACTIVE'),(300,1,'ARCHIVED');
   insert into public.sanctuary_role_permissions
   select r,k,(r in ('MANAGER','SUB_MASTER','MASTER') or (r='STAFF' and k='sanctuary_schedule_manage_assigned')) from unnest(array['MEMBER','STAFF','MANAGER','SUB_MASTER','MASTER']) r cross join unnest(array['sanctuary_schedule_manage_assigned','sanctuary_schedule_manage_all','sanctuary_roster_manage_assigned','sanctuary_roster_manage_all','sanctuary_team_name_edit']) k;`);
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260909111151_sanctuary_permission_foundation.sql'),'utf8');
  await db.exec(sql);
  const caps=async(id,team=100)=>(await db.query('select private.kinojo_sm_capabilities($1,$2) c',[id,team])).rows[0].c;
  const allManagement=c=>Object.entries(c).filter(([k])=>k!=='canCreateTeam').map(([,v])=>v);
  assert.ok(Object.values(await caps(999)).every(x=>x===false),'unknown member');
  assert.ok(Object.values(await caps(7)).every(x=>x===false),'inactive Master');
  assert.ok(allManagement(await caps(2)).every(x=>!x),'Staff flag without actual team relation grants nothing');
  await db.exec('insert into private.sanctuary_team_operators(team_id,member_id,assigned_by_member_id) values(100,2,5)');
  const assigned=await caps(2);assert.equal(assigned.canManageSchedule,true);assert.equal(assigned.canEditRoster,false);assert.equal(assigned.canArchive,false);assert.equal(assigned.canDecideSupport,false);assert.equal(assigned.canEditInfo,false);
  assert.ok(allManagement(await caps(2,200)).every(x=>!x),'assigned to another team is not enough');
  await db.exec('update private.sanctuary_team_operators set active=false');
  assert.equal((await caps(2)).canManageSchedule,false,'revocation effective on next request');
  const owner=await caps(1);for(const [key,value] of Object.entries(owner))assert.equal(value,key!=='canAssignOperators','creator baseline '+key);
  for(const id of [3,4]){const c=await caps(id);assert.equal(c.canEditRoster,true);assert.equal(c.canManageSchedule,true);assert.equal(c.canDecideSupport,true);assert.equal(c.canArchive,true);assert.equal(c.canAssignOperators,false);}
  for(const id of [5,6])assert.ok(Object.values(await caps(id)).every(Boolean),'Server-normalized Master/ADMIN');
  for(const id of [1,2,3,4,5,6])assert.ok(allManagement(await caps(id,300)).every(x=>!x),'archived mutation denied');
  assert.ok(allManagement(await caps(8)).every(x=>!x),'legacy overrides preserved without implicit expansion');
  await db.exec("insert into public.sanctuary_role_permissions values('MANAGER','sanctuary_support_manage_all',false),('MANAGER','sanctuary_support_manage_assigned',false)");
  assert.equal((await caps(3)).canDecideSupport,false,'explicit OFF wins over new default');
  assert.equal((await caps(3,200)).canDecideSupport,true,'grade OFF does not revoke creator baseline');
  await db.exec("update public.member_codes set permissions='{sanctuary_roster_manage_all}' where id=8");
  assert.equal((await caps(8)).canEditRoster,true);assert.equal((await caps(8)).canManageSchedule,false,'explicit personal scope only');
  const before={info:{mode:'PARTICIPATION',title:'팀'},roster:[{forceId:1,slots:[]}],schedule:{weekday:2}};
  const changed=async(after,cancel=false)=>(await db.query('select private.kinojo_sm_changed_domains($1::jsonb,$2::jsonb,$3) d',[JSON.stringify(before),JSON.stringify(after),cancel])).rows[0].d;
  assert.deepEqual(await changed(before),[]);
  assert.deepEqual(await changed({...before,schedule:{weekday:3}}),['schedule']);
  assert.deepEqual(await changed({...before,info:{...before.info,mode:'FIXED'}},true),['info','support']);
  assert.deepEqual(await changed({...before,roster:[]}),['roster']);
  await assert.rejects(changed({...before,changedFields:[]} ),/CANONICAL_INVALID/);
  await assert.rejects(changed(null),/CANONICAL_INVALID/);
  const acl=(await db.query("select has_function_privilege('anon','private.kinojo_sm_capabilities(bigint,bigint)','execute') a,has_function_privilege('authenticated','private.kinojo_sm_changed_domains(jsonb,jsonb,boolean)','execute') b,relrowsecurity rls from pg_class where oid='private.sanctuary_team_operators'::regclass")).rows[0];
  assert.deepEqual(acl,{a:false,b:false,rls:true});
  const counts=(await db.query('select count(*)::int n from private.sanctuary_team_operators')).rows[0].n;
  await db.exec(sql);assert.equal((await db.query('select count(*)::int n from private.sanctuary_team_operators')).rows[0].n,counts,'re-run preserves assignments');
  console.log('PASS Stage14 SQL foundation: roles / ownership / exact assignment / revoke / OFF / personal / canonical diff / ACL / idempotence');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
