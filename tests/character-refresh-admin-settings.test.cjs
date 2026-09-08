const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const read=p=>fs.readFileSync(p,'utf8');
(async()=>{
 const nodes=new Map(),listeners={};let calls=0,release,command;
 const A={state:{},$:s=>nodes.get(s)||null,$$:()=>[],roleLevel:()=>5,setStatus(){},formatServerTime:s=>s,toast(){},esc:s=>s,
 adminAutomation:async(c,e)=>{calls++;command={c,e};return new Promise(r=>release=r)},adminLookup:async()=>({ok:true})};
 const context=vm.createContext({window:{KinojoAdmin:A},document:{addEventListener:(e,f)=>listeners[e]=f},Date,
 sessionStorage:{getItem(){},setItem(){},removeItem(){}},localStorage:{getItem(){},setItem(){},removeItem(){}},
 setTimeout,clearTimeout});
 vm.runInContext(read('admin/js/admin-characters.js'),context);
 const a=A.refreshCharacterAutomation(),b=A.refreshCharacterAutomation();
 assert.equal(calls,1);release({ok:true,canManage:true,characterRefresh:{ok:true,enabled:true,listSheetSyncEnabled:false}});
 await Promise.all([a,b]);await A.refreshCharacterAutomation();assert.equal(calls,1);
 const list={};nodes.set('#characterAutomationListToggle',list);
 A.renderCharacterAutomation(A.state.characterAutomation);assert.equal(list.checked,false);assert.equal(list.disabled,false);
 A.state.characterAutomationCanManage=false;A.renderCharacterAutomation(A.state.characterAutomation);assert.equal(list.disabled,true);
 A.state.characterAutomationCanManage=true;
 const save=A.saveCharacterAutomation(true,true);assert.equal(command.c,'saveListWrite');assert.equal(command.e.enabled,true);
 release({ok:true,status:{canManage:true,characterRefresh:{ok:true,enabled:true,listSheetSyncEnabled:true}}});await save;
 A.renderCharacterAutomation({...A.state.characterAutomation,running:true});assert.equal(list.disabled,true);
 const before=calls;await A.saveCharacterAutomation(false,true);assert.equal(calls,before);
 let lookupCalls=0,lookupRelease;
 A.adminLookup=async()=>{lookupCalls++;return new Promise(r=>lookupRelease=r)};
 const first=A.refreshCharacterLookupStatus(),second=A.refreshCharacterLookupStatus();assert.equal(lookupCalls,1);
 A.storeLookupSession('new','synthetic');lookupRelease({ok:true,sessionId:'old',active:false});
 await Promise.all([first,second]);assert.equal(A.state.lookupSessionId,'new');assert.equal(A.state.lookupConsole,undefined);
 for(const file of ['admin/index.html','m/admin/index.html']){
  const html=read(file);
  for(const id of ['characterAutomationToggle','characterAutomationListToggle','characterLookupListToggle','characterLookupListResult'])
   assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
  assert.match(html,/자동 실행 설정/);assert.match(html,/이번 수동 실행/);
 }
 // Actual list Edge entrypoint: disabled policy must cause zero Sheet/Queue I/O and no completion marker.
 let handler,external=0;
 const edge=vm.createContext({TextEncoder,URL,URLSearchParams,Request,Response,AbortController,Intl,setTimeout,clearTimeout,
 Deno:{env:{get:()=> 'https://synthetic.invalid'},serve:fn=>handler=fn},fetch:()=>{external++;throw Error('network forbidden')}});
 vm.runInContext(stripTypeScriptTypes(read('supabase/functions/lookup-list-sync/index.ts')).replace('export {};',''),edge);
 edge.rpc=async name=>name==='kinojo_validate_updater_session'?{ok:true}:{ok:true,skipListWrite:true,listSkipReason:'USER_DISABLED'};
 edge.rest=edge.app=edge.mark=()=>{external++;throw Error('OFF side effect')};
 const response=await handler(new Request('https://synthetic.invalid',{method:'POST',body:JSON.stringify({action:'syncList',sessionId:'local',sessionToken:'synthetic'})}));
 const result=await response.json();assert.equal(result.listWriteSkipped,true);assert.equal(result.finished,false);assert.equal(external,0);
 console.log('PASS: automation single-flight/cache, independent toggle, master/running display, status single-flight+late session discard, PC/mobile controls, OFF Edge zero writes/marker');
})().catch(e=>{console.error(e);process.exitCode=1});
