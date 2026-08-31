const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260830051921_sanctuary_management_public_read_v448.sql');
const edge=read('supabase/functions/sanctuary-management/index.ts');
const feature=read('core/kinojo-supabase-features.js');
const client=read('sanctuary-management/js/sanctuary-management.js');
const commonUi=read('ui/kinojo-common-ui.js');
const workflow=read('.github/workflows/verify-kinojo-pages.yml');

for(const token of [
  'kinojo_sanctuary_management_public_bootstrap_v448()',
  'kinojo_sanctuary_management_public_month_v448(p_month date)',
  "where team.status in ('ACTIVE', 'FULL')",
  "'publicRead', true",
  "'writeEnabled', false",
  "'creatorMemberId', null",
  "'supportBatches', '[]'::jsonb",
  "'canEdit', false",
  'security definer',
  "set search_path to 'pg_catalog', 'public', 'private'",
])assert.ok(migration.includes(token),`public Sanctuary migration missing ${token}`);
for(const signature of [
  'public.kinojo_sanctuary_management_public_bootstrap_v448()',
  'public.kinojo_sanctuary_management_public_month_v448(date)',
]){
  assert.ok(migration.includes(`revoke all on function ${signature} from public, anon, authenticated`),`${signature} browser ACL is open`);
  assert.ok(migration.includes(`grant execute on function ${signature} to service_role`),`${signature} service role grant is missing`);
}
assert.equal(migration.includes('kinojo_sm_actor_v412'),false,'public read must not resolve a viewer account');
assert.doesNotMatch(migration,/kws_[A-Za-z0-9_-]{20,}/,'public read migration must never contain a session credential');

for(const token of [
  'PUBLIC_SANCTUARY_READ',
  'if(!credential){',
  'kinojo_sanctuary_management_public_bootstrap_v456',
  'kinojo_sanctuary_management_public_month_v454',
  'return failure(request,"SESSION_TOKEN_INVALID"',
])assert.ok(edge.includes(token),`Edge public-read boundary missing ${token}`);
assert.ok(feature.includes('sessionToken:optionalServerSessionCredential()'),'public reads must accept an empty browser credential');
assert.ok(feature.includes('sessionToken:currentServerSessionCredential()'),'mutating methods must keep the strict browser credential gate');

for(const token of [
  'const publicRead=data.publicRead===true',
  '성역 팀과 일정을 공개 보기로 표시합니다.',
  '공개된 팀·포스·월간 일정을 불러옵니다.',
  'if(!bootstrapData||backgroundCheckActive||document.hidden)return;',
  'function handleAuthChanged()',
])assert.ok(client.includes(token),`public Sanctuary client behavior missing ${token}`);
assert.equal(client.includes("setAccess('denied','로그인이 필요합니다.'"),false,'guest load must not stop at the old login wall');
assert.ok(commonUi.includes('const canOpenSanctuaryManagement=true'),'Sanctuary navigation must stay visible while logged out');
assert.ok(workflow.includes('node tests/sanctuary-management-public-read-contract.test.js'),'public read test is not wired into CI');

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  assert.ok(html.includes('kinojo-supabase-features.js?cache=2026083104'),`${page}: public feature cache key missing`);
  assert.ok(html.includes('sanctuary-management.js?cache=2026083104'),`${page}: public client cache key missing`);
}

function party(partyNo){
  return {
    partyId:100+partyNo,partyNo,capacity:5,occupiedCount:0,vacancyCount:5,
    slots:Array.from({length:5},(_,index)=>({slotId:partyNo*10+index+1,slotNo:index+1,occupied:false,revision:1,character:null})),
  };
}
const response={
  apiVersion:1.8,schemaVersion:446,serverTime:'2026-08-30T05:30:00Z',publicRead:true,
  readEnabled:true,writeEnabled:false,globalWriteEnabled:true,
  rollout:{mode:'OPEN',globalWriteEnabled:true,effectiveWriteEnabled:false,pilotApproved:false,reasonCode:'LOGIN_REQUIRED',message:'로그인 후 사용할 수 있습니다.'},
  actor:{loggedIn:false,role:'GUEST'},
  composerCharacters:{ownerResolved:false,code:'LOGIN_REQUIRED',candidateCount:0,characters:[]},
  transitionReview:{canReview:false,canApprove:false,approved:false,executed:true,completed:true,runId:1,stage7State:'COMPLETE',unresolvedCount:0},
  sanctuaries:[{id:1,code:'rudra',name:'심연의 재련: 루드라',displayOrder:1}],
  teams:[{
    teamId:81,sanctuaryId:1,title:'공개 팀',activity:'성역1 진행',mode:'PARTICIPATION',joinPolicy:'INSTANT',status:'ACTIVE',revision:1,
    schedule:{scheduleId:71,kind:'WEEKLY',startsOn:'2026-08-30',weekdays:[4],startsAt:'21:00',durationMinutes:30,timezoneName:'Asia/Seoul',status:'ACTIVE',revision:1},
    forceCount:1,slotCount:10,occupiedCount:0,vacancyCount:10,
    supportCharacters:{ownerResolved:false,code:'LOGIN_REQUIRED',candidateCount:0,characters:[]},supportBatches:[],canEdit:false,canArchive:false,scheduleEditScopes:[],
    forces:[{forceId:91,forceNo:1,capacity:10,status:'OPEN',revision:1,occupiedCount:0,vacancyCount:10,creatorMemberId:null,creatorOwnerResolved:false,creatorAlreadyAssigned:false,creatorCandidateCode:'LOGIN_REQUIRED',creatorCandidateCount:0,creatorCandidates:[],viewerAlreadyAssigned:false,viewerPending:false,canSupport:false,supportDisabledCode:'LOGIN_REQUIRED',supportDisabledMessage:'로그인 후 지원할 수 있습니다.',parties:[party(1),party(2)]}],
  }],
};

const listeners=new Map();
const context={
  window:{KinojoSupabase:{async getSanctuaryManagementBootstrap(){return structuredClone(response);}}},
  document:{readyState:'loading',addEventListener(name,callback){listeners.set(name,callback);},getElementById(){return null;}},
  location:{href:'https://kinojo.info/sanctuary/',search:'',pathname:'/sanctuary/',hash:''},history:{replaceState(){}},
  URL,URLSearchParams,CustomEvent:class CustomEvent{},Object,Number,String,JSON,Math,Array,Error,RegExp,Promise,
};
vm.runInNewContext(client,context,{filename:'sanctuary-management/js/sanctuary-management.js'});

context.window.KinojoSanctuaryManagementData.bootstrap().then(data=>{
  assert.equal(data.publicRead,true);
  assert.equal(data.writeEnabled,false);
  assert.equal(data.teams.length,1);
  assert.equal(data.teams[0].forces[0].creatorMemberId,0);
  assert.equal(data.teams[0].forces[0].canSupport,false);
  console.log('KINOJO Sanctuary public read without login contract: PASS');
}).catch(error=>{console.error(error);process.exitCode=1;});
