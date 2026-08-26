'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260826020948_banner_asset_titles_tags_v403.sql');
const edge=read('supabase/functions/kinojo-banner-media/index.ts');
const workflow=read('admin/js/admin-banner-event-workflow.js');

for(const token of [
  'add column if not exists title text',
  'add column if not exists tags text[] not null default',
  'metadata_migration_status',
  "'AUTO_SPLIT'",
  "'PRESERVED'",
  "'REVIEW_REQUIRED_DUPLICATE'",
  'kinojo_banner_asset_metadata_compat_v403_trg',
  'before insert or update of display_name,title,tags',
  'kinojo_banner_assets_title_key_v403_uidx',
  'create unique index if not exists',
  'kinojo_banner_assets_tags_v403_gin',
  'jsonb_array_length(p_tags) <= 5',
  'char_length(n.tag) not between 1 and 20',
  'count(distinct pg_catalog.lower(e.value))',
  'kinojo_banner_asset_title_available_v403',
  'kinojo_banner_asset_list_v403',
  'kinojo_banner_asset_update_v403',
  'kinojo_banner_asset_register_storage_v403',
  "when unique_violation then",
  "'BANNER_ASSET_TITLE_DUPLICATE'",
  'revoke all on function public.kinojo_banner_asset_title_available_v403',
  'grant execute on function public.kinojo_banner_asset_title_available_v403',
  'alter table public.kinojo_banner_assets enable row level security',
  'BANNER_ASSET_TITLE_MIGRATION_DUPLICATE'
])assert.ok(migration.includes(token),`v403 migration contract missing: ${token}`);

assert.match(migration,/create unique index[\s\S]+lower\(private\.kinojo_banner_title_normalize_v403\(title\)\)/,'normalized title uniqueness must be enforced by the database');
assert.match(migration,/when unique_violation then[\s\S]+BANNER_ASSET_TITLE_DUPLICATE/,'concurrent title race must return a stable duplicate code');
assert.match(migration,/where a\.title is null[\s\S]+metadata_migration_status=case/,'legacy displayName migration must only fill missing canonical metadata');

for(const token of [
  'V = "2.5"',
  'DB = "409"',
  'UPLOAD = "403"',
  '"asset-title-check"',
  'kinojo_banner_asset_title_available_v403',
  'kinojo_banner_asset_list_v403',
  'kinojo_banner_asset_update_v406',
  'kinojo_banner_asset_register_storage_v403',
  'p_title: title',
  'p_tags: tagResult.tags',
  'BANNER_ASSET_TITLE_INVALID',
  'BANNER_ASSET_TITLE_DUPLICATE',
  'BANNER_ASSET_TAGS_INVALID',
  'candidateDeleted: duplicateTitle'
])assert.ok(edge.includes(token),`v403 Edge contract missing: ${token}`);

for(const token of [
  '저장 이미지 제목',
  'data-bew-file-title',
  "api(s,'asset-title-check'",
  'force:true',
  'data-bew-tag-input',
  'data-bew-tag-remove',
  'data-bew-tag-count',
  "event.key==='Backspace'",
  "event.key==='Enter'||event.key===','",
  'compositionstart',
  'clipboardData?.getData',
  'tags:s.uploadTags',
  'title:normalizeTitle(item.title)',
  "filter:'NONE'"
])assert.ok(workflow.includes(token),`v403 admin metadata UI missing: ${token}`);

assert.ok(!workflow.includes('data-bew-upload-name'),'retired bundle-wide upload name field remains');
assert.ok(!workflow.includes('data-bew-upload-tags'),'retired free-text hashtag field remains');

console.log('PASS banner asset metadata v403 contract');
