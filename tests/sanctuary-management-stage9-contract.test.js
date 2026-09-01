const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=file=>fs.readFileSync(file,'utf8');
const migration=read('supabase/migrations/20260830200000_sanctuary_management_item_level_difficulty_v452.sql');
const entryModes=read('supabase/migrations/20260830201000_sanctuary_master_entry_modes_v452.sql');
const edge=read('supabase/functions/sanctuary-management/index.ts');
const main=read('sanctuary-management/js/sanctuary-management.js');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');
const support=read('sanctuary-management/js/sanctuary-management-support.js');
const draftCss=read('sanctuary-management/css/sanctuary-management-draft.css');
const supportCss=read('sanctuary-management/css/sanctuary-management-support.css');

for(const token of [
  "difficulty in ('NORMAL', 'HARD')",
  "rule_type in ('MAIN_MIN', 'POWER_MIN', 'ITEM_LEVEL_MIN')",
  'private.kinojo_sm_min_item_level_v452',
  "sanctuary.code = 'kaldrix' and upper(coalesce(p_difficulty, 'NORMAL')) = 'HARD' then 'hard'",
  'kinojo_sanctuary_management_linked_alts_v452',
  'kinojo_sanctuary_management_official_record_v452',
  'kinojo_sanctuary_management_command_v452',
  "v_kind = 'RANDOM_ALT'",
  'private.kinojo_sm_character_eligible_v452'
])assert.ok(migration.includes(token),`Stage 9 DB contract missing ${token}`);

for(const token of ["code = 'rudra'","'minItemLevel', 2700","code = 'bagot'","'minItemLevel', 3500","code = 'kaldrix'","'minItemLevel', 4300","'minItemLevel', 4500","code = 'sanctuary4'"]){
  assert.ok(entryModes.includes(token),`Stage 9 entry mode seed missing ${token}`);
}

for(const token of [
  'const API_VERSION="2.4"',
  'const DATABASE_CONTRACT="458"',
  'profile.combatPower',
  'officialStatValue(payload,"ItemLevel")',
  'kinojo_sanctuary_management_character_search_v457',
  'kinojo_sanctuary_management_official_materialize_v457'
])assert.ok(edge.includes(token),`Stage 9 Edge contract missing ${token}`);

for(const token of [
  "toFixed(1)+'K'",
  'sanctuary-management-power-value',
  'sanctuary-management-force-difficulty',
  "+' 모집 중'",
  'item.dataset.slotNumber='
])assert.ok(main.includes(token),`Stage 9 public UI contract missing ${token}`);

for(const token of [
  'ITEM_LEVEL_MIN',
  'data-requirement-metric',
  'minimumItemLevel',
  'characterEligible',
  'canSelectAlts',
  'draftDifficulty',
  'data-slot-number='
])assert.ok(draft.includes(token),`Stage 9 composer contract missing ${token}`);

for(const token of [
  "assignmentKind:'RANDOM_ALT'",
  '랜덤 부캐 신청하기',
  'sanctuary-management-support-inline'
])assert.ok(support.includes(token),`Stage 9 support contract missing ${token}`);

for(const token of ['sanctuary-management-draft-character-icon','sanctuary-management-draft-slot::before','sanctuary-management-power-value'])assert.ok(draftCss.includes(token),`Stage 9 composer CSS missing ${token}`);
for(const token of ['grid-template-columns:repeat(4,minmax(0,1fr))','sanctuary-management-support-inline','sanctuary-management-support-character.is-random'])assert.ok(supportCss.includes(token),`Stage 9 support CSS missing ${token}`);

console.log('KINOJO sanctuary management Stage 9 item-level, difficulty and compact support contract: PASS');
