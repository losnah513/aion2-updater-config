const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260828081822_sanctuary_management_stage4_complete_v436.sql');
const publishGuard=read('supabase/migrations/20260828085344_sanctuary_management_publish_guard_v436.sql');
const edge=read('supabase/functions/sanctuary-management/index.ts');
const feature=read('core/kinojo-supabase-features.js');
const client=read('sanctuary-management/js/sanctuary-management.js');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');
const support=read('sanctuary-management/js/sanctuary-management-support.js');
const supportCss=read('sanctuary-management/css/sanctuary-management-support.css');
const commonUi=read('ui/kinojo-common-ui.js');

for(const token of [
  'STAGE4_SUPPORT_SERIALIZATION','STAGE4_CREATOR_COMMAND_GATE',
  'kinojo_sm_creator_candidates_v436','kinojo_sm_support_characters_v436',
  'kinojo_sm_support_batches_v436','kinojo_sm_force_roster_v436',
  'kinojo_sanctuary_management_bootstrap_v436','kinojo_sanctuary_management_month_v436',
  'kinojo_sanctuary_management_command_v436',"v_action = 'SUBMIT_SUPPORT'",
  "v_action = 'DECIDE_SUPPORT'","v_action = 'CANCEL_SUPPORT'",
  "v_action = 'UPDATE_PARTICIPATION_TEAM'",'for update of s',
  'result_code','result_message','force_creator_count = 1','count(distinct creator_character_id)',
  "'weekStartsOn', 'WEDNESDAY'",'kinojo_sm_conflicts_for_participant_v412',
  'grant execute on function public.kinojo_sanctuary_management_command_v436(text, text, text, jsonb, bigint) to service_role',
  'revoke all on function public.kinojo_sanctuary_management_command_v436(text, text, text, jsonb, bigint) from public, anon, authenticated',
])assert.ok(migration.includes(token),`DB436 Stage 4 contract missing ${token}`);
for(const token of ["v_team.team_mode = 'FIXED' and not exists",'kinojo_sm_team_conflicts_v433(v_team_id)','kinojo_sanctuary_management_command_v436'])assert.ok(publishGuard.includes(token),`DB436 publish guard migration missing ${token}`);

for(const token of [
  'const API_VERSION="1.9"','const DATABASE_CONTRACT="449"','"month"',
  'kinojo_sanctuary_management_bootstrap_v449','kinojo_sanctuary_management_month_v449',
  'kinojo_sanctuary_management_command_v449',
])assert.ok(edge.includes(token),`current Edge contract missing ${token}`);

for(const token of ['getSanctuaryManagementMonth',"action:'month'",'runSanctuaryManagementCommand'])assert.ok(feature.includes(token),`Feature bridge missing ${token}`);

for(const token of [
  'const API_VERSION=1.9','const SCHEMA_VERSION=449','validateSupportCharacter','validateSupportBatch',
  'data-sanctuary-support-force','sanctuary-management-force-grid','async function loadMonth',
  "ServerAdapter.command('SUBMIT_SUPPORT'","ServerAdapter.command('DECIDE_SUPPORT'","ServerAdapter.command('CANCEL_SUPPORT'",
  'window.KinojoSanctuaryManagementSupportBridge',"['ACTIVE','FULL'].includes(status)?'UPDATE_PARTICIPATION_TEAM':'UPDATE_PARTICIPATION_TEAM_DRAFT'",
])assert.ok(client.includes(token),`WEB Stage 4 bridge missing ${token}`);

for(const token of [
  'function participationReady()',"bridge().saveComposition(model)",'참여 팀 생성',
  '만들어 둔 포스 중 한 곳에 생성자의 캐릭터 1개','최소 팀 생성자의 캐릭터 1개를 추가해야 합니다.',
  '즉시 참가는 빈 슬롯에 바로 배치되고',
])assert.ok(draft.includes(token),`Participation publisher UI missing ${token}`);

for(const token of [
  'state.assignments=new Map()','assignmentOwner','availableForceIds.includes',
  'data-support-submit','data-support-decision','data-support-cancel',
  'bridge().submitSupport','bridge().decideSupport','bridge().cancelSupport',
  "event.key==='Escape'","event.key!=='Tab'",
])assert.ok(support.includes(token),`Support modal contract missing ${token}`);

for(const token of [
  'overflow-x:hidden','scrollbar-width:none','.sanctuary-management-support-dialog.has-more::after',
  '@media(max-width:760px)','.sanctuary-management-force-grid',
])assert.ok(supportCss.includes(token),`Stage 4 layout guard missing ${token}`);

assert.ok(commonUi.includes('PUBLIC_SANCTUARY_NAV'),'public Sanctuary navigation warning missing');
assert.ok(commonUi.includes('const canOpenSanctuaryManagement=true'),'management navigation must remain visible to guests');

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  for(const token of ['sanctuary-management-support.css?cache=2026083007','sanctuary-management-support.js?cache=2026082923','kinojo-supabase-features.js?cache=2026083004'])assert.ok(html.includes(token),`${page}: missing ${token}`);
}

console.log('KINOJO sanctuary management Stage 4 complete v436 contract: PASS');
