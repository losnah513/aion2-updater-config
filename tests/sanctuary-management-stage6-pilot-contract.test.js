const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260828111536_sanctuary_management_stage6_pilot_rollout_v439.sql');
const edge=read('supabase/functions/sanctuary-management/index.ts');
const client=read('sanctuary-management/js/sanctuary-management.js');
const support=read('sanctuary-management/js/sanctuary-management-support.js');
const common=read('ui/kinojo-common-ui.js');

for(const token of [
  'write_rollout_mode','sanctuary_management_pilot_members_v439',
  "member.role in ('MASTER', 'ADMIN')",'INITIAL_MASTER_AND_CODEX_ADMIN_PILOT',
  'private.kinojo_sm_rollout_v439','private.kinojo_sm_assert_pilot_write_v439',
  'kinojo_sanctuary_management_write_access_v439','kinojo_sanctuary_management_bootstrap_v439',
  'kinojo_sanctuary_management_month_v439','kinojo_sanctuary_management_notification_summary_v439',
  'kinojo_sanctuary_management_archive_preview_v439','kinojo_sanctuary_management_command_v439',
  'kinojo_sanctuary_management_lease_v439','kinojo_sanctuary_management_official_materialize_v439',
  "'effectiveWriteEnabled', v_effective_write","'PILOT_NOT_APPROVED'",
  'enable row level security','secrets never belong in this table',
])assert.ok(migration.includes(token),`DB439 pilot rollout missing ${token}`);

for(const signature of [
  'public.kinojo_sanctuary_management_write_access_v439(text,text)',
  'public.kinojo_sanctuary_management_bootstrap_v439(text)',
  'public.kinojo_sanctuary_management_month_v439(text,date)',
  'public.kinojo_sanctuary_management_notification_summary_v439(text)',
  'public.kinojo_sanctuary_management_archive_preview_v439(text,bigint)',
  'public.kinojo_sanctuary_management_command_v439(text,text,text,jsonb,bigint)',
  'public.kinojo_sanctuary_management_lease_v439(text,bigint,text,text)',
  'public.kinojo_sanctuary_management_official_materialize_v439(text,bigint,uuid,text,bigint,text)',
]){
  assert.ok(migration.includes(`revoke all on function ${signature} from public, anon, authenticated`),`${signature} browser ACL is not closed`);
  assert.ok(migration.includes(`grant execute on function ${signature} to service_role`),`${signature} service ACL is missing`);
}
assert.doesNotMatch(migration,/kws_[A-Za-z0-9_-]{20,}/,'pilot migration must never contain a session credential');

for(const token of [
  'const API_VERSION="1.8"','const DATABASE_CONTRACT="446"','WRITE_ACTIONS',
  'kinojo_sanctuary_management_write_access_v446','kinojo_sanctuary_management_bootstrap_v446',
  'kinojo_sanctuary_management_command_v446','kinojo_sanctuary_management_lease_v446',
  'kinojo_sanctuary_management_official_materialize_v446','SANCTUARY_WRITE_DISABLED',
  'kinojo_sanctuary_management_rollout_state_v446',
])assert.ok(edge.includes(token),`Stage 7 Edge write gate handoff missing ${token}`);

for(const token of [
  'const API_VERSION=1.8','const SCHEMA_VERSION=446','sourceRollout',
  "['CLOSED','PILOT','OPEN']",'renderWriteState','시험 운영','읽기 전용',
  '시험 사용자만 쓰기','bootstrapData?.writeEnabled&&team.canEdit',
  "params.get('support')==='1'&&bootstrapData.writeEnabled",
])assert.ok(client.includes(token),`Stage 6 client rollout state missing ${token}`);
assert.ok(support.includes("bridge()?.snapshot?.()?.writeEnabled!==true"),'support modal must reject read-only bootstrap state');
assert.ok(common.includes('kinojo_sanctuary_recruitment_seen_v439'),'Stage 6 notification session namespace missing');

for(const page of ['sanctuary-management/index.html','m/sanctuary-management/index.html']){
  const html=read(page);
  for(const token of [
    'id="sanctuaryManagementWriteMeta"','sanctuary-management.js?cache=2026082903',
    'sanctuary-management-support.js?cache=2026082814','kinojo-common-ui.js?cache=2026082901',
  ])assert.ok(html.includes(token),`${page}: missing ${token}`);
}

console.log('KINOJO sanctuary management Stage 6-1 pilot rollout v439 contract: PASS');
