const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '../.codex-test-runtime/node_modules/@electric-sql/pglite');

const migration = fs.readFileSync('supabase/migrations/20260928050552_progress_storage_reuse.sql','utf8');
const rollback = fs.readFileSync('supabase/rollbacks/20260928050552_progress_storage_reuse.sql','utf8');
async function setup(db) {
  await db.exec(`create schema private; create role anon; create role authenticated; create role service_role;
    create table public.lookup_snapshots(id int,raw_payload jsonb);
    create table public.extension_character_payloads(id int,raw_payload jsonb);
    create table public.lookup_session_steps(id bigint,session_id text,step_key text,status text,
      progress_current int,progress_total int,message text,detail jsonb,
      started_at timestamptz,finished_at timestamptz,updated_at timestamptz);
    create function private.kinojo_queue_summary_refresh_core_v422(text) returns void language plpgsql as $$
    begin raise exception 'unexpected core refresh';end$$;`);
  await db.exec(fs.readFileSync('tests/fixtures/progress-storage-baseline.sql','utf8'));
  await db.exec(`insert into public.updater_session_progress_current
      (session_id,requested_by_member_id,total_count,queued_count,remaining_count,job_payload,session_status)
    values('run',1,100,100,100,'{"avg_ms_per_item":3200}','running');
    insert into public.lookup_session_steps
      (id,session_id,step_key,status,progress_current,progress_total,message,detail,updated_at)
    select n,'run',case n when 1 then 'LIST_MASTER_COMPARE' else 'CHARACTER_LOOKUP' end,
      case n when 1 then 'done' else 'active' end,0,100,'fixture',
      jsonb_build_object('largeEvidence',(select string_agg(md5(i::text),'') from generate_series(1,1500) i),'smallCounter',0),
      '2026-09-01T00:00:00Z'::timestamptz from generate_series(1,2) n;
    select private.kinojo_queue_summary_refresh_progress_v422('run');
    insert into public.updater_session_progress_current(session_id,phases,progress_payload)
    values('legacy','[{"details":null},{"id":"missing"},{"details":{"a":1}}]',
      '{"phases":[{"details":null},{"id":"missing"},{"details":{"a":1}}]}'),
      ('mismatch','[{"details":1}]','{"phases":[{"details":2}]}'),('empty','[]','{}');`);
}
async function response(db,id) {
  return (await db.query('select private.kinojo_admin_server_queue_status_cached_v422(1,5,$1) result',[id])).rows[0].result;
}
function normalized(value) { const copy=structuredClone(value);delete copy.summaryUpdatedAt;return copy; }
async function size(db) { return Number((await db.query("select pg_total_relation_size('public.updater_session_progress_current') n")).rows[0].n); }
async function refresh(db,n) {
  await db.query("update public.updater_session_progress_current set completed_count=$1,success_count=$1,queued_count=100-$1 where session_id='run'",[n]);
  await db.exec("select private.kinojo_queue_summary_refresh_progress_v422('run')");
}
(async()=>{
  const baseline=new PGlite(), packed=new PGlite();
  try {
    await setup(baseline);await setup(packed);
    const before={};for(const id of ['run','legacy','mismatch','empty','absent'])before[id]=await response(packed,id);
    await packed.exec(migration);
    for(const id of Object.keys(before))assert.deepEqual(await response(packed,id),before[id],`migration response: ${id}`);
    assert.equal((await packed.query("select phase_details_v521 is null as legacy from public.updater_session_progress_current where session_id='mismatch'")).rows[0].legacy,true);
    const shapes=[[],[{details:null},{x:1}],[{details:['x'.repeat(4000)]}],[{details:'x'.repeat(4000)}],[{details:{large:'x'.repeat(4000),small:null}}]];
    for(const shape of shapes){
      const restored=(await packed.query('select private.kinojo_queue_phase_restore_v521(private.kinojo_queue_phase_headers_v521($1::jsonb),private.kinojo_queue_phase_details_v521($1::jsonb)) result',[JSON.stringify(shape)])).rows[0].result;
      assert.deepEqual(restored,shape);
    }
    const originalSize=await size(baseline),packedSize=await size(packed);
    for(let n=1;n<=40;n++){
      await refresh(baseline,n);await refresh(packed,n);
      assert.deepEqual(normalized(await response(packed,'run')),normalized(await response(baseline,'run')),`refresh ${n}`);
    }
    const oldGrowth=(await size(baseline))-originalSize,newGrowth=(await size(packed))-packedSize;
    assert.ok(oldGrowth>1000000,`fixture must exercise TOAST rewrites: ${oldGrowth}`);
    assert.ok(newGrowth<oldGrowth*0.25,`storage growth old=${oldGrowth} packed=${newGrowth}`);
    assert.equal((await packed.query("select has_function_privilege('anon','private.kinojo_queue_phase_restore_v521(jsonb,jsonb)','EXECUTE') allowed")).rows[0].allowed,false);
    // A changed large source field must still propagate, rather than reusing stale details.
    for (const db of [baseline,packed]) {
      await db.exec("update public.lookup_session_steps set detail=detail || jsonb_build_object('largeEvidence',repeat('changed',800),'smallCounter',9)");
      await refresh(db,41);
    }
    assert.deepEqual(normalized(await response(packed,'run')),normalized(await response(baseline,'run')));
    const preRollback=await response(packed,'run');
    await packed.exec(rollback);
    assert.deepEqual(await response(packed,'run'),preRollback);
    console.log(JSON.stringify({test:'progress storage reuse: PASS',oldGrowth,newGrowth,reductionPercent:100*(1-newGrowth/oldGrowth)}));
  } finally {await baseline.close();await packed.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
