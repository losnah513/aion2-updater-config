const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');
const draftCss=read('sanctuary-management/css/sanctuary-management-draft.css');
const migration=read('supabase/migrations/20260901052026_sanctuary_roster_character_family_identity.sql');
const harness=read('tests/sanctuary-management-fixed-draft-e2e.html');
const workflow=read('.github/workflows/verify-kinojo-pages.yml');

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  assert.ok(html.includes('linkedAltLayout=2026090101'),`${page}: linked-alt layout cache marker missing`);
  assert.ok(html.includes('familyMessage=2026090101'),`${page}: family-message cache marker missing`);
}

for(const token of [
  'sanctuary-management-builder-side',
  "side.classList.toggle('has-linked-alts',Boolean(state.linkedAlts))",
  '+linkedAltPanelMarkup()',
  'function sameCharacterFamily(left,right)',
  'function characterFamilyRole(character)',
  'function forceCharacterFamilyConflict(force,character,excludedSlotId=0)',
  'function forceHasCharacterFamily(force,character,excludedSlotId=0)',
  'function familyConflictText(conflict,forceLabel=\'이 포스\')',
  'function familyConflictMarkup(conflict)',
  'function localFamilyConflict()',
  "'랜덤 부캐 · '+forceLabel+'에 소속됨'",
  "'본캐 ':'부캐 '",
  'familyConflict=force?forceCharacterFamilyConflict(force,character):null',
])assert.ok(draft.includes(token),`composer layout/family guard missing ${token}`);
assert.ok(draft.indexOf('familyConflict=force?forceCharacterFamilyConflict(force,character):null')<draft.indexOf("character.alreadyAssignedToOtherForce===true"),'same-force family conflict must be evaluated before other-force conflict');

for(const token of [
  '.sanctuary-management-builder-side{',
  '.sanctuary-management-builder-side.has-linked-alts{',
  '.sanctuary-management-linked-alt-panel{position:relative',
  '.sanctuary-management-builder-side.has-linked-alts .sanctuary-management-linked-alt-panel',
  '.sanctuary-management-linked-alt-panel>div{display:flex;flex-direction:column',
  'position:static!important',
  'white-space:nowrap!important',
  '.sanctuary-management-linked-alt-unavailable-name{',
  '.sanctuary-management-linked-alt-unavailable-lead.is-random-alt{',
  'text-shadow:0 0 8px currentColor',
])assert.ok(draftCss.includes(token),`in-flow linked-alt layout missing ${token}`);
assert.equal(draftCss.includes('.sanctuary-management-linked-alt-panel{position:fixed'),false,'linked-alt panel must not cover the schedule panel');

for(const token of [
  "'mainCharacterId', s.owner_root_character_id",
  "'ownerMemberId', s.owner_member_id",
  'kinojo_sm_same_force_character_family_guard_v461',
  'deferrable initially deferred',
  "raise exception '이미 해당 캐릭터의 본캐(나 부캐)가 이 포스에 소속되어 있습니다.'",
  'revoke all on function private.kinojo_sm_same_force_character_family_guard_v461()',
])assert.ok(migration.includes(token),`database family guard missing ${token}`);
for(const token of ["characterId:510,mainCharacterId:501,ownerMemberId:7,characterName:'같은포스부캐'",'alreadyAssignedToOtherForce:true,scheduleConflict:true',"familyFixture==='alt'","name:'기존부캐'","characterId:703,mainCharacterId:701"])assert.ok(harness.includes(token),`browser harness same-force priority fixture missing ${token}`);

assert.ok(workflow.includes('node tests/sanctuary-management-layout-family-guard-contract.test.js'),'layout/family guard contract is not wired into CI');
console.log('KINOJO sanctuary management linked-alt layout and same-force family guard contract: PASS');
