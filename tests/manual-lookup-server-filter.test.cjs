const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'../.codex-test-runtime/node_modules/@electric-sql/pglite');
const migration='20261008054913_manual_lookup_server_names.sql';
const before=fs.readFileSync('supabase/rollbacks/'+migration,'utf8').split('\n').slice(1).join('\n');
const after=fs.readFileSync('supabase/migrations/'+migration,'utf8').split('\n').slice(2).join('\n');
const old="where regexp_replace(f.value, '[^0-9]', '', 'g') = t.server_id::text";
const addition=`where regexp_replace(f.value, '[^0-9]', '', 'g') = t.server_id::text
         or exists (
           select 1
           from public.server_master sm
           where sm.server_id = t.server_id
             and btrim(f.value) in (sm.server_name, sm.server_short_name)
         )`;
// Enforce the complete live function differs only at this existing filter.
assert.equal(after.replace(addition,old).trimEnd(),before.trimEnd());
function predicate(sql){
 const start=sql.indexOf('jsonb_array_length(v_filter_servers) = 0');
 const end=sql.indexOf('\n    and (\n      jsonb_array_length(v_filter_gear_types)',start);
 assert.ok(start>0&&end>start);
 return sql.slice(start,end).replace(/\n    \)\s*$/,'').replaceAll('v_filter_servers','$1::jsonb');
}
async function run(){
 const db=new PGlite();
 try{
  await db.exec(`create table server_master(server_id int,server_name text,server_short_name text);
   insert into server_master values(2002,'지켈','지켈'),(2003,'브리트라','브리');
   create table targets(id int,server_id int,character_name text,eligible boolean);
   insert into targets values(1,2002,'이전이름',true),(2,2003,'이전이름',true),(3,2002,'다른이름',true),(4,2002,'제외',false);
   create function kinojo_validate_updater_session(text,text) returns jsonb language sql as $$ select '{"ok":false,"code":"INVALID_SESSION"}'::jsonb $$;`);
  const select=async(sql,servers,name='이전이름')=>(await db.query(
   'select id from targets t where ('+predicate(sql)+') and character_name=$2 and eligible order by id',
   [JSON.stringify(servers),name])).rows.map(r=>r.id);
  assert.deepEqual(await select(before,['지켈']),[]);
  assert.deepEqual(await select(after,['지켈']),[1]);
  assert.deepEqual(await select(after,[' 지켈 ']),[1]);
  assert.deepEqual(await select(after,['2002']),[1]);
  assert.deepEqual(await select(after,['서버2002']),[1]); // retained legacy numeric parsing
  assert.deepEqual(await select(after,['브리']),[2]);
  assert.deepEqual(await select(after,['브리트라']),[2]);
  assert.deepEqual(await select(after,['없는서버']),[]);
  assert.deepEqual(await select(after,['지']),[]);
  assert.deepEqual(await select(after,['2002','브리']),[1,2]);
  assert.deepEqual(await select(after,[]),[1,2]);
  assert.deepEqual(await select(after,['지켈'],'제외'),[]);
  assert.deepEqual(await select(after,['브리'],'다른이름'),[]);
  // Actual complete function compilation and early auth/full-list guards.
  await db.exec(after);
  const call=async filter=>(await db.query("select kinojo_prepare_lookup_queue_from_list_v296('synthetic','synthetic','[]'::jsonb,$1) p",[JSON.stringify(filter)])).rows[0].p;
  assert.equal((await call({servers:['지켈']})).code,'INVALID_SESSION');
  await db.exec(`create or replace function kinojo_validate_updater_session(text,text) returns jsonb language sql as $$ select '{"ok":true}'::jsonb $$;`);
  assert.equal((await call({servers:['지켈']})).code,'COMPLETE_LIST_READ_REQUIRED');
  await db.exec(before);
  assert.deepEqual(await select(before,['지켈']),[]);
  assert.deepEqual(await select(before,['2002']),[1]);
  console.log('PASS: baseline reproduction, canonical name/alias/ID, AND selection, exclusions, exact scope, auth/full-list gates and rollback');
 }finally{await db.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
