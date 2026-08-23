const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const common = read('ui/kinojo-common-ui.js');
const myInfoCss = read('ui/kinojo-my-info.css');
const adminMembers = read('admin/js/admin-members.js');
const adminCss = read('admin/css/admin.css');

for (const token of [
  'kinojo-my-info-manager-headline',
  'kinojo-my-info-profile-layout',
  'kinojo-my-info-profile-character-pane',
  'updateMyInfoProfileCharacterOverflow_',
  'KINOJO_REFERENCE_GUIDE_ASSETS',
  '/assets/images/my-info/guides/front-2x3.png',
  '/assets/images/my-info/guides/back-2x3.png',
  '/assets/images/my-info/guides/upper-body-4x5.png',
  'data-reference-select-slot',
  'data-reference-upload-slot',
  'data-reference-cancel-slot',
  'data-reference-delete-slot',
  'uploadMyInfoReference_(slotValue)',
  'deleteMyInfoReference_(slotValue)',
  "link.href='/ui/kinojo-my-info.css?cache=2026082203'",
]) assert.ok(common.includes(token), `My Info JS contract missing: ${token}`);
assert.equal(common.includes('kinojoMyInfoReferenceUploadBtn'), false, 'global reference upload button must be removed');
assert.equal(common.includes('kinojoMyInfoReferenceCancelBtn'), false, 'global reference cancel button must be removed');
assert.equal(common.includes('kinojoMyInfoReferenceDeleteBtn'), false, 'global reference delete button must be removed');

for (const token of [
  'grid-template-columns:repeat(2,minmax(0,1fr))',
  'scrollbar-width:none',
  'kinojo-my-info-profile-character-pane::before',
  'kinojo-my-info-profile-character-pane::after',
  'object-fit:contain',
  'height:auto',
  'prefers-reduced-motion:reduce',
  '.kinojo-my-info-btn.is-clicked',
  '.kinojo-my-info-menu-btn.is-clicked',
]) assert.ok(myInfoCss.includes(token), `My Info CSS contract missing: ${token}`);

for (const token of [
  'memberImageModalData',
  'selectedMemberImageCharacterId',
  'renderMemberImageCharacterSelector_',
  'data-admin-image-character-select',
  'selectMemberImageCharacter_',
  'data-admin-member-image-detail',
  'data-admin-member-image-character=',
  "document.body.classList.add('admin-member-image-modal-open')",
  "document.body.classList.remove('admin-member-image-modal-open')",
]) assert.ok(adminMembers.includes(token), `Admin member image JS contract missing: ${token}`);
assert.equal(adminMembers.includes("characters.map(renderAdminCharacterImageGroup_).join('')"), false, 'admin modal must not render all character detail cards together');

for (const token of [
  '#adminMemberImageModal .admin-event-preview-panel',
  'grid-template-rows:auto minmax(0,1fr)',
  '#adminMemberImageModal .admin-event-preview-head{display:flex!important',
  '#adminMemberImageModal .admin-event-preview-body{display:block!important',
  'overflow-y:auto!important',
  '.admin-member-image-character-selector',
  'body.admin-member-image-modal-open{overflow:hidden}',
]) assert.ok(adminCss.includes(token), `Admin member image CSS contract missing: ${token}`);

const vm = require('node:vm');
const adminModule = { state: {}, $: () => null, action(){}, addLog(){}, adminAccount(){}, esc(value){ return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }, isMaster(){ return true; }, option(){}, refreshDashboard(){}, roleKey(){}, roleLabel(){}, setStatus(){}, toast(){} };
const adminContext = { window: { KinojoAdmin: adminModule }, console, Date, Number, String, Array, Object, Math, RegExp, Error, setTimeout, clearTimeout };
vm.runInNewContext(adminMembers, adminContext, { filename: 'admin/js/admin-members.js' });
const sample = { ownerResolved:true, profileOverrideCount:1, referenceCount:2, characters:[
  { characterId:1, characterName:'본캐', serverName:'지켈', className:'검성', isMain:true, profile:{hasOverride:false}, references:[] },
  { characterId:2, characterName:'부캐A', serverName:'지켈', className:'치유성', isMain:false, profile:{hasOverride:false}, references:[] },
  { characterId:3, characterName:'부캐B', serverName:'루미엘', className:'궁성', isMain:false, profile:{hasOverride:false}, references:[] },
] };
const rendered = adminModule.renderMemberImageGroups_(sample, 2);
assert.equal((rendered.match(/data-admin-image-character-select=/g) || []).length, 3, 'admin selector must render every owned character');
assert.equal((rendered.match(/data-admin-member-image-character=/g) || []).length, 1, 'admin detail must render only the selected character');
assert.ok(rendered.includes('data-admin-member-image-character="2"'), 'requested character detail must be selected');
assert.ok(rendered.includes('aria-selected="true"'), 'selected character card must expose state');

console.log('My Info + admin member image layout contract passed');
