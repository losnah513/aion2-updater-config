// Actual SQL497 migration/legacy conversion/expiry/recovery regression; offline only.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '../.codex-test-runtime/node_modules/@electric-sql/pglite');
const read = p => fs.readFileSync(p, 'utf8');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema private;
      create table character_history(id bigint primary key,character_master_id bigint,
        history_date int,character_name text,record_type text,status text,gear_type text,
        pve_combat_power int,pve_item_level int,pvp_combat_power int,pvp_item_level int,
        server_id int,created_at timestamptz);
      create function kinojo_character_identity_key_v298(text) returns text
        language sql immutable as $$select lower($1)$$;`);
    await db.exec(read('tests/evidence/20260908-character-refresh-audit/rollup-existing-fixture.sql'));
    await db.exec('create trigger trg_character_history_growth_rollup_insert_v424 after insert on character_history for each row execute function private.kinojo_growth_rollup_history_insert_v424()');
    await db.exec(read('supabase/migrations/20260908090023_character_rollup_identity_writer.sql'));
    await db.exec(read('supabase/migrations/20260908091051_character_rollup_write_guard.sql'));
    const windowSource = read('tests/evidence/20260908-character-refresh-audit/weekly-existing-functions.sql');
    await db.exec(windowSource.slice(0, windowSource.indexOf('$function$;') + '$function$;'.length));
    const draft = read('supabase/migrations/20260923034002_character_growth_week_wednesday_06.sql');

    const insert = (id, at, power, master=1, gear='PVE', status='OK') => db.query(`
      insert into character_history values($1,$2,
        to_char($3::timestamptz at time zone 'Asia/Seoul','YYMMDD')::int,
        'synthetic','POWER',$4,$5,
        case when $5='PVE' then $6::int end,case when $5='PVE' then 10 end,
        case when $5='PVP' then $6::int end,case when $5='PVP' then 20 end,
        2002,$3::timestamptz,false) on conflict(id) do nothing`,
      [id,master,at,status,gear,power]);
    const row = async (g, d, master=1, gear='PVE') => (await db.query(`
      select opening_power,closing_power,source_count,opening_boundary_hit,closing_boundary_hit,
        opening_source_id,closing_source_id from private.character_growth_rollups
      where granularity=$1 and period_start=$2::date and character_master_id=$3 and gear_type=$4 and week_start_hour=case when $1='WEEK' then 6 else 0 end`,
      [g,d,master,gear])).rows[0];

    await db.exec(`create schema cron; create table cron.job(jobid bigint,jobname text,schedule text);
      insert into cron.job values(19,'kinojo-character-growth-rollup-cleanup-v425','20 20 * * 2');
      create function cron.alter_job(job_id bigint,schedule text) returns void language sql as
      $$update cron.job set schedule=$2 where jobid=$1$$;`);
    await insert(500,'2026-09-23T04:00:00+09:00',5,50);
    await insert(501,'2026-09-23T06:00:00+09:00',6,50);
    await insert(502,'2020-01-01T06:00:00+09:00',7,60);
    const legacy=(await db.query('select to_jsonb(r)::text j from private.character_growth_rollups r order by character_master_id,granularity')).rows;
    await db.exec(draft);
    const legacyAfter=(await db.query("select (to_jsonb(r)-'week_start_hour')::text j from private.character_growth_rollups r where week_start_hour=0 order by character_master_id,granularity")).rows;
    assert.deepEqual(legacyAfter,legacy);
    assert.equal((await row('WEEK','2026-09-16',50)).closing_power,5);
    assert.equal((await row('WEEK','2026-09-23',50)).opening_power,6);
    assert.equal((await db.query('select schedule from cron.job')).rows[0].schedule,'20 21 * * 2');
    // Real SQL common window: microsecond boundary, UTC equivalence, timezone independence.
    const cases = [
      ['2026-09-23T00:00:00+09:00','2026-09-16'],
      ['2026-09-23T05:59:59.999999+09:00','2026-09-16'],
      ['2026-09-23T06:00:00+09:00','2026-09-23'],
      ['2026-09-22T21:00:00Z','2026-09-23'],
      ['2026-09-30T05:59:59.999999+09:00','2026-09-23'],
      ['2026-09-30T06:00:00+09:00','2026-09-30'],
      ['2027-01-01T00:00:00+09:00','2026-12-30']
    ];
    for (const tz of ['UTC','Asia/Seoul','America/Los_Angeles']) {
      await db.exec("set time zone '"+tz+"'");
      for (const [at, expected] of cases) {
        const actual=(await db.query("select (start_at at time zone 'Asia/Seoul')::date::text d from kinojo_aion_week_window($1)",[at])).rows[0].d;
        assert.equal(actual, expected);
      }
    }
    await insert(1,'2026-09-23T05:59:59.999999+09:00',100);
    await insert(2,'2026-09-23T06:00:00+09:00',90);
    await insert(3,'2026-09-23T12:00:00+09:00',300);
    await insert(4,'2026-09-23T23:00:00+09:00',80);
    assert.equal((await row('DAY','2026-09-23')).closing_power,80);
    assert.equal((await row('DAY','2026-09-23')).opening_power,null);
    assert.equal((await row('DAY','2026-09-23')).source_count,4);
    assert.equal((await row('WEEK','2026-09-16')).closing_power,100);
    assert.equal((await row('WEEK','2026-09-16')).closing_boundary_hit,true);
    assert.equal((await row('WEEK','2026-09-23')).opening_power,90);
    assert.equal((await row('WEEK','2026-09-23')).closing_power,80);
    await insert(5,'2026-09-30T05:59:59.999999+09:00',70);
    await insert(6,'2026-09-30T06:00:00+09:00',60);
    assert.equal((await row('WEEK','2026-09-23')).closing_power,70);
    assert.equal((await row('WEEK','2026-09-23')).closing_boundary_hit,true);
    assert.equal((await row('WEEK','2026-09-30')).opening_power,60);
    // Late delivery within a day updates chronological opening, never closing by arrival order.
    await insert(7,'2026-09-23T08:00:00+09:00',999);
    assert.equal((await row('DAY','2026-09-23')).closing_power,80);
    assert.equal((await row('WEEK','2026-09-23')).opening_power,90);
    const before=await row('WEEK','2026-09-23');
    await insert(7,'2026-09-23T08:00:00+09:00',999);
    await db.exec('update character_history set character_master_id=character_master_id where id=7');
    await insert(8,'2026-09-24T08:00:00+09:00',9999,1,'PVE','FAILED');
    await insert(9,'2026-09-24T08:00:00+09:00',9999,null);
    assert.deepEqual(await row('WEEK','2026-09-23'),before);
    await insert(10,'2026-09-24T08:00:00+09:00',40,1,'PVP');
    await insert(11,'2026-09-24T08:00:00+09:00',50,2);
    assert.equal((await row('WEEK','2026-09-23',1,'PVP')).closing_power,40);
    assert.equal((await row('WEEK','2026-09-23',2)).closing_power,50);
    await insert(12,'2026-09-01T00:00:00+09:00',20);
    await insert(13,'2026-09-30T23:59:59+09:00',30);
    await insert(14,'2026-10-01T00:00:00+09:00',25);
    assert.equal((await row('MONTH','2026-09-01')).opening_power,20);
    assert.equal((await row('MONTH','2026-09-01')).closing_power,30);
    assert.equal((await row('MONTH','2026-10-01')).opening_power,25);
    // Transaction failure must not leave any summary or receipt behind.
    await db.exec(`create function reject_test() returns trigger language plpgsql as
      $$begin if new.id=99 then raise exception 'FORCED_FAILURE'; end if; return new;end$$;
      create trigger zz_reject after insert on character_history for each row execute function reject_test();`);
    await assert.rejects(insert(99,'2026-09-25T12:00:00+09:00',500,99),/FORCED_FAILURE/);
    assert.equal((await db.query('select count(*)::int n from private.character_growth_rollups where character_master_id=99')).rows[0].n,0);
    // Expiry must remove one keyed legacy/new week, not both via the pre-migration key.
    await db.exec("delete from private.character_growth_rollups where granularity='DAY' and period_start<'2021-01-01'");
    const expiredBefore=(await db.query("select count(*)::int n from private.character_growth_rollups where granularity='WEEK' and character_master_id=60")).rows[0].n;
    assert.equal(expiredBefore,2);
    const cleanup=(await db.query("select kinojo_character_growth_rollup_cleanup_v425(false,1) result")).rows[0].result;
    assert.equal(cleanup.deleted.WEEK,1);
    assert.equal((await db.query("select count(*)::int n from private.character_growth_rollups where granularity='WEEK' and character_master_id=60")).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int n from private.character_growth_rollups where granularity='MONTH' and character_master_id=60")).rows[0].n,1);
    const beforeFreeze=(await db.query("select to_jsonb(r)::text j from private.character_growth_rollups r order by granularity,period_start,character_master_id,gear_type,week_start_hour")).rows;
    await db.exec(read('supabase/rollbacks/20260923034002_character_growth_week_wednesday_06.sql'));
    assert.deepEqual((await db.query("select to_jsonb(r)::text j from private.character_growth_rollups r order by granularity,period_start,character_master_id,gear_type,week_start_hour")).rows,beforeFreeze);
    await insert(700,'2026-09-25T06:00:00+09:00',123,70);
    assert.equal((await db.query("select count(*)::int n from private.character_growth_rollups where character_master_id=70 and granularity='WEEK'")).rows[0].n,0);
    assert.equal((await db.query("select count(*)::int n from private.character_growth_rollups where character_master_id=70 and granularity in ('DAY','MONTH')")).rows[0].n,2);
    console.log('PASS: actual SQL497; legacy numeric archive unchanged; verified source rebucketing; 21 timezone/boundary cases; day/month unchanged; duplicate/failure/late input; exact expiry batch key; one cron rescheduled; recovery freeze preserves data.');
  } finally { await db.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
