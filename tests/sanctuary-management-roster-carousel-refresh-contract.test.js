const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const client=read('sanctuary-management/js/sanctuary-management.js');
const supportClient=read('sanctuary-management/js/sanctuary-management-support.js');
const pageCss=read('sanctuary-management/css/sanctuary-management.css');
const draftCss=read('sanctuary-management/css/sanctuary-management-draft.css');
const rosterCss=read('sanctuary-management/css/sanctuary-management-support.css');
const workflow=read('.github/workflows/verify-kinojo-pages.yml');

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  for(const token of ['sanctuaryManagementRefreshCard','sanctuaryManagementRefreshState','sanctuaryManagementRefreshMeta','sanctuaryManagementRefreshAction','새로고침하기','canonical=2026083002','stage77=2026083001'])assert.ok(html.includes(token),`${page}: refresh/projector asset missing ${token}`);
  assert.equal(html.includes('sanctuaryManagementSelectedName'),false,`${page}: redundant selected sanctuary card returned`);
}

for(const token of [
  'CLASS_ICON_MAP','function classIconFor','function createMaskedCharacterName','slice(0,5)','is-faded',
  'is-viewer-character','is-main','is-alt',"'['+(value(slot.character?.serverName)||'서버 미상')+']'",
  'sanctuary-management-force-carousel','dataset.sanctuaryForceShift','setForceCarouselIndex','forceCarouselCurrent','setForceCardVisibility',
  'touchstart','touchend',"event.key==='ArrowRight'",'dataset.sanctuaryForcePosition','dataset.sanctuaryForceAnnouncer',
  'sanctuary-management-force-overview-layer','function openForceOverview','function suspendForceOverview','function resumeForceOverview',
  'dataset.forceOverviewEdit','포스·캐릭터 편집','팀 이미지 복사','window.KinojoSanctuaryManagementSupportUI?.open?.',
  'BACKGROUND_CHECK_INTERVAL','pendingBootstrapData','bootstrapFingerprint','checkForUpdates','refreshContent',
  "meta.textContent=hasUpdate?'새로운 내용이 추가되었습니다.'",
])assert.ok(client.includes(token),`roster/carousel/refresh client missing ${token}`);

for(const token of ['onClose:null','typeof options?.onClose',"if(onClose)onClose()"]){
  assert.ok(supportClient.includes(token),`support overview return contract missing ${token}`);
}
assert.equal(client.includes('forceCarouselStarts'),false,'paired-force page calculation must be removed');
assert.equal(client.includes('scrollTo({left:'),false,'operating roster must not use the old horizontal scroll carousel');

assert.equal(client.includes("window.addEventListener('kinojo:auth-changed',load)"),false,'auth refresh must not replace visible content');
assert.equal(client.includes('renderMonth();if(bootstrapData)renderTeams();'),false,'month loading must not rerender operating teams');

for(const token of [
  '.sanctuary-management-date-field,.sanctuary-management-time-field{grid-template-columns:max-content minmax(0,1fr)',
  'width:3.25em!important','grid-template-columns:repeat(2,40px)',
])assert.ok(draftCss.includes(token),`compact schedule fields missing ${token}`);

for(const token of [
  'grid-area:1/1','width:min(700px,100%)','perspective:1300px','sanctuary-force-enter-forward','.46s cubic-bezier',
  'min-height:48px','grid-template-columns:21px 34px 5em minmax(0,1fr)','width:34px','font-size:11px',
  '.sanctuary-management-force-overview-layer[hidden]','width:min(1420px,calc(100vw - 40px))','grid-template-columns:repeat(2,minmax(0,1fr))',
  '@media(max-width:980px){.sanctuary-management-force-overview-grid{grid-template-columns:1fr}',
  '.sanctuary-management-force-carousel.has-pages .sanctuary-management-force-arrow{display:none!important}',
  'touch-action:pan-y','overflow-x:hidden','scrollbar-width:none','mask-image:linear-gradient',
  'sanctuary-management-force-slot-icon img',
  '.sanctuary-management-force-slot.is-viewer-character','.sanctuary-management-force-slot.is-main','.sanctuary-management-force-slot.is-alt',
  '.sanctuary-management-force-slot-name>span.is-faded','prefers-reduced-motion:reduce',
])assert.ok(rosterCss.includes(token),`operating roster carousel CSS missing ${token}`);

for(const token of ['.sanctuary-management-refresh-card.has-update','text-decoration:underline'])assert.ok(pageCss.includes(token),`refresh indicator CSS missing ${token}`);
assert.ok(workflow.includes('node tests/sanctuary-management-roster-carousel-refresh-contract.test.js'),'roster carousel refresh contract is not wired into CI');

console.log('KINOJO sanctuary management roster carousel and manual refresh contract: PASS');
