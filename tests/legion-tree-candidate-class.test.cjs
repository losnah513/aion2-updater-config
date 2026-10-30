'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/kinojo-legion-tree/index.ts'),'utf8');
 const calls=[],rows=[{name:'후보',characterId:'a',serverId:2002,className:'검성',level:50},{name:'후보',characterId:'b',serverId:2002,class_name:'치유성',level:50},{name:'후보',characterId:'c',serverId:2002,level:50}];
 const context=vm.createContext({URL,TextEncoder,TextDecoder,Headers,Request,Response,AbortController,setTimeout,clearTimeout,console,
  Deno:{env:{get:name=>name==='SUPABASE_URL'?'https://fixture.invalid':'fixture-only'},serve:()=>{}},
  fetch:async(url,options)=>{calls.push({url:String(url),body:options?.body});return Response.json(String(url).includes('plaync.com')?{list:rows}:{ok:true,allowed:true});}
 });
 vm.runInContext(stripTypeScriptTypes(source)+'\nglobalThis.candidateClassTest=officialCharacterCandidates;',context);
 const result=await context.candidateClassTest({raw:'후보',characterName:'후보',server:{}},[{server_id:2002,server_name:'지켈',server_short_name:'지켈',race_id:2}],'fixture-session','main');
 assert.equal(result.ok,true);assert.equal(result.candidates.length,3);
 assert.deepEqual(Array.from(result.candidates,c=>c.className),['검성','치유성','']);
 assert.equal(calls.filter(c=>c.url.includes('plaync.com')).length,1,'class display must not trigger per-candidate detail requests');
 assert(calls.every(c=>!c.url.includes('/api/character/info')));
 console.log('PASS: actual Edge candidate mapping preserves official class names/alias/unknown without additional official requests');
})().catch(e=>{console.error(e);process.exitCode=1;});
