const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('supabase/migrations/20260824082604_banner_event_text_overlay_v394.sql');
const edge = read('supabase/functions/kinojo-banner-media/index.ts');
const config = read('supabase/config.toml');

for (const token of [
  'alter table public.kinojo_banner_campaign_items',
  'add column if not exists text_overlay jsonb not null',
  "'verticalPosition',v_position",
  "'fontFamily',v_font",
  "'fontSizePx',v_font_size",
  "'textColor',v_text_color",
  "'backgroundColor',v_background_color",
  "'backgroundOpacity',v_background_opacity",
  "'heightPercent',v_height_percent",
  "'widthMode','FULL'",
  'kinojo_banner_event_list_v394',
  'kinojo_banner_event_save_v394',
  'kinojo_banner_event_publish_v394',
  'kinojo_banner_manifest_v394',
  "'exposureMode','ALL_ACTIVE'",
  "c.status='PUBLISHED'",
  'and i.is_enabled',
  'order by\n      c.priority desc',
  'drop constraint if exists kinojo_banner_assets_ratio_v384_chk',
  "'fitMode','COVER'",
]) assert.ok(migration.includes(token), `missing migration contract: ${token}`);

assert.equal(
  migration.includes('alter table public.kinojo_banner_campaigns\n  add column if not exists text_overlay'),
  false,
  'text overlays must be stored per image item, not per campaign',
);

for (const token of [
  'V = "1.7"',
  'EVENT = "394"',
  'UPLOAD = "394"',
  'kinojo_banner_asset_register_storage_v394',
  'kinojo_banner_event_list_v394',
  'kinojo_banner_event_save_v394',
  'kinojo_banner_event_publish_v394',
  'kinojo_banner_manifest_v394',
  'eventWorkflowContract: EVENT',
  'uploadContract: UPLOAD',
  'exposureMode: "ALL_ACTIVE_PUBLISHED_ITEMS"',
  'inactiveItemsExcluded: true',
  'cropWarning: !aspectMatchesTarget',
  'textOverlay: publicOverlay(x.textOverlay)',
  '"event-list",',
  '"event-save",',
  '"event-publish",',
]) assert.ok(edge.includes(token), `missing Edge contract: ${token}`);

assert.ok(config.includes('[functions.kinojo-banner-media]'));
assert.ok(config.includes('verify_jwt = false'));
assert.ok(edge.includes('ADMIN_KWS_MASTER_SESSION_PUBLIC_MANIFEST_ANONYMOUS'));

console.log('banner event stage 1 contract: ok');
