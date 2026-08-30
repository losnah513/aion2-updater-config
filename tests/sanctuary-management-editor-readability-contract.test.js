const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');
const css=read('sanctuary-management/css/sanctuary-management-draft.css');

for(const token of [
  'sanctuary-management-candidate-position','선택한 포스·슬롯','포스 · ',
  'sanctuary-management-candidate-completion','sanctuary-management-search-result-profile',
  'sanctuary-management-search-result-avatar','sanctuary-management-search-result-copy',
])assert.ok(draft.includes(token),`Readable editor markup missing ${token}`);

assert.ok(
  draft.includes("</div>'+completion+'<button type=\"button\" class=\"sanctuary-management-search-reset\""),
  'Completed-placement notice must sit below the scrollable candidate list and above reset'
);
assert.ok(
  draft.includes("if(creatorOnly)return '<aside class=\"sanctuary-management-candidate-rail\"")&&
  draft.includes("if(state.team?.localOnly)return '<aside class=\"sanctuary-management-candidate-rail\""),
  'Fixed and participation team creation must reuse the readable candidate rail'
);
assert.ok(
  draft.includes("'+railHeader+'<div class=\"sanctuary-management-candidate-list\" data-candidate-list>'+quick+"),
  'Creation and edit flows must share the candidate header and card list markup'
);
assert.equal(
  draft.includes("[character.serverName,character.className,character.legionName]"),
  false,
  'Master search result must not render the class as tiny text when a class icon is present'
);
assert.ok(
  draft.includes("const server='['+(value(character.serverName)||'서버 미확인')+']';"),
  'Master search result must render the server in brackets'
);

for(const token of [
  '.sanctuary-management-composer-middle{grid-template-columns:18% 58% 24%}',
  '.sanctuary-management-candidate-rail{container-type:inline-size',
  '.sanctuary-management-character-search,.sanctuary-management-main-search{grid-template-columns:minmax(0,1fr)',
  '.sanctuary-management-character-search>button,.sanctuary-management-main-search>button{width:100%',
  '.sanctuary-management-search-result{min-height:118px',
  'font-size:clamp(13px,9.5cqw,16px)',
  '.sanctuary-management-search-result>button,.sanctuary-management-register-character{width:100%',
  '.sanctuary-management-candidate-rail{grid-column:1/-1;grid-row:2',
])assert.ok(css.includes(token),`Readable editor layout missing ${token}`);

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  assert.ok(html.includes('sanctuary-management-draft.css?cache=2026083020'),`${page}: readable editor CSS cache missing`);
  assert.ok(html.includes('sanctuary-management-draft.js?cache=2026083020'),`${page}: readable editor JS cache missing`);
}

console.log('KINOJO Sanctuary team composer readability contract: PASS');
