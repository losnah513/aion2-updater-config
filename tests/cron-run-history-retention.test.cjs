const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '../.codex-test-runtime/node_modules/@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema private; create schema cron;
      create role anon; create role authenticated; create role service_role;
      create table cron.job_run_details(runid bigint primary key, end_time timestamptz);
      create table cron.jobs(name text primary key,schedule text,command text);
      create function cron.schedule(text,text,text) returns integer language plpgsql as $$
      begin insert into cron.jobs values($1,$2,$3);return 1;end$$;
      create function cron.unschedule(text) returns boolean language plpgsql as $$
      begin delete from cron.jobs where name=$1;return found;end$$;
      insert into cron.job_run_details values
        (1,now()-interval '9 days'),(2,now()-interval '8 days'),
        (3,now()-interval '2 days'),(4,null);
    `);
    await db.exec(fs.readFileSync('supabase/migrations/20260926103900_cron_run_history_retention.sql','utf8'));
    const call = async (dry,limit) => (await db.query(
      'select private.kinojo_cron_run_history_cleanup_v520($1,$2) result',[dry,limit]
    )).rows[0].result;
    assert.equal((await call(true,1)).candidates,1);
    assert.equal((await db.query('select count(*)::int n from cron.job_run_details')).rows[0].n,4);
    assert.equal((await call(false,1)).deleted,1);
    assert.equal((await call(false,2000)).deleted,1);
    assert.equal((await call(false,2000)).deleted,0);
    assert.deepEqual((await db.query('select runid from cron.job_run_details order by runid')).rows.map(x=>Number(x.runid)),[3,4]);
    const job=(await db.query('select schedule,command from cron.jobs')).rows[0];
    assert.equal(job.schedule,'58 20 * * *');
    assert.ok(job.command.includes('kinojo_cron_run_history_cleanup_v520'));
    await db.exec(fs.readFileSync('supabase/rollbacks/20260926103900_cron_run_history_retention.sql','utf8'));
    assert.equal((await db.query('select count(*)::int n from cron.jobs')).rows[0].n,0);
    console.log('cron run history retention: PASS');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
