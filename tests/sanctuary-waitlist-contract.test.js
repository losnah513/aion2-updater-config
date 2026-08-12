const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const feature = read('core/kinojo-supabase-features.js');
const page = read('sanctuary/js/sanctuary.js');
const style = read('sanctuary/css/sanctuary.css');

for (const token of [
  'kinojo_web_get_sanctuary_waitlist_v315',
  'kinojo_web_get_sanctuary_v317',
  'kinojo_web_get_sanctuary_waitlist_recommendations_v318',
  'kinojo_sanctuary_waitlist_slot_detail_v318',
  'kinojo_sanctuary_support_request_submit_v318',
  'kinojo_web_notification_summary_v316',
  "sanctuaryWaitlistRecommendations",
  "sanctuaryWaitlistSlotDetail",
  "sanctuarySupportRequest"
]) {
  assert.ok(feature.includes(token), `Supabase feature bridge is missing ${token}`);
}

for (const token of [
  'data-waitlist-open',
  'waitlist-person-card',
  'waitlist-sanctuary-card',
  'waitlist-force-card',
  'SANCTUARY_WAITLIST_CLASSES',
  'sanctuaryForceHasMembers',
  'sanctuaryWaitlistSortDirection',
  'waitlist-sort-arrow',
  'completionReady',
  '클래스 중복 없음 → 합류하면 완성되는 포스 → 공석 적은 순',
  'data-waitlist-step-go="4"',
  'data-waitlist-empty-slot',
  'DIRECT_ASSIGN',
  'forceOwnerConflict',
  'sameClassAsCandidate',
  '동일 사용자 캐릭터 편성 불가',
  '해당 파티에는 이미 [',
  'withRequestTimeout'
]) {
  assert.ok(page.includes(token), `Sanctuary waitlist UI is missing ${token}`);
}

assert.equal(/\b(2700|3500|4300|4500)\b/.test(page), false, 'WEB must not own sanctuary item-level thresholds');
assert.ok(style.includes('grid-template-columns:minmax(250px,.78fr) minmax(330px,1fr) minmax(390px,1.25fr)'), 'Desktop modal must keep three panes');
assert.ok(style.includes('.sanctuary-waitlist-modal.is-compact-phone'), 'Compact phone page-flow contract is missing');
assert.ok(style.includes('.waitlist-people-pane.is-class-view .waitlist-people-browser'), 'Class view must use a vertical side tab rail');
assert.ok(style.includes('min-height:92px'), 'Force recommendation cards must provide doubled readable height');
assert.ok(style.includes('.waitlist-sort-arrow'), 'Waitlist sorting direction arrow is missing');
assert.ok(style.includes('.waitlist-slot.is-same-class'), 'Same-class occupied slot warning is missing');
assert.ok(style.includes('.waitlist-confirm-warning'), 'Same-class confirmation warning is missing');
assert.equal(page.includes('공석 많은 순'), false, 'Recommendation copy must never advertise vacancy-descending ranking');
assert.ok(style.includes('[data-waitlist-step="4"]'), 'Compact phone party step is missing');
assert.ok(style.includes('.kinojo-scrollbar::-webkit-scrollbar'), 'KINOJO modal scrollbar contract is missing');
assert.ok(style.includes('top:var(--kinojo-safe-top,0px)'), 'Modal must respect the fixed top safe area');
assert.ok(style.includes('bottom:var(--kinojo-safe-bottom,0px)'), 'Modal must respect the fixed notice-bar safe area');

for (const entry of ['sanctuary/index.html', 'm/sanctuary/index.html']) {
  const html = read(entry);
  assert.ok(html.includes('sanctuary.css?cache=2026081222'), `${entry}: waitlist CSS cache missing`);
  assert.ok(html.includes('sanctuary.js?cache=2026081222'), `${entry}: waitlist JS cache missing`);
  assert.ok(html.includes('kinojo-supabase-features.js?cache=2026081218'), `${entry}: feature bridge cache missing`);
}

assert.ok(style.includes('.sanctuary-waitlist-modal.is-split-mobile'), 'Fold/tablet split-flow contract is missing');
assert.ok(style.includes('.is-recommendation-stage'), 'Fold/tablet sanctuary-to-recommendation slide is missing');
assert.ok(style.includes('grid-template-columns:minmax(0,1fr) minmax(0,1fr)'), 'Fold recommendation workspace must split force and party evenly');

for (const type of ['backgrounds', 'bosses']) {
  for (const code of ['rudra', 'bagot', 'kaldrix']) {
    const file = path.join(root, 'assets', 'images', 'sanctuary', type, `${code}.webp`);
    const stat = fs.statSync(file);
    assert.ok(stat.size > 20_000, `${type}/${code}.webp is unexpectedly small`);
    assert.ok(stat.size < 500_000, `${type}/${code}.webp exceeds the web asset budget`);
  }
}

console.log('KINOJO sanctuary waitlist, recommendation modal, and asset contract: PASS');
