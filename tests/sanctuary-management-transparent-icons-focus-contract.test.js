const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const css=read('sanctuary-management/css/sanctuary-management-support.css');

for(const token of [
  '.sanctuary-management-force-card.is-assigned,',
  '.sanctuary-management-force-card.is-pending{background:transparent}',
  '.sanctuary-management-force-card:hover,',
  '.sanctuary-management-force-card.is-supportable:hover,',
  'background:#eefaf4',
  '.sanctuary-management-support-forces button.is-selected{background:transparent}',
  '.sanctuary-management-support-forces button:focus-visible{background:#eefaf4}',
  '.sanctuary-management-force-slot-icon,.sanctuary-management-support-avatar,.sanctuary-management-candidate-avatar,.sanctuary-management-search-result-avatar):has(>img)',
  'background:transparent!important',
  ':has(>img)>img{object-fit:contain}',
  '.sanctuary-management-support-forces button.is-active,',
  '.sanctuary-management-support-character.is-selected{box-shadow:inset',
  '.sanctuary-management-force-slot.is-viewer-character{box-shadow:inset',
  '.sanctuary-management-draft-slot.is-dragging{box-shadow:inset',
  '.sanctuary-management-draft-layer :is(button,input,select,[tabindex]):focus-visible{outline:0;box-shadow:inset',
])assert.ok(css.includes(token),`Transparent icon or inset highlight policy missing ${token}`);

const policyStart=css.indexOf('/* Canonical Sanctuary visual policy:');
assert.ok(policyStart>0,'Page-wide visual policy must be appended after component rules');
for(const legacy of [
  '.sanctuary-management-force-slot.is-occupied .sanctuary-management-force-slot-icon{background:linear-gradient',
  '.sanctuary-management-support-avatar{width:42px',
  '.sanctuary-management-candidate-avatar{',
  '.sanctuary-management-search-result-avatar{',
]){
  assert.ok(css.indexOf(legacy)<policyStart,`Final transparent override must follow ${legacy}`);
}

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  assert.ok(html.includes('sanctuary-management-support.css?cache=2026083107'),`${page}: transparent icon CSS cache missing`);
  assert.ok(html.includes('canonical=2026083007'),`${page}: canonical transparent icon cache missing`);
}

console.log('KINOJO Sanctuary transparent class icons and inset highlights contract: PASS');
