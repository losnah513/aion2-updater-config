const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const read=p=>fs.readFileSync(p,'utf8');
const {createBridgeMock}=require('./helpers/list-metadata-mock.cjs');
function context(file){const c=vm.createContext({URL,URLSearchParams,TextEncoder,Response,Request,AbortController,DOMException,setTimeout,clearTimeout,Date,console});const s=read(file);vm.runInContext(stripTypeScriptTypes(s.slice(0,s.indexOf('Deno.serve('))).replace('export {};',''),c);return c;}
async function run(){
 let c=context('supabase/functions/lookup-list-sync/index.ts'),pages=[];
 c.rest=async p=>{const u=new URL('https://mock.invalid/'+p),offset=Number(u.searchParams.get('offset'));pages.push(offset);return{ok:true,data:Array.from({length:offset===0?1000:1},(_,i)=>({id:offset+i+1,sync_status:'queued'}))};};
 let r=await c.allQueuePages(new URLSearchParams({session_id:'eq.mock'}));assert.equal(r.data.length,1001);assert.deepEqual(pages,[0,1000]);
 c.rest=async()=>({ok:true,data:Array.from({length:1000},(_,i)=>({id:i+1}))});assert.equal((await c.allQueuePages(new URLSearchParams())).code,'QUEUE_PAGE_ID_CONFLICT');
 let path;c.rest=async p=>{path=p;return{ok:true};};await c.patch([1],'failed','error');assert.match(path,/sync_status=neq.synced/);
 console.log('PASS: complete 1001-row paging, duplicate page rejection, failure PATCH cannot downgrade synced');
 c=context('supabase/functions/character-refresh-worker/index.ts');
 c.fetch=async (_u,opt)=>({ok:true,status:200,text:()=>new Promise((_resolve,reject)=>opt.signal.addEventListener('abort',()=>reject(Error('body blocked'))))});
 await assert.rejects(()=>c.boundedServerFetch('https://mock.invalid',{},5),e=>e.code==='SERVER_CALL_TIMEOUT');
 console.log('PASS: Worker timeout covers response body, not just headers');
 const bridge=createBridgeMock(read('apps-script/list-master/BRIDGE.gs'));
 const update={id:1,characterId:1,listRow:6,originalListName:'before',characterName:'before_D',listDisplayName:'before_D',identityChanged:true,className:'궁성',listStatus:'삭제후보'};
 assert.equal(bridge.write([update]).ok,true);assert.equal(bridge.cells[5][7],'삭제후보');
 assert.equal(bridge.write([update]).ok,true);assert.equal(bridge.cells[5][7],'삭제후보');
 assert.equal(bridge.write([{...update,originalListName:'before_D',characterName:'restored',listDisplayName:'restored',listStatus:''}]).ok,true);assert.equal(bridge.cells[5][7],'');
 console.log('PASS: _D and H deletion marker write/retry/explicit restore');
 c=context('supabase/functions/character-identity-recovery/index.ts');
 const prepared={characterId:1,current:{serverId:2002,characterName:'old'}};
 const candidate={serverId:2003,characterName:'new',charKey:'123456789012345678'};
 let urls=[];c.directKeyInfo=async url=>{const u=new URL(url);urls.push(u);return{list:[{serverId:Number(u.searchParams.get('serverId')),characterName:u.searchParams.get('keyword'),charKey:u.searchParams.get('keyword')==='old'?'222222222222222222':candidate.charKey}]};};
 r=await c.verifyNameSlots(prepared,candidate,Date.now()+1000);assert.equal(r.length,2);assert.equal(r[0].sameKey,false);assert.equal(r[1].sameKey,true);
 assert.deepEqual(urls.map(x=>x.searchParams.get('keyword')),['old','new']);
 c.directKeyInfo=async()=>({list:[{serverId:2003,characterName:'new',charKey:'wrong'}]});
 await assert.rejects(()=>c.verifyNameSlots(prepared,candidate,Date.now()+1000));
 let mutations=0;c.verifyNameSlots=async()=>[];
 c.rpc=async name=>{if(name==='kinojo_identity_collision_owner')return{characterId:2};if(name.includes('prepare'))return{ok:true,characterId:2};mutations++;throw Error('unexpected mutation');};
 c.probe=async()=>({candidate:null,evidence:{scanComplete:false,code:'PROVIDER_RETRY_REQUIRED'}});
 await assert.rejects(()=>c.adminIdentityChanges('local-fixture',prepared,{candidate}));assert.equal(mutations,0);
 let ack=0;c.rpc=async(name)=>{if(name.includes('pending'))return{ok:true,items:[{queueId:1,queueRevision:'revision',id:1,listRow:6}]};ack++;return{ok:true};};
 c.syncList=async()=>({ok:false});r=await c.flushAdminIdentityList('local-fixture',1);assert.equal(r.ok,false);assert.equal(ack,0);
 console.log('PASS: old and new name checks, namesake rejection, incomplete collision causes no apply, failed list stays pending');
}
run().catch(e=>{console.error(e);process.exitCode=1});
