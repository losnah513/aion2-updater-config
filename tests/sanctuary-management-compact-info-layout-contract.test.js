const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const css=read('sanctuary-management/css/sanctuary-management.css');
const harness=read('tests/sanctuary-management-fixed-draft-e2e.html');
const workflow=read('.github/workflows/verify-kinojo-pages.yml');

for(const page of ['sanctuary-management/index.html','m/sanctuary-management/index.html']){
  const html=read(page);
  for(const token of [
    'sanctuary-management.css?cache=2026082809',
    'sanctuary-management-hero-info',
    'sanctuary-management-section-info',
    'sanctuary-management-side-head',
    '<strong id="sanctuaryManagementSource">Server</strong><div class="sanctuary-management-info-copy">',
    '<h2 id="sanctuaryManagementTeamTitle">운영 팀</h2>',
    '월 단위 · 수요일 시작',
  ])assert.ok(html.includes(token),`${page}: compact information layout missing ${token}`);
}

for(const token of [
  '.sanctuary-management-hero-info{',
  'grid-template-columns:minmax(190px,.72fr) minmax(260px,1.28fr)',
  '.sanctuary-management-summary article{',
  '.sanctuary-management-section-info{',
  '.sanctuary-management-side-head{',
  'grid-template-columns:minmax(118px,.72fr) minmax(0,1.28fr)',
])assert.ok(css.includes(token),`compact information CSS missing ${token}`);

for(const token of ['sanctuary-management-hero-info','sanctuary-management-section-info','sanctuary-management-info-copy'])assert.ok(harness.includes(token),`E2E harness missing ${token}`);
assert.ok(workflow.includes('node tests/sanctuary-management-compact-info-layout-contract.test.js'),'compact information layout test is not wired into CI');

console.log('KINOJO sanctuary management compact information layout contract: PASS');
