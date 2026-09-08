const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const {PGlite}=require('../.codex-test-runtime/node_modules/@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 try {
 const fixture=fs.readFileSync('tests/character-refresh-audit-safety.test.cjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1];
 await db.exec(fixture);
 await db.exec(`
 alter table updater_sessions add stage text,add updated_at timestamptz;
 alter table lookup_batches add stage text,add message text;
 alter table updater_lock_state add updated_at timestamptz;
 alter table kinojo_server_automation_settings add running_since timestamptz,add updated_by text;
 alter table character_detail_refresh_jobs add phase text,add cooldown_until timestamptz,add resume_at timestamptz,add worker_id text,add last_error_code text,add last_error_message text,add current_label text;
 insert into updater_sessions(session_id,status) values('test','running');
 insert into lookup_batches(session_id,status) values('test','running');
 insert into kinojo_server_automation_settings(automation_key,running,active_run_id,active_session_id) values('character_refresh',true,'run','test');
 `);
 await db.exec(fs.readFileSync('supabase/migrations/20260908095125_character_refresh_dispatch_completion_guards.sql','utf8'));
 const finish=async s=>(await db.query("select kinojo_automation_finish_v377('character_refresh',null,$1,'test','test') as v",[s])).rows[0].v;
 assert.equal((await finish('failed')).code,'AUTOMATION_SESSION_NOT_TERMINAL');
 assert.equal((await db.query('select running from kinojo_server_automation_settings')).rows[0].running,true);
 await db.exec("update updater_sessions set status='completed'; update lookup_batches set status='completed'");
 await db.exec(`create function kinojo_validate_updater_session(text,text) returns jsonb language sql as $$select jsonb_build_object('ok',$2='synthetic')$$;`);
 const late=(await db.query("select kinojo_server_queue_handoff_update_v276('test','synthetic','old','attention') v")).rows[0].v;
 assert.equal(late.ignored,true);assert.equal(late.status,'completed');
 assert.equal((await db.query("select kinojo_server_queue_handoff_update_v276('test','wrong','old','attention') v")).rows[0].v.ok,false);
 assert.equal((await finish('failed')).status,'completed'); // lost ACK must never invert success
 assert.equal((await finish('failed')).ignored,true);
 assert.equal((await db.query("select has_function_privilege('anon','kinojo_automation_finish_v377(text,text,text,text,text)','execute') as v")).rows[0].v,false);
 const id='00000000-0000-0000-0000-000000000001';
 await db.query("insert into character_detail_refresh_jobs(id,status,updated_at) values($1,'queued','2026-01-01')",[id]);
 const fail=async()=> (await db.query("select kinojo_character_detail_dispatch_failed_v1($1,'2026-01-01') as v",[id])).rows[0].v;
 await db.exec("update character_detail_refresh_jobs set status='running',worker_id='receiver'");
 assert.equal((await fail()).recorded,false);
 await db.exec("update character_detail_refresh_jobs set status='queued',worker_id=null,updated_at='2026-01-02'");
 assert.equal((await fail()).recorded,false);
 await db.exec("update character_detail_refresh_jobs set updated_at='2026-01-01'");
 assert.equal((await fail()).recorded,true);
 assert.equal((await fail()).recorded,false);
 await db.exec(fs.readFileSync('supabase/rollbacks/20260908095125_character_refresh_dispatch_completion_guards.sql','utf8'));
 } finally {await db.close();}
 const src=fs.readFileSync('supabase/functions/character-refresh-worker/index.ts','utf8');
 let calls=0;
 const ctx=vm.createContext({rpc:async()=>{if(++calls<3)throw Error('lost');return {ok:true}},clean:v=>v,sleep:async()=>{},console});
 vm.runInContext(src.slice(src.indexOf('async function finishScheduledAutomation'),src.indexOf('function internalRequest')),ctx);
 assert.equal((await ctx.finishScheduledAutomation('test','completed','')).ok,true);assert.equal(calls,3);
 let abort;
 const detail=fs.readFileSync('supabase/functions/character-detail-refresh/index.ts','utf8');
 const timeout=vm.createContext({AbortController,DetailError:Error,setTimeout:fn=>(abort=fn,1),clearTimeout(){},fetch:async(_u,o)=>({ok:true,status:200,text:()=>new Promise((_r,reject)=>{o.signal.addEventListener('abort',()=>reject(Error('abort')));abort()})})});
 vm.runInContext(stripTypeScriptTypes(detail.slice(detail.indexOf('async function boundedDetailFetch'),detail.indexOf('async function dbRows'))),timeout);
 await assert.rejects(timeout.boundedDetailFetch('https://synthetic.invalid',{}),/Server/);
 console.log('PASS: active session preserved, canonical terminal result, stale callback, detail dispatch CAS, callback retries, body timeout');
})().catch(e=>{console.error(e);process.exitCode=1});
