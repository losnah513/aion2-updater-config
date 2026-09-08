const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
(async()=>{
 let requests=0,timeout=0,now=100,gate={ok:true,allowed:true,waitMs:2000};
 const ctx=vm.createContext({TextEncoder,URL,Request,Response,AbortController,Date:{now:()=>now},
 setTimeout:(_f,ms)=>(timeout=ms,1),clearTimeout(){},console,
 Deno:{serve(){},env:{get:()=> 'synthetic'}},fetch:async()=>{requests++;return {ok:true,status:200,text:async()=> '{"ok":true}'}}});
 vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/character-refresh-worker/index.ts','utf8')).replace('export {};',''),ctx);
 await ctx.rpc('fixture',{},150);assert.equal(timeout,50);assert.equal(requests,1);
 now=151;await assert.rejects(ctx.rpc('fixture',{},150),e=>e.code==='TARGET_TIME_BUDGET_EXCEEDED');assert.equal(requests,1);
 ctx.rpc=async()=>gate;
 await assert.rejects(ctx.officialRateGate('test','test','fixture',200),e=>e.code==='PLAYNC_RATE_PAUSED'&&e.rateLimited===true);
 assert.equal(requests,1);
 console.log('PASS: remaining target budget caps response-body timeout; expired budget starts no I/O; reserved wait never shortened');
})().catch(e=>{console.error(e);process.exitCode=1});
