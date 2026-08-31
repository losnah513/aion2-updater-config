const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=file=>fs.readFileSync(file,'utf8');
const migration=read('supabase/migrations/20260831050524_sanctuary_force_difficulty_v454.sql');
const edge=read('supabase/functions/sanctuary-management/index.ts');
const main=read('sanctuary-management/js/sanctuary-management.js');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');
const core=read('core/kinojo-supabase-features.js');
const css=read('sanctuary-management/css/sanctuary-management.css');

for(const token of [
  'add column if not exists difficulty text',
  'sanctuary_management_forces_v412_difficulty_ck',
  'private.kinojo_sm_force_min_item_level_v454',
  'private.kinojo_sm_force_roster_v454',
  'private.kinojo_sm_support_characters_v454',
  'public.kinojo_sanctuary_management_bootstrap_v454',
  'public.kinojo_sanctuary_management_public_bootstrap_v454',
  'public.kinojo_sanctuary_management_linked_alts_v454',
  'public.kinojo_sanctuary_management_command_v454',
  'public.kinojo_sanctuary_management_balance_proposal_v454',
  "'difficultyScope', 'FORCE'",
  "'해당 포스 아이템레벨을 충족하는 캐릭터만 배치할 수 있습니다.'",
  'grant execute on function public.kinojo_sanctuary_management_command_v454',
])assert.ok(migration.includes(token),`Stage 10 part 1 DB contract missing ${token}`);

for(const token of [
  'const DATABASE_CONTRACT="457"',
  'kinojo_sanctuary_management_public_bootstrap_v456',
  'kinojo_sanctuary_management_month_v454',
  'kinojo_sanctuary_management_linked_alts_v457',
  'p_force_id:forceId',
  'kinojo_sanctuary_management_balance_proposal_v454',
  'kinojo_sanctuary_management_command_v454',
])assert.ok(edge.includes(token),`Stage 10 part 1 Edge contract missing ${token}`);

for(const token of [
  'const SCHEMA_VERSION=457',
  'calendarMonthData',
  'function renderRecruitmentSummary()',
  'function renderWeek()',
  'function openMonthlySchedule(opener)',
  "difficulty:value(item.difficulty||options.teamDifficulty||'NORMAL')",
])assert.ok(main.includes(token),`Stage 10 part 1 browser contract missing ${token}`);

assert.ok(draft.includes('difficulty:selectedDifficulty(force)'),'composer must send force difficulty');
assert.ok(core.includes('async function getSanctuaryManagementLinkedAlts(teamId,mainCharacterId,forceId=null)'),'bridge must accept a force-scoped alt lookup');
assert.ok(core.includes('forceId:normalizedForceId'),'bridge must send forceId to Edge');

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  for(const token of [
    'id="sanctuaryManagementStatusShell"',
    'id="sanctuaryManagementScheduleState"',
    'id="sanctuaryManagementMonthlySchedule"',
    'id="sanctuaryManagementRecruitmentState"',
    'stage10=2026083102',
  ])assert.ok(html.includes(token),`${page}: Stage 10 part 1 layout missing ${token}`);
  for(const retired of ['sanctuary-management-summary','sanctuary-management-side','sanctuaryManagementAdminState'])assert.equal(html.includes(retired),false,`${page}: retired side layout remains ${retired}`);
}

for(const token of [
  '.sanctuary-management-subbar-status{',
  '.sanctuary-management-overview{',
  '.sanctuary-management-week{',
  '.sanctuary-management-operation-dialog.is-calendar',
  '.sanctuary-management-layout{margin-top:14px;display:grid;grid-template-columns:minmax(0,1fr)',
])assert.ok(css.includes(token),`Stage 10 part 1 CSS contract missing ${token}`);

console.log('KINOJO sanctuary management Stage 10 part 1 contract: PASS');
