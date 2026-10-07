const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'../.codex-test-runtime/node_modules/@electric-sql/pglite');
const migration=fs.readFileSync('supabase/migrations/20261007013943_retention_candidate_sets.sql','utf8');
const rollback=fs.readFileSync('supabase/rollbacks/20261007013943_retention_candidate_sets.sql','utf8');
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create schema private;create role anon;create role authenticated;create role service_role;
   create function public.kinojo_normalize_character_name(text) returns text language sql immutable
    as $$select lower(replace($1,' ',''))$$;
   create table public.lookup_snapshots(id bigint primary key,session_id text,server_id integer,
    character_name text,status text,created_at timestamptz,snapshot_uid text,raw_payload jsonb);
   create table public.extension_character_payloads(id bigint primary key,session_id text,
    server_id integer,character_name text,received_at timestamptz,master_sync_status text,
    growth_review_status text,source_snapshot_id bigint,lookup_order integer);
   create table public.updater_sessions(session_id text primary key,status text,finished_at timestamptz);
   create table public.updater_runtime_jobs(session_id text,status text);
   create table public.lookup_batches(session_id text,status text);
   create table public.google_list_sheet_sync_queue(session_id text,sync_status text);
   create table public.character_master(latest_payload_id bigint,latest_pve_payload_id bigint,
    latest_pvp_payload_id bigint,legion_source_snapshot_id bigint,latest_snapshot_uid text);
   create table public.character_skill_current_state(snapshot_id bigint);
   create table public.character_stat_sources(snapshot_id bigint,payload_id bigint);
   create table private.character_snapshot_requests(snapshot_id bigint);
   create table public.ranking_entries(latest_payload_id bigint);
   create table public.lookup_session_targets(payload_id bigint,session_id text,lookup_order integer,target_status text);
   create table public.character_history(source_payload_id bigint);
   insert into public.updater_sessions select id::text,'completed',now()-interval '40 days'
    from generate_series(1,80) id;
   insert into public.lookup_snapshots
    select id,id::text,2002,'Hero'||id,'OK',now()-interval '40 days','uid'||id,'{"detail":"old"}'
    from generate_series(1,80) id;
   insert into public.lookup_snapshots
    select 1000+id,id::text,2002,'Hero'||id,'OK',now(),'new'||id,'{}'
    from generate_series(1,80) id;
   insert into public.extension_character_payloads
    select id,id::text,2002,'Hero'||id,now()-interval '40 days','synced','reviewed',id,1
    from generate_series(1,80) id;
   insert into public.extension_character_payloads
    select 1000+id,id::text,2002,'Hero'||id,now(),'synced','reviewed',1000+id,2
    from generate_series(1,80) id;
   insert into public.character_master values(1,2,3,4,'uid5');
   insert into public.character_skill_current_state values(6);
   insert into public.character_stat_sources values(7,8);
   insert into private.character_snapshot_requests values(9);
   insert into public.ranking_entries values(10);
   insert into public.lookup_session_targets values(11,'11',1,'lookup_done'),(null,'12',1,'retry'),(null,'13',1,null);
   insert into public.character_history values(14);
   insert into public.updater_runtime_jobs values('15','running'),('16',null);
   insert into public.lookup_batches values('17','running'),('18',null);
   insert into public.google_list_sheet_sync_queue values('19','failed'),('20',null),('21','synced'),('22','obsolete');
   update public.extension_character_payloads set master_sync_status='pending' where id=23;
   update public.extension_character_payloads set master_sync_status=null where id=24;
   update public.extension_character_payloads set growth_review_status=null where id=25;
   update public.updater_sessions set status='running' where session_id='26';
   update public.updater_sessions set finished_at=null where session_id='27';
   update public.updater_sessions set finished_at=now()-interval '10 days' where session_id='28';
   update public.lookup_snapshots set created_at=now()-interval '2 days' where id=29;
   update public.extension_character_payloads set received_at=now()-interval '2 days' where id=30;
   update public.lookup_snapshots set raw_payload='{"retainedSummaryVersion":514}' where id=31;
   update public.lookup_snapshots set raw_payload=null where id=32;
   update public.lookup_snapshots set status='failed' where id=33;
   delete from public.lookup_snapshots where id=1034;
   update public.lookup_snapshots set character_name=null where id in (35,1035);
   update public.lookup_snapshots set server_id=null where id in (36,1036);
   update public.extension_character_payloads set source_snapshot_id=null,master_sync_status='pending' where id=1037;
   update public.extension_character_payloads set character_name='H E R O38',server_id=null where id in(38,1038);
   update public.extension_character_payloads set received_at=null where id=1039;
   update public.extension_character_payloads set received_at=now()-interval '40 days' where id=1040;
   update public.updater_sessions set status='failed' where session_id='41';
   update public.updater_sessions set status='cancelled' where session_id='42';
   update public.updater_sessions set status='expired' where session_id='43';
   update public.updater_sessions set status='error' where session_id='44';
   insert into public.character_master values(null,null,null,null,null);
   insert into public.character_stat_sources values(null,null);
  `);
  // Baseline definitions are the exact rollback, preserving the original selectors.
  await db.exec(rollback.replace('DROP INDEX public.idx_lookup_snapshot_pending_summary_v527;',''));
  for(const fn of ['snapshot_raw_candidates_v514','payload_seven_day_candidates_v515'])
   await db.exec(`revoke all on function private.kinojo_${fn}(bigint,integer) from public`);
  const selectors=['snapshot_raw_candidates_v514','payload_seven_day_candidates_v515'];
  const all=async()=>{
   const result=[];
   for(const name of selectors)for(const after of [0,20,50,79,null])for(const limit of [0,1,17,50,500,null])
    result.push((await db.query(`select id from private.kinojo_${name}($1,$2)`,[after,limit])).rows);
   return result;
  };
  const baseline=await all();
  assert.ok(baseline[3].length>0,'snapshot fixture must exercise eligible rows');
  assert.ok(baseline[33].length>0,'payload fixture must exercise eligible rows');
  const hashes=async()=>(await db.query(`select 'snapshots' kind,md5(jsonb_agg(to_jsonb(s) order by id)::text) hash from lookup_snapshots s
    union all select 'payloads',md5(jsonb_agg(to_jsonb(p) order by id)::text) from extension_character_payloads p order by kind`)).rows;
  const before=await hashes();
  await db.exec(migration);
  assert.deepEqual(await all(),baseline,'all protection, ordering, cursor and limit semantics');
  assert.deepEqual(await hashes(),before,'migration must not mutate source rows');
  for(const role of ['anon','authenticated','service_role'])for(const fn of selectors)
   assert.equal((await db.query("select has_function_privilege($1,$2,'execute') allowed",[role,`private.kinojo_${fn}(bigint,integer)`])).rows[0].allowed,false);
  // The partial index must track transitions in both directions and null/foreign versions.
  await db.exec(`update lookup_snapshots set raw_payload='{"retainedSummaryVersion":514}' where id=50`);
  assert.ok(!(await db.query('select id from private.kinojo_snapshot_raw_candidates_v514(0,50)')).rows.some(r=>Number(r.id)===50));
  await db.exec(`update lookup_snapshots set raw_payload='{"retainedSummaryVersion":999}' where id=50`);
  assert.ok((await db.query('select id from private.kinojo_snapshot_raw_candidates_v514(0,50)')).rows.some(r=>Number(r.id)===50));
  const after=await hashes(),results=await all();
  await db.exec(rollback);
  assert.deepEqual(await all(),results,'rollback preserves candidate outputs');
  assert.deepEqual(await hashes(),after,'rollback preserves data');
  assert.equal((await db.query("select to_regclass('public.idx_lookup_snapshot_pending_summary_v527') i")).rows[0].i,null);
  console.log('PASS: retention selector parity across protection/null/identity/status/cursor/limit cases, index updates, ACL and rollback');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
