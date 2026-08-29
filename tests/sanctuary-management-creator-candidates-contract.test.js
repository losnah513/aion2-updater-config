const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const client=read('sanctuary-management/js/sanctuary-management.js');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');
const css=read('sanctuary-management/css/sanctuary-management-draft.css');
const workflow=read('.github/workflows/verify-kinojo-pages.yml');

for(const token of [
  'function validateCreatorCandidate',
  'creatorAlreadyAssigned',
  'creatorCandidateCount',
  "ServerAdapter.command('SET_SLOT'",
  'async function setSlot',
])assert.ok(client.includes(token),`Browser DB432 candidate boundary missing ${token}`);

for(const token of [
  'function candidateMarkup',
  'data-draft-slot',
  'data-draft-candidate',
  '다른 구성원을 검색해 추가할 수 있습니다.',
  'function assignCreatorCharacter',
  'await bridge().setSlot',
  'state.selectedSlotId=0',
])assert.ok(draft.includes(token),`DRAFT creator candidate UI missing ${token}`);

for(const token of [
  '.sanctuary-management-candidate-list',
  'overflow-y:auto;overflow-x:hidden;scrollbar-width:none',
  '.sanctuary-management-candidate-rail.has-more::after',
  '.sanctuary-management-draft-slot.is-selected',
])assert.ok(css.includes(token),`Creator candidate layout missing ${token}`);

assert.ok(workflow.includes('node tests/sanctuary-management-creator-candidates-contract.test.js'),'Creator candidate test is not wired into CI');

function party(partyNo){
  return {
    partyId:100+partyNo,partyNo,capacity:5,occupiedCount:0,vacancyCount:5,
    slots:Array.from({length:5},(_,index)=>({slotId:partyNo*10+index+1,slotNo:index+1,occupied:false,revision:1,character:null})),
  };
}

const candidate={characterId:501,serverId:2,serverName:'지켈',characterName:'생성자본캐',className:'검성',profileImageUrl:'',isMain:true,relation:'MAIN',mainCharacterId:501};
const response={
  apiVersion:1.7,schemaVersion:445,serverTime:'2026-08-28T04:30:00Z',readEnabled:true,writeEnabled:true,globalWriteEnabled:true,
  rollout:{mode:'PILOT',globalWriteEnabled:true,effectiveWriteEnabled:true,pilotApproved:true,reasonCode:'PILOT_APPROVED',message:'시험 사용자 쓰기가 활성화되었습니다.'},
  actor:{memberId:7,canManageAll:true},sanctuaries:[{id:1,code:'rudra',shortName:'성역1'}],
  teams:[{
    teamId:77,sanctuaryId:1,title:'1팀',activity:'성역1 진행',mode:'FIXED',joinPolicy:'INSTANT',status:'DRAFT',revision:4,schedule:null,
    forceCount:2,slotCount:20,occupiedCount:0,vacancyCount:20,
    forces:[
      {forceId:91,forceNo:1,capacity:10,status:'OPEN',revision:1,occupiedCount:0,vacancyCount:10,creatorMemberId:7,creatorOwnerResolved:true,creatorAlreadyAssigned:false,creatorCandidateCode:'READY',creatorCandidateCount:1,creatorCandidates:[candidate],parties:[party(1),party(2)]},
      {forceId:92,forceNo:2,capacity:10,status:'OPEN',revision:1,occupiedCount:0,vacancyCount:10,creatorMemberId:7,creatorOwnerResolved:true,creatorAlreadyAssigned:true,creatorCandidateCode:'CREATOR_ALREADY_ASSIGNED',creatorCandidateCount:0,creatorCandidates:[],parties:[party(1),party(2)]},
    ],
  }],
};

const listeners=new Map();
const context={
  window:{KinojoSupabase:{async getSanctuaryManagementBootstrap(){return structuredClone(response);}}},
  document:{readyState:'loading',addEventListener(name,callback){listeners.set(name,callback);},getElementById(){return null;}},
  location:{href:'https://kinojo.info/sanctuary-management/',search:'',pathname:'/sanctuary-management/',hash:''},
  history:{replaceState(){}},URL,URLSearchParams,CustomEvent:class CustomEvent{},Object,Number,String,JSON,Math,Array,Error,RegExp,Promise,
};
vm.runInNewContext(client,context,{filename:'sanctuary-management/js/sanctuary-management.js'});

async function verify(){
  const data=await context.window.KinojoSanctuaryManagementData.bootstrap();
  assert.equal(data.schemaVersion,445);
  assert.equal(data.teams[0].forces[0].creatorCandidateCount,1);
  assert.equal(data.teams[0].forces[0].creatorCandidates[0].characterName,'생성자본캐');
  assert.equal(data.teams[0].forces[1].creatorAlreadyAssigned,true);
  assert.equal(data.teams[0].forces[1].creatorCandidates.length,0);

  const invalid=structuredClone(response);
  invalid.teams[0].forces[1].creatorCandidateCount=1;
  invalid.teams[0].forces[1].creatorCandidates=[candidate];
  context.window.KinojoSupabase.getSanctuaryManagementBootstrap=async()=>invalid;
  await assert.rejects(context.window.KinojoSanctuaryManagementData.bootstrap(),/포스 인원 집계/);
}

verify()
  .then(()=>console.log('KINOJO sanctuary management DB432 creator candidates contract: PASS'))
  .catch(error=>{console.error(error);process.exitCode=1;});
