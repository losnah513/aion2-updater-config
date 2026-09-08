const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create schema private; create role anon; create role authenticated; create role service_role;
   create table private.sanctuary_character_registration_events_v480(registration_id uuid primary key,list_sync_requested boolean,list_queue_session_id text,list_sync_status text,list_queue_count int,updated_at timestamptz);
   create table public.google_list_sheet_sync_queue(session_id text,sync_status text);
   insert into private.sanctuary_character_registration_events_v480 values('00000000-0000-4000-8000-000000000001',true,'registration-test','FAILED',2,now());
   insert into public.google_list_sheet_sync_queue values('registration-test','synced'),('registration-test','synced');`);
  const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  const baseline=read('supabase/migrations/20260908105603_sanctuary_external_guest_family_v480.sql');
  await db.exec(baseline.slice(baseline.indexOf('create or replace function public.kinojo_sanctuary_list_sync_prepare_v480('),baseline.indexOf('create or replace function public.kinojo_sanctuary_list_readback_finalize_v480(')));
  const prepare=async(session='registration-test')=>(await db.query('select public.kinojo_sanctuary_list_sync_prepare_v480($1::uuid,$2) result',['00000000-0000-4000-8000-000000000001',session])).rows[0].result;
  assert.equal((await prepare()).code,'LIST_QUEUE_EMPTY','reproduce lost-finalize response');
  await db.exec(read('supabase/migrations/20260908121402_sanctuary_list_retry_readback_v480.sql'));
  assert.equal((await prepare()).expectedCount,2,'all synced rows remain available for readback');
  assert.equal((await prepare('another-event')).code,'REGISTRATION_NOT_FOUND','queue ownership preserved');
  await db.exec("update public.google_list_sheet_sync_queue set sync_status='failed' where ctid=(select min(ctid) from public.google_list_sheet_sync_queue)");
  assert.equal((await prepare()).expectedCount,2,'mixed success rows revalidated together');
  await db.exec("update private.sanctuary_character_registration_events_v480 set list_sync_status='SYNCED'");
  assert.equal((await prepare()).alreadySynced,true,'final event success short circuits');
  const acl=(await db.query("select has_function_privilege('anon','public.kinojo_sanctuary_list_sync_prepare_v480(uuid,text)','execute') allowed")).rows[0];
  assert.equal(acl.allowed,false);
  console.log('Sanctuary DB480 retry: baseline + lost response + partial success + ownership + ACL PASS');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
