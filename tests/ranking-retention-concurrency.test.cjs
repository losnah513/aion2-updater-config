// Real PostgreSQL, synthetic data only. No production URL/credentials accepted.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {Client}=require('./runtime/postgres/node_modules/pg');
(async()=>{
 const binaries=await (await import(pathToFileURL(path.resolve('tests/runtime/postgres/node_modules/embedded-postgres/dist/binary.js')))).default();
 const parent=path.resolve('tests/runtime/postgres/data');fs.mkdirSync(parent,{recursive:true});
 const dir=fs.mkdtempSync(path.join(parent,'activity-'));
 const net=require('node:net'),probe=net.createServer();
 await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;
 await new Promise(r=>probe.close(r));
 execFileSync(binaries.initdb,['-D',dir,'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C'],{windowsHide:true,stdio:'pipe',timeout:30000});
 // pg_ctl uses PostgreSQL's normal restricted-token startup on Windows.
 // No OS user/service is created and the listener is loopback-only.
 execFileSync(binaries.pg_ctl,['-D',dir,'-l',path.join(dir,'server.log'),'-o',`-p ${port} -h 127.0.0.1 -c statement_timeout=5000`,'start','-w','-t','15'],{windowsHide:true,stdio:'ignore',timeout:20000});
 const clients=[];
 try{
   for(let n=0;n<100;n++){
     const c=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',connectionTimeoutMillis:500});
     try{await c.connect();clients.push(c);break;}catch{await c.end().catch(()=>{});await new Promise(r=>setTimeout(r,100));}
   }
   assert.equal(clients.length,1,'local PostgreSQL connection failed');
   const a=clients[0],b=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'});
   await b.connect();clients.push(b);
   await a.query("create schema private;create role anon;create role authenticated;create role service_role;create table ranking_runs(id bigint,run_id text,status text,created_at timestamptz);create table ranking_entries(id bigint,run_id text);create table hall_of_fame_current(run_id text);create table mvp_candidates_current(run_id text);insert into ranking_runs select n,'r'||n,'completed',now()+n*interval '1 second' from generate_series(1,4)n;insert into ranking_entries select n,'r'||n from generate_series(1,4)n");
   const migration=fs.readFileSync('supabase/migrations/20260923041508_ranking_entries_bounded_retention.sql','utf8');
   await a.query(migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION private.'),migration.indexOf('CREATE OR REPLACE FUNCTION public.')));
   const clean=()=>a.query('select private.kinojo_ranking_entries_cleanup_v498(20000,false) v');
   for(const sql of ["update ranking_runs set status='running' where id=1","insert into ranking_entries values(5,'r1')","insert into hall_of_fame_current values('r1')","insert into mvp_candidates_current values('r1')"]){
    await b.query('begin');await b.query(sql);
    assert.equal((await clean()).rows[0].v.code,'RANKING_RETENTION_BUSY');
    assert.equal(Number((await a.query('select count(*) n from ranking_entries')).rows[0].n),4);
    await b.query('rollback');
   }
   await b.query('begin;select pg_advisory_xact_lock(498,1)');
   assert.equal((await clean()).rows[0].v.code,'RANKING_RETENTION_BUSY');await b.query('rollback');
   await a.query('begin');assert.equal((await clean()).rows[0].v.count,2);
   await b.query("set lock_timeout='100ms'");
   await assert.rejects(b.query("insert into hall_of_fame_current values('r1')"),e=>e.code==='55P03');
   await a.query('rollback');
   assert.equal(Number((await a.query('select count(*) n from ranking_entries')).rows[0].n),4);
   console.log('PASS: real PostgreSQL keep-set locks, concurrent writers, shared advisory lock, no partial delete');

 }finally{
   for(const c of clients){await c.query('rollback').catch(()=>{});await c.end().catch(()=>{});}
   execFileSync(binaries.pg_ctl,['-D',dir,'stop','-m','fast','-w'],{windowsHide:true,stdio:'pipe',timeout:10000});
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
