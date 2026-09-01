const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const client=read('sanctuary-management/js/sanctuary-management.js');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');
const supportCss=read('sanctuary-management/css/sanctuary-management-support.css');
const draftCss=read('sanctuary-management/css/sanctuary-management-draft.css');

for(const token of [
  'function createAltRelationshipTooltip',
  'dataset.sanctuaryAltDetail',
  'mainCharacterName',
  'sanctuary-management-alt-name',
  'sanctuary-management-main-name',
  'ALT_DETAIL_IDLE_MS=5000',
  'altDetailIdleTimers=new WeakMap()',
  'scheduleAltDetailIdleClose',
  'activateAltDetail',
  "document.addEventListener('pointerover'",
  "document.addEventListener('pointermove'",
  "document.addEventListener('pointerout'",
  "event.key==='Enter'||event.key===' '",
  "event.key==='Escape'",
  "recruitment.textContent=(CLASS_NAME_BY_CODE[requiredClass]||'지정 클래스')+' 모집 중'",
])assert.ok(client.includes(token),`public roster interaction missing ${token}`);

for(const token of [
  "const classRecruiting=!occupied&&required.code!=='ALL'",
  "displayName=classRecruiting?required.label+' 모집 중':name",
  "(classRecruiting?' is-class-slot':'')",
])assert.ok(draft.includes(token),`composer class-slot interaction missing ${token}`);

for(const token of [
  '.sanctuary-management-force-card.is-supportable{cursor:default',
  '.sanctuary-management-force-party:hover:not(:has(.sanctuary-management-force-slot:hover))',
  '.sanctuary-management-force-slot:not(.is-occupied)::after',
  '@keyframes sanctuary-empty-slot-dashes',
  '.sanctuary-management-force-slot.is-class-slot .sanctuary-management-force-slot-icon',
  'width:70px;height:70px',
  '.sanctuary-management-force-slot-recruitment',
  '.sanctuary-management-alt-tooltip',
  'background:rgba(8,13,17,.94)',
  '.sanctuary-management-alt-name{color:#ff75e6',
  '.sanctuary-management-alt-name,.sanctuary-management-main-name',
  'color:#b9ff73',
  'font-size:.5em',
  'align-items:center',
  'justify-content:center',
  'text-shadow:0 0 4px',
  '.is-alt-detail-open>.sanctuary-management-alt-tooltip',
])assert.ok(supportCss.includes(token),`public roster CSS missing ${token}`);
assert.equal(supportCss.includes('.sanctuary-management-force-card.is-supportable{cursor:pointer'),true,'historical rule is retained for cascade audit');
assert.ok(supportCss.lastIndexOf('.sanctuary-management-force-card.is-supportable{cursor:default')>supportCss.indexOf('.sanctuary-management-force-card.is-supportable{cursor:pointer'),'final cursor override must win the cascade');

for(const token of [
  '.sanctuary-management-draft-slot:not(.is-occupied)::after',
  '@keyframes sanctuary-draft-empty-dashes',
  '.sanctuary-management-draft-slot-shell.is-class-slot .sanctuary-management-draft-character-icon',
  'width:64px;height:64px',
  'position:absolute',
  'box-shadow:inset',
])assert.ok(draftCss.includes(token),`composer roster CSS missing ${token}`);

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  assert.ok(html.includes('sanctuary-management-support.css?cache=2026090101'),`${page}: roster interaction CSS cache missing`);
  assert.ok(html.includes('sanctuary-management.js?cache=2026083107'),`${page}: roster interaction JS cache missing`);
  assert.equal((html.match(/altDetail=2026090101/g)||[]).length,2,`${page}: alt detail cache keys missing`);
}

console.log('KINOJO sanctuary management roster interaction contract: PASS');
