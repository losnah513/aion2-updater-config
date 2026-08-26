const fs=require('fs');
const path=require('path');
const assert=require('assert');

const root=path.resolve(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,'admin/js/admin-banner-event-workflow.js'),'utf8');

for(const token of [
  'banner event workflow phase 2 shell stage 1',
  "filter:'NONE'",
  '미선택',
  '전체 ${usableAssets(s).length}',
  '분류 해시태그 · 라이브러리 필터용',
  '해시태그는 1번에서 이미지 분류용으로 한 번만 지정합니다.',
  '3장 선택 완료',
  'data-bew-order-drag',
  "document.addEventListener('dragstart'",
  "document.addEventListener('drop'",
  'item.animate',
  'data-bew-image-preview',
  'bew-image-peek',
  "frequency:'BASE'",
  "option('BASE','기본'",
  "option('ONE_HALF','×1.5'",
  "option('TWO','×2.0'",
  "value.frequency==='TWO'?200:value.frequency==='ONE_HALF'?150:100",
  '이미지별 콘텐츠 편집',
  '문구 3 + 꾸미기 3',
  "layerPosition:'FRONT'",
  "option('FRONT','이미지 앞 · 기본'",
  "option('BACK','이미지 뒤'",
  'data-bew-overlay-add',
  'data-bew-overlay-apply',
  'data-bew-overlay-field="verticalPosition"',
  'data-bew-overlay-field="fontFamily"',
  'data-bew-overlay-field="fontSizePx"',
  'data-bew-overlay-field="textColor"',
  'data-bew-overlay-field="backgroundColor"',
  'data-bew-overlay-field="backgroundOpacity"',
  'data-bew-overlay-field="heightPercent"',
  "contentOverlays:(s.overlays[Number(id)]||[])",
  "widthMode:'FULL'",
])assert.ok(workflow.includes(token),`stage-4 workflow token missing: ${token}`);

assert.equal(workflow.includes('data-bew-tag-input'),false,'step 2 must not expose a second hashtag editor');
assert.ok(workflow.includes("layers.filter(layer=>layer.type==='TEXT').length<LIMIT"),'text overlay maximum-three guard missing');
assert.ok(workflow.includes("source.map(layer=>({...layer}))"),'multi-image overlay copy missing');
assert.ok(workflow.includes('.bew-unit-input{display:grid;grid-template-columns:minmax(0,1fr) 22px'),'seconds suffix must stay beside its compact input');
assert.ok(workflow.includes('.bew-asset-copy b{font-size:11px}'),'library card text enlargement missing');
assert.ok(workflow.includes('.bew-asset img{width:88px;height:100%;min-height:90px'),'library preview must use the available card height');
assert.ok(workflow.includes("'event-save'"),'stage 5 save must be wired');
assert.ok(workflow.includes("'event-publish'"),'stage 5 publish must be wired');

console.log('PASS banner event stage-4 UI contract');
