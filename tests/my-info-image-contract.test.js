'use strict';

const assert=require('node:assert/strict');
const contract=require('../ui/kinojo-my-info-image-contract.js');

assert.equal(contract.contractVersion,'2026-08-21.1');
assert.equal(contract.status,'FOLLOWUP_TARGET');
assert.deepEqual(contract.input.acceptedMimeTypes,['image/jpeg','image/png','image/webp']);
assert.equal(contract.input.maxBytes,5*1024*1024);
assert.deepEqual(contract.output,{
  mimeType:'image/webp',
  extension:'webp',
  quality:0.90,
  uploadOriginal:false,
  stripMetadata:true
});
assert.deepEqual(contract.slotOrder,['PROFILE','FRONT','BACK','UPPER_BODY']);
assert.deepEqual(contract.referenceSlotOrder,['FRONT','BACK','UPPER_BODY']);

const expected={
  PROFILE:{size:[512,512],aspect:[1,1],visibility:'PUBLIC_PROFILE_OVERRIDE',retentionDays:null,guide:'얼굴과 캐릭터 특징'},
  FRONT:{size:[800,1200],aspect:[2,3],visibility:'PRIVATE_REFERENCE',retentionDays:7,guide:'머리·양손·발끝'},
  BACK:{size:[800,1200],aspect:[2,3],visibility:'PRIVATE_REFERENCE',retentionDays:7,guide:'머리카락·의상 후면·뒤꿈치'},
  UPPER_BODY:{size:[800,1000],aspect:[4,5],visibility:'PRIVATE_REFERENCE',retentionDays:7,guide:'머리 전체부터 허리선까지, 양어깨'}
};

for(const [slot,rule] of Object.entries(expected)){
  const actual=contract.slots[slot];
  assert.ok(actual,`${slot} contract is missing`);
  assert.deepEqual([actual.outputWidth,actual.outputHeight],rule.size);
  assert.deepEqual([actual.aspectWidth,actual.aspectHeight],rule.aspect);
  assert.equal(actual.outputWidth/actual.outputHeight,actual.aspectWidth/actual.aspectHeight);
  assert.equal(actual.visibility,rule.visibility);
  assert.equal(actual.retentionDays,rule.retentionDays);
  assert.match(actual.preAttachGuide,new RegExp(rule.guide));
}

assert.match(contract.commonCaptureNotice,/HUD/);
assert.match(contract.commonCaptureNotice,/편집으로 제거할 수 없습니다/);
assert.ok(Object.isFrozen(contract));
assert.ok(Object.isFrozen(contract.slots));
assert.ok(Object.isFrozen(contract.slots.FRONT));

const commonUiSource=require('node:fs').readFileSync(require('node:path').join(__dirname,'../ui/kinojo-common-ui.js'),'utf8');
assert.match(commonUiSource,/const KINOJO_PROFILE_IMAGE_MAX_BYTES=5\*1024\*1024;/);
assert.match(commonUiSource,/new Set\(\['image\/jpeg','image\/png','image\/webp'\]\)/);
assert.match(commonUiSource,/const KINOJO_REFERENCE_IMAGE_SLOTS=\['FRONT','BACK','UPPER_BODY'\];/);

console.log('My Info image output contract: PASS');
