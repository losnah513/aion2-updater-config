const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  for(const token of [
    'sanctuary-management-copy.css?cache=2026083001',
    'sanctuary-management-copy.js?cache=2026083001',
    'canonical=2026083001',
  ])assert.ok(html.includes(token),`${page}: image-copy asset contract missing ${token}`);
}

const client=read('sanctuary-management/js/sanctuary-management.js');
for(const token of [
  'sanctuary-management-team-title-row',
  'sanctuary-management-force-title-row',
  'dataset.sanctuaryCopyTeam',
  'dataset.sanctuaryCopyForce',
  'KinojoSanctuaryManagementCopyBridge',
])assert.ok(client.includes(token),`team/force copy-button wiring missing ${token}`);
assert.ok(client.indexOf('titleRow.append(title,copyButton)')>=0,'team copy button must sit beside the team name');
assert.ok(client.indexOf('titleWrap.append(name,copyButton)')>=0,'force copy button must sit beside the force name');

const copy=read('sanctuary-management/js/sanctuary-management-copy.js');
for(const token of [
  "new ClipboardItem({'image/png':Promise.resolve(blobOrPromise)})",
  'navigator.clipboard.write',
  'function renderPng(team,targetForce)',
  '[1,2].map(partyNo=>',
  'while(slots.length<5)',
  'repeat(2,minmax(0,1fr))',
  'sanctuary-management-copy-preview',
  'KinojoSanctuaryManagementCopy=Object.freeze',
  "document.addEventListener('click'",
  "dataset.sanctuaryCopyReady='true'",
  '20260830_01_browser_legacy_layout',
])assert.ok(copy.includes(token),`browser image-copy renderer missing ${token}`);
for(const forbidden of ['runSanctuaryManagementCommand','KinojoSupabase','sanctuary-copy-render','/functions/v1/']){
  assert.equal(copy.includes(forbidden),false,`copy renderer must not write or send Server data: ${forbidden}`);
}

const css=read('sanctuary-management/css/sanctuary-management-copy.css');
for(const token of [
  '.sanctuary-management-copy-button',
  '.sanctuary-management-copy-preview',
  '@media(max-width:760px)',
  'width:min(980px,100%)',
])assert.ok(css.includes(token),`image-copy responsive layout missing ${token}`);
assert.equal(css.includes('overflow-x'),false,'image-copy UI must not introduce horizontal overflow');

const harness=read('tests/sanctuary-management-fixed-draft-e2e.html');
assert.ok(harness.includes('sanctuary-management-copy.css'),'fixed-draft harness missing copy CSS');
assert.ok(harness.includes('sanctuary-management-copy.js'),'fixed-draft harness missing copy JS');

console.log('KINOJO Sanctuary team/force legacy-layout clipboard image contract: PASS');
