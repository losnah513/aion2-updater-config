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
   await a.query(fs.readFileSync('tests/fixtures/retention-diagnostic-candidates-data.sql','utf8'));
   await a.query(fs.readFileSync('supabase/rollbacks/20261031042747_family_snapshot_retention_coordination.sql','utf8'));
   await a.query('create table private.kinojo_snapshot_retention_control_v512(singleton boolean,enabled boolean,backup_waived_at timestamptz,backup_verified_at timestamptz)');
   await b.query("set lock_timeout='150ms'");
   const names=['kinojo_superseded_snapshot_cleanup_v512','kinojo_snapshot_raw_cleanup_v514','kinojo_payload_seven_day_cleanup_v515'];
   for(const name of names){
    await a.query('begin');assert.equal((await a.query('select private.'+name+'(true,5) r')).rows[0].r.ok,true);
    await assert.rejects(b.query('update private.character_snapshot_requests set snapshot_id=snapshot_id'),e=>e.code==='55P03','baseline must reproduce the publication completion conflict');await a.query('rollback');
   }
   await a.query(fs.readFileSync('supabase/migrations/20261031042747_family_snapshot_retention_coordination.sql','utf8'));
   for(const name of names){
    await a.query('begin');assert.equal((await a.query('select private.'+name+'(true,5) r')).rows[0].r.ok,true);
    await b.query('begin');assert.equal((await b.query('update private.character_snapshot_requests set snapshot_id=snapshot_id')).rowCount,1,'publication request completion must proceed during cleanup');await b.query('rollback');
    await assert.rejects(b.query('update character_master set latest_payload_id=latest_payload_id'),e=>e.code==='55P03','real keep-set writers must remain protected');await a.query('rollback');
   }
   console.log('PASS real PostgreSQL: reproduced all three retention/publication lock failures; publication now proceeds while real raw keep-set writers remain serialized');
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
