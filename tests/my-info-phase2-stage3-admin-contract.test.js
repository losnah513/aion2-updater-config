const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const migration = read('supabase/migrations/20260826053325_member_image_request_admin_workflow_v405.sql');
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
  'create table private.member_image_request_admin_events',
  'request_id bigint primary key',
  'alter table private.member_image_request_admin_events enable row level security',
  'revoke all on table private.member_image_request_admin_events from public, anon, authenticated',
  'on conflict (request_id) do nothing',
  'kinojo_admin_member_image_request_list_v405',
  'kinojo_admin_member_image_request_detail_v405',
  'kinojo_admin_member_image_request_status_v405',
  'kinojo_admin_member_image_request_asset_v405',
  "v_request.status = 'SUBMITTED' and v_next in ('IN_PROGRESS', 'REJECTED')",
  "v_request.status = 'IN_PROGRESS' and v_next in ('COMPLETED', 'REJECTED')",
  'insert into private.member_image_request_status_history',
  "'MASTER', v_actor_member_id",
  'memberImageRequestPendingCount',
  'latestImageRequest',
]) assert.ok(migration.includes(token), `stage-3 migration contract missing: ${token}`);

for (const fn of [
  'kinojo_admin_member_image_request_list_v405',
  'kinojo_admin_member_image_request_detail_v405',
  'kinojo_admin_member_image_request_status_v405',
  'kinojo_admin_member_image_request_asset_v405',
]) {
  assert.match(migration, new RegExp(`revoke all on function public\\.${fn}[\\s\\S]+?from public, anon, authenticated`), `${fn} public grants must be revoked`);
  assert.match(migration, new RegExp(`grant execute on function public\\.${fn}[\\s\\S]+?to service_role`), `${fn} must be Edge/service-role only`);
}

for (const token of [
  'ADMIN_REQUEST = "405"',
  'admin-image-request-list',
  'admin-image-request-detail',
  'admin-image-request-status',
  'admin-image-request-preview',
  'admin-image-request-download',
  'admin-member-image-request-list-api-v1',
  'admin-member-image-request-detail-api-v1',
  'admin-member-image-request-status-api-v1',
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
  'data-admin-image-request-status',
  "action:'admin-image-request-list'",
  "action:'admin-image-request-detail'",
  "action:'admin-image-request-status'",
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
  assert.ok(html.includes('캐릭터 이미지·제작 요청 확인'), 'admin page must explain the combined request workflow');
  assert.ok(html.includes('admin.css?cache=2026082605'), 'admin CSS cache must include stage 3');
  assert.ok(html.includes('admin.js?cache=2026082609'), 'admin JS cache must include current banner stage');
  assert.ok(html.includes('kinojo-auth-ui.js?cache=2026082601'), 'notification bridge loader cache must include stage 3');
}

assert.ok(shared.includes('memberImageRequestPendingCount:0'), 'shared state must track active production requests');
assert.ok(bootstrap.includes('memberImagePendingCount'), 'badge must keep generic image queue count');
assert.ok(bootstrap.includes('memberImageRequestPendingCount'), 'badge must include production requests');
for (const token of [
  "const SEEN_KEY='kinojo_admin_notification_seen_v405'",
  'latestImageRequest',
  "eventKey:'IMAGE_REQUEST:'",
  "tone:'request'",
  "title:'참고 이미지 제작 요청'",
  'memberImageRequestPendingCount',
  "adminHref('#members/character-images')",
  '.tone-request .kinojo-admin-notification-head',
]) assert.ok(notifications.includes(token), `stage-3 notification contract missing: ${token}`);
assert.ok(authUi.includes('kinojo-admin-notifications.js?cache=2026082601'), 'auth UI must load the stage-3 notification bridge');

const adminModule = {
  state: {}, $: () => null, action(){}, addLog(){}, adminAccount(){},
  esc(value){ return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); },
  isMaster(){ return true; }, option(){}, refreshDashboard(){}, roleKey(){}, roleLabel(){}, setStatus(){}, toast(){},
};
const context = { window: { KinojoAdmin: adminModule }, console, Date, Number, String, Array, Object, Math, RegExp, Error, setTimeout, clearTimeout };
vm.runInNewContext(members, context, { filename: 'admin/js/admin-members.js' });

const cards = adminModule.renderMemberImageRequestCards_([
  { requestId: 10, styleCode: 'ANIMATION', status: 'SUBMITTED', submittedAt: '2026-08-26T01:00:00Z', slots: ['FRONT','BACK'] },
  { requestId: 9, styleCode: null, status: 'IN_PROGRESS', submittedAt: '2026-08-25T01:00:00Z', slots: ['UPPER_BODY'] },
]);
assert.equal((cards.match(/data-admin-image-request-select=/g) || []).length, 2, 'request list must render one selectable card per request');
assert.equal(cards.includes('data-admin-image-request-detail-view='), false, 'request details must remain closed until a request card is selected');
assert.ok(cards.includes('data-admin-image-request-detail-host'), 'request list must reserve exactly one selected-detail host');

const detail = adminModule.renderMemberImageRequestDetail_({
  requestId: 10, styleCode: 'ANIMATION', requestNote: '밝고 선명하게', status: 'SUBMITTED', submittedAt: '2026-08-26T01:00:00Z', imageExpiresAt: '2026-09-02T01:00:00Z',
  allowedNextStatuses: ['IN_PROGRESS','REJECTED'],
  items: [{ slot:'FRONT', mimeType:'image/webp', sizeBytes:12345, available:true }],
  history: [{ previousStatus:'DRAFT', newStatus:'SUBMITTED', actorKind:'MEMBER', createdAt:'2026-08-26T01:00:00Z' }],
});
assert.ok(detail.includes('data-admin-image-request-detail-view="10"'), 'selected request detail must bind to its request id');
assert.equal((detail.match(/data-admin-image-request-slot=/g) || []).length, 1, 'detail must render only actually submitted slots');
assert.ok(detail.includes('밝고 선명하게'), 'detail must show the member production note');
assert.ok(detail.includes('data-admin-image-request-status="IN_PROGRESS"'), 'SUBMITTED request must offer production start');
assert.ok(detail.includes('data-admin-image-request-status="REJECTED"'), 'SUBMITTED request must offer rejection');

console.log('My Info phase-2 stage-3 admin workflow contract: PASS');
