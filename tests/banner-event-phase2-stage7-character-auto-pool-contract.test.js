'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260826075456_banner_character_auto_pool_v407.sql');
const hardening=read('supabase/migrations/20260826084259_banner_eventless_pool_priority_v408.sql');
const activation=read('supabase/migrations/20260826084607_banner_eventless_pool_activation_v409.sql');
const closeout=read('supabase/migrations/20260826091642_banner_stage7_security_performance_v410.sql');
const edge=read('supabase/functions/kinojo-banner-media/index.ts');
const workflow=read('admin/js/admin-banner-event-workflow.js');
const library=read('admin/js/admin-banner-library.js');
const pool=read('admin/js/admin-banner-auto-pool.js');
const tabs=read('admin/js/admin-banner-tabs.js');
const bootstrap=read('admin/js/admin-bootstrap.js');
const loader=read('admin/js/admin.js');
const desktop=read('admin/index.html');
const mobile=read('m/admin/index.html');

for(const token of [
  'kinojo_banner_asset_characters_v407',
  'kinojo_banner_asset_representatives_v407',
  'kinojo_banner_auto_pools_v407',
  'kinojo_banner_auto_pool_assets_v407',
  'kinojo_banner_auto_pool_composites_v407',
  'kinojo_banner_character_search_v407',
  'kinojo_banner_character_resolve_v407',
  'kinojo_banner_asset_library_v407',
  'kinojo_banner_asset_character_set_v407',
  'kinojo_banner_asset_representative_set_v407',
  'kinojo_banner_auto_pool_save_v407',
  'kinojo_banner_auto_pool_state_v407',
  'kinojo_banner_auto_pool_delete_v407',
  'kinojo_banner_auto_pool_composite_register_v407',
  'kinojo_banner_auto_playlist_v407',
  'kinojo_banner_manifest_v407',
  "'priorityMode','AFTER_FORMAL_EVENTS'",
  "'sourceMode','AUTO_LIBRARY_POOL'",
  'BANNER_AUTO_POOL_COMPOSITES_REQUIRED',
  'partition by coalesce(l.character_id,-a.asset_id)',
  'enable row level security',
  'revoke all on table public.kinojo_banner_auto_pools_v407',
])assert.ok(migration.includes(token),`missing DB407 stage-7 token: ${token}`);

assert.match(migration,/cardinality\(v_asset_ids\)>99/,'Server must cap automatic pools at 99 assets');
assert.ok(migration.includes("jsonb_array_length(v_items)>99"),'Server must cap formal event variants at 99 assets');
assert.ok(hardening.includes('if v_has_formal then return v_base'),'formal events must suppress automatic pools');
assert.ok(hardening.includes("v_playlist:=v_auto||coalesce(v_base->'playlist','[]'::jsonb)"),'automatic pools must precede legacy/default banners');
assert.ok(hardening.includes('if pg_catalog.jsonb_array_length(v_auto)=0 then return v_base'),'no eligible automatic pool must leave the prior manifest unchanged');
assert.ok(activation.includes("'active',true")&&activation.includes("'reason',null"),'an eligible automatic pool must activate an otherwise empty slot');
assert.ok(!/disable\s+row\s+level\s+security/i.test(migration),'stage 7 must not disable RLS');
assert.ok(closeout.includes('revoke execute on function public.kinojo_banner_manifest_v407(text, text) from public, anon, authenticated'),'superseded manifest must remain behind the Edge boundary');
assert.ok(closeout.includes('kinojo_banner_auto_pool_assets_asset_v410_idx'),'automatic pool asset cleanup must have a covering index');
assert.ok(closeout.includes('kinojo_banner_auto_pool_composites_asset_v410_idx'),'automatic composite cleanup must have a covering index');

for(const token of [
  'V = "2.6"','DB = "412"','EVENT = "407"','REQ = 4194304',
  '"character-search"','"asset-character-set"','"asset-representative-set"',
  '"auto-pool-list"','"auto-pool-save"','"auto-pool-state"','"auto-pool-delete"',
  '"pool-composite-upload-prepare"','"pool-composite-upload-complete"',
  'kinojo_banner_manifest_v409','maxItemsPerEventVariant: 99',
  'eventlessAutoPoolAuthority: "SERVER_FORMAL_EVENT_EMPTY_ONLY_EXPLICIT_READY_ASSETS"',
  'BANNER_AUTO_POOL_ASSET_REQUIRED',
])assert.ok(edge.includes(token),`missing Edge 2.5/DB407 stage-7 token: ${token}`);

for(const token of [
  'UPLOAD_LIMIT=3','BUNDLE_LIMIT=99','WINDOW_SIZE=24',
  "filter:'NONE'",'data-bew-character-query','data-bew-character-unlinked',
  "api(s,'character-search'",'characterId:Number(item.character?.characterId)||null',
  'libraryVisible:WINDOW_SIZE','orderVisible:WINDOW_SIZE','reviewVisible:12',
  'loading="lazy" decoding="async"','object-fit:contain!important',
])assert.ok(workflow.includes(token),`missing stage-7 authoring token: ${token}`);

for(const token of [
  'data-bal-character-filter','캐릭터 연결됨','캐릭터 미연결','대표 이미지만',
  "api('character-search'","api('asset-character-set'","api('asset-representative-set'",
  'duplicateNameCount','expectedAssetId','representativeFormats','loading="lazy" decoding="async"',
])assert.ok(library.includes(token),`missing stage-7 library token: ${token}`);

for(const token of [
  '랜덤 이벤트','등록 이벤트 → 랜덤 이벤트 → 기본 배너',
  "const EDGE='kinojo-banner-media',BUCKET='kinojo-site-banners',LIMIT=99,WINDOW=32",
  "api('event-targets')","api('asset-library'","api('auto-pool-list')",
  "api('auto-pool-save'","api('auto-pool-state'","api('auto-pool-delete'",
  "api('pool-composite-upload-prepare'","api('pool-composite-upload-complete'",
  'function drawCover(','canvas.toBlob','AUTO_POOL_COMPOSITE_READY',
  'showCharacterName','representativeOnly','data-bap-page','data-bap-slot-choice',
  'loading="lazy" decoding="async"','꺼진 상태로 저장','영구 삭제',
])assert.ok(pool.includes(token),`missing automatic-pool UI token: ${token}`);

assert.ok(tabs.includes('data-banner-view="events"')&&tabs.includes('data-banner-view="library"'),'event and library views must share a contextual secondary navigation');
assert.ok(read('admin/js/admin-banner-events.js').includes('data-banner-auto-pool'),'random event must be hosted inside event management');
assert.ok(tabs.includes('A.loadBannerAutoPool?.(force)'),'tab navigation must load automatic pools');
assert.ok(bootstrap.includes('A.loadBannerContext?.(subtab,force===true)'),'router must load the contextual event/library workspace');
assert.ok(loader.includes("'admin-banner-auto-pool.js'"),'automatic-pool module missing from shared loader');
assert.ok(loader.indexOf("'admin-banner-library.js'")<loader.indexOf("'admin-banner-auto-pool.js'"),'automatic pool must load after the asset library');
assert.ok(desktop.includes('admin.js?cache=2026082901')&&mobile.includes('admin.js?cache=2026082901'),'PC/mobile must share the current admin loader generation');

console.log('PASS banner event phase-2 stage-7 character identity and automatic pool contract');
