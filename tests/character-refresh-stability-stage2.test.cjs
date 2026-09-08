const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
const key = '123456789012345678'; // Synthetic string, not a production identity.
const servers = [{serverId:2002,serverName:'old',serverShortName:'o',raceId:2},{serverId:2003,serverName:'new',serverShortName:'n',raceId:2}];
const prepared = {characterId:1,charKey:key,raceId:2,current:{characterName:'before',className:'궁성'},servers};
const profile = (serverId=2003, changes={}) => ({profile:{characterName:'after',characterId:'encrypted=',serverId,raceId:2,className:'궁성',charKey:key,...changes}});
function identity(get, checkpoint={ok:true,completed:[],matches:[]}) {
  const code = read('supabase/functions/character-identity-recovery/index.ts');
  const ctx = vm.createContext({URL,Error,Date,Set,Map,setTimeout,clearTimeout,AbortController,DOMException});
  vm.runInContext(code.slice(0,code.indexOf('Deno.serve(')),ctx);
  ctx.rpc = async (name,args) => name.includes('checkpoint') ? checkpoint : {ok:true,allowed:true,waitMs:0};
  ctx.fetchJson = get;
  return ctx;
}
async function run() {
  let calls=[];
  let ctx=identity(async url=>{const u=new URL(url);calls.push(u);return u.searchParams.get('serverId')==='2002'?{profile:{}}:profile()});
  let result=await ctx.probe(prepared);
  assert.equal(result.candidate.characterName,'after');
  assert.equal(result.evidence.detailRevalidated,true);
  assert.equal(calls.length,3);
  assert.equal(calls[0].searchParams.get('characterId'),key);
  assert.equal(calls[2].searchParams.get('characterId'),'encrypted=');
  assert.equal(result.evidence.reviewCandidates.length,0);
  for(const [changes,code] of [[{className:'치유성'},'DIRECT_KEY_CLASS_MISMATCH'],[{charKey:'123456789012345679'},'DIRECT_KEY_IDENTITY_MISMATCH'],[{raceId:1},'DIRECT_KEY_IDENTITY_MISMATCH']]) {
    ctx=identity(async()=>profile(2002,changes));result=await ctx.probe(prepared);
    assert.equal(result.candidate,null);assert.equal(result.evidence.code,code);assert.equal(result.evidence.retryable,false);
  }
  ctx=identity(async url=>profile(Number(new URL(url).searchParams.get('serverId'))));
  result=await ctx.probe(prepared);assert.equal(result.evidence.code,'DIRECT_KEY_MULTIPLE_MATCHES');assert.equal(result.candidate,null);
  ctx=identity(async()=>({profile:{}}));result=await ctx.probe(prepared);
  assert.equal(result.evidence.code,'NOT_FOUND_BY_CHAR_KEY');assert.equal(result.evidence.confirmedAbsent,false);
  ctx=identity(async()=>({}));result=await ctx.probe(prepared);assert.equal(result.evidence.retryable,true);
  ctx=identity(async()=>{throw new ctx.ProviderError('rate',429,30000)});
  // Class declarations are lexical; construct the provider error in its own context.
  ctx.fetchJson=async()=>{throw vm.runInContext('new ProviderError("rate",429,30000)',ctx)};
  result=await ctx.probe(prepared);assert.equal(result.evidence.retryable,true);assert.equal(result.evidence.scanComplete,false);
  calls=[];ctx=identity(async url=>{calls.push(url);return profile()},{ok:true,completed:[2002],matches:[]});
  result=await ctx.probe(prepared);assert.equal(calls.length,2);assert.equal(result.candidate.charKey,key);
  calls=[];ctx=identity(async url=>{calls.push(url);return profile()});
  result=await ctx.probe({...prepared,charKey:Number(key)});assert.equal(calls.length,0);assert.equal(result.candidate,null);
  const listCode=stripTypeScriptTypes(read('supabase/functions/lookup-list-sync/index.ts'));
  const listCtx=vm.createContext({TextEncoder,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,Intl});
  vm.runInContext(listCode.slice(0,listCode.indexOf('Deno.serve(')),listCtx);
  const mapped=listCtx.mapRows([{id:1,list_row:6,list_original_name:'before',list_display_name:'after',character_name:'after',identity_changed:true,main_character_renamed:true,previous_character_name:'before',main_character_name:'main',class_name:'궁성',pve_item_level:100}]);
  assert.equal(mapped[0].identityChanged,true);assert.equal(mapped[0].mainCharacterRenamed,true);
  let verified=listCtx.verify(mapped,[{row:6,originalName:'after',className:'궁성',mainCharacterName:'main',pveItemLevel:100}],[1]);
  assert.deepEqual(plain(verified.verifiedIds),[1]);
  verified=listCtx.verify(mapped,[{row:6,originalName:'before',className:'궁성',mainCharacterName:'wrong',pveItemLevel:100}],[1]);
  assert(verified.failedItems[0].message.includes('A 캐릭터명'));assert(verified.failedItems[0].message.includes('G 본캐명'));
  mapped[0].identityChanged=false;
  verified=listCtx.verify(mapped,[{row:6,originalName:'before',className:'궁성',mainCharacterName:'main',pveItemLevel:100}],[1]);
  assert.deepEqual(plain(verified.verifiedIds),[1]);
  const bridge=read('apps-script/list-master/BRIDGE.gs');
  new vm.Script(bridge);
  const cells=Array.from({length:8},()=>Array(8).fill(''));
  cells[5]=['before','궁성',100,200,'','','wrong','삭제후보'];
  cells[6]=['other','궁성',100,200,'','','before',''];
  const writes=[];
  const sheet={getLastRow:()=>8,getLastColumn:()=>8,getName:()=>'list',getRange(r,c,n,w){return {getValues:()=>cells.slice(r-1,r-1+n).map(x=>x.slice(c-1,c-1+w)),setValues(v){writes.push({r,c,n,w});v.forEach((row,i)=>row.forEach((x,j)=>cells[r-1+i][c-1+j]=x));}}}};
  const bridgeCtx=vm.createContext({LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},SpreadsheetApp:{flush(){}}});
  vm.runInContext(bridge,bridgeCtx);
  bridgeCtx.kinojoGetListSheet_=()=>({sheet,ss:{getId:()=>'LOCAL-SYNTHETIC'}});
  mapped[0].identityChanged=true;
  let synced=bridgeCtx.kinojoHandleServerListSheetSync_({updates:mapped},'POST');
  assert.equal(synced.ok,true);
  const readback=bridgeCtx.kinojoHandleServerListSheetRead_({},'GET');
  assert.equal(readback.readComplete,true);assert.equal(readback.list[0].status,'삭제후보');
  assert.equal(cells[5][0],'after');assert.equal(cells[5][6],'main');assert.equal(cells[6][6],'before');
  assert.deepEqual(plain(listCtx.verify(mapped,readback.list,[1]).verifiedIds),[1]);
  const writesBefore=writes.length;
  synced=bridgeCtx.kinojoHandleServerListSheetSync_({updates:[{...mapped[0],originalListName:'after'}]},'POST');
  assert.equal(synced.ok,true);assert.equal(writes.length,writesBefore);
  synced=bridgeCtx.kinojoHandleServerListSheetSync_({updates:[{...mapped[0],originalListName:''}]},'POST');
  assert.equal(synced.ok,false);assert.equal(writes.length,writesBefore);
  assert(bridge.includes("status: String(row[cfg.COL_STATUS - 1] || '').trim()"));
  assert(bridge.includes('if (mainCharacterName) {'));
  assert(!bridge.includes('values.forEach(function(targetRow, targetIndex)'));
  assert(bridge.includes('LIST_ORIGINAL_IDENTITY_REQUIRED'));
  assert(listCode.includes('LIST_QUEUE_STATUS_SAVE_FAILED'));
  console.log('PASS: direct-key discovery, mismatch/race/class, incomplete scan, checkpoint resume, list rename/G/readback contracts');
}
run().catch(e=>{console.error(e);process.exitCode=1});
