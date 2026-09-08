const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||'tests/fixtures/extension-reference/updater/updater.js','utf8');
(async()=>{
 let response={active:false,session:{status:'expired'}},running='true',stopped=false,calls=0;
 const noop=()=>{},context=vm.createContext({window:{
  KINOJO_SUPABASE:{serverQueueStatus:async()=>{calls++;return await response;}},
  AION2_CONFIG:{KEYS:{RUNNING:'running'}},AION2_UI:{updateButtonState:noop,updateStatusBox:noop,pushTaskLog:noop}
 },localStorage:{setItem:(_k,v)=>running=v},document:{getElementById:()=>null},console});
 vm.runInContext(source,context);
 const updater=context.window.AION2_UPDATER;
 let session='synthetic';
 Object.assign(updater,{isServerEngineMode_:()=>true,getSessionId:()=>session,getRuntimePassCode_:()=>'',getServerSessionToken_:()=>'',stopServerProgressPolling_:()=>stopped=true});
 for(const status of ['completed','failed','cancelled','expired']){
  running='true';stopped=false;response={active:false,session:{status}};
  await updater.captureServerDebugSnapshot_('poll');assert.equal(running,'false');assert.equal(stopped,true);
 }
 let release;response=new Promise(resolve=>release=resolve);calls=0;running='true';stopped=false;
 const first=updater.captureServerDebugSnapshot_('poll');
 await updater.captureServerDebugSnapshot_('poll');assert.equal(calls,1);
 session='new-session';release({active:false,session:{status:'completed'}});await first;
 assert.equal(running,'true');assert.equal(stopped,false);assert.equal(updater.serverProgressPollInFlight_,false);
 console.log('PASS: full updater source loads, four terminal states, single in-flight poll, late previous-session response ignored');
})().catch(e=>{console.error(e);process.exitCode=1});
