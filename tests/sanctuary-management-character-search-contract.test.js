const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const feature=read('core/kinojo-supabase-features.js');
const client=read('sanctuary-management/js/sanctuary-management.js');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');
const css=read('sanctuary-management/css/sanctuary-management-draft.css');
const workflow=read('.github/workflows/verify-kinojo-pages.yml');

for(const token of [
  'searchSanctuaryManagementCharacter','registerSanctuaryManagementCharacter',
  "action:'character-search'","action:'character-register'",'mainCharacterId',
])assert.ok(feature.includes(token),`Feature character boundary missing ${token}`);

for(const token of [
  'function validateCharacterCard','function validateCharacterSearch','async searchCharacter(teamId,query)',
  'async registerCharacter(teamId,candidateId,relationType,mainCharacterId,requestKey)',
])assert.ok(client.includes(token),`Management character adapter missing ${token}`);

for(const token of [
  'data-character-search-form','size="16"','이름 또는 이름[서버]','캐릭터 마스터 우선 조회',
  '아이온2 공식 확인','data-draft-relation="','data-main-search-form','data-draft-register-main',
  '외부 레기온 또는 레기온 미가입 캐릭터로 게스트 등록','registerOfficialCharacter',
])assert.ok(draft.includes(token),`Character search UI missing ${token}`);

for(const token of [
  '.sanctuary-management-character-search','overflow-x:hidden','scrollbar-width:none',
  '.sanctuary-management-relation-buttons','.sanctuary-management-register-character',
])assert.ok(css.includes(token),`Character search layout missing ${token}`);

assert.ok(workflow.includes('node tests/sanctuary-management-character-search-contract.test.js'),'Character search test is not wired into CI');
assert.equal(draft.includes('깡'),false,'Operational legion names must not be hardcoded in Browser UI');
assert.equal(draft.includes('키나노동조합'),false,'Operational legion names must remain Server configuration');

const calls=[];
const listeners=new Map();
const master={characterId:501,characterName:'마스터캐릭터',serverId:2002,serverName:'지켈',raceId:2,className:'검성',legionName:'',profileImageUrl:'',relation:'GUEST',mainCharacterId:501,ownerMemberId:0,isOperationalLegion:false};
const official={candidateId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',characterName:'공식캐릭터',serverId:2002,serverName:'지켈',raceId:2,className:'살성',legionName:'외부',profileImageUrl:'',isOperationalLegion:false,allowedRelations:['GUEST']};
const context={
  window:{KinojoSupabase:{
    async searchSanctuaryManagementCharacter(teamId,query){calls.push({kind:'search',teamId,query});return query==='공식'?{ok:true,schemaVersion:432,source:'OFFICIAL',candidate:official}:{ok:true,schemaVersion:432,source:'CHARACTER_MASTER',character:master};},
    async registerSanctuaryManagementCharacter(teamId,candidateId,relationType,mainCharacterId,requestKey){calls.push({kind:'register',teamId,candidateId,relationType,mainCharacterId,requestKey});return{ok:true,character:master};},
  }},
  document:{readyState:'loading',addEventListener(name,callback){listeners.set(name,callback);},getElementById(){return null;}},
  location:{href:'https://kinojo.info/sanctuary-management/',search:'',pathname:'/sanctuary-management/',hash:''},
  history:{replaceState(){}},URL,URLSearchParams,CustomEvent:class CustomEvent{},Object,Number,String,JSON,Math,Array,Error,RegExp,Promise,
};
vm.runInNewContext(client,context,{filename:'sanctuary-management/js/sanctuary-management.js'});

async function verify(){
  const adapter=context.window.KinojoSanctuaryManagementData;
  const found=await adapter.searchCharacter(77,'마스터캐릭터');
  assert.equal(found.character.characterId,501);
  assert.equal(found.character.relation,'GUEST');
  const candidate=await adapter.searchCharacter(77,'공식');
  assert.deepEqual(Array.from(candidate.candidate.allowedRelations),['GUEST']);
  const registered=await adapter.registerCharacter(77,official.candidateId,'GUEST',null,'sm-character-test-432');
  assert.equal(registered.character.characterId,501);
  assert.equal(calls.length,3);
  assert.equal(calls[2].relationType,'GUEST');
}

verify().then(()=>console.log('KINOJO sanctuary management DB432 character search contract: PASS')).catch(error=>{console.error(error);process.exitCode=1;});
