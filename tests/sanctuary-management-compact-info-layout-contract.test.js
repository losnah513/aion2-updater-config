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
    'sanctuary-management.css?cache=2026082812',
    'sanctuary-management-hero-info',
    'sanctuary-management-section-info',
    'sanctuary-management-side-head',
    '<strong id="sanctuaryManagementSource">Server</strong><div class="sanctuary-management-info-copy">',
    '<strong id="sanctuaryManagementSelectedName">성역 1</strong>',
    '<h2 id="sanctuaryManagementTeamTitle">운영 팀</h2>',
    '월 단위 · 수요일 시작',
  ])assert.ok(html.includes(token),`${page}: compact information layout missing ${token}`);
}

for(const token of [
  '.sanctuary-management-hero-info{',
  'display:flex;align-items:center;gap:24px',
  '.sanctuary-management-summary article{',
  '.sanctuary-management-section-info{',
  '.sanctuary-management-side-head{',
  '.sanctuary-management-hero-info>h1{flex:0 0 auto;white-space:nowrap}',
  '.sanctuary-management-summary .sanctuary-management-info-copy{flex:1}',
  '.sanctuary-management-section-info>h2{flex:0 0 auto;white-space:nowrap}',
  '.sanctuary-management-side-head>h2{flex:0 0 auto;white-space:nowrap}',
])assert.ok(css.includes(token),`compact information CSS missing ${token}`);

for(const token of ['sanctuary-management-hero-info','sanctuary-management-section-info','sanctuary-management-info-copy'])assert.ok(harness.includes(token),`E2E harness missing ${token}`);
assert.ok(workflow.includes('node tests/sanctuary-management-compact-info-layout-contract.test.js'),'compact information layout test is not wired into CI');

console.log('KINOJO sanctuary management compact information layout contract: PASS');
