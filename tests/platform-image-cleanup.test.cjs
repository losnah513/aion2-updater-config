'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
let handler,rows=[],storageCode='NoSuchKey',storageStatus=400,finalized=[],active=0,peak=0;
const logs=[];
const context=vm.createContext({TextEncoder,TextDecoder,Request,Response,AbortController,setTimeout,clearTimeout,console:{error:(...a)=>logs.push(a)},
 Deno:{env:{get:n=>n==='SUPABASE_URL'?'https://fixture.invalid':'synthetic-backend'},serve:fn=>handler=fn},
 fetch:async(url,init)=>{
  if(url.includes('/storage/')){active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,3));active--;return new Response(JSON.stringify({code:storageCode}),{status:storageStatus});}
  const fn=url.split('/').pop(),body=JSON.parse(init.body);
  if(fn.includes('candidates'))return Response.json(rows);
  if(fn.includes('finalize')){finalized.push(body);return Response.json({ok:body.p_character_id!==99});}
  if(fn.includes('metadata_cleanup'))return Response.json({ok:true,metadataDeleted:0});
  if(fn.includes('cron_authorize'))return Response.json(false);
  throw Error('unexpected RPC');
 }});
vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/_shared/http-budget.ts','utf8')).replace('export async','async'),context);
vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/kinojo-member-image-cleanup/index.ts','utf8').replace(/^import .*http-budget.*;$/m,'')),context);
const candidate=id=>({source_kind:'QUEUED_OBJECT',character_id:id,slot:'FRONT',mime_type:'image/webp',object_path:`characters/${id}/FRONT/${'a'.repeat(32)}.webp`});
async function run(auth=true){const res=await handler(new Request('https://fixture.invalid',{method:'POST',headers:auth?{authorization:'Bearer synthetic-backend'}:{},body:'{}'}));return {status:res.status,body:await res.json()};}
(async()=>{
 assert.equal((await run(false)).status,401);assert.equal(finalized.length,0);
 rows=[candidate(1)];let r=await run();assert.equal(r.status,200);assert.equal(r.body.summary.storageAbsent,1);assert.equal(finalized.length,1);
 for(const [status,code] of [[403,'AccessDenied'],[400,'InvalidRequest'],[404,'NoSuchBucket'],[404,'TenantNotFound']]){
  storageStatus=status;storageCode=code;finalized=[];r=await run();assert.equal(r.status,502);assert.equal(r.body.ok,false);assert.equal(r.body.code,'CLEANUP_PARTIAL_FAILURE');assert.equal(finalized.length,0,'non-object errors preserve metadata');
 }
 storageStatus=404;storageCode='NoSuchKey';r=await run();assert.equal(r.body.summary.storageAbsent,1);
 storageStatus=200;rows=Array.from({length:12},(_,i)=>candidate(i+1));peak=0;finalized=[];r=await run();assert.equal(r.body.summary.metadataDeleted,12);assert.equal(peak,4);assert.equal(finalized.length,12);
 rows=[candidate(99),{...candidate(1),object_path:'outside/unsafe'}];r=await run();assert.equal(r.body.summary.conflicts,1);assert.equal(r.body.summary.invalidCandidates,1);assert.equal(r.body.ok,false);
 assert.ok(finalized.every(x=>x.p_expected_object_path.startsWith('characters/')),'metadata finalization retains expected path fence');
 console.log('PASS: authenticated cleanup, exact legacy/current absence, bucket/auth/error preservation, partial failure, four-worker bound and replacement fence');
})().catch(e=>{console.error(e);process.exitCode=1;});
