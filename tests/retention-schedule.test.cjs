const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '../.codex-test-runtime/node_modules/@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema private; create schema cron;
      create table private.kinojo_snapshot_retention_control_v512(
        singleton boolean primary key,enabled boolean,backup_waived_at timestamptz);
      insert into private.kinojo_snapshot_retention_control_v512 values(true,false,null);
      create table cron.jobs(name text primary key,schedule text,command text);
      create function cron.schedule(text,text,text) returns integer language plpgsql as $$
      begin insert into cron.jobs values($1,$2,$3);return 1;end$$;
      create function cron.unschedule(text) returns boolean language plpgsql as $$
      begin delete from cron.jobs where name=$1;return found;end$$;
    `);
    const migration=fs.readFileSync('supabase/migrations/20260924121000_retention_schedule.sql','utf8');
    await assert.rejects(db.exec(migration),/BACKUP_WAIVER_NOT_RECORDED/);
    await db.exec('rollback');
    await db.exec(`update private.kinojo_snapshot_retention_control_v512
      set backup_waived_at=now() where singleton`);
    await db.exec(migration);
    assert.equal((await db.query('select enabled from private.kinojo_snapshot_retention_control_v512')).rows[0].enabled,true);
    const jobs=(await db.query('select name,schedule,command from cron.jobs order by name')).rows;
    assert.equal(jobs.length,3);
    assert.ok(jobs.some(j=>j.command.includes('kinojo_snapshot_raw_cleanup_v514')));
    assert.ok(jobs.some(j=>j.command.includes('kinojo_payload_seven_day_cleanup_v515')));
    assert.ok(jobs.some(j=>j.command.includes('kinojo_intake_event_cleanup_v516')));
    await db.exec(fs.readFileSync('supabase/rollbacks/20260924121000_retention_schedule.sql','utf8'));
    assert.equal((await db.query('select enabled from private.kinojo_snapshot_retention_control_v512')).rows[0].enabled,false);
    assert.equal((await db.query('select count(*)::int n from cron.jobs')).rows[0].n,0);
    console.log('retention schedule: PASS');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
