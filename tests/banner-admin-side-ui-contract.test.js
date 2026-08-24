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
  "['ALL','전체 페이지']",
  "['HOME','홈']","['HOF','명예의 전당']","['RANKING','레기온 순위']","['LEGION_TREE','레기온 트리']","['METER','키노조 미터']","['SANCTUARY','성역 메인']","['SANCTUARY_SCHEDULE','성역 스케줄']",
  "const TARGET_PAGES=PAGES.filter(([code])=>code!=='ALL')",
  "if(pageCode==='HOF')return S.slot==='RIGHT'?[]:['LEFT']","S.slot==='BOTH'?['LEFT','RIGHT']:[S.slot]",
  "type:'SIDE',pageCode,slotCodes:physicalSlots(pageCode)",
  "weight:Number(v.weight||0)","scheduleMode:custom?'CUSTOM':'INHERIT'",
  "startsAtKst:custom?","endsAtKst:custom?","weekdays:custom?","specificDates:custom?",
  "bannerSidePreviewLeft","bannerSidePreviewRight",
  "const pageCode=S.page==='ALL'?'HOME':S.page",
  "api('upload-prepare'","api('upload-complete'","formatCode:FORMAT","'x-upsert':'false'",
  "naturalWidth*715!==im.naturalHeight*300",
  "campaign-publish","campaign-pause","campaign-archive","campaign-restore",
  "function saveAll({refresh=true}={})","function publishAll()","campaign:payload(pageCode)",
  "전체 페이지 일괄 생성","생성 후 수정은 페이지별로 진행하세요","명예의 전당에는 왼쪽 배너만 생성",
  "banner-admin-grid","banner-fields","banner-actions-primary","현재 게시 중","좌우 배너 미리보기","이미지 라이브러리","선택 이미지","사이드 캠페인 목록"
]) assert.ok(side.includes(token),`missing ${token}`);
assert.equal(side.includes("pageCode:'ALL'"),false,'ALL must stay a client-only batch option');
assert.equal(/service_role/i.test(side),false);
assert.equal(/passKey|passCode/.test(side),false);
assert.ok(side.includes('payload.idempotencyKey=uuid()'));
console.log('KINOJO banner admin 5-c side UI contract: PASS');
