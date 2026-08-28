'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const workflow=read('admin/js/admin-banner-event-workflow.js');
const edge=read('supabase/functions/kinojo-banner-media/index.ts');
const migration=read('supabase/migrations/20260826054751_banner_overlay_name_uniqueness_v405.sql');

for(const token of [
  'banner event workflow phase 2 stage 7 integration v2026082811',
  "root.dataset.bannerEventStage='phase2-7'",
  'const OVERLAY_NUMERIC=',
  'function clampOverlayNumber(',
  'data-bew-overlay-number-field',
  'data-bew-overlay-output',
  'syncOverlayNumericControls',
  "String(input.value).trim()===''",
  '내 스티커 보관함',
  'data-bew-sticker-panel-toggle',
  'data-bew-overlay-add-now',
  'JPEG는 투명 배경을 저장할 수 없습니다.',
  '가로·세로 크기는 각각 1~4096px 범위여야 합니다.',
  "api(s,'overlay-asset-list',{includeArchived:false})",
  'data-bew-emoji-popover',
  'aria-expanded="${s.emojiPopoverOpen}"',
  'kinojoBannerRecentEmojis',
  'data-bew-emoji-query',
  'data-bew-emoji-custom-add',
  "event.key==='Escape'",
  "['ArrowDown','ArrowRight','ArrowUp','ArrowLeft']",
  '실제 합성 미리보기',
  'data-bew-preview-jump',
  'position:sticky;top:238px',
  '@media(max-width:980px)',
  '게시할 때 같은 구성으로 WebP 합성본을 별도 저장',
])assert.ok(workflow.includes(token),`missing phase-2 stage-5 editor token: ${token}`);

for(const field of ['fontSizePx','backgroundOpacity','heightPercent','sizePercent','opacity','rotationDeg']){
  assert.ok(workflow.includes(`${field}:{min:`),`numeric range contract missing: ${field}`);
}
assert.ok(workflow.includes("layer.type==='TEXT'?(String(layer.text||'').trim()"),'text preview layer label missing');
assert.ok(workflow.includes("${previewLayersMarkup(s,layers,'BACK')}<img crossorigin=\"anonymous\""),'source and back layers must share the live preview');
assert.ok(workflow.includes("${previewLayersMarkup(s,layers,'FRONT')}</div>"),'front layers must share the live preview');

for(const token of [
  'kinojo_banner_overlay_assets_name_v405_uidx',
  'lower(btrim(display_name))',
  'kinojo_banner_overlay_asset_register_v405',
  "'BANNER_OVERLAY_NAME_DUPLICATE'",
  "'apiVersion','405'",
  'grant execute on function public.kinojo_banner_overlay_asset_register_v405',
])assert.ok(migration.includes(token),`missing v405 overlay uniqueness token: ${token}`);

for(const token of [
  'V = "2.6"',
  'DB = "412"',
  'BANNER_OVERLAY_NAME_DUPLICATE',
  'rpc("kinojo_banner_overlay_asset_register_v405"',
  'candidateDeleted: deleted === true',
])assert.ok(edge.includes(token),`missing Edge v405 token: ${token}`);

console.log('PASS banner event phase-2 stage-5 editor contract');
