const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
let handler,manager=true,valid=true,dbFailed=false,calls=[];
const context={Request,Response,URL,TextEncoder,AbortController,setTimeout,clearTimeout,console,
 Deno:{serve(fn){handler=fn;},env:{get(name){return name==='SUPABASE_URL'?'https://fixture.invalid':'local-fixture-only';}}},
 fetch:async(url,options)=>{const name=url.split('/').pop();calls.push({name,body:JSON.parse(options.body)});if(dbFailed&&name==='kinojo_roster_family_save_v477')return Response.json({message:'database failure'},{status:500});return Response.json(name==='kinojo_web_session_validate_v320'?{ok:valid,profile:{canManage:manager}}:{ok:true,items:[]});}};
vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/kinojo-legion-tree/index.ts','utf8')),context);
// Constructed local fixture; never a real login/session and never sent to production.
const sessionToken=['kws','fixture'.repeat(7)].join('_');
async function invoke(body){return handler(new Request('https://fixture.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));}
(async()=>{
 assert.equal((await invoke({action:'family-search',query:'A'})).status,401);assert.equal(calls.length,0);
 valid=false;assert.equal((await invoke({action:'family-search',query:'A',sessionToken})).status,401);
 valid=true;manager=false;assert.equal((await invoke({action:'family-search',query:'A',sessionToken})).status,403);
 manager=true;assert.equal((await invoke({action:'family-search',query:'',sessionToken})).status,400);
 assert.equal((await invoke({action:'family-load',characterId:12,sessionToken})).status,400);
 const count=calls.length;assert.equal((await invoke({action:'family-search',query:'A',sessionToken,canManage:true})).status,400);assert.equal(calls.length,count);
 const result=await invoke({action:'family-search',query:'A',sessionToken});assert.equal(result.status,200);assert.equal((await result.json()).contract,'roster-family-v477');assert.equal(calls.at(-1).name,'kinojo_roster_family_read_v477');
 assert.equal((await invoke({action:'family-save',sessionToken,requestId:'fixture-request-477',mainCharacterId:'11',altCharacterIds:['12'],expectedFamilies:[{rootId:'11',revision:'a'.repeat(32)}]})).status,200);assert.equal(calls.at(-1).name,'kinojo_roster_family_save_v477');
 assert.equal((await (await invoke({action:'health'})).json()).apiVersion,'1.11');
 dbFailed=true;const failed=await invoke({action:'family-save',sessionToken,requestId:'fixture-request-478',mainCharacterId:'11',altCharacterIds:['12'],expectedFamilies:[{rootId:'11',revision:'a'.repeat(32)}]});assert.equal(failed.status,500);const failure=await failed.json();assert.equal(failure.code,'FAMILY_SERVER_ERROR');assert(failure.message.includes('본캐·부캐 연결'));assert(!failure.message.includes('캐릭터 추가'));
 console.log('roster family Edge auth/validation/routing: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
