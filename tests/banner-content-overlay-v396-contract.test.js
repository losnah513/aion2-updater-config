const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260824110551_banner_content_overlay_library_v396.sql'),'utf8');
const orphanMigration=fs.readFileSync(path.join(root,'supabase/migrations/20260824113811_banner_overlay_orphan_protection_v396.sql'),'utf8');
const idempotencyMigration=fs.readFileSync(path.join(root,'supabase/migrations/20260824115430_banner_stage5_idempotency_actions_v397.sql'),'utf8');
const edge=fs.readFileSync(path.join(root,'supabase/functions/kinojo-banner-media/index.ts'),'utf8');

for(const token of [
  'create table if not exists public.kinojo_banner_overlay_assets',
  "asset_kind in ('EMOTICON','STICKER','BADGE')",
  'enable row level security',
  'kinojo_banner_content_overlays_normalize_v396',
  "if v_text_count>3 or v_decor_count>3",
  'add column if not exists content_overlays',
  'add column if not exists composite_object_path',
  'kinojo_banner_overlay_asset_register_v396',
  'kinojo_banner_overlay_asset_list_v396',
  'kinojo_banner_composite_register_v396',
  'kinojo_banner_event_save_v396',
  'kinojo_banner_event_publish_v396',
  "'BANNER_COMPOSITE_REQUIRED'",
  'kinojo_banner_manifest_internal_v396',
  "'contentOverlays','[]'::jsonb",
  "'composite',true",
  'grant execute on function public.kinojo_banner_manifest_v396',
])assert.ok(migration.includes(token),`missing v396 migration token: ${token}`);

for(const token of [
  'V = "2.0"',
  'DB = "400"',
  'EVENT = "400"',
  '"overlay-asset-list"',
  '"overlay-upload-prepare"',
  '"overlay-upload-complete"',
  '"composite-upload-prepare"',
  '"composite-upload-complete"',
  'kinojo_banner_overlay_asset_register_v396',
  'kinojo_banner_composite_register_v396',
  'kinojo_banner_event_save_v400',
  'kinojo_banner_event_publish_v400',
  'kinojo_banner_manifest_v400',
  'publishedMedia: "FLATTENED_COMPOSITE_WHEN_CONTENT_EXISTS"',
])assert.ok(edge.includes(token),`missing v396 Edge token: ${token}`);

assert.ok(migration.includes('revoke all on table public.kinojo_banner_overlay_assets from public, anon, authenticated'));
for(const token of ['kinojo_banner_orphan_candidates_v396','kinojo_banner_overlay_assets overlay_asset','item.composite_object_path=o.name'])assert.ok(orphanMigration.includes(token),`missing orphan protection token: ${token}`);
assert.ok(edge.includes('rpc("kinojo_banner_orphan_candidates_v396"'),'Edge orphan cleanup must protect overlay and composite paths');
assert.equal(edge.includes('SUPABASE_ANON_KEY'),false,'Edge must keep the service-role database boundary');
for(const action of ['overlay-upload-prepare','overlay-upload-complete','composite-upload-prepare','composite-upload-complete'])assert.ok(idempotencyMigration.includes(`'${action}'`),`idempotency allowlist missing ${action}`);
assert.ok(idempotencyMigration.includes('BANNER_IDEMPOTENCY_ACTION_INVALID'),'v397 must preserve explicit action rejection');
assert.ok(edge.includes('BANNER_IDEMPOTENCY_ACTION_INVALID'),'Edge must explain an idempotency action mismatch');
console.log('PASS banner content overlay/composite v396 contract');
