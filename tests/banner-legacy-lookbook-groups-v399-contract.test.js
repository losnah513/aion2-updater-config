'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const migration=fs.readFileSync(path.join(
  root,'supabase/migrations/20260824232500_attach_legacy_lookbooks_v399.sql'
),'utf8').replace(/\r\n/g,'\n');

for(const token of [
  "'푸석사과 룩북'::text",
  "'꾸힉 룩북'::text",
  "'SIDE','SYNC'",
  "event_role='SHARED'",
  'event_group_id=v_group_id',
  'v_campaign_count<>6',
  'BANNER_LEGACY_LOOKBOOK_CAMPAIGN_COUNT_MISMATCH',
  'BANNER_LEGACY_LOOKBOOK_CAMPAIGN_SHAPE_MISMATCH',
  'BANNER_LEGACY_LOOKBOOK_ITEM_COUNT_MISMATCH',
  'BANNER_LEGACY_LOOKBOOK_ALREADY_LINKED_ELSEWHERE',
  'BANNER_LEGACY_LOOKBOOK_ATTACH_INCOMPLETE',
])assert.ok(migration.includes(token),`missing DB399 contract: ${token}`);

for(const forbidden of [
  "set status=",
  "set playback_mode=",
  "set priority=",
  "set slot_codes=",
  "delete from public.kinojo_banner_campaign",
  "delete from public.kinojo_banner_campaign_items",
])assert.ok(!migration.toLowerCase().includes(forbidden.toLowerCase()),`DB399 must preserve runtime data: ${forbidden}`);

assert.equal((migration.match(/insert into private\.kinojo_banner_event_groups_v391/g)||[]).length,1);
assert.equal((migration.match(/update public\.kinojo_banner_campaigns/g)||[]).length,1);
console.log('KINOJO legacy lookbook event attachment DB399 contract: PASS');
