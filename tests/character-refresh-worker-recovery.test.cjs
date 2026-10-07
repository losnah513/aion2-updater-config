// No network or production writes: execute the real worker with synthetic queue adapters.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('supabase/functions/character-refresh-worker/index.ts','utf8');
function worker(){
 const calls={dispatch:[],finish:[],handoff:[],queue:0};
 const ctx=vm.createContext({Response,Request,Headers,URL,AbortController,Date,setTimeout,clearTimeout,
  crypto:{randomUUID:()=> 'synthetic'},Deno:{env:{get:()=> 'synthetic'},serve:handler=>calls.handler=handler}});
 vm.runInContext(source,ctx);
 ctx.handoff=async(...args)=>{calls.handoff.push(args);return {ok:true};};
 ctx.finishScheduledAutomation=async(...args)=>calls.finish.push(args);
 ctx.dispatchAutonomousTick=(...args)=>calls.dispatch.push(args);
 ctx.runQueue=async()=>{calls.queue++;return new Response(JSON.stringify({ok:true,hasMore:true}));};
 return {ctx,calls,tick:body=>ctx.runAutonomousTick({sessionId:'synthetic',sessionToken:'synthetic',...body})};
}
const timeout={code:'SUPABASE_RPC_FAILED',sqlState:'57014',httpStatus:500,retryable:true,message:'statement timeout'};
(async()=>{
 // Every diagnostic write fails; queue continuation and canonical completion still run.
 for(const result of [{ok:true,hasMore:true},{ok:true,completed:true},{ok:true,done:true,failed:true},{ok:true,paused:true},{ok:true,cancelled:true}]){
  const w=worker();w.ctx.handoff=async()=>{throw timeout;};w.ctx.runQueue=async()=>new Response(JSON.stringify(result));await w.tick();
  assert.equal(w.calls.dispatch.length,result.hasMore?1:0);
  assert.equal(w.calls.finish.length,result.hasMore?0:1);
  if(result.completed)assert.equal(w.calls.finish[0][1],'completed');
 }
 // Claim throws before runQueue's catch; response-form failures follow the same bounded path.
 for(const mode of ['throw','response'])for(let attempt=0;attempt<=3;attempt++){
  const w=worker();w.ctx.runQueue=async()=>{if(mode==='throw')throw timeout;return new Response(JSON.stringify({ok:false,...timeout}));};
  await w.tick({recoveryAttempt:attempt});
  assert.equal(w.calls.dispatch.length,attempt<3?1:0);
  assert.equal(w.calls.finish.length,attempt===3?1:0);
  if(attempt<3){assert.equal(w.calls.dispatch[0][4],attempt+1);assert.equal(w.calls.dispatch[0][3],5000*(attempt+1));}
 }
 // Never bypass another worker's lease. Only recovery ticks wait for expiry.
 for(const attempt of [0,1,3]){
  const w=worker();w.ctx.runQueue=async()=>new Response(JSON.stringify({ok:true,acquired:false,busy:true,leaseUntil:new Date(Date.now()+60000).toISOString()}));
  await w.tick({recoveryAttempt:attempt});assert.equal(w.calls.dispatch.length,attempt===1?1:0);
  if(attempt===1){assert(w.calls.dispatch[0][3]>=59000);assert.equal(w.calls.dispatch[0][4],2);}
  assert.equal(w.calls.finish.length,attempt===3?1:0);
 }
 // Permanent/auth/configuration failures never reschedule; progress resets a prior recovery budget.
 for(const error of [{...timeout,retryable:false},{code:'SUPABASE_RPC_FAILED',sqlState:'42501',httpStatus:403},{code:'UNEXPECTED',message:'bug'}]){
  const w=worker();w.ctx.runQueue=async()=>{throw error;};await w.tick();assert.equal(w.calls.dispatch.length,0);assert.equal(w.calls.finish.length,1);
 }
 const denied=worker();denied.ctx.handoff=async()=>({ok:false,code:'INVALID_SESSION'});await denied.tick();assert.equal(denied.calls.queue,0);assert.equal(denied.calls.dispatch.length,0);
 // Completion can invalidate the session before its final diagnostic write. Preserve the result/message.
 for(const terminal of [{ok:true,completed:true},{ok:true,done:true,failed:true},{ok:true,cancelled:true},{ok:true,paused:true}]){
  const w=worker();let first=true;w.ctx.handoff=async()=>{if(first){first=false;return {ok:true};}return {ok:false,code:'INVALID_SESSION',message:'expired diagnostic'};};
  w.ctx.runQueue=async()=>new Response(JSON.stringify(terminal));await w.tick();
  assert.equal(w.calls.finish.length,1);assert.equal(w.calls.finish[0][1],terminal.completed?'completed':'failed');
  assert(!w.calls.finish[0][2].includes('expired diagnostic'));assert.equal(w.calls.dispatch.length,0);
 }
 const resumed=worker();await resumed.tick({recoveryAttempt:3});assert.equal(resumed.calls.dispatch[0].length,4);
 // Replay uses the queue's persisted checkpoint: completed targets are never reprocessed.
 const replay=worker(),pending=['b','c'],processed=['a'];let interrupted=true;
 replay.ctx.runQueue=async()=>{if(interrupted){interrupted=false;throw timeout;}processed.push(pending.shift());return new Response(JSON.stringify({ok:true,hasMore:pending.length>0,completed:pending.length===0}));};
 await replay.tick();await replay.tick({recoveryAttempt:1});await replay.tick();assert.deepEqual(processed,['a','b','c']);assert.equal(replay.calls.finish.at(-1)[1],'completed');
 // RPC retains SQLSTATE + HTTP status, including permission rejection.
 for(const [status,sqlState,retryable] of [[500,'57014',true],[409,'40001',true],[403,'42501',false]]){
  const w=worker();w.ctx.boundedServerFetch=async()=>({ok:false,status,text:async()=>JSON.stringify({code:sqlState,message:'synthetic'})});
  await assert.rejects(w.ctx.rpc('synthetic',{}),e=>e.sqlState===sqlState&&e.httpStatus===status&&e.retryable===retryable);
 }
 // Detached receiver acknowledges without a fallible diagnostic DB write before recovery.
 const receiver=worker();receiver.ctx.internalRequest=()=>true;let tasks=[];
 receiver.ctx.EdgeRuntime={waitUntil:task=>tasks.push(task)};receiver.ctx.runAutonomousTick=async()=>{};
 receiver.ctx.handoff=async()=>{throw Error('receiver must not write');};
 const response=await receiver.calls.handler(new Request('https://synthetic.invalid',{method:'POST',body:JSON.stringify({action:'autonomousTick',sessionId:'synthetic',sessionToken:'synthetic'})}));
 assert.equal(response.status,202);await Promise.all(tasks);
 receiver.ctx.internalRequest=()=>false;
 const forbidden=await receiver.calls.handler(new Request('https://synthetic.invalid',{method:'POST',body:JSON.stringify({action:'autonomousTick'})}));assert.equal(forbidden.status,403);
 // The recovery counter survives self-handoff transport and delays remain bounded.
 const transport=worker();let sent,waited;transport.ctx.setTimeout=(fn,ms)=>{waited=ms;fn();return 0;};transport.ctx.callEdge=async(_name,body)=>{sent=body;return {ok:true};};
 await transport.ctx.scheduleAutonomousTick('synthetic','synthetic','synthetic',999999,2);assert.equal(waited,120000);assert.equal(sent.recoveryAttempt,2);
 console.log('PASS: transient diagnostics, claim/response recovery bounds, lease expiry, terminal/auth guards, checkpoint replay, RPC metadata, detached receiver and counter transport');
})().catch(e=>{console.error(e);process.exitCode=1;});
