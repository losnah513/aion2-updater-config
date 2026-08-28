'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
const tabs=read('admin/js/admin-banner-tabs.js');
const events=read('admin/js/admin-banner-events.js');
const pool=read('admin/js/admin-banner-auto-pool.js');
const library=read('admin/js/admin-banner-library.js');
const bootstrap=read('admin/js/admin-bootstrap.js');
const workflow=read('admin/js/admin-banner-event-workflow.js');
const migration=read('supabase/migrations/20260826154800_banner_random_event_targets_v411.sql');
const edge=read('supabase/functions/kinojo-banner-media/index.ts');

for(const token of [
  'data-admin-subtab="main"','data-admin-subtab="side"',
  'data-banner-view="create"','data-banner-view="events"','data-banner-view="library"',
  'openBannerEventHub','openBannerAuthoring',
  'loadBannerContext','setBannerEventManagementContext','setBannerAssetLibraryContext','setBannerAutoPoolContext',
])assert.ok(tabs.includes(token),`missing two-level banner workspace token: ${token}`);
assert.equal(tabs.includes('data-admin-subtab="events"'),false,'event management must be secondary, not a primary image tab');
assert.equal(tabs.includes('data-admin-subtab="library"'),false,'image library must be secondary, not a primary image tab');
assert.ok(bootstrap.includes("A.loadBannerContext?.(subtab,force===true)"),'router must load the selected main/side context');
assert.ok(workflow.includes("A.openBannerEventHub?.(s.kind,{force:true})"),'published authoring must return to the contextual event hub');

for(const token of [
  'grid-template-columns:minmax(270px,3fr) minmax(560px,7fr)',
  'data-banner-auto-pool','등록 이벤트 목록','랜덤 이벤트',
  'bem-body-filter','표시할 이벤트',
  'data-bem-slot="ALL"','data-bem-slot="LEFT"','data-bem-slot="RIGHT"',
  "S.context!=='side'",'eventSlots(event).includes(S.slotFilter)',
  'contextEvents().length}개를 불러왔습니다.',
  '등록 이벤트 순환 순서',
])assert.ok(events.includes(token),`missing contextual event hub token: ${token}`);
assert.equal(events.includes('data-bem-create'),false,'event management must not contain a duplicate authoring launcher');

for(const token of [
  '같은 페이지·위치에 게시 중인 등록 이벤트가 있으면 대기',
  '등록 이벤트 → 랜덤 이벤트 → 기본 배너','data-bap-all-pages',
  "['BOTH','전체']","['LEFT','왼쪽']","['RIGHT','오른쪽']",'data-bap-slot-choice',
  'grid-template-columns:repeat(4,minmax(0,1fr))',
  '<button class="bap-asset','aria-pressed="${chosen}"',
  'bap-strip-controls','maxPerCharacter:99',"startsAtKst:''","endsAtKst:''",
  'contextPools().length}개 · 사용 가능 이미지 ${visibleAssets().length}개를 불러왔습니다.',
])assert.ok(pool.includes(token),`missing compact random-event editor token: ${token}`);
for(const retired of ['이벤트 없는 자동 순환 풀','캐릭터당 최대 이미지','시작 일시 · 선택','종료 일시 · 선택','>${chosen?\'빼기\':\'추가\'}<'])assert.equal(pool.includes(retired),false,`retired random-event UI remains: ${retired}`);

for(const token of ['contextAssets()','contextTags()','setBannerAssetLibraryContext','data-bal-title','contextFormat()'])assert.ok(library.includes(token),`missing contextual library token: ${token}`);

for(const token of [
  "'apiVersion','411'","'contract','banner-random-event-save-v411'",
  'v_max_per_character integer:=99','v_starts timestamptz:=null','v_ends timestamptz:=null',
  "s.slot_code not in ('LEFT','RIGHT')",
])assert.ok(migration.includes(token),`missing DB411 random-event contract: ${token}`);
assert.equal(migration.includes("'HOF'=any(v_pages) and 'RIGHT'=any(v_slots)"),false,'HOF + RIGHT must be accepted; the manifest naturally omits unsupported HOF RIGHT');
assert.ok(edge.includes('V = "2.6"')&&edge.includes('DB = "412"'),'Edge health contract must advertise the DB412 stabilization');

console.log('PASS banner stage-7 contextual event and random-event workspace contract');
