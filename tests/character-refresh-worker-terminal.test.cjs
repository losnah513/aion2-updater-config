const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('supabase/functions/character-refresh-worker/index.ts','utf8');
const section=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
(async()=>{
 for(const [result,expected] of [
  [{ok:true,done:true,completed:false,failed:true,allFailed:true},'failed'],
  [{ok:true,done:true,completed:false,failed:true,finalFailure:true},'failed'],
  [{ok:true,done:true,completed:false},'failed'],
  [{ok:true,done:true,completed:true},'completed'],
  [{ok:true,completed:true,partialSuccess:true},'completed'],
  [{ok:true,completed:true,failed:true},'failed']
 ]){
  const calls=[],ctx=vm.createContext({clean:v=>String(v||''),object:v=>v||{},crypto:{randomUUID:()=> 'synthetic'},
   handoff:async()=>{},finishScheduledAutomation:async(...args)=>calls.push(args),
   runQueue:async()=>({json:async()=>result}),dispatchAutonomousTick:()=>{throw Error('unexpected dispatch');}});
  vm.runInContext(section('async function runAutonomousTick','async function startAutonomous'),ctx);
  await ctx.runAutonomousTick({sessionId:'synthetic',sessionToken:'synthetic'});
  assert.equal(calls[0][1],expected);
  if(result.partialSuccess)assert.match(calls[0][2],/일부 캐릭터 조회 실패/);
 }
 let waited=0;
 const ctx=vm.createContext({rpc:async()=>({ok:true,allowed:true,waitMs:12000}),sleep:async ms=>waited=ms});
 vm.runInContext(section('async function officialRateGate','async function officialJson'),ctx);
 await ctx.officialRateGate('synthetic','synthetic','synthetic');assert.equal(waited,12000);
 console.log('PASS: terminal success/failure/partial result matrix; full DB rate reservation honored');
})().catch(e=>{console.error(e);process.exitCode=1});
