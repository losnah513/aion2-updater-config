const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const client=read('sanctuary-management/js/sanctuary-management.js');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');

for(const token of [
  'const SCHEMA_VERSION=437',
  'function validateSlot',
  'function validateParty',
  'function validateForce',
  'item.slots.length!==5',
  'item.parties.length!==2',
  'forces.length>9',
  "ServerAdapter.command('ADD_FORCE'",
  'function validateCreatorCandidate',
  'creatorCandidates:Array.isArray',
])assert.ok(client.includes(token),`Browser DB 432 validator missing ${token}`);

for(const token of [
  'function forceRailMarkup',
  'function rosterMarkup',
  'data-draft-add-force',
  'data-slot-id=',
  'data-slot-revision=',
  '현재 입력 내용을 먼저 저장한 뒤 Server에 다음 포스를 추가하고 있습니다.',
])assert.ok(draft.includes(token),`DRAFT force roster UI missing ${token}`);

function makeParty(partyNo){
  return {
    partyId:100+partyNo,
    partyNo,
    capacity:5,
    occupiedCount:partyNo===1?1:0,
    vacancyCount:partyNo===1?4:5,
    slots:Array.from({length:5},(_,index)=>({
      slotId:partyNo*10+index+1,
      slotNo:index+1,
      occupied:partyNo===1&&index===0,
      revision:1,
      character:partyNo===1&&index===0?{characterId:501,name:'테스트본캐',serverName:'지켈',className:'검성',profileImageUrl:'',relation:'MAIN'}:null,
    })),
  };
}

const response={
  apiVersion:1.5,
  schemaVersion:437,
  serverTime:'2026-08-28T04:00:00Z',
  readEnabled:true,
  writeEnabled:true,
  actor:{memberId:7,canManageAll:true},
  sanctuaries:[{id:1,code:'rudra',shortName:'성역1'}],
  teams:[{
    teamId:77,sanctuaryId:1,title:'1팀',activity:'성역1 진행',mode:'FIXED',joinPolicy:'INSTANT',status:'DRAFT',revision:4,schedule:null,
    forceCount:1,slotCount:10,occupiedCount:1,vacancyCount:9,
    forces:[{forceId:91,forceNo:1,capacity:10,status:'OPEN',revision:2,occupiedCount:1,vacancyCount:9,creatorMemberId:7,creatorOwnerResolved:true,creatorAlreadyAssigned:true,creatorCandidateCode:'CREATOR_ALREADY_ASSIGNED',creatorCandidateCount:0,creatorCandidates:[],parties:[makeParty(1),makeParty(2)]}],
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
  const adapter=context.window.KinojoSanctuaryManagementData;
  const data=await adapter.bootstrap();
  assert.equal(data.schemaVersion,437);
  assert.equal(data.teams[0].forces.length,1);
  assert.equal(data.teams[0].forces[0].parties.length,2);
  assert.equal(data.teams[0].forces[0].parties[0].slots.length,5);
  assert.equal(data.teams[0].forces[0].parties[0].slots[0].character.name,'테스트본캐');
  assert.equal(data.teams[0].vacancyCount,9);

  const malformed=structuredClone(response);
  malformed.teams[0].forces[0].parties[0].slots.pop();
  context.window.KinojoSupabase.getSanctuaryManagementBootstrap=async()=>malformed;
  await assert.rejects(adapter.bootstrap(),/파티 슬롯/);

  const malformedCandidates=structuredClone(response);
  malformedCandidates.teams[0].forces[0].creatorAlreadyAssigned=false;
  malformedCandidates.teams[0].forces[0].creatorCandidateCount=1;
  malformedCandidates.teams[0].forces[0].creatorCandidates=[{characterId:502,serverId:2,serverName:'지켈',characterName:'테스트부캐',className:'살성',profileImageUrl:'',isMain:false,relation:'ALT',mainCharacterId:501}];
  malformedCandidates.teams[0].forces[0].creatorCandidateCount=2;
  context.window.KinojoSupabase.getSanctuaryManagementBootstrap=async()=>malformedCandidates;
  await assert.rejects(adapter.bootstrap(),/포스 인원 집계/);
}

verify()
  .then(()=>console.log('KINOJO sanctuary management DB 432 force roster contract: PASS'))
  .catch(error=>{console.error(error);process.exitCode=1;});
