// SQL524: real trigger/migration/rollback; synthetic offline data only.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '../.codex-test-runtime/node_modules/@electric-sql/pglite');
const read = p => fs.readFileSync(p, 'utf8');
const migration = '20261007004138_twice_daily_day_week_retention.sql';
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema private;
      create table character_history(id bigint primary key,character_master_id bigint,
        history_date int,character_name text,record_type text,status text,gear_type text,
        pve_combat_power int,pve_item_level int,pvp_combat_power int,pvp_item_level int,
        server_id int,created_at timestamptz);
      create function kinojo_character_identity_key_v298(text) returns text
        language sql immutable as $$select lower($1)$$;
      create schema cron;
      create table cron.job(jobid bigint,jobname text,schedule text,active boolean,command text);
      insert into cron.job values
        (19,'kinojo-character-growth-rollup-cleanup-v425','20 20 * * 2',true,'synthetic cleanup'),
        (11,'kinojo-character-refresh-6h-v377','0 1,7,13,19 * * *',false,'synthetic dispatch');
      create function cron.alter_job(job_id bigint,schedule text) returns void language sql as
        $$update cron.job set schedule=$2 where jobid=$1$$;
      create table kinojo_server_automation_settings(automation_key text primary key,
        schedule_kst jsonb,enabled boolean,running boolean,pre_block_minutes int);
      insert into kinojo_server_automation_settings values
        ('character_refresh','["22:00","04:00","10:00","16:00"]',false,false,30),
        ('sanctuary_sync','["02:00","14:00"]',true,false,10);`);
    await db.exec(read('tests/evidence/20260908-character-refresh-audit/rollup-existing-fixture.sql'));
    await db.exec('create trigger trg_character_history_growth_rollup_insert_v424 after insert on character_history for each row execute function private.kinojo_growth_rollup_history_insert_v424()');
    await db.exec(read('supabase/migrations/20260908090023_character_rollup_identity_writer.sql'));
    await db.exec(read('supabase/migrations/20260908091051_character_rollup_write_guard.sql'));
    const windowSource = read('tests/evidence/20260908-character-refresh-audit/weekly-existing-functions.sql');
    await db.exec(windowSource.slice(0, windowSource.indexOf('$function$;') + '$function$;'.length));
    await db.exec(read('supabase/migrations/20260923034002_character_growth_week_wednesday_06.sql'));
    const insert = (id,at,power,status='OK') => db.query(`insert into character_history
      values($1,1,to_char($2::timestamptz at time zone 'Asia/Seoul','YYMMDD')::int,
      'synthetic','POWER',$4,'PVE',$3,10,null,null,2002,$2,false) on conflict(id) do nothing`,[id,at,power,status]);
    const all = async (where='true') => (await db.query(`select to_jsonb(r) j from private.character_growth_rollups r where ${where} order by granularity,period_start,character_master_id,gear_type,week_start_hour`)).rows;
    const months = async () => (await all("granularity='MONTH'")).length;
    await insert(1,'2026-10-07T05:59:59+09:00',100);
    await insert(2,'2026-10-07T06:00:00+09:00',110);
    const protectedRows = await all("granularity in ('DAY','WEEK')");
    assert.ok(await months());
    const cronBefore = (await db.query('select * from cron.job order by jobid')).rows;
    const settingsBefore = (await db.query('select * from kinojo_server_automation_settings order by automation_key')).rows;
    // Guard failure rolls back every change, including data deletion.
    await db.exec("update cron.job set jobname='missing' where jobid=11");
    await assert.rejects(db.exec(read('supabase/migrations/'+migration)), /SQL524_EXPECTED_AUTOMATION_MISSING/);
    await db.exec('rollback');
    assert.ok(await months());
    await db.exec("update cron.job set jobname='kinojo-character-refresh-6h-v377' where jobid=11");
    await db.exec(read('supabase/migrations/'+migration));
    assert.equal(await months(),0);
    assert.deepEqual(await all(),protectedRows);
    const cronAfter=(await db.query('select * from cron.job order by jobid')).rows;
    assert.deepEqual(cronAfter,cronBefore.map(r=>({...r,schedule:r.jobid===11?'0 1,13 * * *':r.schedule})));
    const settingsAfter=(await db.query('select * from kinojo_server_automation_settings order by automation_key')).rows;
    assert.deepEqual(settingsAfter,settingsBefore.map(r=>({...r,schedule_kst:r.automation_key==='character_refresh'?['10:00','22:00']:r.schedule_kst})));
    await assert.rejects(db.exec("update private.character_growth_rollups set granularity='MONTH' where granularity='DAY'"), /character_growth_rollups_day_week_v524/);
    await insert(3,'2026-10-07T22:00:00+09:00',140);
    await insert(4,'2026-10-07T10:00:00+09:00',120); // late arrival
    await insert(5,'2026-10-14T06:00:00+09:00',150);
    let rows=await all();
    const current=rows.find(r=>r.j.granularity==='WEEK' && r.j.period_start==='2026-10-07').j;
    assert.equal(current.opening_power,110);
    assert.equal(current.closing_power,140);
    assert.equal(current.source_count,3);
    assert.equal(current.week_start_hour,6);
    await insert(4,'2026-10-07T10:00:00+09:00',999);
    await insert(6,'2026-10-07T23:00:00+09:00',999,'FAILED');
    assert.deepEqual(await all(),rows);
    assert.equal(await months(),0);
    const policy=(await db.query('select kinojo_character_growth_rollup_cleanup_v425(true,1) result')).rows[0].result;
    assert.equal(policy.policies.DAY.retentionCompletedDays,7);
    assert.equal(policy.policies.WEEK.retention,'1_YEAR');
    assert.equal(policy.policies.MONTH.retention,'NOT_STORED');
    await db.exec(read('supabase/rollbacks/'+migration));
    assert.deepEqual(await all(),rows); // rollback does not invent deleted monthly data
    assert.deepEqual((await db.query('select * from cron.job order by jobid')).rows,cronBefore);
    assert.deepEqual((await db.query('select * from kinojo_server_automation_settings order by automation_key')).rows,settingsBefore);
    await insert(7,'2026-11-01T10:00:00+09:00',160);
    assert.equal(await months(),1);
    console.log('PASS SQL524: atomic guard; DAY/WEEK unchanged; MONTH deletion and write guard; actual collection/late/duplicate/failed records; Wednesday 06h boundary; only target schedule changed; disabled flags preserved; rollback future generation.');
  } finally { await db.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
