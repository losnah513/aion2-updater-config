const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260828074303_sanctuary_management_participation_forces_v435.sql');
const edge=read('supabase/functions/sanctuary-management/index.ts');
const client=read('sanctuary-management/js/sanctuary-management.js');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');
const css=read('sanctuary-management/css/sanctuary-management-draft.css');

for(const token of [
  'PARTICIPATION_FORCE_BOUNDARY',
  'kinojo_sanctuary_management_bootstrap_v435',
  'kinojo_sanctuary_management_command_v435',
  "if v_action = 'CREATE_TEAM' then",
  "v_mode not in ('FIXED', 'PARTICIPATION')",
  "v_policy not in ('INSTANT', 'APPROVAL')",
  'v_force_count <> 1 or v_party_count <> 2 or v_slot_count <> 10',
  "if v_action = 'ADD_FORCE' then",
  'v_force_count not between 1 and 9 or v_party_count <> 2 or v_slot_count <> 10',
  "v_action <> 'UPDATE_PARTICIPATION_TEAM_DRAFT'",
  "v_team.status <> 'DRAFT' or v_team.team_mode <> 'PARTICIPATION'",
  'perform private.kinojo_sm_assert_lease_v433',
  'for update',
  'grant execute on function public.kinojo_sanctuary_management_bootstrap_v435(text) to service_role',
  'grant execute on function public.kinojo_sanctuary_management_command_v435(text, text, text, jsonb, bigint) to service_role',
])assert.ok(migration.includes(token),`DB435 participation force contract missing ${token}`);

for(const token of [
  'const API_VERSION="1.6"',
  'const DATABASE_CONTRACT="439"',
  'kinojo_sanctuary_management_bootstrap_v439',
  'kinojo_sanctuary_management_command_v439',
])assert.ok(edge.includes(token),`current Edge contract missing ${token}`);

for(const token of [
  'const API_VERSION=1.6',
  'const SCHEMA_VERSION=439',
  'async function saveTeamDraft',
  "['ACTIVE','FULL'].includes(status)?'UPDATE_PARTICIPATION_TEAM':'UPDATE_PARTICIPATION_TEAM_DRAFT'",
  'joinPolicy,',
  'saveTeamDraft,',
  "ServerAdapter.command('ADD_FORCE'",
])assert.ok(client.includes(token),`WEB435 participation bridge missing ${token}`);

for(const token of [
  'data-draft-mode="participation"',
  "state.creationMode=mode.dataset.draftMode==='participation'?'PARTICIPATION':'FIXED'",
  'data-draft-join-policy="INSTANT"',
  'data-draft-join-policy="APPROVAL"',
  '첫 포스 추가 시 DRAFT와 1포스가 함께 생성됩니다.',
  '1포스 생성 · 최대 9',
  '10번째 포스는 추가할 수 없음',
  "if(forces.length>=9){setStatus('한 팀에는 최대 9포스까지만 구성할 수 있습니다.')",
  '참여 팀 DRAFT와 1포스를 Server에 함께 만들고 있습니다.',
  'await bridge().saveTeamDraft(model)',
  'await bridge().addForce',
])assert.ok(draft.includes(token),`participation-team UI missing ${token}`);
assert.equal(draft.includes('aria-disabled="true" data-draft-mode="participation"'),false,'participation mode must be selectable');

for(const token of [
  '.sanctuary-management-force-rail button.is-limit',
  '.sanctuary-management-join-policy',
  'overflow-x:hidden',
  'scrollbar-width:none',
  '.sanctuary-management-force-rail.has-more::after',
  '@media(max-width:1100px)',
])assert.ok(css.includes(token),`participation layout guard missing ${token}`);

console.log('KINOJO sanctuary management Stage 4-1 participation forces v435 contract: PASS');
