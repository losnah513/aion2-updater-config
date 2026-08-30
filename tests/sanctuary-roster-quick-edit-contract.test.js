const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('sanctuary/js/sanctuary.js');
const editor = read('sanctuary/js/sanctuary-editor.js');
const style = read('sanctuary/css/sanctuary.css');

assert.ok(page.includes('data-sanctuary-quick-add'), 'Empty sanctuary slots must expose the permission-gated quick-add action');
assert.equal(page.includes('>파티 정보 수정</button>'), false, 'The retired per-force party editor entry must not be rendered');

for (const token of [
  'forceEditBtn',
  '포스 편집하기',
  'sanctuaryQuickAddPopover',
  'sanctuaryQuickScope',
  "const QUICK_SCOPES=['WAITLIST','LEGION','ALL']",
  'commitQuickScope',
  'data-kinojo-range-mode="steps"',
  'window.KinojoRangeControl?.setValue',
  '해당 캐릭터로 검색',
  '이 조건으로 검색',
  "rosterAction('SEARCH'",
  "rosterAction('MUTATE'",
  "rosterAction('TARGET_OPEN'",
  "rosterAction('DRAFT_SAVE'",
  'selectedMemberKey',
  'data-roster-action="stage-remove"',
  'stageMemberRemoval',
  'sanctuaryRosterLeaseText',
  'hasRelationshipConflict',
  'hasForceRelationshipConflict',
  'sanctuary-roster-class-icon',
  'ROSTER_POWER_ICON_URL',
  'openQuickPopover',
  'closeQuickPopover',
  "event.key!=='Escape'"
]) {
  assert.ok(editor.includes(token), `Sanctuary roster editor is missing ${token}`);
}

for (const token of [
  '.empty-slot[data-sanctuary-quick-add].is-quick-add-enabled:hover',
  '@keyframes sanctuaryQuickFlow',
  '.sanctuary-quick-add-card',
  'background:rgba(255,255,255,.97)',
  'width:clamp(180px,42vw,216px)',
  'grid-template-columns:minmax(100px,180px) minmax(112px,1fr) 54px',
  '.sanctuary-quick-scope>.kinojo-range__control{width:100%}',
  '.sanctuary-roster-force-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))',
  '@media(max-width:1180px){.sanctuary-roster-force-grid{grid-template-columns:repeat(2,minmax(0,1fr))',
  '.sanctuary-roster-force-card.is-owner-conflict',
  'outline:3px solid rgba(239,68,68,.2)',
  'height:62px;min-height:62px',
  '.sanctuary-roster-class-icon{width:42px;height:42px',
  '.sanctuary-roster-relation-badge.is-main',
  '.sanctuary-roster-relation-badge.is-sub',
  '.sanctuary-roster-slot.is-drop-target',
  '.sanctuary-roster-slot.is-swap-target',
  '.sanctuary-roster-slot.is-selected',
  '.sanctuary-roster-exclude-badge',
  '.sanctuary-roster-lease-actions',
  'body>.sanctuary-page-bar .summary-card{min-height:26px'
]) {
  assert.ok(style.includes(token), `Sanctuary roster style is missing ${token}`);
}

for (const entry of ['sanctuary/index.html', 'm/sanctuary/index.html']) {
  const html = read(entry);
  assert.ok(html.includes('id="sanctuaryManagementTeamList"'), `${entry}: upgraded Server roster workspace is missing`);
  assert.ok(html.includes('sanctuary-management.css?cache=2026082903'), `${entry}: upgraded Sanctuary CSS is missing`);
  assert.ok(html.includes('kinojo-components.css?cache=2026082103'), `${entry}: shared component CSS is missing`);
  assert.equal(html.includes('sanctuary-editor.js'), false, `${entry}: retired roster editor remains loaded`);
  assert.equal(html.includes('id="forceEditBtn"'), false, `${entry}: retired global editor entry remains`);
}

assert.equal(editor.includes('class="sanctuary-roster-foot"'), false, 'Roster actions must not remain in a separate bottom footer');

assert.equal(editor.includes('sanctuaryQuickLegionOnly'), false, 'Legacy legion checkbox must be retired');
assert.equal(editor.includes('sanctuaryQuickWaitlistOnly'), false, 'Legacy waitlist checkbox must be retired');
assert.equal(editor.includes('--quick-scope-progress'), false, 'Page editor must not own shared range visuals');
assert.equal(editor.includes('updateQuickScopeSlider'), false, 'Page editor must not duplicate shared range behavior');
assert.equal(style.includes('::-webkit-slider-thumb'), false, 'Page CSS must not own shared range thumb visuals');
assert.ok(style.lastIndexOf('background:rgba(255,255,255,.97)') > style.indexOf('background:linear-gradient(145deg,rgba(13,31,31,.92),rgba(11,22,35,.88))'), 'KINOJO white quick-add override must win over the retired dark surface');

console.log('KINOJO sanctuary roster quick-add and global force editor contract: PASS');
