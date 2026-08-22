'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const side=fs.readFileSync(path.join(__dirname,'../admin/js/admin-side-banners.js'),'utf8');
const loader=fs.readFileSync(path.join(__dirname,'../admin/js/admin.js'),'utf8');
assert.ok(loader.includes("'admin-images.js'"));
assert.ok(loader.includes("'admin-side-banners.js'"));
for(const token of [
  "FORMAT='SIDE_300_715'",
  "['HOME','홈']","['HOF','명예의 전당']","['RANKING','레기온 순위']","['LEGION_TREE','레기온 트리']","['METER','키노조 미터']","['SANCTUARY','성역 메인']","['SANCTUARY_SCHEDULE','성역 스케줄']",
  "S.page==='HOF'","S.slot==='BOTH'?['LEFT','RIGHT']:[S.slot]",
  "type:'SIDE',pageCode:S.page,slotCodes:physicalSlots()",
  "weight:Number(v.weight||0)","scheduleMode:custom?'CUSTOM':'INHERIT'",
  "startsAtKst:custom?","endsAtKst:custom?","weekdays:custom?","specificDates:custom?",
  "bannerSidePreviewLeft","bannerSidePreviewRight",
  "api('manifest',{pageCode:S.page,slotCode:'LEFT'}","api('manifest',{pageCode:S.page,slotCode:'RIGHT'}",
  "api('upload-prepare'","api('upload-complete'","formatCode:FORMAT","'x-upsert':'false'",
  "naturalWidth*715!==im.naturalHeight*300",
  "campaign-publish","campaign-pause","campaign-archive","campaign-restore",
  "BOTH는 같은 이미지 풀을 공유하지만 Server가 LEFT/RIGHT 재생 순서를 독립 생성"
]) assert.ok(side.includes(token),`missing ${token}`);
assert.equal(/service_role/i.test(side),false);
assert.equal(/passKey|passCode/.test(side),false);
assert.ok(side.includes('payload.idempotencyKey=uuid()'));
console.log('KINOJO banner admin 5-c side UI contract: PASS');
