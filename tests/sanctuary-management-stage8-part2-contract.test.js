const fs=require('node:fs');
const assert=require('node:assert/strict');

const migration=fs.readFileSync('supabase/migrations/20260830190000_sanctuary_management_slot_classes_and_alts_v450.sql','utf8');
const supportEligibilityFix=fs.readFileSync('supabase/migrations/20260830191000_sanctuary_management_support_eligibility_v450_fix.sql','utf8');
const edge=fs.readFileSync('supabase/functions/sanctuary-management/index.ts','utf8');
const main=fs.readFileSync('sanctuary-management/js/sanctuary-management.js','utf8');
const draft=fs.readFileSync('sanctuary-management/js/sanctuary-management-draft.js','utf8');
const css=fs.readFileSync('sanctuary-management/css/sanctuary-management-draft.css','utf8');
const core=fs.readFileSync('core/kinojo-supabase-features.js','utf8');

for(const token of [
  "required_class_code text not null default 'ALL'",
  "assignment_kind text not null default 'ACTUAL_CHARACTER'",
  "assignment_kind in ('ACTUAL_CHARACTER', 'RANDOM_ALT')",
  'sanctuary_management_slot_assignment_guard_v450',
  'deferrable initially deferred',
  'NO_CLASS_ELIGIBLE_SLOT',
  'kinojo_sanctuary_management_linked_alts_v450',
  "'randomCandidate'",
  "'isRandomAlt', true",
  "slot.assignment_kind = 'ACTUAL_CHARACTER'",
  "slot.required_class_code = 'ALL' or slot.required_class_code = v_class_code",
  'kinojo_sanctuary_management_command_v450'
])assert.ok(migration.includes(token),`migration contract missing: ${token}`);

assert.ok(!/insert\s+into\s+public\.character_master[\s\S]{0,500}RANDOM_ALT/i.test(migration),'RANDOM_ALT must not fabricate a character_master row');
assert.ok(migration.includes('private.kinojo_sm_force_roster_v449')&&migration.includes('never creates a character_master'), 'RANDOM_ALT must reuse the actual-only v449 power and rule model');
for(const token of ['kinojo_sm_support_characters_v450','availableForceIds','NO_CLASS_ELIGIBLE_SLOT','canSupport',"set search_path = ''"]){
  assert.ok(supportEligibilityFix.includes(token),`force support eligibility fix missing: ${token}`);
}

for(const token of ['const API_VERSION="2.2"','const DATABASE_CONTRACT="453"','"linked-alts"','kinojo_sanctuary_management_command_v453','kinojo_sanctuary_management_public_bootstrap_v452'])assert.ok(edge.includes(token),`current Edge contract missing while retaining part 2: ${token}`);
for(const token of ['const API_VERSION=2.2','const SCHEMA_VERSION=453','requiredClassCode','assignmentKind','mainCharacterId','validateLinkedAlts','linkedAlts,'])assert.ok(main.includes(token),`current browser contract missing while retaining part 2: ${token}`);
for(const token of ['data-slot-class-open','data-slot-class','data-linked-alts-open','data-linked-alt-random','RANDOM_ALT','실제 캐릭터 확정 전에는 전투력·조건 계산에서 제외'])assert.ok(draft.includes(token),`composer part 2 contract missing: ${token}`);
for(const token of ['sanctuary-management-slot-class-picker','sanctuary-management-linked-alt-panel','overflow-x:hidden'])assert.ok(css.includes(token),`part 2 layout contract missing: ${token}`);
for(const token of ['getSanctuaryManagementLinkedAlts','action:\'linked-alts\''])assert.ok(core.includes(token),`core linked-alt adapter missing: ${token}`);

console.log('Sanctuary management Stage 8 part 2 contract: PASS');
