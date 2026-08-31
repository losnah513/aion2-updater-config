const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=file=>fs.readFileSync(file,'utf8');
const migration=read('supabase/migrations/20260831041156_sanctuary_random_alt_class_reservation.sql');
const edge=read('supabase/functions/sanctuary-management/index.ts');
const main=read('sanctuary-management/js/sanctuary-management.js');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');
const css=read('sanctuary-management/css/sanctuary-management-draft.css');

for(const token of [
  'sanctuary_management_slots_v453_occupancy_ck',
  'kinojo_sanctuary_management_linked_alts_v453',
  'kinojo_sanctuary_management_command_v453',
  "'randomAltClassReservation', true",
  "'itemLevelEligible'",
  "'alreadyAssignedToOtherForce'",
  "'scheduleConflict'",
  "'캐릭터의 아이템레벨이 부족합니다'",
  "'같은 시간 다른 포스에 소속되어있습니다'",
  "'이미 다른 포스에 소속되어 있습니다'"
])assert.ok(migration.includes(token),`v453 database contract missing ${token}`);

for(const token of [
  'const DATABASE_CONTRACT="453"',
  'kinojo_sanctuary_management_linked_alts_v453',
  'kinojo_sanctuary_management_command_v453',
  'KINOJO-Sanctuary-Management/453'
])assert.ok(edge.includes(token),`v453 Edge contract missing ${token}`);

assert.ok(main.includes('const SCHEMA_VERSION=453'),'browser must require the current v453 contract');
assert.ok(main.includes("character.randomClassCode=requiredClassCode"),'saved random-alt cards must recover their reserved class');

for(const token of [
  "character.relation==='MAIN'",
  '팀 생성 중에는 내 캐릭터 목록에서만 검색할 수 있습니다.',
  '랜덤 부캐도 선택할 수 있습니다.',
  'data-linked-alt-class=',
  'randomClassCode',
  "(data.characters||[]).map",
  'sanctuary-management-linked-alt-unavailable',
  'chooseRandomAltClass',
  "slot.assignmentKind==='RANDOM_ALT'&&!slot.mainCharacterId"
])assert.ok(draft.includes(token),`v453 composer contract missing ${token}`);
assert.ok(!draft.includes('(data.characters||[]).filter(character=>characterEligible(character))'),'item-level filtering must not hide linked alternate cards');

const harness=read('tests/sanctuary-management-fixed-draft-e2e.html');
assert.ok(harness.includes("characterName:'내부캐없는본캐'"),'creation harness must include a main character with zero linked alts');

for(const token of [
  '.sanctuary-management-linked-alt-class-picker',
  '.sanctuary-management-linked-alt-card.is-unavailable',
  'top:-7px;right:-6px;width:26px'
])assert.ok(css.includes(token),`v453 composer layout contract missing ${token}`);

console.log('KINOJO sanctuary management random-alt v453 contract: PASS');
