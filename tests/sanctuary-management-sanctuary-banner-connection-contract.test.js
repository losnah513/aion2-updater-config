const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const client=read('sanctuary-management/js/sanctuary-management.js').replace(/\r\n/g,'\n');
const css=read('sanctuary-management/css/sanctuary-management.css');
const harness=read('tests/sanctuary-management-fixed-draft-e2e.html');
const workflow=read('.github/workflows/verify-kinojo-pages.yml');

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  for(const token of [
    'id="sanctuaryManagementHero"','id="sanctuaryManagementHeroBg"','sanctuary-management-hero-fade',
    'id="sanctuaryManagementHeroKicker"','id="sanctuaryManagementTitle"','id="sanctuaryManagementHeroSub"',
    'id="sanctuaryManagementConnectionCard"','id="sanctuaryManagementConnectionState"',
    'id="sanctuaryManagementConnectionTitle"','id="sanctuaryManagementConnectionMessage"'
  ])assert.ok(html.includes(token),`${page}: sanctuary banner/connection summary missing ${token}`);
  for(const retired of ['<strong id="sanctuaryManagementSource">Server</strong>','데이터 원본','목업·시트 우회 없음'])assert.equal(html.includes(retired),false,`${page}: retired Server summary remains ${retired}`);
}

for(const token of [
  'SANCTUARY_BANNER_FALLBACK','/assets/images/sanctuary/backgrounds/rudra.webp','/assets/images/sanctuary/backgrounds/bagot.webp','/assets/images/sanctuary/backgrounds/kaldrix.webp',
  "function renderSanctuaryBanner()","byId('sanctuaryManagementHeroKicker').textContent='성역 '+order","sanctuaryOfficialName(item)",
  "byId('sanctuaryManagementHeroSub').textContent=boss?'Boss. '",
  "const folded=state==='ready'||state==='rollout'","region.hidden=folded","byId('sanctuaryManagementConnectionState').textContent=state==='ready'?'연결됨'",
  "window.addEventListener('kinojo:sanctuary-master-rendered'"
])assert.ok(client.includes(token),`client banner/connection behavior missing ${token}`);
assert.match(client,/renderSanctuaryBanner\(\);\s+renderTeams\(\);\s+renderMonth\(\);/,'scope selection must refresh the banner before scoped content');
assert.equal(client.includes("byId('sanctuaryManagementSource')"),false,'retired Server source renderer remains');

for(const token of [
  'min-height:82px','border-radius:6px','.sanctuary-management-hero-bg{position:absolute;inset:0',
  '.sanctuary-management-hero-fade{position:absolute;inset:0','.sanctuary-management-hero-text{position:relative;z-index:2',
  '.sanctuary-management-access[hidden]{display:none}','.sanctuary-management-connection-card[data-state="ready"]'
])assert.ok(css.includes(token),`legacy sanctuary banner/connection CSS missing ${token}`);

for(const token of ['sanctuaryManagementHeroBg','sanctuaryManagementConnectionCard',"name:'비탄의 설원',shortName:'비탄의 설원'"])assert.ok(harness.includes(token),`E2E harness banner fixture missing ${token}`);
assert.ok(workflow.includes('node tests/sanctuary-management-sanctuary-banner-connection-contract.test.js'),'banner/connection contract is not wired into CI');

console.log('KINOJO sanctuary management selected-sanctuary banner and connection summary contract: PASS');
