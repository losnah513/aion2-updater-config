'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const workflow=read('admin/js/admin-banner-event-workflow.js');
const edge=read('supabase/functions/kinojo-banner-media/index.ts');
const migration=read('supabase/migrations/20260826045246_banner_event_page_targets_v404.sql');

for(const token of [
  'banner event workflow phase 2 stage 7 integration v2026082608',
  "api(s,'event-targets')",
  'function normalizeTargetContract(',
  'function selectedSidePages(',
  'function toggleTargetPage(',
  'function setAllTargetPages(',
  'individualTargetPages',
  'allPagesSelected',
  'data-bew-page-code',
  'aria-pressed=',
  'data-bew-all-pages',
  'role="switch"',
  '개별선택',
  '전체선택',
  '선택한 페이지 없음 · 초안 저장 가능',
  '페이지가 없어도 초안 저장은 가능합니다.',
  'targetPageContractVersion',
  'targetPages:[]',
  "base.targetPages=pages.map(page=>page.pageCode)",
  "page.slotCodes.includes('RIGHT')",
  '메인 배너는 서버가 지정한 홈 영역에만 노출됩니다.',
  'is-locked'
])assert.ok(workflow.includes(token),`phase-2 stage-4 UI contract missing: ${token}`);

assert.ok(!workflow.includes('const SIDE_PAGES='),'page list must not be duplicated in the Web layer');
assert.ok(!workflow.includes('const TARGET_PAGES='),'target page IDs must come from the Server');
assert.ok(!workflow.includes("data-bew-page>"),'retired single-page select remains');
assert.match(workflow,/if\(checked\)\{s\.individualTargetPages=[\s\S]+?s\.targetPages=\[\.\.\.supported\][\s\S]+?else\{s\.allPagesSelected=false;s\.targetPages=supported\.filter\(code=>s\.individualTargetPages\.includes\(code\)\)\}/,'all-select must preserve and restore the prior individual set');
assert.match(workflow,/if\(s\.kind==='side'&&!s\.targetPages\.length\)return\{step:3,selector:'\[data-bew-page-selector\]'/,'publish must stop at the page selector when no page is selected');

for(const token of [
  'DB = "412"',
  'EVENT = "407"',
  '"event-targets"',
  'kinojo_banner_event_targets_v404',
  'kinojo_banner_event_list_v404',
  'kinojo_banner_event_save_v407',
  'kinojo_banner_event_publish_v404',
  'BANNER_EVENT_TARGET_PAGES_REQUIRED',
  'BANNER_EVENT_TARGET_VARIANTS_MISMATCH'
])assert.ok(edge.includes(token),`phase-2 stage-4 Edge contract missing: ${token}`);

for(const token of [
  'private.kinojo_banner_supported_page_codes_v404',
  'private.kinojo_banner_target_page_contract_v404',
  "'HOME','HOF','RANKING','LEGION_TREE','METER','SANCTUARY','SANCTUARY_SCHEDULE'",
  'add column if not exists target_pages text[]',
  'add column if not exists target_page_contract_version integer',
  'kinojo_banner_event_target_pages_v404_chk',
  'kinojo_banner_event_targets_v404',
  'kinojo_banner_event_json_v404',
  'kinojo_banner_event_list_v404',
  'kinojo_banner_event_save_v404',
  "v_type='SIDE' and cardinality(v_targets)=0",
  'BANNER_EVENT_TARGET_VARIANTS_MISMATCH',
  'delete from public.kinojo_banner_campaigns c',
  'kinojo_banner_event_publish_v404',
  'BANNER_EVENT_TARGET_PAGES_REQUIRED',
  'targetPageContractVersion',
  'grant execute on function public.kinojo_banner_event_targets_v404'
])assert.ok(migration.includes(token),`DB404 page target contract missing: ${token}`);

assert.match(migration,/update private\.kinojo_banner_event_groups_v391 g[\s\S]+select distinct c\.page_code[\s\S]+where c\.event_group_id=g\.event_group_id/,'existing formal events must be backfilled from their linked campaigns');
assert.match(migration,/target_pages=v_targets,target_page_contract_version=404/,'saved event must persist the explicit page set and contract version');
assert.ok(!migration.includes('update public.kinojo_banner_campaigns\n   set page_code'),'legacy operating campaign targets must not be rewritten by backfill');

console.log('PASS banner event phase-2 stage-4 page selection contract');
