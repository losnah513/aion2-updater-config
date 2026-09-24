const fs = require('fs');
const assert = require('node:assert/strict');
const {PGlite} = require(process.env.PGLITE_MODULE || '../.codex-test-runtime/node_modules/@electric-sql/pglite');
const migration = 'supabase/migrations/20260924081319_completed_runtime_detail_retention.sql';
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema private; create schema cron;
      create role anon; create role authenticated; create role service_role;
      create function cron.schedule(text,text,text) returns integer language sql as 'select 1';
      create function cron.unschedule(text) returns boolean language sql as 'select true';
      create table public.updater_sessions(session_id text primary key,status text,finished_at timestamptz);
      create table public.updater_runtime_jobs(session_id text,status text);
      create table public.lookup_batches(session_id text,status text);
      create table public.updater_runtime_events(id bigint primary key,session_id text,event_type text,stage text,
        character_name text,progress_current integer,progress_total integer,message text,created_at timestamptz);
      create table public.lookup_session_targets(id bigint primary key,session_id text,target_status text,lookup_order integer);
      create table public.lookup_session_steps(id bigint primary key,session_id text);
      create table public.google_list_sheet_sync_queue(id bigint primary key,session_id text,sync_status text);
      create table public.updater_session_progress_current(session_id text primary key,target_refreshes integer default 0,step_refreshes integer default 0);
      create function public.kinojo_get_updater_actor(text) returns table(member_id bigint,level integer)
        language sql as 'select 1::bigint,4';
      create index idx_lookup_session_targets_status on public.lookup_session_targets(session_id,target_status,lookup_order);
      create index idx_lookup_targets_session_status_order on public.lookup_session_targets(session_id,target_status,lookup_order,id);
      create function private.kinojo_queue_summary_refresh_targets_v422(p_session_id text)
        returns void language sql as 'update public.updater_session_progress_current set target_refreshes=target_refreshes+1 where session_id=p_session_id';
      create function private.kinojo_queue_summary_refresh_progress_v422(p_session_id text)
        returns void language sql as 'update public.updater_session_progress_current set step_refreshes=step_refreshes+1 where session_id=p_session_id';
    `);
    await db.exec(fs.readFileSync(migration,'utf8'));
    await db.exec(`
      create trigger trg_lookup_targets_progress_delete_v422 after delete on public.lookup_session_targets
        referencing old table as old_rows for each statement execute function private.kinojo_queue_summary_target_statement_v422();
      create trigger trg_lookup_steps_progress_delete_v422 after delete on public.lookup_session_steps
        referencing old table as old_rows for each statement execute function private.kinojo_queue_summary_step_statement_v422();
      insert into public.updater_sessions values
        ('old','completed',now()-interval '40 days'),
        ('recent','completed',now()-interval '10 days'),
        ('active','running',now()-interval '40 days'),
        ('job-open','completed',now()-interval '40 days');
      insert into public.updater_runtime_jobs values('job-open','running');
      insert into public.updater_session_progress_current(session_id) values('old'),('recent'),('active'),('job-open');
      insert into public.updater_runtime_events values(1,'old'),(2,'recent'),(3,'active'),(4,'job-open');
      insert into public.lookup_session_targets values(1,'old','lookup_done',1),(2,'recent','lookup_done',1),
        (3,'active','lookup_done',1),(4,'job-open','lookup_done',1);
      insert into public.lookup_session_steps values(1,'old'),(2,'recent'),(3,'active'),(4,'job-open');
      insert into public.google_list_sheet_sync_queue values
        (1,'old','synced'),(2,'old','failed'),(3,'recent','synced'),(4,'active','synced'),(5,'job-open','synced');
    `);
    const call = (dry,cutoff=null) => db.query(
      'select private.kinojo_completed_runtime_cleanup_v511($1,5,$2) result',[dry,cutoff]);
    assert.equal((await call(true)).rows[0].result.sessions,1);
    assert.equal((await db.query('select count(*)::int n from public.updater_runtime_events')).rows[0].n,4);
    await assert.rejects(call(false,new Date()),/RETENTION_CUTOFF_MUST_BE_AT_LEAST_30_DAYS/);
    const result=(await call(false)).rows[0].result;
    assert.deepEqual([result.sessions,result.events,result.targets,result.steps,result.queue],[1,1,1,1,1]);
    for(const table of ['updater_runtime_events','lookup_session_targets','lookup_session_steps'])
      assert.deepEqual((await db.query('select session_id from public.'+table+' order by id')).rows.map(r=>r.session_id),
        ['recent','active','job-open']);
    assert.deepEqual((await db.query('select sync_status from public.google_list_sheet_sync_queue where session_id=$1',['old'])).rows.map(r=>r.sync_status),['failed']);
    assert.deepEqual((await db.query('select target_refreshes,step_refreshes from public.updater_session_progress_current where session_id=$1',['old'])).rows[0],
      {target_refreshes:0,step_refreshes:0});
    const archivedDetail=(await db.query("select public.kinojo_admin_server_queue_detail_v422('probe','old','events') detail")).rows[0].detail;
    assert.equal(archivedDetail.detailExpired,true);
    assert.equal(archivedDetail.detailRetentionDays,30);
    assert.deepEqual(archivedDetail.items,[]);
    const archivedPerformance=(await db.query("select public.kinojo_admin_server_queue_detail_v422('probe','old','performance') detail")).rows[0].detail;
    assert.equal(archivedPerformance.performanceProfile.detailExpired,true);
    assert.equal((await call(false)).rows[0].result.sessions,0);
    await db.exec("delete from public.lookup_session_targets where session_id='recent'; delete from public.lookup_session_steps where session_id='recent'");
    assert.deepEqual((await db.query('select target_refreshes,step_refreshes from public.updater_session_progress_current where session_id=$1',['recent'])).rows[0],
      {target_refreshes:1,step_refreshes:1});
    assert.equal((await db.query("select to_regclass('public.idx_lookup_session_targets_status') is null removed")).rows[0].removed,true);
    for(const role of ['anon','authenticated','service_role'])
      assert.equal((await db.query("select has_function_privilege($1,'private.kinojo_completed_runtime_cleanup_v511(boolean,integer,timestamptz)','execute') v",[role])).rows[0].v,false);
    await db.exec(fs.readFileSync(migration.replace('/migrations/','/rollbacks/'),'utf8'));
    assert.equal((await db.query("select to_regclass('public.idx_lookup_session_targets_status') is not null restored")).rows[0].restored,true);
    console.log('completed runtime detail retention: PASS');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
