const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const migration = read('supabase/migrations/20260828223317_member_image_request_acknowledgement_v444.sql');
const legacyMigration = read('supabase/migrations/20260826053325_member_image_request_admin_workflow_v405.sql');
const edge = read('supabase/functions/kinojo-member-profile/index.ts');
const members = read('admin/js/admin-members.js');
const bootstrap = read('admin/js/admin-bootstrap.js');
const shared = read('admin/js/admin-shared.js');
const css = read('admin/css/admin.css');
const desktop = read('admin/index.html');
const mobile = read('m/admin/index.html');
const notifications = read('ui/kinojo-admin-notifications.js');
const authUi = read('core/kinojo-auth-ui.js');

for (const token of [
  'add column acknowledged_at timestamptz',
  'kinojo_admin_member_image_request_list_v444',
  'kinojo_admin_member_image_request_detail_v444',
  'kinojo_admin_member_image_request_ack_v444',
  'kinojo_admin_member_image_work_queue_v444',
  "check (status in ('DRAFT', 'SUBMITTED', 'CANCELLED'))",
  "revoke all on function public.kinojo_admin_member_image_request_status_v405",
  'memberImageRequestPendingCount',
  'latestImageRequest',
]) assert.ok(migration.includes(token), `stage-3 migration contract missing: ${token}`);

for (const fn of [
  'kinojo_admin_member_image_request_list_v444',
  'kinojo_admin_member_image_request_detail_v444',
  'kinojo_admin_member_image_request_ack_v444',
  'kinojo_admin_member_image_work_queue_v444',
]) {
  assert.match(migration, new RegExp(`revoke all on function public\\.${fn}[\\s\\S]+?from public, anon, authenticated`), `${fn} public grants must be revoked`);
  assert.match(migration, new RegExp(`grant execute on function public\\.${fn}[\\s\\S]+?to service_role`), `${fn} must be Edge/service-role only`);
}

for (const token of [
  'ADMIN_REQUEST = "444"',
  'admin-image-request-list',
  'admin-image-request-detail',
  'admin-image-request-ack',
  'admin-image-request-preview',
  'admin-image-request-download',
  'admin-member-image-request-list-api-v1',
  'admin-member-image-request-detail-api-v1',
  'admin-member-image-request-ack-api-v1',
  'SIGNED_PREVIEW_URL_ONLY_NO_OBJECT_PATH',
  'SIGNED_DOWNLOAD_URL_ONLY_NO_OBJECT_PATH',
  'EXPLICIT_DOWNLOAD_ONLY',
]) assert.ok(edge.includes(token), `stage-3 Edge contract missing: ${token}`);

for (const token of [
  'data-admin-image-request-console',
  'data-admin-image-request-select',
  'data-admin-image-request-detail-host',
  'data-admin-image-request-preview',
  'data-admin-image-request-download',
  'data-admin-image-request-ack',
  "action:'admin-image-request-list'",
  "action:'admin-image-request-detail'",
  "action:'admin-image-request-ack'",
  "action:'admin-image-request-preview'",
  "action:'admin-image-request-download'",
  'NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS',
  'SIGNED_PREVIEW_URL_ONLY_NO_OBJECT_PATH',
  'SIGNED_DOWNLOAD_URL_ONLY_NO_OBJECT_PATH',
  'ADMIN_IMAGE_REQUEST_DOWNLOAD_URL_INVALID',
]) assert.ok(members.includes(token), `stage-3 admin UI contract missing: ${token}`);
for (const forbidden of ['objectPath', 'signedUrl', 'uploadUrl']) {
  assert.equal(members.includes(forbidden), false, `admin client leaked private Storage selector: ${forbidden}`);
}

for (const token of [
  '.admin-member-image-request-console',
  '.admin-member-image-request-list',
  '.admin-member-image-request-card.is-selected',
  '.admin-member-image-request-detail-card',
  '.admin-member-image-request-assets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))',
  '@media(max-width:720px)',
  '@media(max-width:420px)',
]) assert.ok(css.includes(token), `stage-3 admin CSS contract missing: ${token}`);

