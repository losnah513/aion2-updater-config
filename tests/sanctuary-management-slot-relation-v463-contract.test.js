const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260901101033_sanctuary_slot_master_relation.sql');
const css=read('sanctuary-management/css/sanctuary-management-support.css');
const workflow=read('.github/workflows/verify-kinojo-pages.yml');

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  assert.ok(read(page).includes('slotRelation=2026090110'),`${page}: slot relation CSS cache marker missing`);
}

for(const token of [
  'kinojo_sm_normalize_slot_character_relation_v463',
  'security invoker',
  "set search_path = ''",
  'sanctuary_management_slot_relation_v463',
  'before insert or update of character_id, character_relation, assignment_kind',
  "upper(coalesce(owner.relation, '')) in ('MAIN', 'ALT', 'GUEST')",
  'private.sanctuary_operational_legions_v432',
  "when coalesce(character.is_main, false)",
  "when character.main_character_id is not null then 'ALT'",
  "else 'GUEST'",
  "slot.character_relation = 'GUEST'",
  'not exists (',
  'revoke all on function private.kinojo_sm_normalize_slot_character_relation_v463()',
])assert.ok(migration.includes(token),`slot relation migration contract missing ${token}`);

assert.ok(
  migration.indexOf("owner.character_id is not null")<migration.indexOf('private.sanctuary_operational_legions_v432'),
  'explicit owner relation must take precedence over operational-legion fallback',
);
assert.ok(
  css.includes('.sanctuary-management-force-slot.is-guest{border-color:#e2e5ec;background:linear-gradient(135deg,#fafbfc,#f1f3f7)}'),
  'guest cards need a neutral fallback distinct from the main-character colour',
);
assert.ok(
  workflow.includes('node tests/sanctuary-management-slot-relation-v463-contract.test.js'),
  'slot relation contract is not wired into CI',
);

console.log('KINOJO sanctuary slot MAIN/ALT relation normalization v463 contract: PASS');
