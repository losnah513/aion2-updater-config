const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {stripTypeScriptTypes}=require('node:module');
const {PGlite}=require(process.env.PGLITE_MODULE||'../.codex-test-runtime/node_modules/@electric-sql/pglite');
const migration=fs.readFileSync('supabase/migrations/20261031055846_private_storage_backup_transport.sql','utf8');
async function sqlTests(){const db=new PGlite();try{
 await require('./helpers/storage-budget-db.cjs')(db,['public.lookup_snapshots','public.extension_character_payloads','public.growth_reviews','public.master_sync_events','public.updater_runtime_events']);
 await db.exec("create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text,created_at timestamptz default now());insert into vault.decrypted_secrets(name,decrypted_secret) values('kinojo_server_automation_cron_token','offline-maintenance-fixture');");
 await db.exec('begin;'+migration+'commit;');
 await db.exec(`insert into public.master_sync_events(id,session_id,created_at,raw_payload) values(1,'fixture','2025-01-01','{"value":1.00,"text":"한글\\n내용"}'),(2,'fixture',now(),'{}'),(3,'fixture','2025-01-01','{}');`);
 const run=async(key,kind='master',after=0,until=2,before='2026-10-30T00:00:00Z',limit=200)=>(await db.query('select public.kinojo_storage_backup_page_v551($1,$2,$3,$4,$5,$6) r',[key,kind,after,until,before,limit])).rows[0].r;
 assert.equal((await run('invalid')).code,'STORAGE_MAINTENANCE_DENIED');const a=await run('offline-maintenance-fixture');assert.equal(a.rows,1);assert.equal(a.lastId,1);assert.match(a.data,/1\.00/,'canonical numeric bytes must survive export');assert.equal(crypto.createHash('sha256').update(a.data).digest('hex'),a.sourceSha256);const record=JSON.parse(a.data);assert.equal(record.row.id,1);assert.equal(a.sourceBytes,Buffer.byteLength(a.data));
 assert.equal((await run('offline-maintenance-fixture','master',1,2)).rows,0);assert.equal((await run('offline-maintenance-fixture','bad')).code,'INVALID_STORAGE_KIND');assert.equal((await run('offline-maintenance-fixture','master',3,2)).code,'INVALID_BACKUP_RANGE');
 await db.exec('set role anon');await assert.rejects(run('offline-maintenance-fixture'),/permission denied/);await db.exec('reset role');await db.exec('set role authenticated');await assert.rejects(run('offline-maintenance-fixture'),/permission denied/);await db.exec('reset role');
 assert.equal((await db.query("select has_function_privilege('service_role','public.kinojo_storage_backup_page_v551(text,text,bigint,bigint,timestamptz,integer)','EXECUTE') allowed")).rows[0].allowed,true);
 await db.exec("insert into public.master_sync_events(id,session_id,created_at,raw_payload) select n,'fixture','2025-01-01',jsonb_build_object('body',repeat('x',22000)) from generate_series(4,503)n");const bounded=await run('offline-maintenance-fixture','master',3,503,'2026-10-30T00:00:00Z',500);assert.ok(bounded.rows>0&&bounded.rows<500);assert.ok(bounded.sourceBytes<=8000000);assert.equal(bounded.data.split('\n').length,bounded.rows);
 }finally{await db.close()}}
async function edgeTests(){let handler,mode='ok',storageCalls=0,upload;
 const data=JSON.stringify({row:{id:1,raw_payload:{value:1}},hash:'fixture'}),hash=crypto.createHash('sha256').update(data).digest('hex');
 const fetcher=async(url,init={})=>{
  if(url.includes('/rpc/'))return Response.json(mode==='deny'?{ok:false,code:'STORAGE_MAINTENANCE_DENIED'}:{ok:true,kind:'master',rows:1,lastId:1,data,sourceBytes:Buffer.byteLength(data),sourceSha256:mode==='bad-hash'?'bad':hash});
  storageCalls++;if(url.endsWith('/bucket/kinojo-db-backups'))return Response.json({public:mode==='public'});
  if(url.includes('/object/authenticated/'))return new Response(mode==='corrupt'?Buffer.from('not gzip'):upload);
  if(url.includes('/object/sign/'))return Response.json({signedURL:'/object/sign/kinojo-db-backups/fixture?token=offline-short-lived-link'});
  if(url.includes('/object/')){upload=Buffer.from(init.body);return mode==='upload-denied'?Response.json({}, {status:403}):Response.json({});}
  throw Error('Unexpected path');
 };
 const sandbox={Deno:{env:{get:n=>n==='SUPABASE_URL'?'https://offline.invalid':'offline-service-fixture'},serve:h=>handler=h},fetch:fetcher,Request,Response,Headers,ReadableStream,Blob,CompressionStream,DecompressionStream,TextEncoder,TextDecoder,Uint8Array,AbortController,setTimeout,clearTimeout,crypto:crypto.webcrypto};
 const helper=stripTypeScriptTypes(fs.readFileSync('supabase/functions/_shared/http-budget.ts','utf8')).replace(/export /g,'');const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/kinojo-storage-maintenance/index.ts','utf8')).replace(/^import .*$/mg,'');vm.runInNewContext(helper+'\n'+source,sandbox);
 const request=async()=>{const r=await handler(new Request('https://offline.invalid',{method:'POST',body:JSON.stringify({action:'backupPage',backupRun:'fixture',kind:'master',after:0,until:1,before:'2026-10-30T00:00:00Z'})}));return{status:r.status,data:await r.json()}};
 mode='deny';assert.equal((await request()).status,403);assert.equal(storageCalls,0);
 mode='bad-hash';assert.equal((await request()).status,502);assert.equal(storageCalls,0);
 mode='public';assert.equal((await request()).status,502);
 mode='ok';const ok=await request();assert.equal(ok.status,200);assert.equal(ok.data.verified,true);assert.equal(zlib.gunzipSync(upload).toString(),data);assert.equal(ok.data.sourceSha256,hash);assert.equal(ok.data.data,undefined,'raw records must not be returned by Edge');
 mode='corrupt';assert.equal((await request()).status,502);mode='upload-denied';assert.equal((await request()).status,502);
 const invalid=await handler(new Request('https://offline.invalid',{method:'POST',body:'invalid private input'}));assert.equal((await invalid.json()).code,'INVALID_JSON');
}
(async()=>{await sqlTests();await edgeTests();console.log('PASS private backup: real service ACL/token gate, fixed scope/age/highwater/byte limit, canonical SHA256, private bucket, gzip roundtrip/readback, failure fencing and no raw Edge response');})().catch(e=>{console.error(e.stack);process.exitCode=1});
