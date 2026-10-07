// Real deployed RPCs/triggers, isolated Postgres. Summary adapters expose their inputs and write counts.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'../.codex-test-runtime/node_modules/@electric-sql/pglite');
const path='20261007030204_queue_progress_write_coalescing.sql';
const migration=fs.readFileSync('supabase/migrations/'+path,'utf8');
const baseline=fs.readFileSync('tests/fixtures/queue-progress-coalescing-baseline.sql','utf8');
const rollback=fs.readFileSync('supabase/rollbacks/'+path,'utf8');
(async()=>{
 const db=new PGlite();
 try{
 await db.exec(`
 create schema private;create role anon;create role authenticated;create role service_role;
 create table updater_sessions(session_id text primary key,raw_payload jsonb,stage text,message text,progress_current int,progress_total int,last_heartbeat_at timestamptz,expires_at timestamptz);
 create table lookup_batches(session_id text primary key,status text,stage text,message text,done_count int,total_count int,worker_id text,worker_lease_until timestamptz,worker_batch_no int,worker_last_started_at timestamptz,worker_last_finished_at timestamptz,worker_last_summary jsonb,last_heartbeat_at timestamptz,expires_at timestamptz,updated_at timestamptz);
 create table updater_runtime_jobs(session_id text primary key,current_stage text,message text,progress_current int,progress_total int,last_heartbeat_at timestamptz);
 create table updater_lock_state(id text primary key,session_id text,stage text,message text,progress_current int,progress_total int,last_heartbeat_at timestamptz,expires_at timestamptz);
 create table private.calls(kind text,session_id text);
 create table private.cache(kind text primary key,payload jsonb);
 create function kinojo_validate_updater_session(text,text) returns jsonb language sql as $$select jsonb_build_object('ok',$2='synthetic','code',case when $2='synthetic' then null else 'INVALID_SESSION' end)$$;
 create function kinojo_lookup_progress_summary(text) returns jsonb language sql as $$select '{"ok":true,"completedCount":7,"total":124}'::jsonb$$;
 create function private.kinojo_queue_summary_refresh_core_v422(text) returns void language plpgsql as $$
 begin
 if current_setting('kinojo.test_summary_failure',true)='on' then raise exception 'synthetic summary failure';end if;
 insert into private.calls values('core',$1);
 insert into private.cache values('core',jsonb_build_object(
 'batch',(select to_jsonb(b) from public.lookup_batches b where session_id=$1),
 'session',(select to_jsonb(s) from public.updater_sessions s where session_id=$1),
 'job',(select to_jsonb(j) from public.updater_runtime_jobs j where session_id=$1),
 'lock',(select to_jsonb(l) from public.updater_lock_state l where session_id=$1)))
 on conflict(kind) do update set payload=excluded.payload;
 end$$;
 create function private.kinojo_queue_summary_refresh_progress_v422(text) returns void language plpgsql as $$
 begin insert into private.calls values('progress',$1);
 insert into private.cache values('progress',(select jsonb_build_object('current',progress_current,'total',progress_total) from public.updater_sessions where session_id=$1))
 on conflict(kind) do update set payload=excluded.payload;end$$;
 `);
 await db.exec(baseline);
 await db.exec(`
 create trigger core after update on lookup_batches for each row execute function private.kinojo_queue_summary_core_trigger_v422();
 create trigger core after update on updater_sessions for each row execute function private.kinojo_queue_summary_core_trigger_v422();
 create trigger core after update on updater_runtime_jobs for each row execute function private.kinojo_queue_summary_core_trigger_v422();
 create trigger lock after update on updater_lock_state for each row execute function private.kinojo_queue_summary_lock_trigger_v422();
 revoke all on function kinojo_server_queue_worker_claim_v270(text,text,text,integer) from public;
 revoke all on function kinojo_server_queue_worker_update_v270(text,text,text,text,text,boolean,jsonb) from public;
 grant execute on function kinojo_server_queue_worker_claim_v270(text,text,text,integer),kinojo_server_queue_worker_update_v270(text,text,text,text,text,boolean,jsonb) to service_role;
 `);
 async function reset(){
  await db.exec(`truncate updater_sessions,lookup_batches,updater_runtime_jobs,updater_lock_state,private.calls,private.cache;
  insert into updater_sessions(session_id,raw_payload,progress_current,progress_total) values('run','{"serverQueue":true}',6,124);
  insert into lookup_batches(session_id,done_count,total_count,worker_batch_no) values('run',6,124,0);
  insert into updater_runtime_jobs(session_id,progress_current,progress_total) values('run',6,124);
  insert into updater_lock_state(id,session_id,progress_current,progress_total) values('global','run',6,124);`);
 }
 const claim="select kinojo_server_queue_worker_claim_v270('run','synthetic','worker',5) result";
 const update="select kinojo_server_queue_worker_update_v270('run','synthetic','worker','BATCH_DONE','done',true,'{}') result";
 async function count(){return Object.fromEntries((await db.query('select kind,count(*)::int n from private.calls group by kind')).rows.map(r=>[r.kind,r.n]));}
 function normalized(v){
  if(Array.isArray(v))return v.map(normalized);
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!/(?:_at|_until|leaseUntil)$/.test(k)).map(([k,x])=>[k,normalized(x)]));
  return v;
 }
 async function state(){return normalized((await db.query('select kind,payload from private.cache order by kind')).rows);}
 async function acl(){return (await db.query("select oid::regprocedure::text name,proacl::text acl from pg_proc where proname in ('kinojo_server_queue_worker_claim_v270','kinojo_server_queue_worker_update_v270') order by name")).rows;}
 async function restored(){assert.notEqual((await db.query("select current_setting('kinojo.defer_queue_summary_v528',true) v")).rows[0].v,'on');}
 await reset();const oldClaim=(await db.query(claim)).rows[0].result,oldClaimState=await state();assert.deepEqual(await count(),{core:5,progress:3});
 await db.exec('truncate private.calls');const oldUpdate=(await db.query(update)).rows[0].result,oldUpdateState=await state();assert.deepEqual(await count(),{core:5,progress:3});
 const oldAcl=await acl();await db.exec(migration);assert.deepEqual(await acl(),oldAcl);
 await reset();assert.deepEqual(normalized((await db.query(claim)).rows[0].result),normalized(oldClaim));assert.deepEqual(await state(),oldClaimState);assert.deepEqual(await count(),{core:1,progress:1});await restored();
 await db.exec('truncate private.calls');assert.deepEqual((await db.query(update)).rows[0].result,oldUpdate);assert.deepEqual(await state(),oldUpdateState);assert.deepEqual(await count(),{core:1,progress:1});await restored();
 // Ordinary writes outside these RPCs still refresh immediately.
 await db.exec("truncate private.calls;update updater_sessions set progress_current=8 where session_id='run'");
 assert.deepEqual(await count(),{core:1,progress:1});assert.equal((await db.query("select payload->>'current' n from private.cache where kind='progress'")).rows[0].n,'8');
 // Auth rejection, another owner's lease and admin controls must never flush or acquire.
 await reset();await db.query(claim);await db.exec('truncate private.calls');
 assert.equal((await db.query("select kinojo_server_queue_worker_claim_v270('run','wrong','other',5) result")).rows[0].result.ok,false);
 assert.equal((await db.query("select kinojo_server_queue_worker_claim_v270('run','synthetic','other',5) result")).rows[0].result.busy,true);
 assert.deepEqual(await count(),{});await restored();
 for(const control of ['paused','cancelled']){
  await db.query("update updater_sessions set raw_payload=jsonb_build_object('serverQueue',true,'adminControlState',$1::text)",[control]);await db.exec('truncate private.calls');
  assert.equal((await db.query(claim)).rows[0].result[control],true);assert.deepEqual(await count(),{});await restored();
 }
 // A failed final flush rolls back all four updates and restores the function-local setting.
 await reset();await db.exec("set kinojo.test_summary_failure='on'");
 await assert.rejects(db.query(claim),/synthetic summary failure/);await restored();
 assert.equal((await db.query("select worker_id from public.lookup_batches where session_id='run'")).rows[0].worker_id,null);
 await db.exec("set kinojo.test_summary_failure='off'");
 // The caller's non-default setting survives successful and exceptional function exits.
 await db.exec("set kinojo.defer_queue_summary_v528='caller'");
 await db.query(claim);assert.equal((await db.query("show kinojo.defer_queue_summary_v528")).rows[0]['kinojo.defer_queue_summary_v528'],'caller');
 await db.exec("set kinojo.test_summary_failure='on'");await assert.rejects(db.query(update),/synthetic summary failure/);
 assert.equal((await db.query("show kinojo.defer_queue_summary_v528")).rows[0]['kinojo.defer_queue_summary_v528'],'caller');
 await db.exec("set kinojo.test_summary_failure='off'");
 await db.exec(rollback);assert.deepEqual(await acl(),oldAcl);await reset();await db.query(claim);assert.deepEqual(await count(),{core:5,progress:3});
 console.log('PASS: claim/update final summary parity; refresh writes 8 to 2; null/auth/control/lease guards; direct update; transaction rollback; scoped setting restoration; ACL and rollback');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
