'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const common=read('ui/kinojo-common-ui.js');
const css=read('ui/kinojo-my-info.css');
const workflow=read('.github/workflows/verify-kinojo-pages.yml');

for(const token of [
  "KINOJO_IMAGE_REQUEST_STYLES={SHONEN_MANGA:'소년만화 스타일',ROMANCE_MANGA:'순정만화 스타일',ANIMATION:'애니메이션 스타일',REALISTIC:'실사풍 스타일',CUSTOM:'직접 요청'}",
  '/ui/kinojo-my-info-image-request.js?cache=2026082601',
  'myInfoSelectedRequestResults_()',
  'invalidateMyInfoImageRequestResume_()',
  'submitMyInfoImageRequest_(options={})',
  'loadMyInfoImageRequestState_(characterId,force=false)',
  'id="kinojoMyInfoRequestSelectionSummary"',
  'name="kinojoMyInfoRequestStyle"',
  'id="kinojoMyInfoRequestNote" maxlength="300"',
  'id="kinojoMyInfoRequestSubmitBtn"',
  '요청 스타일을 정하지 않고 이미지만 업로드하시겠습니까?',
  'id="kinojoMyInfoStyleConfirmSubmitBtn"',
  "submitMyInfoImageRequest_({allowNoStyle:true})",
  "progress?.stage==='finalizing'",
  "일부 이미지('+completed+'/'+results.length+') 전송 후 멈췄습니다."
])assert.ok(common.includes(token),`member request UI contract missing: ${token}`);

assert.equal(common.includes('data-reference-upload-slot'),false,'per-slot server upload buttons must not remain');
assert.equal(common.includes('uploadMyInfoReference_(slotValue)'),false,'per-slot server upload handler must not remain');
assert.match(common,/if\(!styleCode&&options\.allowNoStyle!==true\)\{\s*openMyInfoStyleConfirm_\(\);\s*return false;/,'no-style submit must stop until the explicit confirmation dialog');
assert.match(common,/if\(!results\.length\)\{[\s\S]*?참고 이미지를 최소 1장 선택해 주세요/,'zero-image submission must be blocked');
assert.match(common,/if\(styleCode==='CUSTOM'&&!requestNote\)/,'CUSTOM must require the additional request');

for(const token of [
  '.kinojo-my-info-request-style-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))',
  '.kinojo-my-info-request-note textarea{width:100%;min-width:0',
  '.kinojo-my-info-request-submit-row{display:grid;grid-template-columns:minmax(0,1fr) auto',
  '.kinojo-my-info-request-confirm[hidden]{display:none!important}',
  '@media(max-width:620px)',
  '.kinojo-my-info-request-style-grid{grid-template-columns:repeat(2,minmax(0,1fr))}',
  '@media(max-width:390px)',
  '.kinojo-my-info-request-style-grid{grid-template-columns:1fr}'
])assert.ok(css.includes(token),`member request responsive CSS missing: ${token}`);

assert.ok(workflow.includes('ui/kinojo-my-info-image-request.js'),'GitHub verification must syntax-check the member request client');
assert.ok(workflow.includes('node tests/my-info-image-request-client.test.js'),'GitHub verification must run the member request client contract');
assert.ok(workflow.includes('node tests/my-info-image-request-ui-contract.test.js'),'GitHub verification must run the member request UI contract');

console.log('KINOJO My Info Phase 2 member image-request UI contract: PASS');
