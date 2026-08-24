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
  "weight:Number(value.weight||0)","scheduleMode:custom?'CUSTOM':'INHERIT'",
  "startsAtKst:custom?","endsAtKst:custom?","weekdays:custom?","specificDates:custom?",
  "bannerSidePreviewLeft","bannerSidePreviewRight",
  "const pageCode=S.page==='ALL'?'HOME':S.page",
  "api('upload-prepare'","api('upload-complete'","formatCode:FORMAT","'x-upsert':'false'",
  "A.prepareBannerUploadImage(file,{...SIDE_OUTPUT","files=Array.from($('#sFile')?.files||[])","multiple","renderBannerFileQueue","bannerUploadDisplayName","분류 태그",
  "campaign-publish","campaign-pause","campaign-archive","campaign-restore","campaign-delete","expectedName",
  "function saveAll({refresh=true}={})","function publishAll()","campaign:payload(pageCode)",
  "전체 페이지 일괄 생성","생성 후 수정은 페이지별로 진행하세요","명예의 전당에는 왼쪽 배너만 생성",
  "banner-flow","banner-flow-rail","이미지 추가","노출 묶음 구성","노출 조건 설정","검토하고 게시","현재 게시 중","좌우 미리보기","이미지 라이브러리","이번 묶음에 선택한 이미지","사이드 캠페인 목록",
  "sCampaignQuery","sCampaignStatusFilter","campaignPageSize:8","data-s-page-prev","data-s-delete-id","설정 열기","영구 삭제"
]) assert.ok(side.includes(token),`missing ${token}`);
assert.equal(side.includes("pageCode:'ALL'"),false,'ALL must stay a client-only batch option');
assert.equal(side.includes('naturalWidth*715!=='),false,'arbitrary source ratios must be converted instead of rejected');
assert.equal(/service_role/i.test(side),false);
assert.equal(/passKey|passCode/.test(side),false);
assert.ok(side.includes('payload.idempotencyKey=uuid()'));
console.log('KINOJO banner admin 5-c side UI contract: PASS');
