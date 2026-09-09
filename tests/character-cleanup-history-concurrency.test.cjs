// Real PostgreSQL; synthetic loopback database only, never an operating connection.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {Client}=require('./runtime/postgres/node_modules/pg');
(async()=>{
 const binaries=await(await import(pathToFileURL(path.resolve('tests/runtime/postgres/node_modules/embedded-postgres/dist/binary.js')))).default();
 const parent=path.resolve('tests/runtime/postgres/data');fs.mkdirSync(parent,{recursive:true});
 const dir=fs.mkdtempSync(path.join(parent,'history-'));
 const probe=require('node:net').createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));
 const port=probe.address().port;await new Promise(r=>probe.close(r));
 execFileSync(binaries.initdb,['-D',dir,'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C'],{windowsHide:true,stdio:'pipe',timeout:30000});
 const clients=[];let started=false;
 try{
  execFileSync(binaries.pg_ctl,['-D',dir,'-l',path.join(dir,'server.log'),'-o',`-p ${port} -h 127.0.0.1 -c statement_timeout=5000`,'start','-w','-t','15'],{windowsHide:true,stdio:'ignore',timeout:20000});started=true;
  for(let i=0;i<3;i++){const c=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'});await c.connect();clients.push(c);}
  const [a,b,observer]=clients;
  await a.query(`create schema private;create role anon;create role authenticated;create role service_role bypassrls;
   create table character_master(id bigint primary key,char_key text,server_id int,character_name text,last_lookup_success_at timestamptz);
   create table character_identity_change_history(character_id bigint references character_master(id) on delete cascade,
    previous_server_id int,previous_character_name text,current_server_id int,current_character_name text,char_key text,previous_char_key text,current_char_key text);
   create table character_identity_recovery_attempts(character_id bigint references character_master(id) on delete set null);
   create table private.character_activity_checks(character_id bigint references character_master(id) on delete restrict);
   create table private.character_activity_lifecycle(character_id bigint references character_master(id) on delete restrict);
   create function public.kinojo_hof_weekly_gear_deltas(timestamptz) returns setof bigint language sql
    as $$select cm.id from (select 1) x join public.character_master cm on true$$;
   insert into character_master values(1,'111111111111',2008,'renamed',now());
   insert into character_identity_change_history values(1,2002,'old',2008,'renamed','111111111111','101010101010','111111111111');`);
  await a.query(fs.readFileSync('supabase/migrations/20260909111102_character_cleanup_history_preservation.sql','utf8'));
  const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
  for(const isolation of ['read committed','repeatable read']){
   for(const values of ["(2,'111111111111',2008,'renamed',null)","(2,'101010101010',2002,'old',null)","(2,null,2002,'old',null)"]){
    await b.query('begin isolation level '+isolation);await b.query('select count(*) from character_master');
    await a.query('begin;delete from character_master where id=1');
    const pending=b.query('insert into character_master values'+values).then(()=>({code:'unexpected success'}),e=>({code:e.code}));
    let blocked=false;const deadline=Date.now()+2000;
    while(Date.now()<deadline){
     const r=(await observer.query('select wait_event from pg_stat_activity where pid=$1',[pid])).rows[0];
     if(r?.wait_event==='advisory'){blocked=true;break;}
     await new Promise(r=>setTimeout(r,10));
    }
    assert.ok(blocked,'replay must wait for retirement');await a.query('commit');
    assert.equal((await pending).code,isolation==='read committed'?'23514':'40001',isolation+' replay fence');
    await b.query('rollback');
    assert.equal(Number((await a.query('select count(*) n from character_master')).rows[0].n),0);
    // Synthetic fixture reset only, never a production restoration route.
    await a.query("update private.character_historical_identities set retired_at=null;insert into character_master values(1,'111111111111',2008,'renamed',now())");
   }
   console.log('PASS concurrent retirement/replay: '+isolation+' current key, old key and old alias');
  }
  await a.query('delete from character_master where id=1');
  await assert.rejects(a.query(fs.readFileSync('supabase/rollbacks/20260909111102_character_cleanup_history_preservation_rollback.sql','utf8')),/HISTORICAL_IDENTITIES_RETIRED_ROLL_FORWARD_REQUIRED/);
  await a.query('rollback');
  assert.equal(Number((await a.query('select count(*) n from character_identity_change_history')).rows[0].n),1);
  assert.equal(Number((await a.query('select count(*) n from private.character_historical_identities where retired_at is not null')).rows[0].n),1);
  console.log('PASS rollback refuses after retirement and leaves historical rows intact');
 }finally{
  for(const c of clients)await c.end().catch(()=>{});
  if(started)execFileSync(binaries.pg_ctl,['-D',dir,'stop','-m','fast','-w','-t','15'],{windowsHide:true,stdio:'ignore',timeout:20000});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
