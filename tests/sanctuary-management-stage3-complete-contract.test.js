const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260828064134_sanctuary_management_stage3_complete_v433.sql');
const edge=read('supabase/functions/sanctuary-management/index.ts');
const feature=read('core/kinojo-supabase-features.js');
const rpc=read('core/kinojo-supabase-rpc.js');
const client=read('sanctuary-management/js/sanctuary-management.js');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');
const css=read('sanctuary-management/css/sanctuary-management-draft.css');
const auth=read('core/kinojo-auth-ui.js');
const handoff=read('docs/HANDOFF.md');

for(const token of [
  'CODEX_ADMIN_ROLE',
  "('MASTER', 'ADMIN') then 'MASTER'",
  'kinojo_admin_member_list_v433',
  "v_actor_raw_role = 'MASTER'",
  "upper(replace(coalesce(mc.role, ''), ' ', '_')) = 'ADMIN'",
  'kinojo_sm_team_conflicts_v433',
  'kinojo_sm_assert_lease_v433',
  'kinojo_sanctuary_management_bootstrap_v433',
  'kinojo_sanctuary_management_command_v433',
  "v_action = 'PUBLISH_TEAM'",
  "v_action in ('ADD_FORCE', 'SET_SLOT')",
  "v_action not in ('UPDATE_FIXED_TEAM', 'MOVE_SLOT')",
  '최소 팀 생성자의 캐릭터 1개를 추가해야 합니다.',
  'read_enabled = true',
  'write_enabled = true',
])assert.ok(migration.includes(token),`DB433 Stage 3 contract missing ${token}`);

for(const token of [
  'EDGE_CONTRACT_AUTHORITY',
  'const API_VERSION="1.7"',
  'const DATABASE_CONTRACT="445"',
  'kinojo_sanctuary_management_bootstrap_v445',
  'kinojo_sanctuary_management_command_v445',
])assert.ok(edge.includes(token),`current Edge contract missing ${token}`);

for(const token of [
  'runSanctuaryManagementLease',
  "action:'lease'",
  "rpc('kinojo_admin_member_list_v433'",
])assert.ok(feature.includes(token),`Feature bridge missing ${token}`);
assert.ok(rpc.includes("'kinojo_admin_member_list_v433'"),'ADMIN list v433 must accept the opaque Server session');

for(const token of [
  'const API_VERSION=1.7',
  'const SCHEMA_VERSION=445',
  'scheduleLabel',
  'data-sanctuary-edit-team',
  'data-sanctuary-archive-team',
  "ServerAdapter.command('PUBLISH_TEAM'",
  "ServerAdapter.command('MOVE_SLOT'",
])assert.ok(client.includes(token),`Management Stage 3 client missing ${token}`);

for(const token of [
  'newLeaseToken',
  'acquireLease',
  'setInterval',
  'handleDragStart',
  'handleDrop',
  'moveSlot(fromSlotId,toSlotId)',
  '빈 슬롯은 그대로 유지됩니다.',
  '최소 1개 필요합니다.',
])assert.ok(draft.includes(token),`Management Stage 3 editor missing ${token}`);

for(const token of ['.is-move-source','.is-dragging','.is-drop-target','overflow-x:hidden'])assert.ok(css.includes(token),`Management Stage 3 layout missing ${token}`);
assert.ok(auth.includes('CODEX_ADMIN_ROLE'),'ADMIN display-label warning comment missing');
assert.ok(auth.includes('const managedRoleLabel = account.roleLabel || roleLabel(role)'),'MASTER-only member list must render the ADMIN label returned by Server');
assert.ok(handoff.includes('Server 응답 계약 권위 규칙'),'Edge contract recovery rule missing from handoff');

console.log('KINOJO sanctuary management Stage 3 complete contract: PASS');
