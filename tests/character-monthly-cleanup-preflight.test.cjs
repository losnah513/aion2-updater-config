const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'../.codex-test-runtime/node_modules/@electric-sql/pglite');
const sql=fs.readFileSync('supabase/tests/character_monthly_cleanup_preflight.sql','utf8');
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create schema private;
   create table public.character_master(id bigint primary key,policy jsonb not null);
   create table private.character_activity_lifecycle(character_id bigint primary key references public.character_master(id) on delete restrict,
     state text,episode integer,excluded_at timestamptz,cleanup_candidate_at timestamptz);
   create table public.character_identity_change_history(history_id bigint,character_id bigint references public.character_master(id) on delete cascade,evidence jsonb);
   create table public.character_history(id bigint,character_master_id bigint,character_name text);
   create table public.kinojo_banner_auto_pools_v407(character_ids bigint[]);
   create function private.kinojo_character_lookup_policy(bigint,timestamptz) returns jsonb
     language sql stable as $$select policy from public.character_master where id=$1$$;
   insert into public.character_master select n,'{"eligible":false,"reason":"AUTO_NO_ACTIVITY"}'::jsonb from generate_series(1,8)n;
   update public.character_master set policy='{"eligible":true,"reason":"CURRENT_SANCTUARY_FAMILY"}' where id=4;
   update public.character_master set policy='{"eligible":false,"reason":"ADMIN_EXCLUDED"}' where id=5;
   insert into private.character_activity_lifecycle
     select n,'EXCLUDED',1,'2020-09-30T14:59:59Z','2020-09-30T15:00:00Z' from generate_series(2,8)n;
   update private.character_activity_lifecycle set excluded_at='2099-09-30T14:59:59Z',cleanup_candidate_at='2099-09-30T15:00:00Z' where character_id=3;
   update private.character_activity_lifecycle set state='HELD',cleanup_candidate_at=null where character_id=6;
   update private.character_activity_lifecycle set cleanup_candidate_at=null where character_id=7;
   update private.character_activity_lifecycle set cleanup_candidate_at='2020-10-30T15:00:00Z' where character_id=8;
   insert into public.character_identity_change_history values(1,2,'{"originalName":"preserved"}');
   insert into public.character_history values(1,2,'original');`);
  const before=(await db.query('select jsonb_agg(to_jsonb(c)) data from public.character_master c')).rows;
  const run=async()=>{const r=await db.exec(sql);return r.find(x=>x.rows?.[0]?.cleanup_preflight)?.rows[0].cleanup_preflight;};
  const r=await run();assert.equal(r.readOnly,true);assert.equal(r.deletionAllowed,false);
  for(const reason of ['NO_CONFIRMED_EXCLUSION_DATE','NOT_DUE','RESTORE_REQUIRES_RECONCILE','POLICY_HOLD',
   'NOT_EXCLUDED','INVALID_LIFECYCLE','INVALID_MONTH_BOUNDARY','REQUIRES_FRESH_RELATION_AND_REFERENCE_CHECK'])assert.equal(r.counts[reason],1,reason);
  assert.deepEqual(r.dueCandidates.map(x=>x.characterId),[2,4,5]);
  const fk=r.foreignKeys.find(x=>x.table_name==='character_identity_change_history');
  assert.equal(fk.delete_action,'CASCADE');assert.equal(fk.required_handling,'PRESERVE_AUDIT_REFERENCE');
  assert(r.logicalColumns.some(x=>x.table_name==='character_history'&&x.column_name==='character_master_id'));
  assert(r.structuredColumns.some(x=>x.table_name==='kinojo_banner_auto_pools_v407'));
  assert.deepEqual((await run()).counts,r.counts,'repeatable without reconciliation side effects');
  assert.deepEqual((await db.query('select jsonb_agg(to_jsonb(c)) data from public.character_master c')).rows,before);
  assert.equal((await db.query('select count(*)::int n from public.character_identity_change_history')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from private.character_activity_lifecycle')).rows[0].n,7);
  await db.exec('delete from private.character_activity_lifecycle; delete from public.character_identity_change_history; delete from public.character_master');
  const empty=await run();assert.deepEqual(empty.counts,{});assert.deepEqual(empty.dueCandidates,[]);assert.equal(empty.deletionAllowed,false);
  assert.match(sql,/begin read only;/i);assert.match(sql,/statement_timeout='10s'/);
  console.log('PASS cleanup preflight: KST month boundary, manual/restore/held, FK cascade, logical/array references, no mutation, repeat, empty');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
