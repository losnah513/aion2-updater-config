const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,'admin/js/admin-banner-event-workflow.js'),'utf8');

for(const token of [
  'banner event workflow phase 2 stage 5',
  '이미지별 콘텐츠 편집',
  '내 스티커 보관함',
  "const EMOJIS=",
  "type:'EMOJI'",
  "type:String(asset.assetKind||'STICKER')",
  'data-bew-overlay-file',
  'data-bew-overlay-kind',
  'data-bew-overlay-upload',
  'data-bew-decor-add',
  'data-bew-emoji-add',
  "layer.type==='TEXT'",
  "layer.type!=='TEXT'",
  'data-bew-review',
  'bew-review-columns',
  'data-bew-save-draft',
  'data-bew-publish',
  'bew-action-dock',
  'bew-needs-attention',
  "api(s,'event-save'",
  "api(s,'event-publish'",
  "api(s,'composite-upload-prepare'",
  "api(s,'composite-upload-complete'",
  "canvas.toBlob",
  "'image/webp'",
  '원본과 편집 설정은 재편집용으로 계속 보관됩니다.',
])assert.ok(workflow.includes(token),`missing stage-5 UI token: ${token}`);

assert.ok(workflow.includes("layers.filter(layer=>layer.type==='TEXT').length<LIMIT"),'text maximum must be three');
assert.ok(workflow.includes("layers.filter(layer=>layer.type!=='TEXT').length<LIMIT"),'decoration maximum must be three');
assert.ok(workflow.includes("position:fixed;z-index:12020;right:24px;bottom:20px"),'fixed bottom-right action dock missing');
assert.ok(workflow.includes("target?.scrollIntoView({behavior:'smooth',block:'start'})"),'sticky-safe missing-field navigation missing');
assert.ok(workflow.includes("contentOverlays:(s.overlays[Number(id)]||[])"),'general content payload missing');
assert.ok(workflow.includes('data-bew-overlay-number-field'),'numeric direct input missing');
assert.ok(workflow.includes('data-bew-emoji-popover'),'emoji popover missing');
assert.ok(workflow.includes('실제 합성 미리보기'),'live composite preview missing');
console.log('PASS banner event stage-5 UI contract');
