const fs=require('fs');
const path=require('path');
const assert=require('assert');

const root=path.resolve(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,'admin/js/admin-banner-event-workflow.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'admin/js/admin.js'),'utf8');
const desktop=fs.readFileSync(path.join(root,'admin/index.html'),'utf8');
const mobile=fs.readFileSync(path.join(root,'m/admin/index.html'),'utf8');

for(const token of [
  'banner event workflow stage 3',
  "['ALL','전체 페이지']",
  "['HOME','홈']",
  "['HOF','명예의 전당']",
  "['RANKING','레기온 순위']",
  "['LEGION_TREE','레기온 트리']",
  "['METER','키노조 미터']",
  "['SANCTUARY','성역 메인']",
  "['SANCTUARY_SCHEDULE','성역 스케줄']",
  "sideMode:'SYNC'",
  "'INDEPENDENT'",
  'data-bew-side-mode',
  'kinojo-filter-switch bew-mode-switch',
  '좌우 동시',
  '좌우 별도',
  '언제 보여줄까요?',
  '날짜·요일 지정',
  '이미지 유지 시간',
  '바뀌는 시간',
  '부드럽게 겹쳐 바꾸기',
  '밀어서 바꾸기',
  '밀면서 부드럽게 바꾸기',
  '확대하며 바꾸기',
  'LEFT_TO_RIGHT',
  'RIGHT_TO_LEFT',
  'TOP_TO_BOTTOM',
  'BOTTOM_TO_TOP',
  'data-bew-side-add',
  'data-bew-side-remove',
  'data-bew-side-move',
  "eventRole:'SHARED'",
  "eventRole:'LEFT'",
  "eventRole:'RIGHT'",
  "eventRole:'MAIN'",
  "pageCode==='HOF'?['LEFT']:['LEFT','RIGHT']",
  'getBannerEventPayload'
])assert.ok(workflow.includes(token),`stage-3 workflow token missing: ${token}`);

assert.ok(workflow.includes("root.dataset.bannerEventStage='3'"),'stage-3 mount marker missing');
assert.ok(workflow.includes("index<3?' ready':''"),'third workflow node must be active');
assert.ok(workflow.includes("pageCode==='HOF'?['LEFT']:['LEFT','RIGHT']"),'HOF left-only shared target missing');
assert.ok(workflow.includes("if(pageCode!=='HOF')"),'HOF right variant exclusion missing');
assert.ok(workflow.includes('slideIntervalMs:Math.max(3000'),'slide interval normalization missing');
assert.ok(workflow.includes('transitionDurationMs:Math.max(0'),'transition duration normalization missing');
assert.ok(workflow.includes("directional?value.transitionDirection:'NONE'"),'non-directional effect normalization missing');
assert.ok(!workflow.includes("'event-save'"),'stage 3 must not persist a draft before stage 5');
assert.ok(!workflow.includes("'event-publish'"),'stage 3 must not publish before stage 5');

assert.ok(loader.includes('v2026082408'),'stage-3 loader cache generation missing');
assert.ok(desktop.includes('admin.js?cache=2026082408'),'desktop stage-3 cache mismatch');
assert.ok(mobile.includes('admin.js?cache=2026082408'),'mobile stage-3 cache mismatch');

console.log('PASS banner event stage-3 UI contract');
