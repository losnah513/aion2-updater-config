'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const contract=require('../ui/kinojo-my-info-image-contract.js');
const expected={FRONT:[800,1200,['머리','양손','발끝']],BACK:[800,1200,['머리카락','의상 후면','뒤꿈치']],UPPER_BODY:[800,1000,['머리 전체','양어깨','허리선']]};
const sig=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
const paths=[];
for(const slot of contract.referenceSlotOrder){
  const def=contract.slots[slot], rule=expected[slot];
  assert.ok(def.guideAssetPath?.startsWith('/assets/images/my-info/guides/'));
  assert.ok(def.guideAssetPath.endsWith('.png'));
  const rel=def.guideAssetPath.slice(1), abs=path.join(__dirname,'..',rel), data=fs.readFileSync(abs);
  paths.push(rel);
  assert.ok(data.subarray(0,8).equals(sig),`${rel} PNG signature`);
  assert.equal(data.toString('ascii',12,16),'IHDR');
  assert.equal(data.readUInt32BE(16),rule[0]); assert.equal(data.readUInt32BE(20),rule[1]);
  const colorType=data[25]; assert.ok(colorType===4||colorType===6||data.includes(Buffer.from('tRNS')),`${rel} transparency`);
  assert.ok(data.length<=256*1024,`${rel} size budget`);
  assert.equal(def.outputWidth,rule[0]); assert.equal(def.outputHeight,rule[1]);
  for(const landmark of rule[2])assert.match(def.preAttachGuide,new RegExp(landmark));
}
assert.equal(new Set(paths).size,3); assert.equal(contract.slots.PROFILE.guideAssetPath,null);
for(const legacy of ['front-2x3.svg','back-2x3.svg','upper-body-4x5.svg'])assert.equal(fs.existsSync(path.join(__dirname,'../assets/images/my-info/guides',legacy)),false);
console.log('My Info three transparent PNG reference guide assets: PASS');
