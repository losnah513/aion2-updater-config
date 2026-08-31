const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260830161500_sanctuary_management_composition_requirements_v449.sql');
const performanceGuard=read('supabase/migrations/20260830162500_sanctuary_management_composition_rules_performance_guard_v449.sql');
const fkIndexGuard=read('supabase/migrations/20260830162800_sanctuary_management_composition_rules_fk_index_v449.sql');
const edge=read('supabase/functions/sanctuary-management/index.ts');
const client=read('sanctuary-management/js/sanctuary-management.js');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');
const rosterCss=read('sanctuary-management/css/sanctuary-management-support.css');
const draftCss=read('sanctuary-management/css/sanctuary-management-draft.css');
const workflow=read('.github/workflows/verify-kinojo-pages.yml');

for(const token of [
  'private.sanctuary_management_composition_rules_v449','MAIN_MIN','POWER_MIN',
  'private.kinojo_sm_combat_power_v449','private.kinojo_sm_scope_requirements_v449',
  'private.kinojo_sm_force_roster_v449','public.kinojo_sanctuary_management_bootstrap_v449',
  'public.kinojo_sanctuary_management_public_bootstrap_v449','public.kinojo_sanctuary_management_command_v449',
  "set search_path = ''",'compositionRulesVersion','미충족이어도 팀은 저장',
])assert.ok(migration.includes(token),`Stage 8 part 1 migration missing ${token}`);
for(const token of ['created_by_member_id','updated_by_member_id','where created_by_member_id is not null','where updated_by_member_id is not null'])assert.ok(performanceGuard.includes(token),`Stage 8 performance guard missing ${token}`);
for(const token of ['drop index if exists private.sanctuary_management_composition_rules_v449_created_by_idx','created_by_member_id);','updated_by_member_id);'])assert.ok(fkIndexGuard.includes(token),`Stage 8 FK index guard missing ${token}`);

for(const token of ['const API_VERSION="2.3"','const DATABASE_CONTRACT="456"','bootstrap_v456','public_bootstrap_v456','command_v454'])assert.ok(edge.includes(token),`Stage 8 Edge contract missing ${token}`);
for(const token of [
  'function formatCombatPower','validateCombatPower','validateRequirements','sanctuary-management-force-average',
  'sanctuary-management-force-slot-power','has-unmet-requirements','compositionRulesVersion:2',
  "if(bootstrapData&&next===currentAuthProjection){checkForUpdates();return;}",
])assert.ok(client.includes(token),`Stage 8 operating/read contract missing ${token}`);
for(const token of [
  'function refreshRequirementScope','function requirementEditorMarkup','data-requirement-open','data-requirement-toggle="MAIN_MIN"',
  'data-requirement-toggle="POWER_MIN"','function applyRequirementEditor','requirements:[','미충족 상태여도 저장할 수 있습니다.',
])assert.ok(draft.includes(token),`Stage 8 composer contract missing ${token}`);

assert.equal(/function handleAuthChanged\(\)\{[\s\S]*?\n\s*load\(\);\n\s*\}/.test(client)&&!client.includes('next===currentAuthProjection'),false,'same-viewer auth renewal must not automatically replace visible content');
for(const token of ['sanctuary-management-force-slot-power','has-unmet-requirements','sanctuary-management-requirement-warning'])assert.ok(rosterCss.includes(token),`Stage 8 operating CSS missing ${token}`);
for(const token of ['sanctuary-management-force-requirement-summary','sanctuary-management-requirement-editor','overflow-x:hidden'])assert.ok(draftCss.includes(token),`Stage 8 composer CSS missing ${token}`);
for(const page of ['sanctuary/index.html','m/sanctuary/index.html'])assert.ok(read(page).includes('stage8=2026083030'),`${page}: Stage 8 cache boundary missing`);
assert.ok(workflow.includes('node tests/sanctuary-management-stage8-part1-contract.test.js'),'Stage 8 part 1 contract is not wired into CI');

console.log('KINOJO sanctuary management Stage 8 part 1 contract: PASS');
