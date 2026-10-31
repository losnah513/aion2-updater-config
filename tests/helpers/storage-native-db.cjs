const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),net=require('node:net'),{execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
module.exports=async function create(){
 const modules=process.env.POSTGRES_TEST_MODULES||path.resolve('tests/runtime/postgres/node_modules');
 const {Client,types}=require(path.join(modules,'pg'));types.setTypeParser(20,Number);const binary=await(await import(pathToFileURL(path.join(modules,'embedded-postgres/dist/binary.js')))).default();
 const parent=path.resolve('tests/runtime/postgres/data');fs.mkdirSync(parent,{recursive:true});const dir=fs.mkdtempSync(path.join(parent,'storage-'));
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 execFileSync(binary.initdb,['-D',dir,'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C'],{windowsHide:true,stdio:'pipe',timeout:30000});
 execFileSync(binary.pg_ctl,['-D',dir,'-l',path.join(dir,'server.log'),'-o',`-p ${port} -h 127.0.0.1 -c statement_timeout=30000`,'start','-w','-t','15'],{windowsHide:true,stdio:'ignore',timeout:20000});
 const options={host:'127.0.0.1',port,user:'postgres',database:'postgres',connectionTimeoutMillis:5000,options:'-c timezone=UTC'},client=new Client(options);await client.connect();const peers=[];
 return{connectionOptions:options,query:(sql,args)=>client.query(sql,args),exec:sql=>client.query(sql),async connectPeer(){const peer=new Client(options);await peer.connect();peers.push(peer);return peer},async close(){for(const c of [client,...peers]){await c.query('rollback').catch(()=>{});await c.end().catch(()=>{});}execFileSync(binary.pg_ctl,['-D',dir,'stop','-m','fast','-w'],{windowsHide:true,stdio:'pipe',timeout:20000});const resolved=path.resolve(dir);assert.ok(resolved.startsWith(parent+path.sep)&&path.basename(resolved).startsWith('storage-'));fs.rmSync(resolved,{recursive:true});}};
};
