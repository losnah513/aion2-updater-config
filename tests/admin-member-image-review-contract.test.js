const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const desktop = read('admin/index.html');
const mobile = read('m/admin/index.html');
const members = read('admin/js/admin-members.js');
const bootstrap = read('admin/js/admin-bootstrap.js');
const css = read('admin/css/admin.css');
const notifications = read('ui/kinojo-admin-notifications.js');

for (const html of [desktop, mobile]) {
  for (const token of [
    'id="adminMemberImageBadge"',
    'data-admin-subtab="character-images"',
    'id="adminMemberImageSubBadge"',
    'data-admin-subpane="character-images"',
    'id="memberImageReviewSearch"',
    'id="memberImageReviewStatus"',
    'id="memberImageReviewSummary"',
    'id="memberImageReviewList"',
    '캐릭터 이미지 확인',
    '미확인만',
  ]) assert.ok(html.includes(token), `member image review HTML contract missing: ${token}`);
  assert.ok(html.includes('data-admin-master-only'), 'member image review must remain MASTER-only');
  assert.ok(html.includes('admin.css?cache=2026082401'), 'member image review CSS cache must be current');
  assert.ok(html.includes('admin.js?cache=2026082410'), 'admin module cache must be current');
}

for (const token of [
  "action:'admin-image-review-list'",
  "action:'admin-image-review-ack'",
  'NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS',
  'updateMemberImageReviewBadges_',
  'renderMemberImageReviewRows_',
  'loadMemberImageReviews',
  'acknowledgeMemberImageReview_',
  'data-member-image-review-ack',
  'data-latest-uploaded-at',
  'openMemberImageModal(view)',
]) assert.ok(members.includes(token), `member image review JS contract missing: ${token}`);

for (const token of [
  "subtab==='character-images'&&isMaster()",
  'memberImagePendingCount',
  'refreshNotificationBadges()',
  'memberImageReviewReloadBtn',
  'memberImageReviewStatus',
  'memberImageReviewSearch',
  'memberImageReviewList',
  "clone.querySelectorAll('[id]').forEach",
]) assert.ok(bootstrap.includes(token), `member image review bootstrap contract missing: ${token}`);

for (const token of [
  '.admin-member-image-review-list',
  '.admin-member-image-review-row',
  '.admin-member-image-review-row.is-pending',
  '.admin-member-image-review-main dl',
  '@media(max-width:760px)',
]) assert.ok(css.includes(token), `member image review CSS contract missing: ${token}`);

assert.ok(notifications.includes("adminHref('#members/character-images')"), 'image upload notification must open the review subtab');
assert.ok(notifications.includes('latestCharacterImageUpload'), 'notification bridge must prefer the unified character-image event');

console.log('admin member image review contract: PASS');
