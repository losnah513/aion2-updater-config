// Read-only verification of product sources. All transport, sheets and DB data are local mocks.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {PGlite}=require('../.codex-test-runtime/node_modules/@electric-sql/pglite');
const root=path.resolve(__dirname,'..');
const source=p=>fs.readFileSync(path.join(root,p),'utf8');
const results=[];
function check(name,condition,detail){results.push({name,pass:Boolean(condition),detail});}
const {createBridgeMock}=require('./helpers/list-metadata-mock.cjs');
function bridge(move=false){return createBridgeMock(source('apps-script/list-master/BRIDGE.gs'),{move});}
async function edge({already=false,recordOk=true,readComplete=true}={}){
 let handler;
 const ctx=vm.createContext({TextEncoder,URL,URLSearchParams,Request,Response,AbortController,Intl,setTimeout,clearTimeout,
  fetch:()=>{throw Error('External transport forbidden')},
  Deno:{env:{get:()=> 'https://synthetic.invalid'},serve(fn){handler=fn}}});
 vm.runInContext(stripTypeScriptTypes(source('supabase/functions/lookup-list-sync/index.ts')).replace('export {};',''),ctx);
 ctx.rpc=async()=>({ok:true});
 ctx.rest=async p=>({ok:true,data:[{id:1,character_id:1,list_row:6,list_original_name:'name',character_name:'name',main_character_name:'main',class_name:'궁성',sync_status:already?'synced':'queued'}]});
 ctx.app=async(_url,p)=>p.action==='serverBridgeHealth'?{ok:true,metadataWriteContract:'MASTER_ID_V1'}:p.action==='serverListSheetSync'?{ok:true,metadataWriteContract:'MASTER_ID_V1',processedIds:[1],results:[{id:1,row:6,ok:true}]}:{ok:true,bridgeRole:'APPSCRIPT_MASTER',readComplete,list:[{row:6,originalName:'name',mainCharacterName:'main',className:'궁성'}]};
 ctx.patch=async()=>({ok:true});ctx.record=async()=>({ok:recordOk});ctx.mark=async()=>({ok:true});
 const response=await handler(new Request('https://synthetic.invalid',{method:'POST',body:JSON.stringify({action:'syncList',sessionId:'LOCAL-MOCK',sessionToken:'LOCAL-MOCK',expectedQueuedCount:1})}));
 return response.json();
}
async function run(){
 const update={id:1,characterId:1,listRow:6,originalListName:'before',characterName:'after',listDisplayName:'after',identityChanged:true,className:'궁성',mainCharacterName:'main',pveItemLevel:100,pveCombatPower:200};
 let b=bridge();let first=b.write([update]),second=b.write([update]);
 check('Identical rename Queue retry completes idempotently',first.ok===true&&second.ok===true,{first:first.ok,retry:second.ok,retryFailures:second.failedItems});
 b=bridge(true);const moved=b.write([{...update,characterName:'before',listDisplayName:'before',identityChanged:false,pveCombatPower:300}]);
 check('Row movement cannot overwrite another character stats',moved.ok===true&&b.cells.find(r=>r[0]==='unrelated')[3]===999&&b.cells.find(r=>r[0]==='before')[3]===300,{bridgeOk:moved.ok,unrelatedPower:b.cells.find(r=>r[0]==='unrelated')[3]});
 const partial=await edge({readComplete:false});
 check('Explicitly incomplete readback never completes session',partial.finished!==true,{ok:partial.ok,finished:partial.finished});
 const failedRecord=await edge({already:true,recordOk:false});
 check('Already-synced branch requires successful server completion record',failedRecord.finished!==true&&failedRecord.ok!==true,{ok:failedRecord.ok,finished:failedRecord.finished,serverRecord:failedRecord.serverRecord});
 const normal=await edge();check('Normal complete readback completes session',normal.ok===true&&normal.finished===true,{ok:normal.ok});
 const db=new PGlite();
 try{
  const existing=source('tests/character-refresh-stability-sql.test.cjs');
  const setup=existing.match(/await db\.exec\(`([\s\S]*?)`\);/)[1];
  await db.exec(setup);
  await db.exec(source('supabase/migrations/20260908053907_character_refresh_identity_and_list_guards.sql'));
  await db.exec(source('supabase/migrations/20260908060546_character_refresh_retry_generation_guards.sql'));
  const catalog=[{serverId:2002,serverName:'old',serverShortName:'o',raceId:2},{serverId:2003,serverName:'new',serverShortName:'n',raceId:2}];
  let generation;
  const cp=async(done=null,matches=null,g=generation)=>{
   const value=(await db.query('select public.kinojo_identity_scan_checkpoint_v2(1,$1,$2,$3,$4,$5) as value',['123456789012345678',JSON.stringify(catalog),done===null?null:JSON.stringify(done),matches===null?null:JSON.stringify(matches),g||null])).rows[0].value;
   if(done===null&&value.ok)generation=value.generation;
   return value;
  };
  await cp();await cp([2002],[]);const oldGeneration=generation;
  await db.exec("update private.character_identity_scan_checkpoints set expires_at=now()-interval '1 second'");
  const restarted=await cp();
  const late=await cp([2002,2003],[{serverId:2003,charKey:'123456789012345678',characterName:'stale'}],oldGeneration);
  const state=await cp();
  check('Expired generation late writer cannot contaminate new scan',late.ok!==true&&state.completed.length===0,{restarted:restarted.completed,lateAccepted:late.ok,completed:state.completed});
  await db.exec(`
   alter table public.character_master add character_name text,add updated_at timestamptz,
    add lookup_excluded boolean,add exclusion_reason text,add detail_url text,
    add latest_pve_item_level numeric,add latest_pve_combat_power numeric,
    add latest_pvp_item_level numeric,add latest_pvp_combat_power numeric,add last_synced_at timestamptz;
   alter table public.lookup_session_targets add session_id text,add server_id int,
    add server_name text,add character_name text,add main_character_name text,
    add class_name text,add lookup_order int,add list_row int;
   create function public.kinojo_validate_updater_session(text,text) returns jsonb language sql
    as 'select jsonb_build_object(''ok'',true)'; -- Local routing stub; NOT an authentication/security test.
   create function public.kinojo_normalize_character_name(text) returns text language sql
    as 'select lower(trim($1))';
   insert into public.lookup_session_targets values(1,'LOCAL-MOCK',2002,'old','name','main','궁성',1,6);
  `);
  for(const scenario of [
   {name:'name_D',excluded:false,reason:null,label:'Suffix-only exclusion'},
   {name:'name',excluded:true,reason:'탈퇴',label:'Explicit DB exclusion'},
   {name:'name',excluded:false,reason:'삭제후보',label:'Persisted deletion reason without suffix'},
   {name:'name',excluded:false,reason:null,label:'Normal target',normal:true},
  ]){
   await db.query('update character_master set character_name=$1,lookup_excluded=$2,exclusion_reason=$3',[scenario.name,scenario.excluded,scenario.reason]);
   await db.query('update lookup_session_targets set character_name=$1',[scenario.name]);
   const context=(await db.query("select public.kinojo_server_queue_target_context_v270('LOCAL-MOCK','LOCAL-MOCK',1) as value")).rows[0].value;
   if(scenario.normal){check(scenario.label,context.ok===true,{ok:context.ok});continue;}
   let providerCalls=0,otherRpcCalls=0,errorCode='';
   const worker=vm.createContext({console:{info(){}},URL,AbortController,setTimeout,clearTimeout});
   const workerSource=source('supabase/functions/character-refresh-worker/index.ts');
   vm.runInContext(workerSource.slice(0,workerSource.indexOf('Deno.serve(')),worker);
   worker.rpc=async name=>{if(name==='kinojo_server_queue_target_context_v270')return context;otherRpcCalls++;throw Error('Unexpected RPC');};
   worker.officialJson=async()=>{providerCalls++;throw Error('External transport forbidden');};
   try{await worker.processTarget('LOCAL-MOCK','LOCAL-MOCK',{targetId:1,lookupOrder:1});}catch(e){errorCode=e.code;}
   check(scenario.label+' blocks Worker before API',context.code==='LOOKUP_EXCLUDED'&&errorCode==='LOOKUP_EXCLUDED'&&providerCalls===0&&otherRpcCalls===0,{contextCode:context.code,errorCode,providerCalls,otherRpcCalls});
  }
 }finally{await db.close();}
 for(const result of results)console.log(JSON.stringify(result));
 const failed=results.filter(r=>!r.pass).length;
 console.log(JSON.stringify({total:results.length,passed:results.length-failed,failed}));
 process.exitCode=failed?1:0;
}
run().catch(e=>{console.error(e.message);process.exitCode=1});
