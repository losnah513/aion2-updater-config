'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,'admin/js/admin-banner-event-workflow.js'),'utf8');

for(const token of [
  'banner event workflow phase 2 stage 6 integration v2026082607',
  "root.dataset.bannerEventStage='phase2-5'",
  'function previewButton(',
  'const isTallPreview=',
  '상단~중간 · 전체 보기',
  'data-bew-image-open',
  "${tall?' is-tall':''}",
  '.bew-preview-trigger.is-tall img{object-fit:cover!important;object-position:center 28%!important}',
  'function imagePreviewModal(',
  'role="dialog"',
  'aria-modal="true"',
  'data-bew-image-preview-full',
  'function openImagePreview(',
  'function closeImagePreview(',
  "event.key==='Escape'",
  "event.key!=='Tab'",
  'function assetTagStack(',
  'tags.slice(0,3)',
  'bew-asset-tag-more',
  '추가 태그 ${extra}개',
  'is-dragging',
  'is-drop-before',
  'is-drop-after',
  'is-order-changed',
  'prefers-reduced-motion: reduce',
  'prefers-reduced-motion:reduce',
  'data-bew-order-card',
  'role="listitem"',
  'aria-live','polite',
  "event.altKey&&(event.key==='ArrowUp'||event.key==='ArrowDown')",
  "event.key==='Delete'||event.key==='Backspace'",
  'function moveOrderItem(',
  'function removeOrderItem(',
  '.bew-order-actions,.bew-side-actions{display:grid;grid-template-rows:repeat(3,36px)',
])assert.ok(workflow.includes(token),`phase-2 stage-3 preview/order token missing: ${token}`);

const renderOrder=workflow.slice(workflow.indexOf('function renderOrder('),workflow.indexOf('function selectAsset('));
assert.ok(renderOrder.indexOf('data-bew-direction="up"')<renderOrder.indexOf('data-bew-selected-remove'),'vertical controls must place remove between up and down');
assert.ok(renderOrder.indexOf('data-bew-selected-remove')<renderOrder.indexOf('data-bew-direction="down"'),'vertical controls must end with down');
assert.ok(workflow.includes("dragOrder.position=after?'after':'before'"),'drag insertion position calculation missing');
assert.ok(workflow.includes("s.orderAnnouncement=message||"),'screen-reader order announcement missing');
assert.ok(workflow.includes("window.setTimeout(()=>changed.classList.remove('is-order-changed'),reduced?1800:650)"),'reduced-motion static order feedback missing');

console.log('PASS banner event phase-2 stage-3 preview/order contract');
