const fs=require('fs');
const path=require('path');
const assert=require('assert');

const root=path.resolve(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,'admin/js/admin-banner-event-workflow.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'admin/js/admin.js'),'utf8');
const desktop=fs.readFileSync(path.join(root,'admin/index.html'),'utf8');
const mobile=fs.readFileSync(path.join(root,'m/admin/index.html'),'utf8');

for(const token of [
  "UPLOAD_LIMIT=3",
  "data-banner-event-workflow",
  "이미지 추가",
  "새 노출 묶음 구성",
  "이미지 이벤트 설정",
  "이미지별 콘텐츠 편집",
  "검토하고 게시하기",
  "data-bew-add-card",
  "data-bew-replace",
  "data-bew-upload-cards",
  "data-bew-asset-add",
  "data-bew-move",
  "data-bew-file-title",
  "data-bew-tag-input",
  "data-bew-tag-remove",
  "data-bew-tag-count",
  "filter:'NONE'",
  'data-bew-filter="NONE"',
  'data-bew-order-drag',
  'data-bew-image-preview',
  "cropWarning",
  "배너 비율과 달라 표시할 때 가장자리가 잘릴 수 있습니다.",
  "기존 게시 이미지가 자동으로 섞이지 않습니다.",
  "원본은 크기와 비율 그대로 저장",
  "업로드만으로는 게시되지 않습니다."
])assert.ok(workflow.includes(token),`stage-2 workflow token missing: ${token}`);

assert.ok(workflow.includes("s.files.length>=UPLOAD_LIMIT"),'maximum image guard missing');
assert.ok(workflow.includes("s.files.push"),'persistent append behavior missing');
assert.ok(workflow.includes("api(s,'asset-title-check'"),'per-image title precheck missing');
assert.ok(workflow.includes("title:normalizeTitle(stem(file.name))"),'filename-based initial image title missing');
assert.ok(workflow.includes("tags:s.uploadTags"),'structured upload hashtag payload missing');
assert.ok(workflow.includes("event.key==='Backspace'"),'hashtag Backspace removal missing');
assert.ok(workflow.includes("event.key==='Enter'||event.key===','"),'hashtag Enter/comma commit missing');
assert.ok(workflow.includes("compositionstart"),'hashtag IME guard missing');
assert.ok(workflow.includes("clipboardData?.getData('text')"),'hashtag paste handling missing');
assert.ok(workflow.includes("s.selected.push"),'new bundle selection missing');
assert.ok(workflow.includes("[s.selected[index],s.selected[next]]"),'bundle ordering swap missing');
assert.ok(workflow.includes("payload.idempotencyKey=uuid()"),'mutation idempotency missing');
assert.ok(workflow.includes("'content-type':item.file.type"),'original image MIME upload missing');
assert.ok(!workflow.includes("campaign-create"),'stage-2 workflow must not create legacy campaigns');
assert.ok(!workflow.includes("campaign-publish"),'stage-2 workflow must not publish before review stage');
assert.ok(workflow.includes('.bew-preview-trigger img{display:block;width:100%!important;height:100%!important;min-height:0!important;border-radius:inherit;object-fit:contain!important;object-position:center!important}'),'ordinary workflow previews must fit the whole image');
assert.ok(workflow.includes('.bew-preview-trigger.is-tall img{object-fit:contain!important;object-position:center!important}'),'tall workflow previews must show the full image');

assert.ok(loader.includes("'admin-banner-event-workflow.js'"),'workflow module loader entry missing');
assert.ok(loader.indexOf("'admin-side-banners.js'")<loader.indexOf("'admin-banner-event-workflow.js'"),'workflow must mount after legacy shells');
assert.ok(loader.indexOf("'admin-banner-event-workflow.js'")<loader.indexOf("'admin-banner-quality.js'"),'quality guard must decorate new workflow');
assert.ok(loader.includes("2026082802"),'loader cache generation not bumped');
assert.ok(desktop.includes('admin.js?cache=2026082802'),'desktop admin cache generation mismatch');
assert.ok(mobile.includes('admin.js?cache=2026082802'),'mobile admin cache generation mismatch');

console.log('PASS banner event stage-2 UI contract');
