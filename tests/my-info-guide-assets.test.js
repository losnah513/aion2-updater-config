'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const contract=require('../ui/kinojo-my-info-image-contract.js');

const expected={
  FRONT:{viewBox:'0 0 800 1200',width:800,height:1200,landmarks:['머리','양손','발끝']},
  BACK:{viewBox:'0 0 800 1200',width:800,height:1200,landmarks:['머리카락','의상 후면','뒤꿈치']},
  UPPER_BODY:{viewBox:'0 0 800 1000',width:800,height:1000,landmarks:['머리 전체','양어깨','허리선']}
};

const assetPaths=[];
for(const slot of contract.referenceSlotOrder){
  const rule=expected[slot];
  const slotContract=contract.slots[slot];
  assert.ok(rule,`${slot} guide expectation is missing`);
  assert.ok(slotContract.guideAssetPath?.startsWith('/assets/images/my-info/guides/'));

  const relativePath=slotContract.guideAssetPath.slice(1);
  const absolutePath=path.join(__dirname,'..',relativePath);
  const source=fs.readFileSync(absolutePath,'utf8');
  const size=fs.statSync(absolutePath).size;
  assetPaths.push(relativePath);

  assert.ok(size<=8*1024,`${relativePath} exceeds the 8 KiB guide budget`);
  assert.match(source,new RegExp(`<svg[^>]+width="${rule.width}"[^>]+height="${rule.height}"`));
  assert.match(source,new RegExp(`viewBox="${rule.viewBox}"`));
  assert.match(source,new RegExp(`data-kinojo-guide="${slot}"`));
  assert.match(source,/preserveAspectRatio="xMidYMid meet"/);
  assert.match(source,/role="img"/);
  assert.match(source,/aria-labelledby="[^"]+ [^"]+"/);
  assert.match(source,/<title id="[^"]+">[^<]+<\/title>/);
  assert.match(source,/<desc id="[^"]+">[^<]+<\/desc>/);
  assert.doesNotMatch(source,/<(?:script|foreignObject|text)\b/i);
  assert.doesNotMatch(source,/(?:href|xlink:href)=/i);
  assert.equal(slotContract.outputWidth,rule.width);
  assert.equal(slotContract.outputHeight,rule.height);
  for(const landmark of rule.landmarks)assert.match(slotContract.preAttachGuide,new RegExp(landmark));
}

assert.equal(new Set(assetPaths).size,3);
assert.equal(contract.slots.PROFILE.guideAssetPath,null);

console.log('My Info three reference guide SVG assets: PASS');
