'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 try{
  // Synthetic identities only; no live credentials, sessions, or network.
  await db.exec(`create schema private;create role anon;create role authenticated;create role service_role;
   create table public.member_codes(id bigint primary key,is_active boolean,role text,level int,permissions text[],main_character_name text);
   create function public.kinojo_normalize_role(text,int) returns text language sql as 'select case when $1=''ADMIN'' then ''MASTER'' else $1 end';
   create function public.kinojo_member_from_web_credential_v326(text) returns setof public.member_codes language sql as 'select * from public.member_codes where id=case when $1 ~ ''^fixture-[0-9]+$'' then substring($1 from 9)::bigint end';
   create table private.sanctuary_management_teams_v412(team_id bigint primary key,creator_member_id bigint,status text,title text,sanctuary_id bigint);
   create table public.sanctuary_permission_catalog(permission_key text primary key,permission_label text,description text,display_order int,enabled boolean);
   create table public.sanctuary_role_permissions(role_key text,permission_key text references public.sanctuary_permission_catalog,enabled boolean not null,updated_by_member_id bigint,updated_by_character text,updated_at timestamptz,primary key(role_key,permission_key));
   insert into public.member_codes values (1,true,'MEMBER',0,'{}','생성자'),(2,true,'STAFF',1,'{}','담당자'),(3,true,'MANAGER',2,'{}','관리자'),(5,true,'MASTER',4,'{}','운영자'),(7,false,'MASTER',4,'{}','비활성'),(8,true,'MEMBER',0,'{all,sanctuary_edit}','기존예외');
   insert into private.sanctuary_management_teams_v412 values(100,1,'ACTIVE','팀',1),(200,3,'ACTIVE','팀',2),(300,1,'ARCHIVED','해산',1);
   insert into public.sanctuary_permission_catalog values('sanctuary_team_name_edit','구 정보','',1,true),('sanctuary_schedule_manage_assigned','구 일정','',2,true);
   insert into public.sanctuary_role_permissions(role_key,permission_key,enabled) values('MANAGER','sanctuary_team_name_edit',false),('STAFF','sanctuary_schedule_manage_assigned',true);`);
  for(const file of ['20260909111151_sanctuary_permission_foundation.sql','20260909112603_sanctuary_permission_admin_contract.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
  const read=async(credential='fixture-5')=>(await db.query('select public.kinojo_admin_sanctuary_permissions_v2($1) d',[credential])).rows[0].d;
  const set=async(role,key,value,rev,credential='fixture-5')=>(await db.query('select public.kinojo_admin_sanctuary_permission_set_v2($1,$2,$3,$4,$5) d',[credential,role,key,value,rev])).rows[0].d;
  const operators=async(team=100,query='',credential='fixture-5')=>(await db.query('select public.kinojo_admin_sanctuary_operators_v2($1,$2,$3) d',[credential,team,query])).rows[0].d;
  const assign=async(member,active,rev,team=100,credential='fixture-5')=>(await db.query('select public.kinojo_admin_sanctuary_operator_set_v2($1,$2,$3,$4,$5) d',[credential,team,member,active,rev])).rows[0].d;
  for(const c of ['','fixture-1','fixture-3','fixture-7','fixture-999']){
   await assert.rejects(read(c));await assert.rejects(operators(100,'',c));await assert.rejects(assign(2,true,0,100,c));
  }
  let view=await read();assert.equal(view.items.length,11);assert.ok(view.items.every(x=>x.roles.MASTER));
  assert.equal(view.items.find(x=>x.permissionKey==='sanctuary_info_manage_all').roles.MANAGER,false,'legacy OFF preserved');
  assert.equal(view.items.find(x=>x.permissionKey==='sanctuary_support_manage_all').roles.MANAGER,true);
  await assert.rejects(set('MASTER','sanctuary_team_create',false,view.revision));
  await assert.rejects(set('MEMBER','all',true,view.revision));
  await assert.rejects(set('MEMBER','sanctuary_team_create',null,view.revision));
  await assert.rejects(set('MEMBER','sanctuary_team_create',false,null));
  const old=view.revision;view=await set('MEMBER','sanctuary_team_create',false,old);assert.notEqual(view.revision,old);
  await assert.rejects(set('STAFF','sanctuary_team_create',false,old),/다시 불러/);
  assert.equal((await set('MEMBER','sanctuary_team_create',false,view.revision)).revision,view.revision,'no-op stable');
  assert.equal((await operators(null)).teams.length,2,'no archived teams');
  assert.equal((await operators(100,'%')).candidates.length,0,'literal search, not wildcard');
  assert.equal((await operators(100,'담당')).candidates[0].memberId,2);
  let result=await assign(2,true,0);assert.equal(result.assigned[0].revision,1);
  assert.equal((await operators(200)).assigned.length,0,'same title never implies assignment');
  await assert.rejects(assign(2,false,0),/다시 불러/);
  assert.equal((await assign(2,false,1)).assigned.length,0);
  await assert.rejects(assign(2,true,0));
  assert.equal((await assign(2,true,2)).assigned[0].revision,3,'reactivation retains revision');
  await assert.rejects(assign(7,true,0));await assert.rejects(assign(2,true,0,300));
  await db.exec('update public.member_codes set is_active=false where id=2');
  assert.equal((await assign(2,false,3)).assigned.length,0,'inactive assignment can be revoked');
  assert.equal((await db.query('select count(*)::int n from private.sanctuary_permission_audit')).rows[0].n,5);
  assert.deepEqual((await db.query('select role,permissions from public.member_codes where id=8')).rows[0],{role:'MEMBER',permissions:['all','sanctuary_edit']});
  assert.equal((await db.query('select role from public.member_codes where id=2')).rows[0].role,'STAFF','assignment never promotes');
  const acl=(await db.query("select has_function_privilege('anon','private.kinojo_sm_require_master(text)','execute') helper,has_function_privilege('anon','public.kinojo_admin_sanctuary_permission_set_v2(text,text,text,boolean,text)','execute') rpc,has_table_privilege('authenticated','private.sanctuary_permission_audit','select') audit")).rows[0];
  assert.deepEqual(acl,{helper:false,rpc:true,audit:false});
  console.log('PASS permission admin: Master auth / 11 keys / stale writes / audit / exact team / revoke / no promotion / preserved exceptions / ACL');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
