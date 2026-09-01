const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260901063251_sanctuary_management_slot_entry_v458.sql');
const edge=read('supabase/functions/sanctuary-management/index.ts');
const feature=read('core/kinojo-supabase-features.js');
const main=read('sanctuary-management/js/sanctuary-management.js');
const slot=read('sanctuary-management/js/sanctuary-management-inline-slot.js');
const css=read('sanctuary-management/css/sanctuary-management-inline-slot.css');
const workflow=read('.github/workflows/verify-kinojo-pages.yml');

for(const token of [
  'kinojo_sanctuary_management_lease_status_v458','kinojo_sanctuary_management_official_prepare_all_v458',
  'lockedByOther','ownedByViewer','statement_timestamp()','cardinality(v_ids) > 100',
  'revoke all on function public.kinojo_sanctuary_management_lease_status_v458','to service_role',
])assert.ok(migration.includes(token),`v458 migration contract missing ${token}`);
assert.equal(migration.includes("'editorName'"),false,'edit presence must not expose editor identity');
assert.equal(migration.includes('lease_token_hash'),false,'edit presence must not expose lease tokens');

for(const token of [
  'const API_VERSION="2.4"','const DATABASE_CONTRACT="458"','"lease-status"','"slot-character-search"',
  'kinojo_sanctuary_management_lease_status_v458','kinojo_sanctuary_management_official_prepare_all_v458',
  'size","100"','exactCandidates','OFFICIAL_ALL',
])assert.ok(edge.includes(token),`v458 Edge contract missing ${token}`);

for(const token of [
  'getSanctuaryManagementLeaseStatus','searchSanctuaryManagementSlotCharacters',
  "action:'lease-status'","action:'slot-character-search'",
])assert.ok(feature.includes(token),`v458 feature bridge missing ${token}`);

for(const token of [
  'const API_VERSION=2.4','const SCHEMA_VERSION=458','validateLeaseStatus','validateSlotCharacterSearch',
  "document.createElement(slot.occupied?'span':'button')",'dataset.sanctuarySlotAdd',
  "edit.textContent='확인 중'",'kinojo:sanctuary-management-rendered',
])assert.ok(main.includes(token),`v458 roster client missing ${token}`);

for(const token of [
  'EDIT_PRESENCE_INTERVAL=10000',"button.textContent='편집하기'","button.textContent='편집 중'",
  '다른 이용자가 해당 팀 구성을 편집중입니다.','내 캐릭터 추가하기','다른 캐릭터 추가하기',
  'maxlength="12"','placeholder="캐릭터명[서버]"','조회하기','data-slot-modal-backdrop',
  "if(event.key==='Escape')",'ITEM_LEVEL_ICON_URL','POWER_ICON_URL','statusForTeam(teamId)',
  "'ACQUIRE'","'RELEASE'",'setSlot(','submitSupport(',
])assert.ok(slot.includes(token),`v458 inline-slot client missing ${token}`);

for(const token of [
  '.sanctuary-management-edit-team{width:72px;min-width:72px','.is-editing',
  '.sanctuary-inline-slot-layer','.sanctuary-inline-character-card.is-selected',
  'grid-template-columns:repeat(2,minmax(0,1fr))','@media(max-width:620px)',
])assert.ok(css.includes(token),`v458 inline-slot CSS missing ${token}`);

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  for(const token of ['sanctuary-management-inline-slot.css?cache=2026090101','sanctuary-management-inline-slot.js?cache=2026090101','kinojo-supabase-features.js?cache=2026090101','sanctuary-management.js?cache=2026090101'])assert.ok(html.includes(token),`${page}: v458 asset missing ${token}`);
}
assert.ok(workflow.includes('node tests/sanctuary-management-inline-slot-v458-contract.test.js'),'v458 contract is not wired into CI');

console.log('KINOJO sanctuary inline slot and edit presence v458 contract: PASS');
