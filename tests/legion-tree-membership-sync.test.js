const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync('legion-tree/js/legion-tree.js','utf8');
let writes=0,html='',calls=0,resolveRead,now=100000;
const root={scrollTop:25,setAttribute(){},addEventListener(){},get innerHTML(){return html;},set innerHTML(value){writes++;html=value;}};
const editor={hidden:true};
const status={style:{}};
const document={readyState:'loading',visibilityState:'visible',addEventListener(){},
 querySelector(s){return {'#legionTreeRoot':root,'#legionTreeEditorRoot':editor,'#legionTreeStatus':status}[s]||null;},querySelectorAll(){return [];}};
const window={dispatchEvent(){},KinojoSupabase:{rpc(){calls++;return new Promise(resolve=>resolveRead=resolve);}}};
const clock=class extends Date{static now(){return now;}};
vm.runInNewContext(script,{window,document,console,Date:clock,Map,Set,Object,Promise,setTimeout,clearTimeout,CustomEvent:class{}});
const api=window.KinojoLegionTree;
function payload(name='밤'){
 return {ok:true,contract:'web-legion-tree-v1',databaseContract:'460',membershipContract:'canonical-auto-terminal-v473',
 legions:['깡','낮','밤','키나노동조합'].map((legionName,i)=>({legionName,memberCount:i?0:1,
  stages:[{stageNo:1,stageName:'군단병',roles:[{roleKey:'soldier',roleName:'군단병',groups:i?[]:[{groupKey:'default',members:[{characterId:51,characterName:name,serverId:2002}]}]}]}],unassignedMembers:[]}))};
}
(async()=>{
 const first=api.loadTreeData(),second=api.loadTreeData();
 assert.equal(first,second);assert.equal(calls,1);resolveRead(payload());await first;
 const count=writes;
 const unchanged=api.loadTreeData({background:true});resolveRead(payload());await unchanged;
 assert.equal(writes,count,'unchanged payload must not replace DOM');
 root.scrollTop=77;
 const changed=api.loadTreeData({background:true});resolveRead(payload('이름변경'));await changed;
 assert.equal(root.scrollTop,77);assert(html.includes('이름변경'));
 editor.hidden=false;const before=calls;await api.loadTreeData({background:true});assert.equal(calls,before);
 editor.hidden=true;
 const delayed=api.loadTreeData({background:true});editor.hidden=false;resolveRead(payload('늦은응답'));await delayed;
 assert(!html.includes('늦은응답'),'editor opened while reading must defer apply');editor.hidden=true;
 const outdated=api.loadTreeData({background:true});api.applyTreePayload(payload('저장최신'));resolveRead(payload('저장이전'));await outdated;
 assert(html.includes('저장최신'));assert(!html.includes('저장이전'));
 document.visibilityState='hidden';now+=60000;api.refreshVisibleTree();assert.equal(calls,before+2);
 document.visibilityState='visible';api.refreshVisibleTree();assert.equal(calls,before+3);resolveRead(payload());await api.loadTreeData();
 api.refreshVisibleTree();assert.equal(calls,before+3,'focus/visibility burst throttled');
 const bad=payload();bad.legions[0].memberCount=2;assert.throws(()=>api.normalizeTreePayload(bad),/MEMBERSHIP_INTEGRITY/);
 const pending=payload();pending.legions[0].unassignedMembers=pending.legions[0].stages[0].roles[0].groups[0].members;pending.legions[0].stages[0].roles[0].groups=[];
 assert(api.renderTreeMarkup(api.normalizeTreePayload(pending)).includes('직급 지정 대기'));
 assert(api.renderTreeMarkup(api.normalizeTreePayload(pending)).includes('data-character-id="51"'));
 assert(script.includes('TREE_REFRESH_INTERVAL_MS=60000'));
 assert(script.includes("document.addEventListener('visibilitychange',refreshVisibleTree)"));
 console.log('legion-tree membership sync: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
