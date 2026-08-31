const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const css=read('sanctuary-management/css/sanctuary-management.css');
const workflow=read('.github/workflows/verify-kinojo-pages.yml');

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  for(const token of [
    'stage10=2026083102',
    'id="sanctuaryManagementHeroBg"',
    'id="sanctuaryManagementHeroKicker"',
    'id="sanctuaryManagementHeroSub"',
    'sanctuary-management-section-info',
    'id="sanctuaryManagementStatusShell"',
    'sanctuary-management-overview',
    'id="sanctuaryManagementScheduleState"',
    'id="sanctuaryManagementMonthlySchedule"',
    'id="sanctuaryManagementRecruitmentState"',
    'id="sanctuaryManagementConnectionCard"',
    'id="sanctuaryManagementConnectionState"',
    'id="sanctuaryManagementRefreshCard"',
    'id="sanctuaryManagementRefreshAction"',
    '<h2 id="sanctuaryManagementTeamTitle">운영 팀</h2>',
    '수요일부터 화요일까지',
  ])assert.ok(html.includes(token),`${page}: compact information layout missing ${token}`);
  for(const retired of ['sanctuary-management-summary','sanctuary-management-side','sanctuaryManagementAdminState'])assert.equal(html.includes(retired),false,`${page}: retired side rail remains ${retired}`);
}

for(const token of [
  '.sanctuary-management-hero-bg{',
  '.sanctuary-management-hero-text{',
  '.sanctuary-management-page-bar-shell{',
  '.sanctuary-management-subbar-status{',
  '.sanctuary-management-overview{',
  '.sanctuary-management-week{',
  '.sanctuary-management-recruitment-summary{',
  '.sanctuary-management-section-info{',
  '.sanctuary-management-section-info>h2{flex:0 0 auto;white-space:nowrap}',
  '.sanctuary-management-layout{margin-top:14px;display:grid;grid-template-columns:minmax(0,1fr)',
])assert.ok(css.includes(token),`compact information CSS missing ${token}`);

assert.ok(workflow.includes('node tests/sanctuary-management-compact-info-layout-contract.test.js'),'compact information layout test is not wired into CI');

console.log('KINOJO sanctuary management compact information layout contract: PASS');
