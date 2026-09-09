'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../admin/js/admin-banner-event-workflow.js'),'utf8');
const functions=source.split(/\r?\n/).filter(line=>/^async function (compositeBlob|publishWorkflow)\(/.test(line)).join('\n');
(async()=>{
 let sizes=[900000,700000,500000],qualities=[],uploads=[],published=0,failure=false;
 const canvas={getContext:()=>({}),toBlob(callback,type,quality){qualities.push(quality);callback({type,size:sizes.length>1?sizes.shift():sizes[0]});}};
 const noop=()=>{};
 const context={document:{createElement:()=>canvas},usableAssets:()=>[{assetId:1},{assetId:2}],overlayLayers:()=>[],drawCover:noop,loadCanvasImage:async()=>({}),assetUrl:()=>'/original.png',drawContentLayer:async()=>{},Error,Number,Set,String,MAX_BYTES:5242880,validatePublish:()=>null,focusIssue:noop,renderActions:noop,saveDraft:async()=>true,eventPayload:()=>({variants:[{items:[{assetId:1},{assetId:2},{assetId:1}]}]}),uploadComposite:async(_s,id,blob)=>{if(failure)throw Error('upload failed');uploads.push({id,size:blob.size});},actionNote:noop,api:async(_s,action)=>{if(action==='event-publish'){published++;return{event:{}};}return{events:[{eventGroupId:'group',status:'PUBLISHED'}]};},resetWorkflow:noop};
 vm.createContext(context);vm.runInContext(functions,context);
 const s={kind:'main',config:{width:1536,height:864},bundleName:'test',eventGroupId:'group'};
 let blob=await context.compositeBlob(s,1);assert.equal(blob.size,500000);assert.equal(qualities.length,3,'quality adapts to 600KB budget');
 sizes=[700000];await assert.rejects(context.compositeBlob(s,1),/600KB/);
 sizes=[100000];qualities=[];await context.publishWorkflow(s);assert.deepEqual(uploads.map(x=>x.id),[1,2],'plain assets get deduplicated delivery derivatives');assert.equal(published,1);
 failure=true;published=0;await context.publishWorkflow(s);assert.equal(published,0,'failed derivative must prevent publish');
 sizes=[160000];await assert.rejects(context.compositeBlob({...s,kind:'side'},1),/150KB/);
 console.log('Banner delivery publish plain/dedup/budgets/failure: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
