'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,'admin/js/admin-banner-event-workflow.js'),'utf8');
const bootstrap=fs.readFileSync(path.join(root,'admin/js/admin-bootstrap.js'),'utf8');
const legacyImages=fs.readFileSync(path.join(root,'admin/js/admin-images.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'admin/js/admin.js'),'utf8');
const desktop=fs.readFileSync(path.join(root,'admin/index.html'),'utf8');
const mobile=fs.readFileSync(path.join(root,'m/admin/index.html'),'utf8');

for(const label of [
  '메인 배너',
  '사이드 배너'
])assert.ok(bootstrap.includes(label),`image subpage header label missing: ${label}`);
assert.ok(bootstrap.includes("IMAGE_LOCATION_LABELS[state.subtab]"),'image header must follow the active image subtab');
assert.ok(bootstrap.includes('`[이미지 관리] - ${imageLocation}`'),'image header hierarchy missing');
assert.ok(legacyImages.includes("startsWith(text+' - ')"),'legacy image shell must preserve the subpage header label');

assert.ok(!workflow.includes('<section class="admin-card bew-hero"'),'large authoring hero card must be removed');
assert.ok(!workflow.includes('data-bew-refresh'),'authoring refresh action must be removed');
for(const token of [
  'function stepCompletion(',
  'function renderStepProgress(',
  "labels={current:'현재',complete:'완료',incomplete:'미완료',error:'오류'}",
  'data-step-state="incomplete"',
  "map.classList.remove('ready','is-current','is-complete','is-incomplete','is-error')",
  "map.setAttribute('aria-current','step')",
  "map.setAttribute('aria-invalid','true')",
  'function navigateStep(',
  'issue.step<target',
  'scroll-margin-top:238px',
  'position:sticky',
  'overflow-x:auto',
  'scroll-snap-type:x proximity'
])assert.ok(workflow.includes(token),`real step-map contract missing: ${token}`);

for(const token of [
  '.bew-step:nth-child(1) .bew-step-card{min-height:360px}',
  '.bew-step:nth-child(2) .bew-step-card{min-height:500px}',
  '.bew-step:nth-child(4) .bew-step-card{min-height:500px}',
  '.bew-upload-grid{max-height:530px;overflow:auto',
  '.bew-order-list{max-height:410px;overflow:auto',
  '@media(max-width:1050px)',
  '@media(max-width:700px)'
])assert.ok(workflow.includes(token),`stable responsive card contract missing: ${token}`);

for(const token of [
  '내용 초기화',
  '작성 중인 내용을 초기화하시겠습니까?',
  '업로드된 라이브러리 이미지, 게시된 이벤트와 서버 기록은 삭제하지 않습니다.',
  'data-bew-reset-confirm',
  'data-bew-reset-back',
  'role="dialog"',
  'aria-modal="true"',
  'function hasResettableContent(',
  'function openResetModal(',
  'function closeResetModal(',
  "event.key==='Escape'",
  "event.key!=='Tab'",
  "event.target.matches?.('[data-bew-reset-modal]')",
  "resetWorkflow(s,{message:'작성 중인 내용을 초기화했습니다.'})"
])assert.ok(workflow.includes(token),`safe reset contract missing: ${token}`);

for(const token of [
  "api(s,'event-publish'",
  "api(s,'event-list',{includeArchived:true})",
  "['PUBLISHED','MIXED'].includes",
  '게시 요청은 처리됐지만 서버 게시 결과를 다시 확인하지 못했습니다. 작성 내용은 유지했습니다.',
  'data-bew-result-notice',
  'data-bew-go-events',
  'openBannerEventHub?.(s.kind',
  '작성 화면은 새 이벤트를 만들 수 있도록 초기화했습니다.'
])assert.ok(workflow.includes(token),`publish readback/reset contract missing: ${token}`);

assert.ok(loader.includes('v2026082609'),'phase-2 stage-7 loader generation missing');
assert.ok(desktop.includes('admin.js?cache=2026082609'),'desktop loader generation mismatch');
assert.ok(mobile.includes('admin.js?cache=2026082609'),'mobile loader generation mismatch');

console.log('PASS banner event phase-2 stage-1 shell contract');
