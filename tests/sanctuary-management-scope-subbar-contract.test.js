const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const client=read('sanctuary-management/js/sanctuary-management.js');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');
const css=read('sanctuary-management/css/sanctuary-management.css');
const harness=read('tests/sanctuary-management-fixed-draft-e2e.html');
const workflow=read('.github/workflows/verify-kinojo-pages.yml');

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  for(const token of [
    'aria-label="성역 선택"',
    'id="sanctuaryManagementScope"',
    'sanctuary-management.css?cache=2026082903',
    'sanctuary-management.js?cache=2026083104',
    'sanctuary-management-draft.js?cache=2026083030',
  ])assert.ok(html.includes(token),`${page}: scope-only subbar missing ${token}`);
  for(const legacy of ['kinojo-sanctuary-tabs','관리 범위'])assert.equal(html.includes(legacy),false,`${page}: legacy subbar content remains ${legacy}`);
}

for(const token of [
  "function sanctuaryLabel(item,index=0){return '성역 '+sanctuaryOrder(item,index);}",
  'function sanctuaryOfficialName(item)',
  "short+' | '+official",
  "const items=bootstrapData.sanctuaries.map",
  "detail.className='sanctuary-management-scope-detail'",
  "glyph.className='sanctuary-management-scope-detail-char'",
  "glyph.style.setProperty('--scope-char-index',String(index))",
  "detail.setAttribute('aria-hidden','true')",
  "requestAnimationFrame(()=>{",
  "Math.min(260,detail.scrollWidth)",
  "detail.style.setProperty('--scope-detail-width',detailWidth+'px')",
  "return sanctuaryKey(data.sanctuaries[0]);",
  "item.setAttribute('aria-pressed',item.dataset.sanctuaryScope===selectedSanctuary?'true':'false')",
])assert.ok(client.includes(token),`scope renderer missing ${token}`);
assert.equal(client.includes("[{key:'all',label:'전체'}]"),false,'legacy all-scope button remains');
assert.ok(draft.includes("short+' | '+official"),'team composer must use Server official sanctuary names');
assert.equal(draft.includes('value(item?.shortName)||value(item?.name)'),false,'team composer still prefers legacy sheet-tab names');

for(const token of [
  'flex-wrap:wrap',
  '.sanctuary-management-scope-short{',
  '.sanctuary-management-scope-detail{',
  'width .84s cubic-bezier(.2,.8,.2,1)',
  '.sanctuary-management-scope-detail-char{',
  'transform:translateX(-.6em) scale(.94)',
  'transition-delay:calc(.06s + var(--scope-char-index) * .035s)',
  'button[aria-pressed="true"] .sanctuary-management-scope-detail{width:var(--scope-detail-width,0px)',
  'overflow:hidden',
])assert.ok(css.includes(token),`animated scope CSS missing ${token}`);

for(const token of [
  "name:'심연의 재련: 루드라',shortName:'루드라팟',displayOrder:1",
  "name:'침식의 정화소',shortName:'바고트팟',displayOrder:2",
  "name:'무스펠의 성배',shortName:'칼드릭스팟',displayOrder:3",
])assert.ok(harness.includes(token),`E2E harness official master fixture missing ${token}`);
assert.ok(workflow.includes('node tests/sanctuary-management-scope-subbar-contract.test.js'),'scope subbar contract is not wired into CI');

console.log('KINOJO sanctuary management scope-only animated subbar contract: PASS');
