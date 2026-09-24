const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '../.codex-test-runtime/node_modules/@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema private;
      create role anon; create role authenticated; create role service_role;
      create function public.kinojo_normalize_character_name(text) returns text
        language sql immutable as 'select lower($1)';
      create table private.kinojo_snapshot_retention_control_v512(
        singleton boolean primary key,enabled boolean,backup_waived_at timestamptz);
      insert into private.kinojo_snapshot_retention_control_v512 values(true,false,now());
      create table public.extension_character_payloads(
        id bigint primary key,session_id text,server_id integer,character_name text,
        received_at timestamptz,master_sync_status text,growth_review_status text,
        source_snapshot_id bigint,lookup_order integer);
      create table public.updater_sessions(session_id text primary key,status text,finished_at timestamptz);
      create table public.character_master(latest_payload_id bigint,latest_pve_payload_id bigint,
        latest_pvp_payload_id bigint,legion_source_snapshot_id bigint,latest_snapshot_uid text);
      create table public.character_stat_sources(payload_id bigint,snapshot_id bigint);
      create table public.ranking_entries(latest_payload_id bigint);
      create table public.lookup_session_targets(payload_id bigint,session_id text,
        lookup_order integer,target_status text);
      create table public.character_history(source_payload_id bigint);
      create table public.character_skill_current_state(snapshot_id bigint);
      create table private.character_snapshot_requests(snapshot_id bigint);
      create table public.lookup_snapshots(id bigint,snapshot_uid text);
      create table public.updater_runtime_jobs(session_id text,status text);
      create table public.lookup_batches(session_id text,status text);
      create table public.google_list_sheet_sync_queue(session_id text,sync_status text);
      insert into public.extension_character_payloads
        (id,session_id,server_id,character_name,received_at,master_sync_status,
         growth_review_status,source_snapshot_id,lookup_order)
      select id,id::text,2002,chr(65+((id-1)/2)::int),
        case when id%2=1 then now()-interval '40 days' else now() end,
        'synced',case when id=11 then null else 'reviewed' end,
        case when id=15 then 150 else null end,1
      from generate_series(1,20) id;
      insert into public.updater_sessions
      select id::text,'completed',case when id=19 then now()-interval '1 day'
        when id%2=1 then now()-interval '31 days' else now() end
      from generate_series(1,20) id;
      insert into public.character_master(latest_payload_id) values(3);
      insert into public.character_history values(5);
      insert into public.lookup_session_targets values(7,'7',1,'lookup_done');
      insert into public.google_list_sheet_sync_queue values('9','failed');
      insert into public.character_skill_current_state values(150);
      insert into public.updater_runtime_jobs values('17','running');
    `);
    await db.exec(fs.readFileSync('supabase/migrations/20260924113000_payload_seven_day_cleanup.sql','utf8'));
    const run = dry => db.query('select private.kinojo_payload_seven_day_cleanup_v515($1,50) result',[dry]);
    assert.equal((await run(false)).rows[0].result.code,'RETENTION_NOT_ENABLED');
    assert.equal((await run(true)).rows[0].result.candidates,2);
    await db.exec('update private.kinojo_snapshot_retention_control_v512 set enabled=true');
    const result=(await run(false)).rows[0].result;
    assert.equal(result.deleted,2);
    const remaining=(await db.query('select id from public.extension_character_payloads order by id')).rows.map(r=>Number(r.id));
    assert.deepEqual(remaining,[2,3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19,20]);
    assert.equal((await run(true)).rows[0].result.candidates,0);
    await db.exec(fs.readFileSync('supabase/rollbacks/20260924113000_payload_seven_day_cleanup.sql','utf8'));
    assert.equal((await db.query('select enabled from private.kinojo_snapshot_retention_control_v512')).rows[0].enabled,false);
    console.log('seven-day payload cleanup: PASS');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
