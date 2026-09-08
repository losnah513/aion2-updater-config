const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync('supabase/functions/lookup-list-sync/index.ts','utf8');
const id='12345678-1234-4123-8123-123456789abc';
const body={action:'syncSanctuary',registrationId:id,queueSessionId:'sanctuary-registration:'+id};
function fixture(mode='ok'){
 const calls=[],patches=[];let handler;
 const c=vm.createContext({URL,URLSearchParams,TextEncoder,Request,Response,AbortController,setTimeout,clearTimeout,console,Date,Deno:{env:{get:()=> 'synthetic-service-key'},serve:h=>handler=h}});
 vm.runInContext(stripTypeScriptTypes(source).replace('export {};',''),c);
 c.env=()=> 'https://mock.invalid';
 c.rpc=async(name,args)=>{calls.push({name,args});if(name.includes('prepare'))return mode==='already'?{ok:true,alreadySynced:true}:{ok:true};if(name.includes('finalize')&&mode==='finalize')return{ok:false};if(name.includes('result')&&args.p_ok&&mode==='result')return{ok:false};return{ok:true};};
 c.allQueuePages=async(query)=>{assert.match(query.get('select'),/character_id/);assert.equal(query.has('sync_status'),false);return{ok:true,data:[1,2].map(n=>({id:n,character_id:mode==='missing-id'?null:100+n,append_if_missing:true,character_name:'guest'+n,class_name:'궁성',main_character_name:'main',pve_combat_power:200,sync_status:n===1?'synced':'queued'}))};};
 c.syncBatches=async(_url,_p,updates)=>{calls.push({name:'write'});assert.equal(updates[0].characterId,101);return{ok:mode!=='partial',processedIds:mode==='foreign'?[99]:mode==='partial'?[1]:[1,2],results:[1,2].map(n=>({id:n,row:5+n,characterId:100+n}))};};
 c.app=async()=>({ok:true,readComplete:mode!=='incomplete',bridgeRole:'APPSCRIPT_MASTER',list:[1,2].map(n=>({row:5+n,characterName:'guest'+n,className:'궁성',mainCharacterName:'main',pveCombatPower:mode==='mismatch'?999:200}))});
 c.patch=async(ids,status)=>{patches.push({ids:[...ids],status});return{ok:mode!=='patch'};};
 return{c,calls,patches,handler};
}
(async()=>{
 assert(!source.includes('legacyAppendV311'));
 let f=fixture();let r=await f.handler(new Request('https://mock.invalid',{method:'POST',body:JSON.stringify(body)}));assert.equal(r.status,401);assert.equal(f.calls.length,0);
 f=fixture();r=await f.handler(new Request('https://mock.invalid',{method:'POST',headers:{authorization:'Bearer synthetic-service-key',apikey:'wrong'},body:JSON.stringify(body)}));assert.equal(r.status,401);assert.equal(f.calls.length,0);
 f=fixture();r=await f.handler(new Request('https://mock.invalid',{method:'POST',headers:{authorization:'Bearer synthetic-service-key',apikey:'synthetic-service-key'},body:JSON.stringify(body)}));assert.equal(r.status,200);assert.equal((await r.json()).updatedCount,2);
 f=fixture();assert.equal((await f.c.syncSanctuary({...body,queueSessionId:'other'})).code,'SANCTUARY_SYNC_INPUT_INVALID');assert.equal(f.calls.length,0);
 for(const [mode,code] of [['missing-id','SANCTUARY_LIST_SCOPE_DENIED'],['foreign','LIST_SYNC_UNEXPECTED_ID'],['incomplete','LIST_SHEET_READBACK_FAILED'],['mismatch','LIST_SHEET_READBACK_MISMATCH'],['patch','LIST_QUEUE_STATUS_SAVE_FAILED'],['finalize','LIST_ROW_SERVER_FINALIZE_FAILED'],['result','SANCTUARY_RESULT_SAVE_FAILED']]){f=fixture(mode);r=await f.c.syncSanctuary(body);assert.equal(r.code,code,mode);assert.notEqual(r.finished,true);}
 f=fixture('partial');r=await f.c.syncSanctuary(body);assert.equal(r.ok,false);assert.deepEqual(f.patches,[{ids:[1],status:'synced'}]);assert(!f.calls.some(x=>x.name.includes('finalize')));
 f=fixture('already');assert.equal((await f.c.syncSanctuary(body)).alreadySynced,true);assert(!f.calls.some(x=>x.name==='write'));
 f=fixture();r=await f.c.syncSanctuary(body);assert.equal(r.ok,true);r=await f.c.syncSanctuary(body);assert.equal(r.ok,true);assert(f.patches.every(p=>p.status==='synced'));
 console.log('PASS: sanctuary service-only route, scope/Master ID, metadata retries, partial preservation, read completeness, finalization/result failures and ordinary syncList retained');
})().catch(e=>{console.error(e);process.exitCode=1});
