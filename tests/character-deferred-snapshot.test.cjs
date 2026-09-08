const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PGlite } = require('../.codex-test-runtime/node_modules/@electric-sql/pglite');

(async () => {
 const db = new PGlite();
 await db.exec(`
  create schema private; create schema cron;
  create role anon; create role authenticated; create role service_role;
  create table updater_sessions(session_id text primary key,status text,started_at timestamptz);
  create table lookup_batches(id int,postprocess_snapshot_required boolean);
  create table character_detail_refresh_jobs(status text);
  create table private.kinojo_ranking_snapshots_v390(
   snapshot_id bigint generated always as identity primary key,status text,next_scope smallint default 0,
   source_session_id text,updated_at timestamptz default now(),last_error_code text);
  create table private.test_build_control(fail boolean default false);
  insert into private.test_build_control values(false);
  create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
  create function public.kinojo_expire_updater_lock() returns jsonb language sql as $$select '{"ok":true}'::jsonb$$;
  create table cron.job(jobid bigint,jobname text);
  create function cron.unschedule(bigint) returns boolean language sql as $$select true$$;
  create function private.kinojo_ranking_snapshot_begin_v390(text) returns bigint language sql as $$
   insert into private.kinojo_ranking_snapshots_v390(status,source_session_id) values('BUILDING',$1) returning snapshot_id$$;
  create function private.kinojo_ranking_snapshot_build_step_v390(bigint) returns jsonb language plpgsql as $$
   begin
    if (select fail from private.test_build_control) then return '{"ok":false,"code":"TEST_FAILURE"}'::jsonb;end if;
    update private.kinojo_ranking_snapshots_v390 set next_scope=next_scope+1 where snapshot_id=$1;
    return '{"ok":true}'::jsonb;
   end$$;
  create function private.kinojo_ranking_snapshot_validate_v390(bigint) returns jsonb language sql as $$
   update private.kinojo_ranking_snapshots_v390 set status='READY' where snapshot_id=$1 returning '{"ok":true}'::jsonb$$;
  create function private.kinojo_ranking_snapshot_publish_v390(bigint) returns jsonb language sql as $$
   update private.kinojo_ranking_snapshots_v390 set status='PUBLISHED' where snapshot_id=$1 returning '{"ok":true}'::jsonb$$;
 `);
 await db.exec(fs.readFileSync('supabase/migrations/20260908131706_character_deferred_ranking_snapshot.sql','utf8'));
 const tick = async () => (await db.query('select private.kinojo_deferred_ranking_snapshot_tick() r')).rows[0].r;
 const count = async (table, condition='true') => (await db.query(`select count(*)::int n from ${table} where ${condition}`)).rows[0].n;
 assert.equal((await tick()).state,'IDLE');
 await db.exec("insert into lookup_batches values(1,true); update lookup_batches set postprocess_snapshot_required=true");
 assert.equal((await db.query('select postprocess_snapshot_required r from lookup_batches')).rows[0].r,false);
 await db.exec("insert into updater_sessions values('fresh','completed',now())");
 assert.equal((await tick()).state,'WAIT_30_MINUTES');
 await db.exec("update updater_sessions set status='completed' where session_id='fresh'");
 assert.equal(await count('private.character_snapshot_requests'),1);
 await db.exec("update private.character_snapshot_requests set due_at=now()-interval '1 minute'; insert into updater_sessions values('active','running',now()-interval '1 hour')");
 assert.equal((await tick()).state,'WAIT_REFRESH');
 await db.exec("update updater_sessions set status='completed' where session_id='active'; insert into character_detail_refresh_jobs values('running')");
 assert.equal((await tick()).state,'WAIT_REFRESH');
 await db.exec('delete from character_detail_refresh_jobs');
 for(let i=0;i<4;i++) assert.equal((await tick()).action,'BUILD_RANKING_AND_HOF');
 assert.equal((await tick()).action,'VERIFY');
 assert.equal(await count('private.character_snapshot_requests','completed_at is not null'),0);
 assert.equal((await tick()).action,'PUBLISH');
 assert.equal(await count('private.character_snapshot_requests','completed_at is not null'),2);
 assert.equal((await tick()).state,'IDLE');
 // A new request is not pulled into an older request's already elapsed delay.
 await db.exec("insert into updater_sessions values('old','completed',now()-interval '1 hour'),('new','completed',now())");
 assert.equal((await tick()).state,'WAIT_30_MINUTES');
 await db.exec("update private.character_snapshot_requests set due_at=now()-interval '1 minute' where completed_at is null");
 assert.equal((await tick()).action,'BUILD_RANKING_AND_HOF');
 // A refresh completed between build scopes invalidates only our candidate.
 await db.exec("insert into updater_sessions values('newer','completed',now()-interval '1 hour')");
 assert.equal((await tick()).action,'BUILD_RANKING_AND_HOF');
 assert.equal(await count('private.kinojo_ranking_snapshots_v390',"last_error_code='NEW_REFRESH_GENERATION'"),1);
 // Unsuccessful refreshes do not enqueue publication, but invalidate mixed generations.
 for(const status of ['failed','expired','cancelled']) {
  await db.exec(`insert into updater_sessions values('case-${status}','running',now());`);
  assert.equal((await tick()).state,'WAIT_REFRESH');
  await db.exec(`update updater_sessions set status='${status}' where session_id='case-${status}'`);
  assert.equal((await tick()).action,'BUILD_RANKING_AND_HOF');
 }
 assert.equal(await count('private.character_snapshot_requests','completed_at is null'),3);
 assert.equal(await count('private.kinojo_ranking_snapshots_v390',"last_error_code='NEW_REFRESH_GENERATION'"),4);
 await db.exec("insert into character_detail_refresh_jobs values('processing')");
 assert.equal((await tick()).state,'WAIT_REFRESH');
 await db.exec("update character_detail_refresh_jobs set status='failed'");
 assert.equal((await tick()).action,'BUILD_RANKING_AND_HOF');
 assert.equal(await count('private.kinojo_ranking_snapshots_v390',"last_error_code='NEW_REFRESH_GENERATION'"),5);
 // Failures later in a restarted build must still accumulate to the retry limit.
 for(let i=1;i<=3;i++) {
  await db.exec('update private.test_build_control set fail=true');
  const failed=await tick(); assert.equal(failed.ok,false); assert.equal(failed.attempts,i);
  assert.equal((await tick()).state,i===3?'DISABLED':'RETRY_WAIT');
  if(i<3) {
   await db.exec('update private.character_snapshot_dispatch set retry_at=null; update private.test_build_control set fail=false');
   assert.equal((await tick()).action,'BUILD_RANKING_AND_HOF');
  }
 }
 assert.equal(await count('private.kinojo_ranking_snapshots_v390',"status='PUBLISHED'"),1);
 assert.equal(await count('private.character_snapshot_requests','completed_at is null'),3);
 for(const role of ['anon','authenticated']) {
  const r=(await db.query("select has_function_privilege($1,'private.kinojo_deferred_ranking_snapshot_tick()','execute') allowed",[role])).rows[0];
  assert.equal(r.allowed,false);
 }
 await db.exec(fs.readFileSync('supabase/rollbacks/20260908131706_character_deferred_ranking_snapshot.sql','utf8'));
 assert.equal((await tick()).state,'DISABLED');
 await db.exec('insert into lookup_batches values(2,true)');
 assert.equal((await db.query('select postprocess_snapshot_required r from lookup_batches where id=2')).rows[0].r,true);
 assert.equal(await count('private.character_snapshot_requests'),5);
 assert.equal(await count('private.kinojo_ranking_snapshots_v390',"status='PUBLISHED'"),1);
 await db.close();
 console.log('PASS: deferred queue SQL; 30-minute delay; refresh/detail wait; coalescing; separate build/verify/publish; generation restart; bounded retry; published snapshot preserved; ACL');
})().catch(e=>{console.error(e);process.exitCode=1;});
