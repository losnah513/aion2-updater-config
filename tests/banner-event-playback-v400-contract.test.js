'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
const migration=read('supabase/migrations/20260825124452_banner_event_playback_mode_v400.sql');
const edge=read('supabase/functions/kinojo-banner-media/index.ts');
const manager=read('admin/js/admin-banner-events.js');
const components=read('ui/kinojo-components.css');

for(const token of [
  "playback_mode in ('WEIGHTED','ORDERED','RANDOM')",
  "playback_mode in ('ORDERED','RANDOM')",
  'kinojo_banner_event_json_v400',
  'kinojo_banner_event_list_v400',
  'kinojo_banner_event_save_v400',
  'kinojo_banner_event_publish_v400',
  'kinojo_banner_event_playback_v400',
  'BANNER_EVENT_PLAYBACK_MODE_INVALID',
  "'event-playback'",
  'kinojo_banner_manifest_internal_v400',
  "source.playback_mode='RANDOM'",
  'floor(extract(epoch from v_now)/300.0)',
  "'playbackOrderMode','EVENT_ORDERED_RANDOM'",
  'kinojo_banner_manifest_v400',
])assert.ok(migration.includes(token),`missing DB400 playback contract: ${token}`);

for(const token of [
  'DB = "400"','EVENT = "400"','"event-playback"',
  'kinojo_banner_event_list_v400','kinojo_banner_event_save_v400',
  'kinojo_banner_event_publish_v400','kinojo_banner_event_playback_v400',
  'kinojo_banner_manifest_v400','BANNER_EVENT_PLAYBACK_MODE_INVALID',
])assert.ok(edge.includes(token),`missing Edge400 playback contract: ${token}`);

for(const token of [
  'data-bem-playback','kinojo-filter-switch bem-playback-switch',
  '<span>순차</span>','<span>랜덤</span>',"api('event-playback'",
  "input.checked?'RANDOM':'ORDERED'",
])assert.ok(manager.includes(token),`missing event manager playback UI: ${token}`);

for(const token of [
  '.kinojo-filter-switch{','.kinojo-filter-switch-track{',
  '.kinojo-filter-switch-knob{','input:checked + .kinojo-filter-switch-track',
])assert.ok(components.includes(token),`shared switch rule missing: ${token}`);

assert.equal(migration.includes('random()'),false,'stable manifests must not call random()');
assert.ok(migration.indexOf('source.campaign_id')<migration.indexOf("source.playback_mode='RANDOM'"),'randomization must stay inside each campaign');
console.log('KINOJO banner event playback DB/Edge/UI v400 contract: PASS');
