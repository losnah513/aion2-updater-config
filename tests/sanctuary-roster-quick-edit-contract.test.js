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
  'quick-scope-progress',
  '해당 캐릭터로 검색',
  '이 조건으로 검색',
  "rosterAction('SEARCH'",
  "rosterAction('MUTATE'",
  "rosterAction('TARGET_OPEN'",
  "rosterAction('DRAFT_SAVE'",
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
  '#sanctuaryQuickScope{--quick-scope-progress:100%',
  'height:44px',
  'width:22px;height:22px',
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
  'body>.sanctuary-page-bar .summary-card{min-height:26px'
]) {
  assert.ok(style.includes(token), `Sanctuary roster style is missing ${token}`);
}

for (const entry of ['sanctuary/index.html', 'm/sanctuary/index.html']) {
  const html = read(entry);
  assert.ok(html.includes('id="forceEditBtn"'), `${entry}: global force editor button is missing`);
  assert.ok(html.includes('sanctuary.css?cache=2026082102'), `${entry}: sanctuary CSS cache key is stale`);
  assert.ok(html.includes('sanctuary-editor.js?cache=2026082102'), `${entry}: editor cache key is stale`);
}

assert.equal(editor.includes('sanctuaryQuickLegionOnly'), false, 'Legacy legion checkbox must be retired');
assert.equal(editor.includes('sanctuaryQuickWaitlistOnly'), false, 'Legacy waitlist checkbox must be retired');
assert.ok(style.lastIndexOf('background:rgba(255,255,255,.97)') > style.indexOf('background:linear-gradient(145deg,rgba(13,31,31,.92),rgba(11,22,35,.88))'), 'KINOJO white quick-add override must win over the retired dark surface');

console.log('KINOJO sanctuary roster quick-add and global force editor contract: PASS');
