'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../admin/js/admin-images.js'),'utf8');
const del=fs.readFileSync(path.join(__dirname,'../admin/js/admin-banner-delete.js'),'utf8');
const loader=fs.readFileSync(path.join(__dirname,'../admin/js/admin.js'),'utf8');
const tabs=fs.readFileSync(path.join(__dirname,'../admin/js/admin-banner-tabs.js'),'utf8');
const shared=fs.readFileSync(path.join(__dirname,'../admin/js/admin-shared.js'),'utf8');
const bootstrap=fs.readFileSync(path.join(__dirname,'../admin/js/admin-bootstrap.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../admin/css/admin.css'),'utf8');
const CACHE='2026082803';
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
  assert.ok(page.includes('data-admin-tab="images" data-admin-master-only'),'image nav must exist in initial HTML without waiting for modules');
  assert.ok(page.includes('data-admin-pane="images" data-admin-master-only'),'image pane must exist in initial HTML without waiting for modules');
}
assert.ok(loader.includes(`v${CACHE}`),'loader generation must match entrypoint cache');
assert.ok(loader.includes("searchParams.get('cache')"),'loader must inherit cache key from its own script URL');
assert.ok(loader.includes("name+'?cache='+encodeURIComponent(CACHE)"),'child admin modules must inherit the loader cache key');
assert.ok(loader.includes("'admin-banner-tabs.js'"),'banner tab module must be part of the admin loader');
assert.ok(loader.includes("'admin-banner-events.js'"),'banner event manager must be part of the admin loader');
assert.ok(loader.indexOf("'admin-banner-tabs.js'")<loader.indexOf("'admin-bootstrap.js'"),'banner tabs must register before admin navigation bootstrap');
assert.equal(loader.includes("name+'?cache=2026082202'"),false,'stale fixed child-module cache must not remain');
for(const token of ["nav.dataset.adminSubnav='images'",'data-admin-subtab="main"','data-admin-subtab="side"','data-banner-view="events"','data-banner-view="library"',"main.dataset.adminSubpane='main'","side.dataset.adminSubpane='side'"]) assert.ok(tabs.includes(token),`missing standard image subnavigation contract ${token}`);
assert.ok(shared.includes("images:'main'"),'image management must have a standard default subtab');
assert.ok(bootstrap.includes("tab==='images'&&(subtab==='main'||subtab==='side')"),'main/side banner context must load through the admin subtab router');
assert.ok(bootstrap.includes('A.loadBannerContext?.(subtab,force===true)'),'contextual event/library workspace must load through the admin router');
assert.ok(bootstrap.includes("clone.removeAttribute('id')"),'top subnav clones must not duplicate source tab ids');
assert.ok(bootstrap.includes("subpane.hidden=!on"),'tabpanel visibility must follow the selected admin subtab');
assert.ok(css.includes('.admin-pane>.admin-subnav{display:none!important}'),'source subnav remains hidden because the visible tabs are rendered in the top subnav');
for(const token of ["EDGE='kinojo-banner-media'","api('asset-list'","api('campaign-list'","api('manifest',{pageCode:'HOME',slotCode:'MAIN'}","api('upload-prepare'","api('upload-complete'","'x-upsert':'false'","formatCode:FORMAT","type:'MAIN',pageCode:'HOME',slotCodes:['MAIN']","scheduleMode:m","startsAtKst","endsAtKst","weekdays","specificDates","slideIntervalMs","transitionDurationMs","weight:100,enabled:true","scheduleMode:'INHERIT'","campaign-update","campaign-create","campaign-publish","campaign-pause","campaign-archive","campaign-restore","campaign-delete","expectedName","bannerMainPreviewPc","bannerMainPreviewMobile","Server Manifest"]) assert.ok(source.includes(token),`missing ${token}`);
for(const token of ['메인 배너 관리','banner-flow','banner-flow-rail','이미지 추가','노출 묶음 구성','노출 조건 설정','검토하고 게시','＋ 추가하기','multiple','분류 태그','업로드만 · 노출 안 함','현재 게시 중','PC·모바일 미리보기','이미지 라이브러리','이번 묶음에 선택한 이미지','메인 노출 묶음 목록','보관','영구 삭제','ensureBannerAdminLayoutStyle']) assert.ok(source.includes(token),`missing polished main layout contract ${token}`);
for(const token of ["EDGE='kinojo-banner-media'","BUCKET='kinojo-site-banners'","api('asset-list'","api('asset-archive'","api('asset-delete'","api('asset-restore'","sourceType)!=='STORAGE'","referenceCount||0","data-b-asset-delete","loadMainBannerManagement?.(true)"]) assert.ok(del.includes(token),`missing delete contract ${token}`);
assert.equal(/service_role/i.test(source+del),false);
assert.equal(/passKey|passCode/.test(source+del),false);
assert.ok(source.includes('p.idempotencyKey=id()'));
assert.ok(del.includes('payload.idempotencyKey=crypto.randomUUID()'));
assert.ok(source.includes("method:'PUT'"));
for(const token of ['prepareBannerUploadImage','canvas.toDataURL','image/webp','createImageBitmap','Math.max)(canvas.width/sourceWidth','renderFileQueue','queueWarning','files=Array.from','for(let index=0;index<files.length;index++)','bannerUploadDisplayName','bannerAssetTags','confirmPermanentCampaignDelete']) assert.ok(source.includes(token),`missing responsive upload/delete contract ${token}`);
assert.equal(source.includes('naturalWidth*9!=='),false,'arbitrary source ratios must be converted instead of rejected');
assert.equal(source.includes('SIDE_300_715'),false);
assert.ok(del.includes("if(!isStorageAsset(label)"));
assert.ok(del.includes('캠페인에서 이미지 선택을 해제하고 저장한 뒤 삭제하세요.'));
console.log('KINOJO banner admin main + storage asset delete contract: PASS');
