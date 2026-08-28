'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const workflow=read('admin/js/admin-banner-event-workflow.js');
const edge=read('supabase/functions/kinojo-banner-media/index.ts');
const migration=read('supabase/migrations/20260826045246_banner_event_page_targets_v404.sql');
const hofRightPatch=read('supabase/migrations/20260828111622_banner_hof_right_side_target_v438.sql');
const hofRightSavePatch=read('supabase/migrations/20260828115503_banner_hof_right_event_save_v440.sql');
const hofRightCampaignPatch=read('supabase/migrations/20260828120843_banner_hof_right_campaign_target_v441.sql');

for(const token of [
  'banner event workflow phase 2 stage 7 integration v2026082811',
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
  'BANNER_EVENT_TARGET_VARIANTS_MISMATCH',
  'BANNER_EVENT_SYNC_TARGET_INVALID',
  'BANNER_EVENT_INDEPENDENT_TARGET_INVALID'
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

for(const token of [
  'private.kinojo_banner_manifest_target_valid_v387',
  'private.kinojo_banner_supported_page_slots_v404',
  'private.kinojo_banner_target_page_contract_v404',
  "'HOF','RANKING','LEGION_TREE','METER','SANCTUARY','SANCTUARY_SCHEDULE'",
  "jsonb_build_object('pageCode','HOF','label','명예의 전당','slotCodes',jsonb_build_array('LEFT','RIGHT')",
  'from public, anon, authenticated, service_role'
])assert.ok(hofRightPatch.includes(token),`DB438 HOF right-side patch missing: ${token}`);
assert.ok(!/create\s+table|create\s+type|alter\s+table/i.test(hofRightPatch),'DB438 must only replace the existing target-contract functions');
assert.ok(!edge.includes('kinojo_banner_event_targets_v413'),'the existing v404 Edge entry point must be reused');

for(const token of [
  'public.kinojo_banner_event_save_v391',
  'private.kinojo_banner_supported_page_slots_v404',
  'v_supported_slots text[]',
  'v_slots<>v_supported_slots',
  'not (v_role=any(v_supported_slots))',
  'DB440 event-save base contract',
  'to service_role'
])assert.ok(hofRightSavePatch.includes(token),`DB440 HOF event-save patch missing: ${token}`);
assert.ok(!hofRightSavePatch.includes("(v_page='HOF' and v_role='RIGHT')"),'DB440 must not retain the retired HOF-right rejection');
assert.ok(!hofRightSavePatch.includes("(v_page='HOF' and v_slots<>array['LEFT']::text[])"),'DB440 must not retain the retired HOF-left-only sync rule');
assert.ok(!/create\s+table|create\s+type|alter\s+table/i.test(hofRightSavePatch),'DB440 must only replace the existing event-save function');

for(const token of [
  'private.kinojo_banner_campaign_target_valid_v386',
  "'HOME','HOF','RANKING','LEGION_TREE','METER','SANCTUARY','SANCTUARY_SCHEDULE'",
  "p_slots <@ array['LEFT','RIGHT']::text[]",
  'cardinality(p_slots) between 1 and 2',
  'security invoker',
  'from public, anon, authenticated, service_role',
  'DB441 shared campaign target validation'
])assert.ok(hofRightCampaignPatch.includes(token),`DB441 HOF campaign target patch missing: ${token}`);
assert.ok(!hofRightCampaignPatch.includes("when p_type='SIDE' and p_page='HOF' then p_slots=array['LEFT']::text[]"),'DB441 must not retain the retired HOF-left-only campaign rule');
assert.ok(!/create\s+table|create\s+type|alter\s+table/i.test(hofRightCampaignPatch),'DB441 must only replace the existing campaign target helper');

console.log('PASS banner event phase-2 stage-4 page selection contract');
