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
assert.ok(authUi.includes('kinojo-admin-notifications.js?cache=2026082601'), 'auth UI must load the latest shared admin notification bridge');

for (const expected of [
  "const SEEN_KEY='kinojo_admin_notification_seen_v405'",
  "const LEGACY_SUPPORT_SEEN_KEY='kinojo_support_notice_seen_v316'",
  'latestCodeRequest',
  'latestSupportRequest',
  'latestReferenceUpload',
  'latestCharacterImageUpload',
  'latestImageRequest',
  'memberImagePendingCount',
  'hasUnifiedImageQueue',
  "title:'코드 요청'",
  "title:'포스 지원'",
  "title:'캐릭터 이미지 업로드'",
  "title:'참고 이미지 제작 요청'",
  "message:'['+name+']님이 캐릭터 이미지를 업로드하였습니다.'",
  "eventKey:'CODE_REQUEST:'",
  "eventKey:'FORCE_REQUEST:'",
  "eventKey:'CHARACTER_IMAGE:'",
  "eventKey:'IMAGE_REQUEST:'",
  "tone:'code'",
  "tone:'support'",
  "tone:'reference'",
  "tone:'request'",
  'aspect-ratio:2/1',
  'grid-template-rows:1fr 2fr',
  'background:#fff',
  'translateY(36px)',
  "adminHref('#requests')",
  "adminHref('#sanctuary/requests')",
  "adminHref('#members/character-images')",
  "name==='notificationSummary'",
]) {
  assert.ok(bridge.includes(expected), `admin notification bridge contract missing: ${expected}`);
}

for (const colorContract of [
  '.tone-code .kinojo-admin-notification-head{background:linear-gradient(135deg,#38bdf8 0%,#3b82f6 100%)}',
  '.tone-support .kinojo-admin-notification-head{background:linear-gradient(135deg,#fb7185 0%,#ef4444 100%)}',
  '.tone-reference .kinojo-admin-notification-head{background:linear-gradient(135deg,#34d399 0%,#10b981 100%)}',
  '.tone-request .kinojo-admin-notification-head{background:linear-gradient(135deg,#a78bfa 0%,#7c3aed 100%)}',
]) {
  assert.ok(bridge.includes(colorContract), `notification type header color contract missing: ${colorContract}`);
}
assert.ok(bridge.includes('kinojo-admin-notification-accent'), 'character name must use the notification type accent inside the message');
assert.equal(bridge.includes('kinojo-admin-notification-character'), false, 'character name must not be duplicated as a standalone body row');
assert.ok(bridge.includes("badge.textContent=total>99?'99+':String(total);badge.hidden=total<1"), 'admin red badge must continue to use server totalCount only');
assert.ok(bridge.includes('Date.now()-lastSummaryAt<35000'), 'bridge must reuse common polling and only fall back when summary polling is absent');
assert.ok(bridge.includes("sessionStorage.setItem(LEGACY_SUPPORT_SEEN_KEY,String(id))"), 'legacy support-only toast must be suppressed before common renderer resumes');
assert.ok(bridge.includes('관리자 페이지 이동'), 'notification card must expose administrator-page hover/focus affordance');
assert.ok(bridge.includes('kinojo-admin-notification-link-hint-arrow'), 'administrator-page arrow must have its own accent style hook');
assert.ok(bridge.includes('kinojo-admin-notification-card:hover + .kinojo-admin-notification-link-hint'), 'desktop pointer hover must reveal the navigation hint');
assert.ok(bridge.includes('border-color:var(--kinojo-admin-notification-accent)'), 'hover/focus border must follow each notification accent color');
assert.ok(bridge.includes('color:var(--kinojo-admin-notification-accent)'), 'navigation hint arrow and message accent must follow each notification accent color');
assert.ok(bridge.includes('location.href=item.href'), 'notification card activation must navigate to the mapped administrator page');
assert.ok(bridge.includes('@media(hover:none){.kinojo-admin-notification-link-hint{display:none}}'), 'touch-only layouts must not reserve hover hint UI');
assert.ok(bridge.includes('.kinojo-admin-notification-card.is-pressing'), 'card activation must expose a pressed-state animation class');
assert.ok(bridge.includes("card.classList.add('is-pressing')"), 'card activation must trigger the pressed-state animation before navigation');
assert.ok(bridge.includes('setTimeout(()=>{location.href=item.href;},110)'), 'navigation must wait briefly so the press animation is visible');

assert.ok(bridge.includes('function isAdminPage()'), 'bridge must identify administrator routes');
assert.ok(bridge.includes("path==='/admin'||path.startsWith('/admin/')||path==='/m/admin'||path.startsWith('/m/admin/')"), 'desktop and mobile administrator route families must suppress notification cards');
assert.ok(bridge.includes('if(!summary||summary.ok!==true||isAdminPage())return;'), 'administrator pages must skip notification enqueue');
assert.ok(bridge.includes('if(isAdminPage()){clearRenderer();return;}'), 'administrator pages must fail closed before rendering while keeping summary processing available');

assert.equal(bridge.includes('hideTimer'), false, 'administrator notifications must not keep an automatic hide timer');
assert.equal(bridge.includes('8500'), false, 'administrator notifications must never auto-close after 8.5 seconds');
assert.ok(bridge.includes("card.querySelector('.kinojo-admin-notification-close')?.addEventListener('click'"), 'close button must remain the explicit queue-advance control');
assert.ok(bridge.includes('setTimeout(showNext,260)'), 'closing one notification must reveal the next queued notification');
assert.ok(bridge.includes('@media(prefers-reduced-motion:reduce)'), 'notification motion must respect reduced-motion preferences');
assert.ok(bridge.includes("event.key==='Enter'||event.key===' '"), 'card keyboard activation must keep Enter and Space support');
assert.ok(bridge.includes('.kinojo-admin-notification-close:focus-visible'), 'close button must remain keyboard focus-visible');

console.log('admin notification contract: PASS');
