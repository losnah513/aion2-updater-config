const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'../.codex-test-runtime/node_modules/@electric-sql/pglite');
const read=p=>fs.readFileSync(p,'utf8');
const migration='supabase/migrations/20260909111102_character_cleanup_history_preservation.sql';
const rollback='supabase/rollbacks/20260909111102_character_cleanup_history_preservation_rollback.sql';
(async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create schema private;create role anon;create role authenticated;create role service_role bypassrls;
 create table public.character_master(id bigint primary key,char_key text,server_id integer,character_name text,last_lookup_success_at timestamptz);
 create table public.character_identity_change_history(history_id bigint,character_id bigint references public.character_master(id) on delete cascade,
 previous_server_id int,previous_character_name text,current_server_id int,current_character_name text,
 char_key text,previous_char_key text,current_char_key text);
 create table public.character_identity_recovery_attempts(attempt_id bigint,character_id bigint references public.character_master(id) on delete set null);
 create table private.character_activity_checks(character_id bigint references public.character_master(id) on delete restrict);
 create table private.character_activity_lifecycle(character_id bigint references public.character_master(id) on delete restrict);
 create table public.extension_character_payloads(id bigint primary key,session_id text,server_id int,character_name text,char_key text,gear_type text,master_sync_status text);
 create table public.master_sync_events(id bigint primary key,session_id text,payload_id bigint,character_name text,status text,after_data jsonb,raw_payload jsonb,created_at timestamptz);
 create function public.kinojo_normalize_character_name(text) returns text language sql immutable as $$select lower(replace($1,' ',''))$$;
 create function public.kinojo_json_int(jsonb,text) returns int language sql immutable as $$select ($1->>$2)::int$$;
 insert into public.character_master values(1,'111111111111',2008,'renamed',now()),(2,'222222222222',2002,'other',now());
 insert into public.character_identity_change_history values(1,1,2002,'old',2008,'renamed','111111111111','101010101010','111111111111');
 insert into public.character_identity_recovery_attempts values(1,1);
 insert into private.character_activity_checks values(1);insert into private.character_activity_lifecycle values(1);`);
 await db.exec(read('tests/evidence/20260908-character-refresh-audit/weekly-existing-functions.sql').split('CREATE OR REPLACE FUNCTION public.kinojo_hof_weekly_deltas')[0]);
 await db.exec(read('supabase/migrations/20260908085012_character_weekly_growth_stable_identity.sql'));
 await db.exec(read('supabase/migrations/20260908131116_character_weekly_identity_query_plan.sql'));
 for(const [id,power,at]of [[1,100,'2026-09-03T00:00Z'],[2,150,'2026-09-08T00:00Z']]){
  await db.query("insert into public.extension_character_payloads values($1,'s',2008,'renamed','111111111111','PVE','synced')",[id]);
  await db.query("insert into public.master_sync_events values($1,'s',$1,'renamed','synced',$2,'{}',$3)",[id,JSON.stringify({id:1,char_key:'111111111111',latest_payload_id:id,server_id:2008,character_name:'renamed',latest_pve_combat_power:power,latest_pve_item_level:10}),at]);
 }
 const rows=async sql=>(await db.query(sql)).rows;
 const weekly=()=>rows("select * from public.kinojo_hof_weekly_gear_deltas('2026-09-08T12:00Z')");
 const before=await weekly();assert.equal(before[0].power_delta,50);
 const histories=await rows('select * from public.character_identity_change_history');
 await db.exec(read(migration));assert.deepEqual(await weekly(),before,'live reader unchanged');
 for(const role of ['anon','authenticated']){
  assert.equal((await rows(`select has_table_privilege('${role}','private.character_historical_identities','SELECT') ok`))[0].ok,false);
  assert.equal((await rows(`select has_function_privilege('${role}','private.kinojo_character_history_identity_scope()','EXECUTE') ok`))[0].ok,false);
 }
 await db.exec('begin; delete from public.character_master where id=1');
 assert.deepEqual(await weekly(),before,'historical weekly reader survives current-row deletion');
 assert.deepEqual(await rows('select * from public.character_identity_change_history'),histories);
 assert.equal((await rows('select character_id from public.character_identity_recovery_attempts'))[0].character_id,1);
 assert.equal((await rows('select count(*)::int n from private.character_activity_lifecycle'))[0].n,1);
 assert.equal((await rows('select count(*)::int n from public.character_master'))[0].n,1,'no active profile placeholder');
 assert((await rows('select retired_at from private.character_historical_identities where character_id=1'))[0].retired_at);
 for(const insert of ["(3,'111111111111',2010,'again',null)","(3,'101010101010',2002,'old',null)","(3,null,2008,' RENAMED ',null)","(3,null,2002,'old',null)","(1,'999999999999',2002,'new',null)"]){
  await db.exec('savepoint denied');
  await assert.rejects(db.exec('insert into public.character_master values'+insert),/RETIRED_CHARACTER_REQUIRES_REVIEW/);
  await db.exec('rollback to denied');
 }
 await db.exec("insert into public.character_master values(3,'333333333333',2002,'old',null)");
 assert.equal((await rows('select count(*)::int n from public.character_master'))[0].n,2,'different key can reuse a name; identity proof remains upstream');
 // An unverified queue-abort row is not a retired character and can be retried.
 await db.exec("insert into public.character_master values(4,null,2002,'draft',null);delete from public.character_master where id=4;insert into public.character_master values(5,null,2002,'draft',null)");
 assert.equal((await rows('select retired_at from private.character_historical_identities where character_id=4'))[0].retired_at,null);
 await db.exec('rollback');
 assert.deepEqual(await weekly(),before);
 await db.exec(read(rollback));assert.deepEqual(await weekly(),before);assert.deepEqual(await rows('select * from public.character_identity_change_history'),histories);
 assert.equal((await rows("select confrelid='public.character_master'::regclass as restored from pg_constraint where conname='character_identity_change_history_character_id_fkey'"))[0].restored,true);
 console.log('PASS history preservation: actual weekly SQL parity, deletion preserves IDs/history, no live placeholder, replay fence/name reuse, pending abort compatibility, ACL and rollback');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
