'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/kinojo-legion-tree/index.ts'),'utf8');
 const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/official-class-catalog.json'),'utf8'));
 const calls=[],rows=[{name:'후보',characterId:'a',serverId:2002,className:'검성',level:50},{name:'후보',characterId:'b',serverId:2002,class_name:'치유성',level:50},{name:'후보',characterId:'c',serverId:2002,pcId:31,level:50},{name:'후보',characterId:'d',serverId:2002,pcId:45,level:50},{name:'후보',characterId:'e',serverId:2002,pcId:999,level:50}];
 let catalogUnavailable=false;
 const context=vm.createContext({URL,TextEncoder,TextDecoder,Headers,Request,Response,AbortController,setTimeout,clearTimeout,console,
  Deno:{env:{get:name=>name==='SUPABASE_URL'?'https://fixture.invalid':'fixture-only'},serve:()=>{}},
  fetch:async(url,options)=>{calls.push({url:String(url),body:options?.body});if(String(url).includes('/pcdata')){if(catalogUnavailable)throw Error('offline');return Response.json(catalog);}return Response.json(String(url).includes('plaync.com')?{list:rows}:{ok:true,allowed:true});}
 });
 vm.runInContext(stripTypeScriptTypes(source)+'\nglobalThis.candidateClassTest=officialCharacterCandidates;',context);
 const result=await context.candidateClassTest({raw:'후보',characterName:'후보',server:{}},[{server_id:2002,server_name:'지켈',server_short_name:'지켈',race_id:2}],'fixture-session','main');
 assert.equal(result.ok,true);assert.equal(result.candidates.length,5);
 assert.deepEqual(Array.from(result.candidates,c=>c.className),['검성','치유성','치유성','권성','']);
 assert.equal(calls.filter(c=>c.url.includes('/search/v2/character')).length,1);
 assert.equal(calls.filter(c=>c.url.includes('/pcdata')).length,1,'all candidates share one catalog request');
 const second=await context.candidateClassTest({raw:'후보',characterName:'후보',server:{}},[{server_id:2002,server_name:'지켈',race_id:2}],'fixture-session','alt');
 assert.equal(second.candidates[2].className,'치유성');assert.equal(calls.filter(c=>c.url.includes('/pcdata')).length,1,'main/alt searches reuse the cached official catalog');
 catalogUnavailable=true;const OriginalDate=Date;context.Date=class extends OriginalDate{static now(){return OriginalDate.now()+3600001;}};
 const stale=await context.candidateClassTest({raw:'후보',characterName:'후보',server:{}},[{server_id:2002,server_name:'지켈',race_id:2}],'fixture-session','main');
 assert.equal(stale.candidates[2].className,'치유성','catalog outage retains last known mapping');assert.equal(stale.candidates[4].className,'','unknown pcId must not be guessed');
 assert(calls.every(c=>!c.url.includes('/api/character/info')));
 console.log('PASS: actual Edge resolves official pcId catalog, aliases, unknown IDs, shared cache and stale fallback without per-candidate detail requests');
})().catch(e=>{console.error(e);process.exitCode=1;});
