'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'admin/js/admin-banner-library.js'),'utf8');
const functions=source.slice(source.indexOf('function managementMarkup('),source.indexOf('function renderDetail('));
const baseAsset={assetId:1,title:'sample',sourceType:'STORAGE',status:'READY',formatCode:'MAIN_16_9',referenceCount:0};
async function run({asset={},confirm=true,dirty=false,fail='',refresh=true,remove=true}={}){
  const image={...baseAsset,...asset},calls=[],messages=[];
  const S={assets:[image],selectedId:1,busy:false};
  const context={S,selected:()=>S.assets.find(a=>a.assetId===S.selectedId),dirty:()=>dirty,esc:String,titleOf:a=>a.title,formatLabel:String,window:{confirm:()=>confirm},location:{},renderDetail(){},broadcastAssets(){calls.push('broadcast')},load:async()=>refresh,announce:(m)=>messages.push(m),api:async(action,payload)=>{calls.push(action);if(action===fail)throw Object.assign(Error('request failed'),{code:'BANNER_STORAGE_DELETE_FAILED'});if(action==='asset-library')return{assets:[image]};if(action==='asset-update')return{asset:{...image,formatCode:payload.formatCode}};return{ok:true}}};
  vm.createContext(context);vm.runInContext(functions,context);
  await context.manageAsset({dataset:remove?{}:{balFormat:'SIDE_300_715'},hasAttribute:()=>remove,disabled:false});
  return{S,calls,messages,context};
}
(async()=>{
  assert.deepEqual((await run({confirm:false})).calls,[]);
  assert.deepEqual((await run({dirty:true})).calls,[]);
  for(const asset of [{referenceCount:1},{autoPoolCount:1},{formalEventCount:1},{representativeFormats:['MAIN_16_9']}]){
    const r=await run({asset});assert.deepEqual(r.calls,['asset-library']);assert.equal(r.S.assets.length,1);
    assert.match(r.context.managementMarkup({...baseAsset,...asset}),/data-bal-delete disabled/);
  }
  const deleted=await run();assert.deepEqual(deleted.calls,['asset-library','asset-archive','asset-delete','broadcast']);assert.equal(deleted.S.assets.length,0);assert.equal(deleted.S.busy,false);
  const failed=await run({fail:'asset-delete'});assert.deepEqual(failed.calls,['asset-library','asset-archive','asset-delete','asset-restore']);assert.equal(failed.S.assets.length,1);
  const changed=await run({remove:false});assert.equal(changed.S.assets[0].formatCode,'SIDE_300_715');assert.equal(changed.context.location.hash,'#images/side/library');
  const stale=await run({refresh:false});assert.match(stale.messages.at(-1),/서버 변경은 완료됐지만/);assert.equal(stale.S.assets.length,0);
  const workflow=fs.readFileSync(path.join(root,'admin/js/admin-banner-event-workflow.js'),'utf8');
  const line=workflow.split('\n').find(l=>l.startsWith("window.addEventListener('kinojo:banner-assets-updated'"));
  const s={config:{format:'MAIN_16_9'},selected:[1,2],loaded:false,root:{}};
  const ctx={states:{main:s},window:{addEventListener:(_,fn)=>ctx.receive=fn},removeSelected:(s,id)=>{s.selected=s.selected.filter(v=>v!==id)},renderBundle(){throw Error('must not render before initialization')}};
  vm.createContext(ctx);vm.runInContext(line,ctx);ctx.receive({detail:{assets:[baseAsset,{...baseAsset,assetId:2,formatCode:'SIDE_300_715'}]}});
  assert.deepEqual(s.selected,[1]);assert.equal(s.loaded,false);
  console.log('PASS banner library management: cancel, dirty, four reference guards, delete, restore, reclassify, refresh failure, workflow initialization');
})().catch(error=>{console.error(error);process.exitCode=1});
