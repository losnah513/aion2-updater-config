const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const src=fs.readFileSync('supabase/functions/character-detail-refresh/index.ts','utf8');
function context(){
 const c=vm.createContext({URL,Response,Request,Set,Map,setTimeout,clearTimeout,AbortController,console,crypto,
  Deno:{env:{get:()=>''}}});
 vm.runInContext(stripTypeScriptTypes(src.slice(0,src.indexOf('Deno.serve('))),c);return c;
}
(async()=>{
 new vm.Script(stripTypeScriptTypes(src));
 const master={id:1,server_id:2002,character_name:'before',class_name:'궁성',char_key:'123456789012345678',detail_url:'https://aion2.plaync.com/ko-kr/characters/2002/canonical'};
 const profile={charKey:master.char_key,characterName:'before',serverId:2002,className:'궁성'};
 const officialProfile={characterName:master.character_name,serverId:master.server_id,className:master.class_name,
  profileImage:'https://profileimg.plaync.com/game_profile_images/aion2/images?gameServerKey=2002&charKey='+master.char_key};
 const verified=context().assertDetailIdentity(master,{profile:officialProfile});
 assert.equal(verified.profile.charKey,master.char_key);
 assert.equal(Object.hasOwn(officialProfile,'charKey'),false,'preserve provider object');
 for(const image of [officialProfile.profileImage.replace(master.char_key,'999999999999999999'),officialProfile.profileImage.replace('profileimg.plaync.com','example.com'),officialProfile.profileImage+'&charKey='+master.char_key,'']){
  assert.throws(()=>context().assertDetailIdentity(master,{profile:{...officialProfile,profileImage:image}}),e=>e.code==='DETAIL_IDENTITY_MISMATCH');
 }
 assert.throws(()=>context().assertDetailIdentity(master,{profile:{...officialProfile,charKey:123456789012345678}}),e=>e.code==='DETAIL_IDENTITY_MISMATCH');
 for(const change of [{charKey:'other'},{serverId:2003},{characterName:'other'},{className:'치유성'},{charKey:123456789012345678}]){
  const c=context();let calls=0,writes=0;
  c.dbRows=async()=>[master];c.patchJob=async()=>{writes++;};c.officialJson=async()=>{calls++;return{profile:{...profile,...change}}};
  await assert.rejects(()=>c.initializeJob({id:'job',character_master_id:1,character_id:'untrusted'},{calls:0}),e=>e.code==='DETAIL_IDENTITY_MISMATCH');
  assert.equal(calls,1);assert.equal(writes,1); // progress only; no equipment request or collected payload
 }
 let c=context(),urls=[],patches=[];
 c.dbRows=async()=>[master];c.patchJob=async(_j,p)=>{patches.push(p);return p;};
 c.officialJson=async url=>{urls.push(url);return url.includes('/info?')?{profile:officialProfile}:{equipment:{equipmentList:[{id:10,slotPos:1,slotPosName:'MainHand'}]}};};
 const result=await c.initializeJob({id:'job',character_master_id:1,character_id:'untrusted'},{calls:0});
 assert.equal(result.phase,'EQUIPMENT');for(const url of urls)assert.equal(new URL(url).searchParams.get('characterId'),'canonical');
 assert.equal(result.base_info_payload.profile.charKey,master.char_key,'canonical key must reach the SQL write fence');
 let dispatched=0;c.findMaster=async()=>master;c.rpc=async()=>({ok:true,accepted:true,job:{id:'job'}});
 c.dispatchRun=()=>dispatched++;c.patchJob=async()=>{throw Error('start must not write around fence');};
 const start=await c.startAction({characterId:'untrusted'});assert.equal(start.identity.characterId,'canonical');assert.equal(dispatched,1);
 c=context();c.rpc=async()=>({ok:false,code:'DETAIL_STALE_WORKER'});
 await assert.rejects(()=>c.patchJob({id:'job',worker_id:'old'},{status:'completed'}),e=>e.code==='DETAIL_STALE_WORKER');
 c=context();c.patchJob=async()=>({});c.officialJson=async()=>({});
 c.detailWrite=async()=>{throw Object.assign(Error('stale'),{code:'DETAIL_STALE_WORKER'});};
 await assert.rejects(()=>c.processEquipment({id:'job',equipment_targets:[{id:10,slotPos:1,category:'weapon'}]},{calls:0}),e=>e.code==='DETAIL_STALE_WORKER');
 assert.equal(/async function dbPatch|async function dbUpsert/.test(src),false);
 console.log('PASS: Edge compile, key/server/name/class/numeric-key reject before equipment, canonical ID only, start cannot bypass fence, stale item write aborts');
})().catch(e=>{console.error(e);process.exitCode=1});
