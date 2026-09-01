const fs=require('node:fs');
const assert=require('node:assert/strict');

const migration=fs.readFileSync('supabase/migrations/20260830193000_sanctuary_management_balance_lock_v451.sql','utf8');
const edge=fs.readFileSync('supabase/functions/sanctuary-management/index.ts','utf8');
const core=fs.readFileSync('core/kinojo-supabase-features.js','utf8');
const main=fs.readFileSync('sanctuary-management/js/sanctuary-management.js','utf8');
const draft=fs.readFileSync('sanctuary-management/js/sanctuary-management-draft.js','utf8');
const css=fs.readFileSync('sanctuary-management/css/sanctuary-management-draft.css','utf8');
const workflow=fs.readFileSync('.github/workflows/verify-kinojo-pages.yml','utf8');

for(const token of [
  'placement_locked boolean not null default false',
  'sanctuary_management_balance_proposals_v451',
  'enable row level security',
  'kinojo_sm_balance_candidate_hash_v451',
  'kinojo_sm_composition_hash_v451',
  "clock_timestamp() + interval '10 minutes'",
  'REQUESTED_FORCE_POWER_DESC_STABLE_SLOT',
  'NO_ELIGIBLE_UNLOCKED_SLOT',
  'placement_locked',
  'BALANCE_APPLY',
  'PLACEMENT_LOCK_SAVE',
  'consumed_at = clock_timestamp()',
  "set search_path = ''",
  'kinojo_sanctuary_management_command_v451'
])assert.ok(migration.includes(token),`v451 migration contract missing: ${token}`);

assert.ok(migration.includes("status = 'APPLIED', applied_slot_id = v_slot_id"),'proposal save must atomically apply support items');
assert.ok(migration.includes("raise exception '지원 후보 상태가 바뀌었습니다."),'stale candidate state must fail closed');
assert.ok(migration.includes("update private.sanctuary_management_slots_v412 set placement_locked = false"),'save must release old locks inside the same transaction before the v450 composer rewrite');
assert.ok(!migration.includes('grant execute on function public.kinojo_sanctuary_management_balance_proposal_v451')||migration.includes('to service_role'),'proposal RPC must only be granted to service_role');

for(const token of ['const API_VERSION="2.4"','const DATABASE_CONTRACT="458"','"balance-proposal"','opaqueToken("smbp_")','kinojo_sanctuary_management_balance_proposal_v454','kinojo_sanctuary_management_command_v454'])assert.ok(edge.includes(token),`Edge v457 contract missing: ${token}`);
for(const token of ['getSanctuaryManagementBalanceProposal','action:\'balance-proposal\'','lockOverrides:locks'])assert.ok(core.includes(token),`core balance adapter missing: ${token}`);
for(const token of ['const API_VERSION=2.4','const SCHEMA_VERSION=458','placementLocked','balanceProposalToken','balanceProposal,'])assert.ok(main.includes(token),`browser v457 bridge missing: ${token}`);
for(const token of ['data-draft-toggle-lock','data-balance-open','data-balance-apply','compositionSignature','balanceAppliedSignature','균형 배치 제안을 로컬 편성안에 적용'])assert.ok(draft.includes(token),`composer part 3 behavior missing: ${token}`);
for(const token of ['sanctuary-management-balance-panel','sanctuary-management-slot-lock','is-placement-locked','overflow-x:hidden','@media(max-width:699px)'])assert.ok(css.includes(token),`part 3 responsive layout missing: ${token}`);
assert.ok(workflow.includes('node tests/sanctuary-management-stage8-part3-contract.test.js'),'Stage 8 part 3 contract is not wired into CI');

console.log('Sanctuary management Stage 8 part 3 contract: PASS');
