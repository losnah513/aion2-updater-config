const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const client=read('sanctuary-management/js/sanctuary-management.js');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');
const css=read('sanctuary-management/css/sanctuary-management-draft.css');
const feature=read('core/kinojo-supabase-features.js');

for(const token of [
  "action:'command'",
  'sessionToken:currentServerSessionCredential()',
  'requestKey:normalizedKey',
  'command:normalizedCommand',
  'payload:normalizedPayload',
  'expectedRevision:revision',
])assert.ok(feature.includes(token),`feature command boundary missing ${token}`);

for(const token of [
  'SERVER_ONLY_DRAFT',
  "mode=value(source.mode).toUpperCase()==='PARTICIPATION'?'PARTICIPATION':'FIXED'",
  "teamId?'UPDATE_TEAM_DRAFT':'CREATE_TEAM'",
  "async function saveFixedDraft(model)",
  'await load()',
  "ServerAdapter.command('ADD_FORCE'",
  "ServerAdapter.command('SET_SLOT'",
  'addForce,',
  'setSlot,',
  'data-sanctuary-edit-team',
])assert.ok(client.includes(token),`client fixed DRAFT flow missing ${token}`);

for(const token of [
  '고정 팀 생성',
  '참여 팀 생성',
  'data-draft-form',
  'data-draft-kind="WEEKLY"',
  'data-draft-kind="ONCE"',
  'draftWeekday',
  'durationMinutes',
  '저장 후 Server 생성',
  'Array.from({length:10}',
  'data-draft-force=',
  'data-draft-add-force',
  'data-slot-id=',
  'data-draft-slot',
  'data-draft-candidate',
  'function candidateMarkup',
  'function assignCreatorCharacter',
  "await bridge().setSlot",
  "await bridge().addForce",
  'aria-modal="true"',
  "if(event.key==='Escape'",
  "if(event.key!=='Tab')",
])assert.ok(draft.includes(token),`fixed DRAFT UI missing ${token}`);

for(const forbidden of ['fetch(','google.script.run','lookup-sheet-bridge','p_pass_key']){
  assert.equal(draft.includes(forbidden),false,`draft UI must not use ${forbidden}`);
}

for(const token of [
  'grid-template-columns:var(--sanctuary-composer-size) 286px',
  'grid-template-columns:20% 60% 20%',
  'grid-template-rows:20% 60% 20%',
  'grid-template-rows:repeat(5,minmax(0,1fr))',
  '.sanctuary-management-schedule-panel{order:1',
  '.sanctuary-management-composer{order:2',
  'overflow-x:hidden',
  'scrollbar-width:none',
  '.sanctuary-management-force-list',
  '.sanctuary-management-force-rail.has-more::after',
  '.sanctuary-management-candidate-rail.has-more::after',
  '.sanctuary-management-candidate-list',
  '.sanctuary-management-draft-slot.is-selected',
  '.sanctuary-management-draft-frame.has-more::after',
  '.sanctuary-management-schedule-panel.has-more::after',
  '@media(max-width:350px)',
])assert.ok(css.includes(token),`fixed DRAFT layout missing ${token}`);

for(const page of ['sanctuary-management/index.html','m/sanctuary-management/index.html']){
  const html=read(page);
  assert.ok(html.includes('sanctuary-management.js?cache=2026082811'),`${page}: management JS cache missing`);
  assert.ok(html.includes('sanctuary-management-draft.css?cache=2026082807'),`${page}: draft CSS cache missing`);
  assert.ok(html.includes('sanctuary-management-draft.js?cache=2026082811'),`${page}: draft JS cache missing`);
}

console.log('KINOJO sanctuary management fixed-team DRAFT contract: PASS');