for (const html of [desktop, mobile]) {
  assert.ok(html.includes('참고 이미지 제작 요청 확인'), 'admin page must explain the acknowledgement-only request workflow');
  assert.ok(html.includes('admin.css?cache=2026082804'), 'admin CSS cache must include stage 3');
  assert.ok(html.includes('admin.js?cache=2026082901'), 'admin JS cache must include the current admin loader');
  assert.ok(html.includes('kinojo-auth-ui.js?cache=2026082901'), 'notification bridge loader cache must include the acknowledgement contract');
}

assert.ok(shared.includes('memberImageRequestPendingCount:0'), 'shared state must track active production requests');
assert.ok(bootstrap.includes('memberImageRequestPendingCount'), 'badge must include production requests');
for (const token of [
  "const SEEN_KEY='kinojo_admin_notification_seen_v444'",
  'latestImageRequest',
  "eventKey:'IMAGE_REQUEST:'",
  "tone:'request'",
  "title:'참고 이미지 제작 요청'",
  'memberImageRequestPendingCount',
  "adminHref('#members/character-images')",
  '.tone-request .kinojo-admin-notification-head',
]) assert.ok(notifications.includes(token), `stage-3 notification contract missing: ${token}`);
assert.ok(authUi.includes('kinojo-admin-notifications.js?cache=2026082901'), 'auth UI must load the acknowledgement notification bridge');

const adminModule = {
  state: {}, $: () => null, action(){}, addLog(){}, adminAccount(){},
  esc(value){ return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); },
  isMaster(){ return true; }, option(){}, refreshDashboard(){}, roleKey(){}, roleLabel(){}, setStatus(){}, toast(){},
};
const context = { window: { KinojoAdmin: adminModule }, console, Date, Number, String, Array, Object, Math, RegExp, Error, setTimeout, clearTimeout };
vm.runInNewContext(members, context, { filename: 'admin/js/admin-members.js' });

const cards = adminModule.renderMemberImageRequestCards_([
  { requestId: 10, styleCode: 'ANIMATION', pending: true, submittedAt: '2026-08-26T01:00:00Z', slots: ['FRONT','BACK'] },
  { requestId: 9, styleCode: null, pending: false, acknowledgedAt: '2026-08-26T02:00:00Z', submittedAt: '2026-08-25T01:00:00Z', slots: ['UPPER_BODY'] },
]);
assert.equal((cards.match(/data-admin-image-request-select=/g) || []).length, 2, 'request list must render one selectable card per request');
assert.equal(cards.includes('data-admin-image-request-detail-view='), false, 'request details must remain closed until a request card is selected');
assert.ok(cards.includes('data-admin-image-request-detail-host'), 'request list must reserve exactly one selected-detail host');

const detail = adminModule.renderMemberImageRequestDetail_({
  requestId: 10, styleCode: 'ANIMATION', requestNote: '밝고 선명하게', pending: true, submittedAt: '2026-08-26T01:00:00Z', imageExpiresAt: '2026-09-02T01:00:00Z',
  items: [{ slot:'FRONT', mimeType:'image/webp', sizeBytes:12345, available:true }],
});
assert.ok(detail.includes('data-admin-image-request-detail-view="10"'), 'selected request detail must bind to its request id');
assert.equal((detail.match(/data-admin-image-request-slot=/g) || []).length, 1, 'detail must render only actually submitted slots');
assert.ok(detail.includes('밝고 선명하게'), 'detail must show the member production note');
assert.ok(detail.includes('data-admin-image-request-ack'), 'pending request must offer one acknowledgement button');
assert.equal(detail.includes('data-admin-image-request-status'), false, 'legacy production status controls must be removed');
assert.ok(legacyMigration.includes('kinojo_admin_member_image_request_asset_v405'), 'v405 asset resolver remains the signed-file boundary');

console.log('My Info phase-2 stage-3 admin workflow contract: PASS');
