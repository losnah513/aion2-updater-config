const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const authUi = read('core/kinojo-auth-ui.js');
const bridge = read('ui/kinojo-admin-notifications.js');

assert.ok(authUi.includes('id="kinojoCodeRequestPanel"'), 'member code request submission panel must remain');
for (const removed of [
  'checkPendingCodeRequests',
  'openCodeRequestNotice',
  'checkPendingSanctuaryRequests',
  'openSanctuaryRequestNotice_',
  'kinojoCodeRequestNoticeModal',
  'kinojoSanctuaryRequestNoticeModal',
]) {
  assert.equal(authUi.includes(removed), false, `legacy central admin notice path must be removed: ${removed}`);
}
assert.ok(authUi.includes('kinojo-admin-notifications.js?cache=2026082301'), 'auth UI must load the shared admin notification bridge');

for (const expected of [
  "const SEEN_KEY='kinojo_admin_notification_seen_v389'",
  "const LEGACY_SUPPORT_SEEN_KEY='kinojo_support_notice_seen_v316'",
  'latestCodeRequest',
  'latestSupportRequest',
  'latestReferenceUpload',
  "title:'코드 요청'",
  "title:'포스 요청'",
  "title:'참고 이미지 업로드'",
  "message:'['+name+']님이 참고 이미지를 업로드 하였습니다.'",
  'aspect-ratio:4/3',
  "adminHref('#requests')",
  "adminHref('#sanctuary/requests')",
  "adminHref('#members/accounts')",
  "name==='notificationSummary'",
]) {
  assert.ok(bridge.includes(expected), `admin notification bridge contract missing: ${expected}`);
}
assert.ok(bridge.includes("badge.textContent=total>99?'99+':String(total);badge.hidden=total<1"), 'admin red badge must continue to use server totalCount only');
assert.ok(bridge.includes('Date.now()-lastSummaryAt<35000'), 'bridge must reuse common polling and only fall back when summary polling is absent');
assert.ok(bridge.includes("sessionStorage.setItem(LEGACY_SUPPORT_SEEN_KEY,String(id))"), 'legacy support-only toast must be suppressed before common renderer resumes');

console.log('admin notification contract: PASS');
