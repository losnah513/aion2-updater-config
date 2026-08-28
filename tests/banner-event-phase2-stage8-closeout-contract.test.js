'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
const tabs=read('admin/js/admin-banner-tabs.js');
const events=read('admin/js/admin-banner-events.js');
const library=read('admin/js/admin-banner-library.js');
const pool=read('admin/js/admin-banner-auto-pool.js');
const workflow=read('admin/js/admin-banner-event-workflow.js');
const quality=read('admin/js/admin-banner-quality.js');
const chrome=read('tests/banner-admin-chrome-e2e.html');
const verify=read('.github/workflows/verify-banner-admin.yml');

for(const token of [
  "setAttribute('role','tablist')",'role="tab"',"setAttribute('role','tabpanel')",
  'ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End',
  'data-banner-view="events"','data-banner-view="library"',
  '메인 배너','사이드 배너','이벤트 관리','이미지 라이브러리',
])assert.ok(tabs.includes(token),`missing keyboard/semantic workspace contract: ${token}`);

for(const token of [
  'grid-template-columns:minmax(270px,3fr) minmax(560px,7fr)',
  '@media(max-width:900px){.bem-hero{position:static}.bem-body-grid{grid-template-columns:1fr}',
  'max-height:740px;overflow:auto','등록 이벤트 목록','랜덤 이벤트',
  'role="group" aria-label="사이드 이벤트 노출 위치"',
  'data-bem-slot="ALL"','data-bem-slot="LEFT"','data-bem-slot="RIGHT"',
  'role="switch" aria-checked="false"','aria-live="polite"',
])assert.ok(events.includes(token),`missing responsive/accessibility event-manager contract: ${token}`);

for(const token of [
  '@media(max-width:980px){.bal-layout{grid-template-columns:1fr}',
  '@media(max-width:430px){.bal-toolbar{grid-template-columns:1fr}',
  '@media(prefers-reduced-motion:reduce)',
  'aria-label="이미지 라이브러리 요약"','role="status" aria-live="polite"',
  'aria-label="선택 이미지 상세"','이미지를 선택해 주세요.',
])assert.ok(library.includes(token),`missing responsive/accessibility library contract: ${token}`);

for(const token of [
  'grid-template-columns:repeat(4,minmax(0,1fr))',
  '@media(max-width:1180px){.bap-assets{grid-template-columns:repeat(3,minmax(0,1fr))}',
  '@media(max-width:700px){.bap-assets{grid-template-columns:repeat(2,minmax(0,1fr))}',
  'role="status" aria-live="polite"','aria-pressed="${chosen}"',
  'data-bap-all-pages','data-bap-slot-choice="${code}"',
])assert.ok(pool.includes(token),`missing responsive/accessibility random-event contract: ${token}`);

for(const token of [
  '@media(prefers-reduced-motion:reduce)',
  'aria-modal="true"','aria-labelledby="bew-${s.kind}-reset-title"',
  'Alt와 위아래 화살표로 이동, Delete로 제거',
  "event.key==='Escape'","event.altKey&&(event.key==='ArrowUp'||event.key==='ArrowDown')",
  'data-bew-save-draft','data-bew-publish','data-bew-reset',
])assert.ok(workflow.includes(token),`missing authoring accessibility/lifecycle contract: ${token}`);
for(const token of ['aria-busy','aria-invalid','beforeunload','data-unsaved'])assert.ok(quality.includes(token),`missing async-form quality contract: ${token}`);

for(const token of [
  "key:'ArrowRight'","key:'ArrowLeft'","key:'End'",
  'stage-5 draft save','draft save must not publish',
  'publish readback and automatic reset','published authoring state did not reset',
  'responsive horizontal overflow','responsive event workspace must stack',
])assert.ok(chrome.includes(token),`missing authenticated browser closeout scenario: ${token}`);

for(const token of [
  'node tests/banner-stage7-random-event-workspace-contract.test.js',
  'node tests/banner-event-phase2-stage8-closeout-contract.test.js',
  'for viewport in 1440,1200 768,1024 390,844',
  '"admin/js/admin-banner-auto-pool.js"',
])assert.ok(verify.includes(token),`missing Stage 8 CI/readback gate: ${token}`);

console.log('PASS banner event phase-2 stage-8 integrated closeout contract');
