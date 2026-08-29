const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260829082943_sanctuary_management_atomic_composer_v446.sql');
const client=read('sanctuary-management/js/sanctuary-management.js');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');
const pageCss=read('sanctuary-management/css/sanctuary-management.css');
const draftCss=read('sanctuary-management/css/sanctuary-management-draft.css');
const supportCss=read('sanctuary-management/css/sanctuary-management-support.css');

for(const token of [
  'kinojo_sm_composer_characters_v446',"v_action <> 'SAVE_COMPOSITION'",
  "pg_advisory_xact_lock(hashtextextended('sanctuary-management:'",
  'kinojo_sm_assert_pilot_write_v439','kinojo_sm_assert_lease_v433',
  'jsonb_array_length(v_composition) not between 1 and 9','jsonb_array_length(force_item->\'slots\')<>10',
  '같은 캐릭터는 한 팀에 중복 배치할 수 없습니다.','각 포스에 본캐·부캐를 합쳐 캐릭터 1개만 배치',
  '최소 팀 생성자의 캐릭터 1개를 추가해야 합니다.','kinojo_sm_team_conflicts_v437',
  'kinojo_sm_recompute_status_v412','kinojo_sm_audit_v412',
  'insert into private.sanctuary_management_commands_v412',
  'revoke all on function public.kinojo_sanctuary_management_command_v446',
  'grant execute on function public.kinojo_sanctuary_management_command_v446',
  'one complete browser-local team composition in one transaction',
])assert.ok(migration.includes(token),`atomic composer migration missing ${token}`);
assert.doesNotMatch(migration,/kws_[A-Za-z0-9_-]{20,}/,'atomic composer migration must not contain a credential');

for(const token of [
  'composerCharacters','async function saveComposition(model)',
  "ServerAdapter.command('SAVE_COMPOSITION'",'saveComposition,',
  'function durationLabel(minutes)','무제한',
  'sanctuary-management-force-party-head','sanctuary-management-force-slot-copy',
])assert.ok(client.includes(token),`atomic composer client missing ${token}`);

for(const token of [
  '팀 이름','name="draftMonth"','name="draftDay"','data-draft-period="AM"','data-draft-period="PM"',
  'data-draft-duration="','30분','1시간','2시간','무제한',
  'function syncNextRepeatDate','function removeForce','function clearSlot','function moveSlot',
  'data-draft-remove-force','data-draft-clear-slot','classIconFor',
  'state.team.forces.push(force)','chosen.slot.character=candidateCharacter(candidate)',
  'await bridge().saveComposition(model)','마지막 저장 전까지 Server에는 반영되지 않습니다.',
])assert.ok(draft.includes(token),`browser-local composer missing ${token}`);
for(const forbidden of ['bridge().setSlot(','bridge().addForce(','bridge().moveSlot(','bridge().publishTeam(']){
  assert.equal(draft.includes(forbidden),false,`composer must not call ${forbidden} before final save`);
}
assert.equal(draft.includes('name="draftActivity"'),false,'removed activity field returned');

for(const token of [
  '.kinojo-sanctuary-management-page button','.kinojo-btn.secondary','.kinojo-btn.danger',
])assert.ok(pageCss.includes(token),`KINOJO button styling missing ${token}`);
for(const token of [
  '.sanctuary-management-force-option','.sanctuary-management-slot-remove',
  '.sanctuary-management-candidate-card.is-main','.sanctuary-management-candidate-card.is-alt',
  '.sanctuary-management-date-parts','.sanctuary-management-time-parts','.sanctuary-management-duration-options',
  '@media(max-width:699px)',
])assert.ok(draftCss.includes(token),`composer layout styling missing ${token}`);
for(const token of [
  '.sanctuary-management-force-party-head','.sanctuary-management-force-slot-icon',
  '.sanctuary-management-force-slot-copy','grid-template-columns:1fr',
])assert.ok(supportCss.includes(token),`legacy-like operating roster styling missing ${token}`);

for(const page of ['sanctuary-management/index.html','m/sanctuary-management/index.html']){
  const html=read(page);
  assert.ok(html.includes('성역 팀 관리 전체 보기'),`${page}: full-view title missing`);
  assert.ok(html.includes('stage7review=2026082922'),`${page}: review cache key missing`);
}

console.log('KINOJO sanctuary management atomic browser-local composer contract: PASS');
