'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260828043859_banner_phase2_post_stabilization_v412.sql');
const edge=read('supabase/functions/kinojo-banner-media/index.ts');
const shared=read('admin/js/admin-shared.js');
const workflow=read('admin/js/admin-banner-event-workflow.js');
const library=read('admin/js/admin-banner-library.js');
const main=read('admin/js/admin-images.js');
const side=read('admin/js/admin-side-banners.js');
const loader=read('admin/js/admin.js');
const desktop=read('admin/index.html');
const mobile=read('m/admin/index.html');
const verify=read('.github/workflows/verify-banner-admin.yml');

const mutationBlock=edge.match(/const MUT = new Set\(\[([\s\S]*?)\]\);/);
assert.ok(mutationBlock,'Edge mutation action set missing');
const mutationActions=[...mutationBlock[1].matchAll(/"([a-z0-9-]+)"/g)].map(match=>match[1]);
assert.ok(mutationActions.length>20,'Edge mutation action extraction is unexpectedly small');

const claimBlock=migration.match(/create or replace function public\.kinojo_banner_idempotency_claim_v402[\s\S]*?if v_action not in \(([\s\S]*?)\) then/);
assert.ok(claimBlock,'DB412 idempotency claim allowlist missing');
const claimedActions=[...claimBlock[1].matchAll(/'([a-z0-9-]+)'/g)].map(match=>match[1]);
for(const action of mutationActions)assert.ok(claimedActions.includes(action),`DB412 claim allowlist missing current Edge mutation: ${action}`);
assert.ok(claimedActions.includes('orphan-cleanup'),'confirmed orphan cleanup must remain idempotent');
assert.equal(new Set(claimedActions).size,claimedActions.length,'DB412 claim allowlist contains duplicate actions');

for(const token of [
  'security definer','set search_path = pg_catalog, public, private',
  'from public, anon, authenticated','to service_role',
  'BANNER_IDEMPOTENCY_ACTION_INVALID','banner-idempotency-v402',
])assert.ok(migration.includes(token),`DB412 security/replay contract missing: ${token}`);
assert.ok(edge.includes('DB = "412"'),'Edge health must advertise DB412');

for(const token of ['function notifyBannerAssetsUpdated(','kinojo:banner-assets-updated','createdAssetIds'])assert.ok(shared.includes(token),`shared asset refresh contract missing: ${token}`);
for(const token of ["A.notifyBannerAssetsUpdated?.(s.assets,'event-workflow-upload'",'새 노출 묶음과 이미지 라이브러리에 바로 추가했습니다.'])assert.ok(workflow.includes(token),`event workflow upload refresh missing: ${token}`);
for(const token of ["detail.source==='image-library'",'S.assets=[...assets];S.loaded=true',"window.addEventListener('kinojo:banner-assets-updated',receiveAssets)"])assert.ok(library.includes(token),`library immediate refresh subscriber missing: ${token}`);
assert.ok(main.includes("A.notifyBannerAssetsUpdated?.(S.assets,'legacy-main-upload'"),'legacy main upload refresh missing');
assert.ok(side.includes("A.notifyBannerAssetsUpdated?.(S.assets,'legacy-side-upload'"),'legacy side upload refresh missing');

for(const source of [loader,desktop,mobile])assert.ok(source.includes('2026082804'),'admin cache generation must be 2026082804');
for(const token of [
  'tests/banner-phase2-post-stabilization-contract.test.js',
  'supabase/migrations/20260828043859_banner_phase2_post_stabilization_v412.sql',
  'node tests/banner-phase2-post-stabilization-contract.test.js',
])assert.ok(verify.includes(token),`Banner Admin CI missing stabilization gate: ${token}`);

console.log('PASS banner phase-2 post-stabilization idempotency and immediate library refresh contract');
