const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260908105603_sanctuary_external_guest_family_v480.sql');
const edge=read('supabase/functions/sanctuary-management/index.ts');
const feature=read('core/kinojo-supabase-features.js');
const client=read('sanctuary-management/js/sanctuary-management.js');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');
const css=read('sanctuary-management/css/sanctuary-management-draft.css');
const workflow=read('.github/workflows/verify-kinojo-pages.yml');

for(const token of [
  'sanctuary_character_registration_events_v480',
  "family_relation text not null check (family_relation in ('MAIN','ALT'))",
  "membership_relation text not null check (membership_relation in ('MAIN','ALT','GUEST'))",
  "jsonb_build_array('GUEST','ALT')",
  'p_main_candidate_id uuid default null',
  'p_list_sync_enabled boolean default true',
  'kinojo_sm_materialize_candidate_v480',
  'roster_family_overrides_v477',
  "when v_target_owner_member_id is null then 'GUEST'",
  "when v_family_relation='ALT' then 'ALT'",
  'kinojo_sanctuary_list_sync_prepare_v480',
  'kinojo_sanctuary_list_readback_finalize_v480',
  'kinojo_sanctuary_list_sync_result_v480',
  'kinojo_sanctuary_management_list_retry_v480',
  'kinojo_sanctuary_guest_family_audit_v480',
  'enable row level security',
])assert.ok(migration.includes(token),`DB480 contract missing ${token}`);

assert.equal(migration.includes("update private.sanctuary_character_owners_v412 set owner_member_id"),false,'DB480 install must not bulk rewrite existing ownership');
assert.ok(migration.includes("character_relation=v_family_relation"),'existing placements must be corrected only for the explicitly registered character');

for(const token of [
  'const API_VERSION="2.5"','const DATABASE_CONTRACT="480"',
  '"character-list-retry"','kinojo_sanctuary_management_character_search_v480',
  'kinojo_sanctuary_management_official_record_v480',
  'kinojo_sanctuary_management_official_materialize_v480',
  'mainCandidateId','listSyncEnabled','syncRegistrationList',
])assert.ok(edge.includes(token),`Sanctuary Edge v480 missing ${token}`);

// Shared lookup-list-sync implementation and writer tests are owned by the
// character-refresh integration. This suite owns the Sanctuary handoff only.
assert.ok(edge.includes('syncSanctuary'),'shared List writer handoff missing');

for(const token of [
  'mainCandidateId=null,listSyncEnabled=true',
  "action:'character-list-retry'",
  'retrySanctuaryManagementCharacterList',
])assert.ok(feature.includes(token),`Feature bridge v480 missing ${token}`);

for(const token of [
  'const API_VERSION=2.5','const SCHEMA_VERSION=480',
  'familyRelation','membershipRelation','retryCharacterList',
])assert.ok(client.includes(token),`Browser adapter v480 missing ${token}`);

for(const token of [
  "listSyncEnabled:true","data-list-sync=\"Y\"","data-list-sync=\"N\"",
  '게스트로 추가','본캐 찾기','의 부캐로 추가',
  '공식 본캐 후보 확인 완료 · 추가할 때 함께 등록',
  '아이템레벨 확인 필요','List 반영 재시도',
  'state.mainLookup?.character||state.mainLookup?.candidate',
])assert.ok(draft.includes(token),`Stage 13 relation UI missing ${token}`);

assert.equal(draft.includes('본캐로 먼저 등록'),false,'main and alt must be materialized atomically');
assert.ok(css.includes('.sanctuary-management-list-sync'),'List Y/N control layout missing');
assert.ok(css.includes('.sanctuary-management-register-blocker'),'one-line eligibility blocker missing');
assert.ok(workflow.includes('node tests/sanctuary-management-stage13-external-family-contract.test.js'),'Stage 13 contract test is not wired into CI');

console.log('KINOJO Sanctuary Stage 13 external family/List contract: PASS');
