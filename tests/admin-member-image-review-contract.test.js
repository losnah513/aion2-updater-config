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
const edge = read('supabase/functions/kinojo-member-profile/index.ts');
const migration = read('supabase/migrations/20260828070646_member_image_admin_work_queue_v406.sql');

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
    '캐릭터 이미지·제작 요청 확인',
    'value="ACTION_REQUIRED">처리 필요',
    'value="IMAGE_REVIEW">이미지 확인',
    'value="PRODUCTION_REQUEST">제작 요청',
    'value="COMPLETED">처리 완료',
  ]) assert.ok(html.includes(token), `member image review HTML contract missing: ${token}`);
  assert.ok(html.includes('data-admin-master-only'), 'member image review must remain MASTER-only');
  assert.ok(html.includes('admin.css?cache=2026082804'), 'member image review CSS cache must be current');
  assert.ok(html.includes('admin.js?cache=2026082804'), 'admin module cache must be current');
}

for (const token of [
  "action:'admin-image-work-queue-list'",
  "action:'admin-image-review-ack'",
  'NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS',
  'updateMemberImageReviewBadges_',
  'renderMemberImageReviewRows_',
  'loadMemberImageReviews',
  'acknowledgeMemberImageReview_',
  'data-member-image-review-ack',
  'data-latest-uploaded-at',
  'data-member-image-request-view',
  'openMemberImageModal(requestView,{characterId:',
  'loadMemberImageGroups_(memberId,requestId,preferredCharacterId=0,preferredRequestId=0)',
]) assert.ok(members.includes(token), `member image review JS contract missing: ${token}`);

for (const token of [
  "subtab==='character-images'&&isMaster()",
  'memberImagePendingCount',
  'memberImageRequestPendingCount',
  'renderMemberImageReviewSummary_(imageCount,imageReviewCount,imageRequestCount,state.memberImageReviewTotalCount)',
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
  '.admin-member-image-review-row.is-request',
  '.admin-work-kind.request',
  '.admin-member-image-review-main dl',
  '@media(max-width:760px)',
]) assert.ok(css.includes(token), `member image review CSS contract missing: ${token}`);

assert.ok(notifications.includes("adminHref('#members/character-images')"), 'image upload notification must open the review subtab');
assert.ok(notifications.includes('latestCharacterImageUpload'), 'notification bridge must prefer the unified character-image event');

for (const token of [
  'ADMIN_WORK_QUEUE = "406"',
  'admin-image-work-queue-list',
  'kinojo_admin_member_image_work_queue_v406',
  'NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS',
  'admin-member-image-work-queue-api-v1',
]) assert.ok(edge.includes(token), `unified work queue Edge contract missing: ${token}`);

for (const token of [
  'create or replace function public.kinojo_admin_member_image_work_queue_v406',
  "v_filter text := upper(pg_catalog.btrim(coalesce(p_filter, 'ACTION_REQUIRED')))",
  "r.status in ('SUBMITTED', 'IN_PROGRESS')",
  "'itemType', 'IMAGE_REVIEW'",
  "'itemType', 'PRODUCTION_REQUEST'",
  "'actionRequiredCount'",
  'NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS',
  'revoke all on function public.kinojo_admin_member_image_work_queue_v406',
  'grant execute on function public.kinojo_admin_member_image_work_queue_v406',
]) assert.ok(migration.includes(token), `unified work queue migration contract missing: ${token}`);

for (const forbidden of ['objectPath', 'signedUrl', 'signedURL', 'uploadUrl']) {
  assert.ok(!members.includes(forbidden), `admin work queue client leaked private storage field: ${forbidden}`);
}

console.log('admin member image review contract: PASS');
