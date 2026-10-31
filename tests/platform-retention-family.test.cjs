'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const read=p=>fs.readFileSync(p,'utf8');
const migration=read('supabase/migrations/20261031042747_family_snapshot_retention_coordination.sql');
const rollback=read('supabase/rollbacks/20261031042747_family_snapshot_retention_coordination.sql');
(async()=>{
 let db=new PGlite();try{
  await db.exec(read('tests/fixtures/retention-diagnostic-candidates-data.sql'));
  await db.exec(rollback);
  const names=['kinojo_superseded_snapshot_candidates_v512','kinojo_snapshot_raw_candidates_v514','kinojo_payload_seven_day_candidates_v515'];
  const ids=async name=>(await db.query('select id from private.'+name+'(0,50)')).rows.map(x=>x.id);
  const before=await Promise.all(names.map(ids));
  await db.exec(migration);
  const after=await Promise.all(names.map(ids));
  for(let i=0;i<names.length;i++){
   assert.ok(!before[i].includes(9));assert.ok(after[i].includes(9),'ranking snapshot ID must not protect an unrelated raw snapshot with the same number');
   assert.deepEqual(after[i],Array.from(new Set([...before[i],9])).sort((a,b)=>a-b).slice(0,50),'all real keep-set, ordering and limit predicates remain');
  }
  for(const fn of ['kinojo_superseded_snapshot_cleanup_v512','kinojo_snapshot_raw_cleanup_v514','kinojo_payload_seven_day_cleanup_v515']){
   const body=(await db.query("select prosrc from pg_proc where proname=$1",[fn])).rows[0].prosrc;
   assert.ok(!body.includes('private.character_snapshot_requests'),'cleanup must not lock the unrelated publication request ledger');
  }
  await db.exec(rollback);assert.deepEqual(await Promise.all(names.map(ids)),before,'code rollback preserves original predicates without row deletion');
 }finally{await db.close();}
 db=new PGlite();try{
  await db.exec(`create schema private;create role anon;create role authenticated;create role service_role;
   create table public.member_codes(id bigint primary key,main_character_name text,is_active boolean default true);
   insert into public.member_codes values(1,'FixtureAccount',true);
   create table public.character_master(id bigint primary key,server_id int,server_name text,character_name text,main_character_id bigint,main_character_name text,is_main boolean,is_active boolean default true,status text default 'OK',visibility_excluded boolean default false,legion_name text);
   create table private.sanctuary_character_owners_v412(character_id bigint primary key,owner_member_id bigint,root_character_id bigint,relation text,verification_source text,updated_at timestamptz);
   create table private.sanctuary_management_slots_v412(character_id bigint,force_id bigint,owner_root_character_id bigint,character_relation text,revision int default 0);
   create function public.kinojo_character_identity_key_v298(text) returns text language sql immutable as $$select lower(replace($1,' ',''))$$;
   create function public.kinojo_web_session_validate_v320(text,boolean) returns jsonb language sql as $$select '{"ok":false}'::jsonb$$;
   create table private.character_snapshot_dispatch(singleton boolean primary key,generation bigint);insert into private.character_snapshot_dispatch values(true,1);
   create table private.character_snapshot_requests(id bigint generated always as identity primary key,session_id text unique,due_at timestamptz);
  `);
  await db.exec(read('supabase/migrations/20260908090316_legion_roster_family_editor_v477.sql'));
  await db.exec(read('supabase/migrations/20260908094523_roster_family_guest_relation_v478.sql'));
  await db.exec(read('supabase/migrations/20260909095156_roster_family_editable_unlink.sql'));
  const family=migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION private.kinojo_roster_family_save_v487'));
  await db.exec(family);
  await db.exec("insert into public.character_master(id,character_name,main_character_id,main_character_name,is_main) values(1,'Main',1,'Main',true),(2,'Alt',2,'Alt',true)");
  const expected=async(...ids)=>Promise.all(ids.map(async id=>{const s=(await db.query('select private.kinojo_roster_family_state_v477($1) r',[id])).rows[0].r;return {rootId:s.rootId,revision:s.revision};}));
  const save=async(key,groups)=>(await db.query('select private.kinojo_roster_family_save_v487(1,$1,1,array[2]::bigint[],$2,array[]::bigint[]) r',[key,JSON.stringify(groups)])).rows[0].r;
  let groups=await expected(1,2);
  await assert.rejects(db.query('select private.kinojo_roster_family_save_v487(999,$1,1,array[2]::bigint[],$2,array[]::bigint[])',['family-fixture-failure-0001',JSON.stringify(groups)]),e=>e.code==='23503');
  assert.equal((await db.query('select count(*)::int n from private.character_snapshot_requests')).rows[0].n,0,'late receipt failure rolls back relation and enqueue atomically');
  assert.equal((await db.query('select generation from private.character_snapshot_dispatch')).rows[0].generation,1);
  let r=await save('family-fixture-request-0001',groups);assert.equal(r.ok,true);assert.equal(r.rankingRefreshQueued,true);
  assert.equal((await save('family-fixture-request-0001',groups)).replayed,true);
  assert.equal((await db.query('select count(*)::int n from private.character_snapshot_requests')).rows[0].n,1,'replay must not enqueue twice');
  assert.equal((await db.query('select generation from private.character_snapshot_dispatch')).rows[0].generation,2);
  groups=await expected(1);r=await save('family-fixture-request-0002',groups);assert.equal(r.ok,true);assert.equal(r.rankingRefreshQueued,false,'no-op relationship save must not invalidate published data');
  assert.equal((await db.query('select generation from private.character_snapshot_dispatch')).rows[0].generation,2);
  await db.exec('begin');await db.exec('update private.character_snapshot_dispatch set generation=3');await db.exec('rollback');assert.equal((await db.query('select generation from private.character_snapshot_dispatch')).rows[0].generation,2);
 }finally{await db.close();}
 console.log('PASS: raw/ranking ID separation, keep-set parity, publication lock removal, code rollback, atomic family invalidation, replay and no-op fencing');
})().catch(e=>{console.error(e);process.exitCode=1;});
