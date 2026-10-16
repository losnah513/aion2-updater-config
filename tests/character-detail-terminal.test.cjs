const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync('supabase/functions/character-detail-refresh/index.ts','utf8');
function context(){
 const c=vm.createContext({URL,Response,Request,Set,Map,setTimeout,clearTimeout,AbortController,console,crypto,Deno:{env:{get:()=>''}}});
 vm.runInContext(stripTypeScriptTypes(source.slice(0,source.indexOf('Deno.serve('))),c);return c;
}
(async()=>{
 for(const failed of [0,1]){
  const c=context(),writes=[];
  const job={id:'job',worker_id:'owner',status:'running',phase:'DAEVANION',daevanion_targets:[{id:1,name:'board'}],daevanion_done:0,daevanion_failed:0,weapon_failed:0};
  c.officialJson=async()=>{if(failed)throw Error('provider failure');return{};};
  c.detailWrite=async()=>({ok:true});
  c.patchJob=async(j,p)=>{writes.push(p);return{...j,...p};};
  const done=await c.processDaevanion(job,{calls:0});
  const terminal=writes.filter(p=>p.phase==='COMPLETE');
  assert.equal(terminal.length,1);assert.equal(terminal[0].status,failed?'partial_failed':'completed');
  assert.equal(terminal[0].daevanion_cursor,1);assert.equal(terminal[0].worker_id,null);
  assert.ok(terminal[0].completed_at);assert.ok(terminal[0].cooldown_until);
  assert.equal(done.daevanion_done,failed?0:1);assert.equal(done.daevanion_failed,failed);
  assert.equal(writes.some(p=>p.phase==='COMPLETE'&&!p.status),false,'no running/COMPLETE checkpoint');
  // A terminal row returned after the final batch must not be finalized again
  // using the now-cleared worker ID.
  c.rpc=async()=>({ok:true,acquired:true});c.getJob=async()=>({...job,worker_id:'new-worker'});
  c.crypto={randomUUID:()=> 'id'};c.getJob=async()=>({...job,worker_id:'detail-id'});
  c.processDaevanion=async()=>done;c.completeJob=async()=>{throw Error('double finalization');};
  c.dispatchRun=()=>{throw Error('terminal redispatch');};
  assert.equal((await c.runJob('job')).done,true);
 }
 // No boards still needs a terminal write; old COMPLETE checkpoints remain
 // finishable by their reclaimed owner.
 const c=context(),writes=[];
 c.patchJob=async(j,p)=>{writes.push(p);return{...j,...p};};
 const result=await c.processDaevanion({id:'empty',worker_id:'owner',daevanion_targets:[]},{calls:3});
 assert.equal(result.status,'completed');assert.equal(result.request_count,3);assert.equal(writes.length,1);
 assert.equal((await c.completeJob({id:'legacy',worker_id:'reclaimed',phase:'COMPLETE',armor_failed:1})).status,'partial_failed');
 console.log('PASS: atomic final counters/terminal status; partial failures; zero boards; no second fenced write; legacy COMPLETE recovery');
})().catch(e=>{console.error(e);process.exitCode=1;});
