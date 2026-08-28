'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n');
const requestApi = require('../ui/kinojo-my-info-image-request.js');
const imageContract = require('../ui/kinojo-my-info-image-contract.js');
const uploadApi = require('../ui/kinojo-my-info-image-upload.js');

const memberMigration = read('supabase/migrations/20260826033315_member_image_request_batch_v404.sql');
const adminMigration = read('supabase/migrations/20260828223317_member_image_request_acknowledgement_v444.sql');
const legacyAdminMigration = read('supabase/migrations/20260826053325_member_image_request_admin_workflow_v405.sql');
const edge = read('supabase/functions/kinojo-member-profile/index.ts');
const cleanup = read('supabase/functions/kinojo-member-image-cleanup/index.ts');
const memberUi = read('ui/kinojo-common-ui.js');
const adminUi = read('admin/js/admin-members.js');
const notifications = read('ui/kinojo-admin-notifications.js');
const desktopPrivacy = read('pages/privacy.html');
const mobilePrivacy = read('m/pages/privacy.html');
const workflow = read('.github/workflows/verify-kinojo-pages.yml');

const token = `kws_${'S'.repeat(44)}`;
const result = slot => ({
  slot,
  blob: { size: 12000, type: 'image/webp' },
  mimeType: 'image/webp',
  width: 800,
  height: slot === 'UPPER_BODY' ? 1000 : 1200,
  outputReady: true,
  uploadConnected: false,
  originalUploaded: false,
  metadataStripped: true,
});
const context = results => ({
  client: { invokeEdgeFunction() {} },
  sessionToken: token,
  characterId: 41,
  styleCode: 'ANIMATION',
  requestNote: '밝은 표정과 푸른 조명',
  results,
  contract: imageContract,
  uploadApi,
});

assert.throws(() => requestApi.validateContext(context([])), /REQUEST_IMAGE_COUNT_INVALID/);
for (const slots of [
  ['FRONT'],
  ['FRONT', 'BACK'],
  ['FRONT', 'BACK', 'UPPER_BODY'],
]) {
  const validated = requestApi.validateContext(context(slots.map(result)));
  assert.deepEqual(validated.items.map(item => item.slot), slots);
}
assert.throws(
  () => requestApi.validateContext(context(['FRONT', 'BACK', 'UPPER_BODY', 'PROFILE'].map(result))),
  /REQUEST_IMAGE_COUNT_INVALID|IMAGE_SLOT_INVALID/,
);
assert.throws(
  () => requestApi.validateContext({ ...context([result('FRONT')]), styleCode: 'WATERCOLOR' }),
  /REQUEST_STYLE_INVALID/,
);
assert.throws(
  () => requestApi.validateContext({ ...context([result('FRONT')]), requestNote: '가'.repeat(301) }),
  /REQUEST_NOTE_TOO_LONG/,
);
assert.throws(
  () => requestApi.validateContext({ ...context([result('FRONT')]), styleCode: 'CUSTOM', requestNote: '' }),
  /REQUEST_CUSTOM_NOTE_REQUIRED/,
);

for (const tokenText of [
  "if v_count < 1 or v_count > 3",
  "style_code in ('SHONEN_MANGA','ROMANCE_MANGA','ANIMATION','REALISTIC','CUSTOM')",
  'char_length(request_note) <= 300',
  "image_expires_at <= created_at + interval '7 days'",
  "metadata_expires_at <= created_at + interval '30 days'",
  'alter table private.member_image_requests enable row level security',
  'to service_role',
]) assert.ok(memberMigration.includes(tokenText), `missing member closeout contract: ${tokenText}`);

for (const tokenText of [
  'add column acknowledged_at timestamptz',
  'kinojo_admin_member_image_request_ack_v444',
  "check (status in ('DRAFT', 'SUBMITTED', 'CANCELLED'))",
  "'latestCharacterImageUpload', null",
  "'latestImageRequest', v_latest_image_request",
]) assert.ok(adminMigration.includes(tokenText), `missing admin closeout contract: ${tokenText}`);
assert.ok(legacyAdminMigration.includes('kinojo_admin_member_image_request_asset_v405'), 'signed asset resolver must remain available');

for (const tokenText of [
  'image-request-prepare',
  'image-request-finalize',
  'image-request-state',
  'admin-image-request-list',
  'admin-image-request-detail',
  'admin-image-request-ack',
  'admin-image-request-preview',
  'admin-image-request-download',
  'NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS',
  'SIGNED_PREVIEW_URL_ONLY_NO_OBJECT_PATH',
  'SIGNED_DOWNLOAD_URL_ONLY_NO_OBJECT_PATH',
]) assert.ok(edge.includes(tokenText), `missing integrated Edge action/privacy contract: ${tokenText}`);
for (const removed of ['admin-image-review-list', 'admin-image-review-ack', 'admin-image-request-status']) {
  assert.equal(edge.includes(removed), false, `removed admin image action still exposed: ${removed}`);
}
for (const removed of ['"reference-upload-prepare",', '"reference-upload-complete",', '"reference-upload-replace-complete",']) {
  assert.equal(edge.includes(removed), false, `standalone reference upload action still exposed: ${removed}`);
}
assert.ok(memberUi.includes('참고 이미지 제작 요청 전송 완료'), 'member UI must describe one request submission path');

assert.ok(cleanup.includes('kinojo_member_image_request_metadata_cleanup_v404'));
assert.ok(memberUi.includes('이미지 제작 요청 보내기'));
assert.ok(memberUi.includes('요청 스타일을 정하지 않고 이미지만 업로드하시겠습니까?'));
assert.ok(adminUi.includes('data-admin-image-request-select'));
assert.ok(adminUi.includes('data-admin-image-request-detail-host'));
assert.ok(notifications.includes("eventKey:'IMAGE_REQUEST:'"));

for (const privacy of [desktopPrivacy, mobilePrivacy]) {
  for (const tokenText of [
    '시행일: 2026년 8월 26일',
    '비공개 참고 이미지와 제작 요청',
    '참고 이미지 1~3장',
    '최대 300자의 추가 요청',
    '최대 60초의 Signed URL',
    '최대 7일',
    '최대 30일',
    '스타일·추가 요청·관리자 확인 시각',
  ]) assert.ok(privacy.includes(tokenText), `privacy disclosure missing: ${tokenText}`);
  assert.ok(privacy.includes('service_role 키나 private object path를 제공하지 않습니다.'));
}
assert.ok(desktopPrivacy.includes('.wrap{box-sizing:border-box;'), 'desktop privacy wrapper must not overflow narrow viewports');

for (const testPath of [
  'tests/my-info-image-request-server-contract.test.js',
  'tests/my-info-image-request-client.test.js',
  'tests/my-info-image-request-ui-contract.test.js',
  'tests/my-info-phase2-stage3-admin-contract.test.js',
  'tests/my-info-phase2-stage4-closeout-contract.test.js',
]) assert.ok(workflow.includes(`node ${testPath}`), `workflow must run ${testPath}`);

console.log('KINOJO My Info phase-2 stage-4 integrated closeout contract: PASS');
