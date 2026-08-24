'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const q=fs.readFileSync(path.join(root,'admin/js/admin-banner-quality.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'admin/js/admin.js'),'utf8');
const main=fs.readFileSync(path.join(root,'admin/js/admin-images.js'),'utf8');
const side=fs.readFileSync(path.join(root,'admin/js/admin-side-banners.js'),'utf8');
assert.ok(loader.replace(/\r\n/g,'\n').includes("'admin-side-banners.js',\n    'admin-banner-quality.js',\n    'admin-banner-tabs.js',\n    'admin-bootstrap.js'"),'quality and tab guards must load after banner modules and before bootstrap');
for(const token of [
  "addEventListener('beforeunload'","data-unsaved","aria-live","aria-busy","aria-invalid","role','region'","type==='error'?'alert':'status'",
  'function validDate(','function safeLink(','function validateBase(','function validateSide(','function setBusy(','function releaseBusy(','function markDirty(','function markClean(','function confirmDiscard(',
  '3000','60000','5000','10000',"mode.value!=='CUSTOM'",'BANNER_CLICK_URL_INVALID','BANNER_CAMPAIGN_PAUSE_REQUIRED',
  "t.matches('#sPage,#sSlot')","캠페인 변경사항을 먼저 저장하거나 새 캠페인으로 초기화한 뒤 이미지를 업로드하세요."
]) assert.ok(q.includes(token),`quality contract missing ${token}`);
assert.ok(q.includes('queueMicrotask(()=>$(') && q.includes('[data-s-new]'),'side target change must reset edit state');
assert.ok(q.includes("document.addEventListener('click'")&&q.includes('},true);'),'quality guards must run in capture phase before existing banner handlers');
assert.ok(q.includes("window.dispatchEvent(new CustomEvent('kinojo-banner-discard-all'))"),'cross-module unsaved reset missing');
assert.ok(q.includes("window.addEventListener('kinojo-banner-discard-all'"),'cross-module reset listener missing');
assert.ok(q.includes('root.dataset.pendingAction'),'pending action lock missing');
assert.ok(q.includes("for(const weight of $$('[data-s-weight]'"),'side weight validation missing');
assert.ok(q.includes("if(root.dataset.unsaved==='true'){block(event,root"),'upload must not discard unsaved campaign state');
assert.equal(/service_role/i.test(q+main+side),false,'browser banner sources must not contain service role');
assert.equal(/passKey|passCode/.test(q+main+side),false,'browser banner sources must not contain raw credential fields');
console.log('KINOJO banner admin 5-d quality contract: PASS');
