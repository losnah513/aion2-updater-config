const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'../.codex-test-runtime/node_modules/@electric-sql/pglite');
const name='20261007033635_retention_diagnostic_candidate_sets.sql';
const read=p=>fs.readFileSync(p,'utf8');
(async()=>{
 const db=new PGlite();
 try{
  await db.exec('begin');
  await db.exec(read('tests/fixtures/retention-diagnostic-candidates-data.sql'));
  await db.exec(read('tests/fixtures/retention-diagnostic-candidates-baseline.sql'));
  await db.exec(`
   insert into public.lookup_session_targets(payload_id,session_id,lookup_order,target_status,server_id,character_name)
    select id,session_id,lookup_order,'lookup_done',server_id,character_name from public.extension_character_payloads where id<=80;
   update public.lookup_session_targets set character_name='wrong' where payload_id=50;
   update public.lookup_session_targets set server_id=9999 where payload_id=51;
   insert into public.lookup_session_targets(payload_id,session_id,lookup_order,target_status) values(52,'different',999,'retry'),(null,'53',1,null);
   update public.extension_character_payloads set gear_evidence='{"gearReasonCode":"already"}' where id=54;
   update public.extension_character_payloads set gear_evidence='[]' where id=55;
   update public.extension_character_payloads set gear_evidence='null' where id=56;
   update public.extension_character_payloads set gear_evidence=null where id=57;
   update public.extension_character_payloads set gear_evidence='5' where id=58;
   update public.extension_character_payloads set gear_evidence='"text"' where id=59;
   update public.extension_character_payloads set received_at=now()-interval '24 hours' where id=60;
   update public.lookup_snapshots set created_at=null where id in(45,1045);
   update public.lookup_snapshots set created_at=now()-interval '40 days' where id=1046;
   update public.lookup_snapshots set snapshot_uid='uid5' where id=47;
   update public.lookup_session_targets set snapshot_id=61 where payload_id=61;
   insert into public.extension_character_payloads(id,source_snapshot_id,master_sync_status) values(2000,62,'pending'),(2001,63,null);
   insert into public.character_master(latest_payload_id) values(64);
   insert into public.character_stat_sources(payload_id) values(65);
   insert into public.ranking_entries(latest_payload_id) values(66);
   update public.extension_character_payloads set source_snapshot_id=null,master_sync_status='pending' where id=1067;
   insert into public.google_list_sheet_sync_queue values('68',null),('69','obsolete'),('70','pending');
   revoke all on function private.kinojo_payload_evidence_candidates_v509(bigint,integer),private.kinojo_superseded_snapshot_candidates_v512(bigint,integer),private.kinojo_payload_evidence_v509(jsonb) from public,anon,authenticated,service_role;
  `);
  const fns=['payload_evidence_candidates_v509','superseded_snapshot_candidates_v512'];
  async function all(){
   const out=[];
   for(const fn of fns)for(const after of [0,20,50,79,1001,null])for(const limit of [0,1,17,50,500,null])
    out.push((await db.query('select id from private.kinojo_'+fn+'($1,$2)',[after,limit])).rows);
   return out;
  }
  const baseline=await all();assert(baseline[3].length>5);assert(baseline[39].length>5);
  const hash=async()=>(await db.query(`select 'snapshot' kind,md5(jsonb_agg(to_jsonb(x) order by id)::text) hash from public.lookup_snapshots x
    union all select 'payload',md5(jsonb_agg(to_jsonb(x) order by id)::text) from public.extension_character_payloads x order by kind`)).rows;
  const before=await hash();
  await db.exec(read('supabase/migrations/'+name));
  assert.deepEqual(await all(),baseline,'exact predicate, NULL, identity, ordering, cursor and limit parity');
  assert.deepEqual(await hash(),before,'DDL must not change application data');
  for(const role of ['anon','authenticated','service_role'])for(const fn of fns)
   assert.equal((await db.query("select has_function_privilege($1,$2,'execute') allowed",[role,'private.kinojo_'+fn+'(bigint,integer)'])).rows[0].allowed,false);
  // All eight retained keys and non-object JSON shapes remain outside the pending index.
  for(const value of [null,[],{},5,'text',true,{gearReasonCode:null,gearType:'PVE'},{unknown:null},{gearEvidence:{large:[1,2]}}]){
   const v=JSON.stringify(value);
   const {rows}=await db.query(`select (case when jsonb_typeof($1::jsonb)='object' then $1::jsonb-
    array['gearReasonCode','visibleEquipmentSlotCount','populatedEquipmentSlotCount','namedEquipmentSlotCount','abyssEquipmentSlotCount','gearType','detectedGearType','gearParseStatus']<>'{}'::jsonb else false end) pending,
    (jsonb_typeof($1::jsonb)='object' and $1::jsonb is distinct from private.kinojo_payload_evidence_v509($1::jsonb)) original`,[v]);
   assert.equal(rows[0].pending,rows[0].original===true);
  }
  // Index expressions use built-ins only; direct service-role writes need no private helper privilege.
  await db.exec(`grant insert on public.extension_character_payloads to service_role;
   set local role service_role;
   insert into public.extension_character_payloads(id,master_sync_status,gear_evidence) values(999999,'synced','{"large":[1]}');
   reset role;`);
  await db.exec("delete from public.extension_character_payloads where id=999999");
  // A newly compacted item disappears; future changes/new eligible items still become visible.
  const id=baseline[3][0].id;
  await db.query('update public.extension_character_payloads set gear_evidence=private.kinojo_payload_evidence_v509(gear_evidence) where id=$1',[id]);
  assert(!(await db.query('select id from private.kinojo_payload_evidence_candidates_v509(0,5000)')).rows.some(r=>r.id===id));
  await db.query('update public.extension_character_payloads set gear_evidence=gear_evidence||\'{"newDetail":[9]}\'::jsonb where id=$1',[id]);
  assert((await db.query('select id from private.kinojo_payload_evidence_candidates_v509(0,5000)')).rows.some(r=>r.id===id));
  const beforeRollback=await hash();
  await db.exec(read('supabase/rollbacks/'+name));
  assert.deepEqual(await hash(),beforeRollback,'rollback preserves current application data');
  assert.deepEqual(await all(),baseline,'rollback restores original selectors and planner configuration');
  assert.equal((await db.query("select to_regclass('public.idx_payload_pending_evidence_v529') gone")).rows[0].gone,null);
  console.log('PASS: old/new selectors agree on 36 parameter combinations each (72 total); protection/NULL/identity/24h/tuple order; no data change; index maintenance; direct service writes; ACL and rollback');
  await db.exec('rollback');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
