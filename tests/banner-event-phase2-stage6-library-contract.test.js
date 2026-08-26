'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const library=read('admin/js/admin-banner-library.js');
const tabs=read('admin/js/admin-banner-tabs.js');
const bootstrap=read('admin/js/admin-bootstrap.js');
const loader=read('admin/js/admin.js');
const workflow=read('admin/js/admin-banner-event-workflow.js');
const desktop=read('admin/index.html');
const mobile=read('m/admin/index.html');
const edge=read('supabase/functions/kinojo-banner-media/index.ts');
const migration=read('supabase/migrations/20260826065731_banner_asset_library_v406.sql');

for(const token of [
  'banner asset library phase 2 stage 6 v2026082607',
  '이미지 라이브러리',
  "mode:'library'",
  'data-bal-mode',
  'role="switch"',
  'data-bal-query',
  'data-bal-tag-groups',
  'data-bal-tag-filter',
  '현재 사용 중인 정식 이벤트',
  'originalFileName',
  'mimeType',
  'sizeBytes',
  'createdAt',
  'data-bal-title',
  'data-bal-tag-input',
  'data-bal-tag-remove',
  'data-bal-tag-move',
  'const dirty=',
  "api('asset-title-check'",
  "api('asset-update'",
  "api('asset-library'",
  'kinojo:banner-assets-updated',
  'TAG_LIMIT=5',
  'TITLE_LIMIT=120',
  'max-height:650px',
  '@media(max-width:980px)',
  '@media(max-width:700px)',
  '@media(forced-colors:active)',
  '@media(prefers-reduced-motion:reduce)',
  'role="status" aria-live="polite"',
])assert.ok(library.includes(token),`missing stage-6 library UI token: ${token}`);

assert.ok(library.includes("selectedId:0"),'library must start without an image selection');
assert.ok(library.includes("object-fit:contain"),'library previews must show the full image');
assert.ok(library.includes("S.draftTags.length>=TAG_LIMIT"),'five-tag limit state missing');
assert.match(library,/dirty\(\)&&validDraft\(\)&&!S\.saving/,'save must require a valid real change');
assert.match(library,/titleOf\(asset\)\.toLocaleLowerCase[\s\S]+tags\.some/,'title and hashtag search must share one filter');

for(const token of [
  'data-banner-management-tab="library"',
  'data-banner-management-panel="library"',
  'adminBannerLibraryPanel',
  "['main','side','events','library']",
  "A.loadBannerAssetLibrary?.(force)",
])assert.ok(tabs.includes(token),`missing stage-6 image tab token: ${token}`);

assert.ok(bootstrap.includes("if(tab==='images'&&subtab==='library') A.loadBannerAssetLibrary?.(force===true)"),'library router loader missing');
assert.ok(loader.includes("'admin-banner-library.js'"),'dedicated library module missing from common admin loader');
assert.ok(loader.indexOf("'admin-banner-tabs.js'")<loader.indexOf("'admin-banner-library.js'"),'library module must mount after the image tab shell');
assert.ok(workflow.includes("window.addEventListener('kinojo:banner-assets-updated'"),'authoring cache refresh listener missing');
assert.ok(desktop.includes('admin.js?cache=2026082607')&&mobile.includes('admin.js?cache=2026082607'),'PC/mobile must share the stage-6 loader generation');

for(const token of [
  'private.kinojo_banner_asset_usage_v406',
  'private.kinojo_banner_asset_json_v406',
  'private.kinojo_banner_asset_tag_groups_v406',
  'public.kinojo_banner_asset_library_v406',
  'public.kinojo_banner_asset_update_v406',
  'eventGroupId',
  'enabledItemCount',
  'formalEventCount',
  "'contract','banner-asset-library-v406'",
  "'contract','banner-asset-update-v406'",
  'private.kinojo_banner_require_master_v384',
  'grant execute on function public.kinojo_banner_asset_library_v406',
  'grant execute on function public.kinojo_banner_asset_update_v406',
  'to service_role',
])assert.ok(migration.includes(token),`missing DB406 library token: ${token}`);

assert.ok(!/delete\s+from\s+public\.kinojo_banner_(assets|campaigns|campaign_items)/i.test(migration),'stage 6 must not delete image or event records');
assert.ok(!/alter\s+table\s+public\.kinojo_banner_assets\s+disable\s+row\s+level\s+security/i.test(migration),'stage 6 must not disable asset RLS');

for(const token of [
  'V = "2.4"',
  'DB = "406"',
  '"asset-library"',
  'kinojo_banner_asset_library_v406',
  'kinojo_banner_asset_update_v406',
])assert.ok(edge.includes(token),`missing Edge 2.4/DB406 token: ${token}`);

console.log('PASS banner event phase-2 stage-6 image library contract');
