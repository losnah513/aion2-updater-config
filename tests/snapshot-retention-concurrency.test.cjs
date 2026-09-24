// Real PostgreSQL, synthetic data only. No production URL/credentials accepted.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {Client}=require('./runtime/postgres/node_modules/pg');
(async()=>{
 const binaries=await (await import(pathToFileURL(path.resolve('tests/runtime/postgres/node_modules/embedded-postgres/dist/binary.js')))).default();
 const parent=path.resolve('tests/runtime/postgres/data');fs.mkdirSync(parent,{recursive:true});
 const dir=fs.mkdtempSync(path.join(parent,'snapshot-'));
 const net=require('node:net'),probe=net.createServer();
 await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;
 await new Promise(r=>probe.close(r));
 execFileSync(binaries.initdb,['-D',dir,'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C'],{windowsHide:true,stdio:'pipe',timeout:30000});
 // pg_ctl uses PostgreSQL's normal restricted-token startup on Windows.
 // No OS user/service is created and the listener is loopback-only.
 execFileSync(binaries.pg_ctl,['-D',dir,'-l',path.join(dir,'server.log'),'-o',`-p ${port} -h 127.0.0.1 -c statement_timeout=5000`,'start','-w','-t','15'],{windowsHide:true,stdio:'ignore',timeout:20000});
 const clients=[];let verified=false;
 try{
   for(let n=0;n<100;n++){
     const c=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',connectionTimeoutMillis:500});
     try{await c.connect();clients.push(c);break;}catch{await c.end().catch(()=>{});await new Promise(r=>setTimeout(r,100));}
   }
   assert.equal(clients.length,1,'local PostgreSQL connection failed');
   const a=clients[0],b=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'});
   await b.connect();clients.push(b);
   await require('./helpers/snapshot-retention-db.cjs')({exec:q=>a.query(q),query:(q,p)=>a.query(q,p)});
   await a.query(fs.readFileSync('supabase/migrations/20260923060706_character_snapshot_raw_retention.sql','utf8'));
   if(process.argv.includes('--diagnostic')){
    await a.query(fs.readFileSync('tests/fixtures/historical-snapshot-audit-helpers.sql','utf8'));
    await a.query('alter table character_master add column if not exists latest_pve_payload_id bigint;alter table character_master add column if not exists latest_pvp_payload_id bigint;create table character_stat_sources(snapshot_id bigint,payload_id bigint);create table private.character_snapshot_requests(snapshot_id bigint)');
    await a.query(fs.readFileSync('supabase/migrations/20260923090420_historical_snapshot_text_retention.sql','utf8'));
    await a.query(fs.readFileSync('supabase/migrations/20260924060040_snapshot_diagnostic_retention.sql','utf8'));
   }
   await a.query("insert into updater_sessions(session_id,status) values('done','completed');insert into lookup_snapshots(id,session_id,server_id,character_name,status,created_at,raw_payload) values(1,'done',2002,'old','OK',now()-interval '2 days','{\"officialRaw\":{\"info\":{}},\"profileHtml\":\"original\"}');insert into extension_character_payloads(id,source_snapshot_id,master_sync_status) values(1,1,'synced');insert into lookup_session_targets(id,snapshot_id,target_status) values(1,1,'lookup_done');insert into character_master(id,server_id,character_name) values(1,2002,'other');insert into character_skill_current_state(character_master_id) values(1)");
   const clean=()=>a.query('select private.kinojo_snapshot_raw_cleanup_v501(false,2000) v');
   if(process.argv.includes('--diagnostic'))await a.query("update extension_character_payloads set session_id='done',server_id=2002,character_name='old';update updater_sessions set status='failed'");
   for(const sql of ["update character_master set latest_snapshot_uid='protect' where id=1","update character_skill_current_state set snapshot_id=1 where character_master_id=1","update updater_sessions set status='running'","update lookup_session_targets set target_status='retry_queued'","update extension_character_payloads set master_sync_status='failed'"]){
    await b.query('begin');await b.query(sql);assert.equal((await clean()).rows[0].v.busy,true);await b.query('rollback');
   }
   await b.query('begin;select pg_advisory_xact_lock(501,501)');assert.equal((await clean()).rows[0].v.busy,true);await b.query('rollback');
   await b.query("begin;select id from lookup_snapshots where id=1 for update");assert.equal((await clean()).rows[0].v.compacted,0);await b.query('rollback');
   await a.query('begin');assert.equal((await clean()).rows[0].v.compacted,1);
   await b.query("set lock_timeout='100ms'");
   await assert.rejects(b.query("update character_skill_current_state set snapshot_id=1 where character_master_id=1"),e=>e.code==='55P03');
   await a.query('rollback');assert.equal((await a.query("select raw_payload ? 'officialRaw' full from lookup_snapshots")).rows[0].full,true);
   await b.query("update character_skill_current_state set snapshot_id=1 where character_master_id=1");assert.equal((await clean()).rows[0].v.compacted,0);
   console.log('PASS real PostgreSQL snapshot retention: keep-set writers, advisory lock, locked-row skip, protection recheck and atomic rollback');
   verified=true;

 }finally{
   for(const c of clients){await c.query('rollback').catch(()=>{});await c.end().catch(()=>{});}
   execFileSync(binaries.pg_ctl,['-D',dir,'stop','-m','fast','-w'],{windowsHide:true,stdio:'pipe',timeout:10000});
   if(verified){
     const resolved=path.resolve(dir),allowed=path.resolve(parent)+path.sep;
     assert.ok(resolved.startsWith(allowed)&&path.basename(resolved).startsWith('snapshot-'));
     fs.rmSync(resolved,{recursive:true});
   }
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
