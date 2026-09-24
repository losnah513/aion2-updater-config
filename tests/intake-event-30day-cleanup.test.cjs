const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '../.codex-test-runtime/node_modules/@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema private;
      create role anon; create role authenticated; create role service_role;
      create table private.kinojo_snapshot_retention_control_v512(
        singleton boolean primary key,enabled boolean,backup_waived_at timestamptz);
      insert into private.kinojo_snapshot_retention_control_v512 values(true,false,now());
      create table public.snapshot_intake_events(id bigint primary key,session_id text,created_at timestamptz);
      create table public.updater_sessions(session_id text primary key,status text,finished_at timestamptz);
      create table public.updater_runtime_jobs(session_id text,status text);
      create table public.lookup_batches(session_id text,status text);
      create table public.google_list_sheet_sync_queue(session_id text,sync_status text);
      insert into public.snapshot_intake_events values
        (1,'old',now()-interval '40 days'),
        (2,'recent-session',now()-interval '40 days'),
        (3,'recent-event',now()-interval '1 day'),
        (4,'active-job',now()-interval '40 days'),
        (5,'failed-sheet',now()-interval '40 days'),
        (6,'active-batch',now()-interval '40 days'),
        (7,'missing-session',now()-interval '40 days'),
        (8,'old',now()-interval '40 days');
      insert into public.updater_sessions values
        ('old','completed',now()-interval '31 days'),
        ('recent-session','completed',now()-interval '1 day'),
        ('recent-event','completed',now()-interval '31 days'),
        ('active-job','completed',now()-interval '31 days'),
        ('failed-sheet','failed',now()-interval '31 days'),
        ('active-batch','completed',now()-interval '31 days');
      insert into public.updater_runtime_jobs values('active-job','running');
      insert into public.lookup_batches values('active-batch','running');
      insert into public.google_list_sheet_sync_queue values('failed-sheet','failed');
    `);
    await db.exec(fs.readFileSync('supabase/migrations/20260924115000_intake_event_30day_cleanup.sql','utf8'));
    const run = dry => db.query('select private.kinojo_intake_event_cleanup_v516($1,50) result',[dry]);
    assert.equal((await run(false)).rows[0].result.code,'RETENTION_NOT_ENABLED');
    assert.equal((await run(true)).rows[0].result.candidates,2);
    await db.exec('update private.kinojo_snapshot_retention_control_v512 set enabled=true');
    assert.equal((await run(false)).rows[0].result.deleted,2);
    assert.deepEqual((await db.query('select id from public.snapshot_intake_events order by id')).rows.map(r=>Number(r.id)),[2,3,4,5,6,7]);
    assert.equal((await run(true)).rows[0].result.candidates,0);
    await db.exec(fs.readFileSync('supabase/rollbacks/20260924115000_intake_event_30day_cleanup.sql','utf8'));
    assert.equal((await db.query('select enabled from private.kinojo_snapshot_retention_control_v512')).rows[0].enabled,false);
    console.log('30-day intake event cleanup: PASS');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
