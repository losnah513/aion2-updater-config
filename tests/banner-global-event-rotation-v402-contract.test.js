'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
const previous=read('supabase/migrations/20260825124452_banner_event_playback_mode_v400.sql');
const migration=read('supabase/migrations/20260825143345_banner_global_event_rotation_v402.sql');
const edge=read('supabase/functions/kinojo-banner-media/index.ts');
const manager=read('admin/js/admin-banner-events.js');
const components=read('ui/kinojo-components.css');

for(const token of [
  'create table if not exists private.kinojo_banner_event_rotation_v402',
  "rotation_mode in ('ORDERED','RANDOM_CYCLE')",
  "values (true,'ORDERED')",
  "set playback_mode='ORDERED'",
  "playback_mode in ('WEIGHTED','ORDERED')",
  "playback_mode='ORDERED'",
  'kinojo_banner_event_json_v402',
  'kinojo_banner_event_list_v402',
  'kinojo_banner_event_save_v402',
  'kinojo_banner_event_publish_v402',
  'kinojo_banner_event_rotation_set_v402',
  'BANNER_EVENT_ROTATION_MODE_INVALID',
  "'eventRotationMode',coalesce(v_rotation_mode,'ORDERED')",
  "'eventRotationScope','FORMAL_EVENT_GROUPS_ONLY'",
  'kinojo_banner_manifest_internal_v402',
  's.exposure_ticket,o.event_rank,s.sort_order',
  "where s.event_group_id is null",
  'join formal_slots slots using(formal_position)',
  "when v_rotation_mode='RANDOM_CYCLE' then 'GLOBAL_EVENT_RANDOM_CYCLE'",
  'kinojo_banner_manifest_v402',
  'kinojo_banner_idempotency_claim_v402',
  "'event-rotation'",
  'revoke execute on function public.kinojo_banner_event_playback_v400',
])assert.ok(migration.includes(token),`missing DB402 global rotation contract: ${token}`);

for(const token of [
  'DB = "403"','EVENT = "402"','"event-rotation"',
  'kinojo_banner_event_list_v402','kinojo_banner_event_save_v402',
  'kinojo_banner_event_publish_v402','kinojo_banner_event_rotation_set_v402',
  'kinojo_banner_manifest_v402','kinojo_banner_idempotency_claim_v402',
  'BANNER_EVENT_ROTATION_MODE_INVALID','BANNER_EVENT_PLAYBACK_RETIRED',
  'eventRotationAuthority: "SERVER_GLOBAL_FORMAL_EVENT_GROUPS"',
])assert.ok(edge.includes(token),`missing Edge402 global rotation contract: ${token}`);

for(const token of [
  'data-bem-event-rotation','kinojo-filter-switch bem-global-rotation-switch',
  '전체 이벤트 노출 방식','<span>순차</span>','<span>랜덤 순환</span>',
  "api('event-rotation'", "input.checked?'RANDOM_CYCLE':'ORDERED'",
  "result.eventRotationMode==='RANDOM_CYCLE'",
])assert.ok(manager.includes(token),`missing global event rotation UI: ${token}`);

for(const token of [
  '.kinojo-filter-switch{','.kinojo-filter-switch-track{',
  '.kinojo-filter-switch-knob{','input:checked + .kinojo-filter-switch-track',
])assert.ok(components.includes(token),`shared switch rule missing: ${token}`);

assert.ok(previous.includes("source.playback_mode='RANDOM'"),'DB400 history must retain evidence of the retired event-local shuffle');
assert.equal(migration.includes('random()'),false,'stable manifests must not call random()');
assert.equal(edge.includes('rpc("kinojo_banner_event_playback_v400"'),false,'Edge must not mutate an event-local playback mode');
assert.equal(manager.includes('data-bem-playback'),false,'event cards must not keep a playback switch');
assert.equal((manager.match(/data-bem-event-rotation/g)||[]).length>=3,true,'one global switch must have template, render and change bindings');
assert.ok(migration.indexOf('s.exposure_ticket,o.event_rank,s.sort_order')<migration.indexOf('formal_slots as'),'formal event order must wrap the preserved item sort order');
console.log('KINOJO global formal-event rotation DB/Edge/UI v402 contract: PASS');
