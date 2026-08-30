const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260829035808_sanctuary_management_stage6_transition_readiness_v445.sql');
const edge=read('supabase/functions/sanctuary-management/index.ts');
const client=read('sanctuary-management/js/sanctuary-management.js');
const css=read('sanctuary-management/css/sanctuary-management.css');
const features=read('core/kinojo-supabase-features.js');
const harness=read('tests/sanctuary-management-fixed-draft-e2e.html');

for(const token of [
  'sanctuary_management_stage6_evidence_v445',
  'sanctuary_management_rollout_rehearsals_v445',
  'sanctuary_management_transition_approvals_v445',
  'private.kinojo_sm_transition_snapshot_v445',
  'kinojo_sanctuary_management_rollout_state_v445',
  'kinojo_sanctuary_management_rollout_control_v445',
  'kinojo_sanctuary_management_record_evidence_v445',
  'kinojo_sanctuary_management_transition_report_v445',
  'kinojo_sanctuary_management_transition_approve_v445',
  "('CARD_COMPARE','6-2')",
  "('SCHEDULE_COMPARE','6-3')",
  "('OPERATION_SCENARIO','6-4')",
  "('RESILIENCE_CONCURRENCY','6-5')",
  "('ROLLBACK_TARGETS','6-6')",
  "'comparisonClass','EXPECTED_PARALLEL_SCOPE'",
  "'weekStartsOn','WEDNESDAY'",
  "'executionPolicy','이 목록은 승인 대상 산출물이며 Stage 6에서는 어떤 초기화·해산·동기화 중지도 실행하지 않습니다.'",
  "btrim(coalesce(p_confirmation,''))<>'전환 범위 승인'",
])assert.ok(migration.includes(token),`DB445 Stage 6 transition contract missing ${token}`);

for(const signature of [
  'public.kinojo_sanctuary_management_rollout_state_v445()',
  'public.kinojo_sanctuary_management_rollout_control_v445(text,text,text)',
  'public.kinojo_sanctuary_management_record_evidence_v445(text,text,text,jsonb)',
  'public.kinojo_sanctuary_management_transition_report_v445(text,date)',
  'public.kinojo_sanctuary_management_transition_approve_v445(text,date,text,jsonb,text)',
]){
  assert.ok(migration.includes(`revoke all on function ${signature} from public,anon,authenticated`),`${signature} browser ACL is not closed`);
  assert.ok(migration.includes(`grant execute on function ${signature} to service_role`),`${signature} service ACL is missing`);
}

const approvalBody=migration.match(/create or replace function public\.kinojo_sanctuary_management_transition_approve_v445[\s\S]*?\n\$\$;/)?.[0]||'';
assert.ok(approvalBody.includes("insert into private.sanctuary_management_transition_approvals_v445"),'approval record insert is missing');
assert.doesNotMatch(approvalBody,/delete\s+from|update\s+public\.sanctuary_|update\s+private\.sanctuary_management_(teams|slots)/i,'Stage 6 approval must not execute transition mutations');
assert.doesNotMatch(migration,/kws_[A-Za-z0-9_-]{20,}/,'Stage 6 migration must never contain a session credential');

for(const token of [
  'const API_VERSION="1.9"','const DATABASE_CONTRACT="449"',
  'kinojo_sanctuary_management_rollout_state_v446',
  'kinojo_sanctuary_management_bootstrap_v449',
])assert.ok(edge.includes(token),`Stage 7 Edge transition handoff missing ${token}`);
assert.doesNotMatch(edge,/"transition-(report|approve)"/,'Stage 6 approval routes must retire after Stage 7 cutover');

for(const token of [
  'getSanctuaryManagementTransitionReport','approveSanctuaryManagementTransition',
  "action:'transition-report'","action:'transition-approve'",
])assert.ok(features.includes(token),`WEB Server adapter missing ${token}`);

for(const token of [
  'const API_VERSION=1.9','const SCHEMA_VERSION=449','transitionReview',
  'openTransitionReview','transitionReportMarkup','bindTransitionApproval',
  '6-2 성역 카드 비교','6-3 일정 결과 비교','6-4·6-5 운영·장애 검증','6-6 롤백·전환 대상',
  '전환 범위 승인','이 승인은 실행 허가를 기록할 뿐 지금 데이터를 변경하지 않습니다.',
  'checkedCount=checks.filter','5/5 범위와 확인 문구가 일치합니다.','compositionend','aria-live="polite"',
])assert.ok(client.includes(token),`Stage 6 transition UI missing ${token}`);

for(const token of [
  '.sanctuary-management-operation-dialog.is-transition',
  '.sanctuary-management-transition-targets',
  'overflow-x:hidden','scrollbar-width:none','overflow:clip','flex:1 1 auto',
  '@media(max-width:699px)','@media(max-width:430px)',
  '.sanctuary-management-transition-confirm-list input:checked+span::before',
  "content:'✓'",'background:#315cca',
])assert.ok(css.includes(token),`Stage 6 transition responsive CSS missing ${token}`);

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  for(const token of [
    'id="sanctuaryManagementTransitionReview"',
    'sanctuary-management.css?cache=2026082903',
    'kinojo-supabase-features.js?cache=2026083004',
    'sanctuary-management.js?cache=2026083004',
  ])assert.ok(html.includes(token),`${page}: missing ${token}`);
}

assert.ok(harness.includes("query.get('transitionDelay')"),'transition harness must support bounded slow-network QA');
assert.ok(harness.includes('dataset.transitionReportRequests'),'transition harness must expose report request count for duplicate-click QA');

console.log('KINOJO sanctuary management Stage 6 transition readiness v445 contract: PASS');
