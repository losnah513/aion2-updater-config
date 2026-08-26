const fs=require('fs');
const path=require('path');
const assert=require('assert');

const root=path.resolve(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260824103940_banner_event_exposure_frequency_v395.sql'),'utf8').replace(/\r\n/g,'\n');
const edge=fs.readFileSync(path.join(root,'supabase/functions/kinojo-banner-media/index.ts'),'utf8');

for(const token of [
  'kinojo_banner_manifest_internal_v395',
  'kinojo_banner_manifest_internal_v394',
  'c.event_group_id is not null and c.priority=150',
  'when v_scale=2 and c.priority=150 then 3',
  'when v_scale=2 and c.priority=200 then 4',
  'when c.priority=200 then 2',
  "'exposureFrequencyMode','BASE_X1_5_X2'",
  "'apiVersion','395'",
  'kinojo_banner_manifest_v395',
  'Legacy campaigns remain BASE',
])assert.ok(migration.includes(token),`frequency migration token missing: ${token}`);

assert.ok(edge.includes('V = "2.1"'),'Edge API version must be 2.1');
assert.ok(edge.includes('DB = "403"'),'Edge DB contract must be 403');
assert.ok(edge.includes('rpc("kinojo_banner_manifest_v402"'),'Edge must read the global-event-rotation weighted content manifest');
assert.ok(edge.includes('"BASE_X1_5_X2" ? "BASE_X1_5_X2" : "BASE"'),'public frequency contract normalization missing');

console.log('PASS banner event exposure-frequency v395 contract');
