'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../admin/js/admin-images.js'),'utf8');
const del=fs.readFileSync(path.join(__dirname,'../admin/js/admin-banner-delete.js'),'utf8');
const loader=fs.readFileSync(path.join(__dirname,'../admin/js/admin.js'),'utf8');
const CACHE='2026082402';
const adminPages=[
  fs.readFileSync(path.join(__dirname,'../admin/index.html'),'utf8'),
  fs.readFileSync(path.join(__dirname,'../m/admin/index.html'),'utf8'),
];
assert.ok(loader.includes("'admin-images.js'"));
assert.ok(loader.includes("'admin-banner-delete.js'"));
assert.ok(loader.indexOf("'admin-images.js'")<loader.indexOf("'admin-banner-delete.js'"));
for(const page of adminPages){
  assert.ok(page.includes(`admin.js?cache=${CACHE}`),'admin entrypoint cache must match current loader generation');
  assert.equal(page.includes('admin.js?cache=2026082202'),false,'stale admin loader cache must not remain');
}
assert.ok(loader.includes(`v${CACHE}`),'loader generation must match entrypoint cache');
assert.ok(loader.includes("searchParams.get('cache')"),'loader must inherit cache key from its own script URL');
assert.ok(loader.includes("name+'?cache='+encodeURIComponent(CACHE)"),'child admin modules must inherit the loader cache key');
assert.ok(loader.includes("'admin-banner-tabs.js'"),'banner tab module must be part of the admin loader');
assert.equal(loader.includes("name+'?cache=2026082202'"),false,'stale fixed child-module cache must not remain');
for(const token of ["EDGE='kinojo-banner-media'","api('asset-list'","api('campaign-list'","api('manifest',{pageCode:'HOME',slotCode:'MAIN'}","api('upload-prepare'","api('upload-complete'","'x-upsert':'false'","formatCode:FORMAT","type:'MAIN',pageCode:'HOME',slotCodes:['MAIN']","scheduleMode:m","startsAtKst","endsAtKst","weekdays","specificDates","slideIntervalMs","transitionDurationMs","weight:100,enabled:true","scheduleMode:'INHERIT'","campaign-update","campaign-create","campaign-publish","campaign-pause","campaign-archive","campaign-restore","bannerMainPreviewPc","bannerMainPreviewMobile","Server Manifest"]) assert.ok(source.includes(token),`missing ${token}`);
for(const token of ["EDGE='kinojo-banner-media'","BUCKET='kinojo-site-banners'","api('asset-list'","api('asset-archive'","api('asset-delete'","api('asset-restore'","sourceType)!=='STORAGE'","referenceCount||0","data-b-asset-delete","loadMainBannerManagement?.(true)"]) assert.ok(del.includes(token),`missing delete contract ${token}`);
assert.equal(/service_role/i.test(source+del),false);
assert.equal(/passKey|passCode/.test(source+del),false);
assert.ok(source.includes('p.idempotencyKey=id()'));
assert.ok(del.includes('payload.idempotencyKey=crypto.randomUUID()'));
assert.ok(source.includes("method:'PUT'"));
assert.ok(source.includes('im.naturalWidth*9!==im.naturalHeight*16'));
assert.equal(source.includes('SIDE_300_715'),false);
assert.ok(del.includes("if(!isStorageAsset(label)"));
assert.ok(del.includes('캠페인에서 이미지 선택을 해제하고 저장한 뒤 삭제하세요.'));
console.log('KINOJO banner admin main + storage asset delete contract: PASS');
