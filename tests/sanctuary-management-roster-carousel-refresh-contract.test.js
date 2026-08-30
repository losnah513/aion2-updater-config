const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const client=read('sanctuary-management/js/sanctuary-management.js');
const pageCss=read('sanctuary-management/css/sanctuary-management.css');
const draftCss=read('sanctuary-management/css/sanctuary-management-draft.css');
const rosterCss=read('sanctuary-management/css/sanctuary-management-support.css');
const workflow=read('.github/workflows/verify-kinojo-pages.yml');

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  for(const token of ['sanctuaryManagementRefreshCard','sanctuaryManagementRefreshState','sanctuaryManagementRefreshMeta','sanctuaryManagementRefreshAction','새로고침하기','canonical=2026083001'])assert.ok(html.includes(token),`${page}: refresh indicator missing ${token}`);
  assert.equal(html.includes('sanctuaryManagementSelectedName'),false,`${page}: redundant selected sanctuary card returned`);
}

for(const token of [
  'CLASS_ICON_MAP','function classIconFor','function createMaskedCharacterName','slice(0,5)','is-faded',
  'is-viewer-character','is-main','is-alt',"'['+(value(slot.character?.serverName)||'서버 미상')+']'",
  'sanctuary-management-force-carousel','dataset.sanctuaryForceShift','forceCarouselStarts','scrollTo({left:',
  'BACKGROUND_CHECK_INTERVAL','pendingBootstrapData','bootstrapFingerprint','checkForUpdates','refreshContent',
  "meta.textContent=hasUpdate?'새로운 내용이 추가되었습니다.'",
])assert.ok(client.includes(token),`roster/carousel/refresh client missing ${token}`);

assert.equal(client.includes("window.addEventListener('kinojo:auth-changed',load)"),false,'auth refresh must not replace visible content');
assert.equal(client.includes('renderMonth();if(bootstrapData)renderTeams();'),false,'month loading must not rerender operating teams');

for(const token of [
  '.sanctuary-management-date-field,.sanctuary-management-time-field{grid-template-columns:max-content minmax(0,1fr)',
  'width:3.25em!important','grid-template-columns:repeat(2,40px)',
])assert.ok(draftCss.includes(token),`compact schedule fields missing ${token}`);

for(const token of [
  'scroll-snap-type:x mandatory','scroll-snap-align:start','flex:0 0 calc((100% - 12px)/2)',
  '@media(max-width:760px){.sanctuary-management-force-carousel{padding-inline:0}.sanctuary-management-force-grid>.sanctuary-management-force-card{flex-basis:100%}',
  'grid-template-columns:15px 24px 5em minmax(0,1fr)','sanctuary-management-force-slot-icon img',
  '.sanctuary-management-force-slot.is-viewer-character','.sanctuary-management-force-slot.is-main','.sanctuary-management-force-slot.is-alt',
  '.sanctuary-management-force-slot-name>span.is-faded','opacity:.3',
])assert.ok(rosterCss.includes(token),`operating roster carousel CSS missing ${token}`);

for(const token of ['.sanctuary-management-refresh-card.has-update','text-decoration:underline'])assert.ok(pageCss.includes(token),`refresh indicator CSS missing ${token}`);
assert.ok(workflow.includes('node tests/sanctuary-management-roster-carousel-refresh-contract.test.js'),'roster carousel refresh contract is not wired into CI');

console.log('KINOJO sanctuary management roster carousel and manual refresh contract: PASS');
