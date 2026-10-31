'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table public.member_codes(id bigint primary key,pass_code text,level int);
 alter table public.member_codes enable row level security;
 insert into public.member_codes values(1,'synthetic-only',1);
 create view public.v_kinojo_admin_members as select * from public.member_codes;
 create table public.character_master(id bigint primary key,character_name text,power int);
 insert into public.character_master values(1,'fixture',100);
 alter table public.character_master enable row level security;
 create policy old_open on public.character_master to anon,authenticated using(true) with check(true);
 create table public.updater_sessions(id bigint,session_token text);
 insert into public.updater_sessions values(1,'synthetic-only');
 alter table public.updater_sessions enable row level security;
 create policy old_open on public.updater_sessions to anon,authenticated using(true) with check(true);
 create table public.announcements(id bigint,content text);
 create table public.hall_suggestions(id bigint,title text);
 grant all on all tables in schema public to anon,authenticated,service_role;
 revoke all on public.member_codes from anon,authenticated;
 grant select(pass_code) on public.member_codes to anon;
 create function public.kinojo_admin_log() returns void language sql security definer as $$insert into public.character_master values(2,'bad',0)$$;
 create function public.fixture_public_read() returns int language sql security definer as $$select count(*)::int from public.v_kinojo_admin_members$$;
 create function public.fixture_admin_update(text) returns void language plpgsql security definer as $$begin if $1<>'valid-fixture-session' then raise exception 'DENIED';end if;update public.character_master set power=200 where id=1;end$$;
 `);
 await db.exec(read('supabase/migrations/20261031040241_platform_public_surface_hardening.sql'));
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  for(const sql of ['select * from public.v_kinojo_admin_members','select pass_code from public.member_codes','select session_token from public.updater_sessions','update public.character_master set power=999','delete from public.character_master','insert into public.character_master values(9,\'bad\',9)','select public.kinojo_admin_log()'])await assert.rejects(db.query(sql),/permission denied/);
  assert.equal((await db.query('select character_name from public.character_master')).rows[0].character_name,'fixture');
  assert.equal((await db.query('select public.fixture_public_read() n')).rows[0].n,1,'owner RPC must retain view read');
  await assert.rejects(db.query("select public.fixture_admin_update('invalid')"),/DENIED/);
  await db.query("select public.fixture_admin_update('valid-fixture-session')");
  await db.exec('reset role');
 }
 assert.equal((await db.query('select power from public.character_master')).rows[0].power,200);
 assert.equal((await db.query("select has_function_privilege('service_role','public.kinojo_admin_log()','execute') ok")).rows[0].ok,true);
 assert.equal((await db.query("select has_table_privilege('service_role','public.updater_sessions','select') ok")).rows[0].ok,true);
 // Reapply is stable, and unsafe privilege restoration is explicitly blocked.
 await db.exec(read('supabase/migrations/20261031040241_platform_public_surface_hardening.sql'));
 await assert.rejects(db.exec(read('supabase/rollbacks/20261031040241_platform_public_surface_hardening.sql')),/PUBLIC_SURFACE_INSECURE_ROLLBACK_BLOCKED/);
 console.log('PASS: view/table/column/PUBLIC containment, backend grants, public and authenticated RPCs, reapply and fail-closed rollback');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
