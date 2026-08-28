'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
const migration=read('supabase/migrations/20260824143000_banner_event_manager_v398.sql');
const edge=read('supabase/functions/kinojo-banner-media/index.ts');
const manager=read('admin/js/admin-banner-events.js');
const tabs=read('admin/js/admin-banner-tabs.js');
const bootstrap=read('admin/js/admin-bootstrap.js');
const loader=read('admin/js/admin.js');

for(const token of [
  'drop constraint if exists kinojo_banner_idempotency_action_v388_chk',
  "'overlay-upload-prepare','overlay-upload-complete'",
  "'composite-upload-prepare','composite-upload-complete'",
  'manager_order bigint',
  'kinojo_banner_event_list_v398',
  'kinojo_banner_event_move_v398',
  'kinojo_banner_event_pause_v398',
  'kinojo_banner_event_delete_v398',
  'BANNER_EVENT_DELETE_PAUSE_REQUIRED',
  'BANNER_EVENT_DELETE_CONFIRMATION_MISMATCH',
  "where event_type=v_target.event_type",
  "status='PUBLISHED'",
])assert.ok(migration.toLowerCase().includes(token.toLowerCase()),`missing DB398 contract: ${token}`);

for(const token of [
  'V = "2.6"','DB = "412"','EVENT = "407"',
  'kinojo_banner_event_list_v404','kinojo_banner_event_move_v398',
  'kinojo_banner_event_pause_v398','kinojo_banner_event_delete_v398',
  '"event-move"','"event-pause"','"event-delete"',
])assert.ok(edge.includes(token),`missing Edge398 contract: ${token}`);

for(const token of [
  '이벤트 관리','등록 이벤트 목록','순서를 조정','영구 삭제',
  "api('event-list'","api('event-move'","api('event-pause'","api('event-delete'",
  'expectedName:expected','data-bem-status-filter','data-bem-query','data-bem-move',
  '이전 방식 캠페인','window.prompt','window.confirm',
])assert.ok(manager.includes(token),`missing event manager UI contract: ${token}`);

for(const token of ['data-bem-event-rotation','kinojo-filter-switch bem-global-rotation-switch','등록 이벤트 순환 순서','순차','랜덤',"api('event-rotation'"])
  assert.ok(manager.includes(token),`missing global event rotation UI contract: ${token}`);
assert.equal(manager.includes('data-bem-playback'),false,'event-local playback controls must stay retired');

for(const token of ['data-banner-view="events"','data-banner-event-host',"const order=['main','side']"])assert.ok(tabs.includes(token),`missing contextual event tab contract: ${token}`);
assert.ok(bootstrap.includes("A.loadBannerContext?.(subtab,force===true)"),'event manager must load through the contextual admin router');
assert.ok(loader.includes("'admin-banner-events.js'"),'event manager module missing from loader');
assert.ok(loader.indexOf("'admin-banner-event-workflow.js'")<loader.indexOf("'admin-banner-events.js'"),'event manager must load after workflow');
assert.ok(loader.indexOf("'admin-banner-events.js'")<loader.indexOf("'admin-banner-tabs.js'"),'event manager must load before tabs/bootstrap');

console.log('KINOJO banner event manager DB/Edge/UI v398 contract: PASS');
