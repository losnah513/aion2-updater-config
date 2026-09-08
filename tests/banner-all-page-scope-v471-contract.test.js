'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
const migration=read('supabase/migrations/20260908000100_banner_all_page_scope_v471.sql');
const rosterTargets=read('supabase/migrations/20260907104932_legion_roster_banner_targets_v468.sql');
const edge=read('supabase/functions/kinojo-banner-media/index.ts');
const workflow=read('admin/js/admin-banner-event-workflow.js');
const events=read('admin/js/admin-banner-events.js');
const images=read('admin/js/admin-images.js');
const desktop=read('admin/index.html');
const mobile=read('m/admin/index.html');

for(const html of [desktop,mobile]){
  assert.ok(html.includes('data-admin-subnav="images" data-banner-management-tabs'),'image location navigation must exist before lazy modules load');
  assert.ok(html.includes('data-admin-subtab="main"')&&html.includes('data-admin-subtab="side"'),'static image navigation must expose both banner contexts');
}
assert.ok(images.includes("p.insertAdjacentHTML('beforeend'"),'legacy authoring shell must append without deleting the static image navigation');
assert.equal(images.includes('p.innerHTML=`<div data-main-banner-admin>'),false,'legacy authoring shell must not replace the entire image pane');

for(const token of [
  'data-bew-page-all','>전체</button>','targetScope:',
  "s.kind==='side'&&s.allPagesSelected?'ALL':'SELECTED'",
  '앞으로 추가되는 페이지','새 페이지가 생겨도 이 이벤트에 자동으로 포함됩니다.'
])assert.ok(workflow.includes(token),`durable ALL-page UI contract missing: ${token}`);
assert.equal(workflow.includes('>전체선택</span>'),false,'the snapshot-style all-selection switch must be removed');
assert.ok(events.includes("event.targetScope==='ALL'"),'event cards must use persisted ALL intent, not a page-count guess');

for(const token of [
  'add column if not exists target_scope text not null',
  "target_scope in ('ALL','SELECTED')",
  'CURRENT_AND_FUTURE_SUPPORTED_PAGES',
  'kinojo_banner_event_all_targets_reconcile_v471',
  "g.event_type='SIDE' and g.target_scope='ALL'",
  'private.kinojo_banner_supported_page_codes_v404()',
  'insert into public.kinojo_banner_campaign_items',
  'kinojo_banner_event_targets_v471',
  'kinojo_banner_event_list_v471',
  'kinojo_banner_event_save_v471',
  'kinojo_banner_event_publish_v471',
  'cardinality(private.kinojo_banner_supported_page_codes_v404())*2',
  "set target_scope='ALL'"
])assert.ok(migration.includes(token),`DB471 ALL-page contract missing: ${token}`);
assert.ok(rosterTargets.includes("'LEGION_ROSTER'")&&rosterTargets.includes("'label','레기온 명부'"),'the canonical contract extended by ALL scope must include Legion Roster');

for(const token of [
  'V = "2.8"','DB = "475"','EVENT = "471"',
  'kinojo_banner_event_targets_v471','kinojo_banner_event_list_v471',
  'kinojo_banner_event_save_v471','kinojo_banner_event_publish_v471',
  'kinojo_banner_event_all_targets_reconcile_v471'
])assert.ok(edge.includes(token),`Edge DB471 routing contract missing: ${token}`);
assert.ok(edge.indexOf('kinojo_banner_event_all_targets_reconcile_v471')<edge.indexOf('kinojo_banner_manifest_v409'),'manifest must reconcile ALL events before reading the playlist');

console.log('PASS banner durable ALL-page scope and deterministic image navigation contract');
