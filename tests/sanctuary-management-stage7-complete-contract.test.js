const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260829061610_sanctuary_management_stage7_final_cutover_v446.sql');
const sanctuary4Migration=read('supabase/migrations/20260829071000_sanctuary4_official_name.sql');
const edge=read('supabase/functions/sanctuary-management/index.ts');
const client=read('sanctuary-management/js/sanctuary-management.js');
const features=read('core/kinojo-supabase-features.js');
const router=read('core/kinojo-supabase-client.js');
const adminBootstrap=read('admin/js/admin-bootstrap.js');
const adminSystem=read('admin/js/admin-system.js');

for(const token of [
  'sanctuary_management_stage7_runs_v446','sanctuary_management_stage7_backup_rows_v446',
  'kinojo_sanctuary_management_stage7_control_v446','kinojo_sanctuary_management_stage7_restore_v446',
  'kinojo_sanctuary_management_stage7_complete_v446','BACKUP','LOCK','EXECUTE','STOP_SYNC','OPEN',
  "pg_advisory_xact_lock(hashtextextended('KINOJO_SANCTUARY_STAGE7',0))",
  "write_rollout_mode='CLOSED'","write_rollout_mode='OPEN'",
  "status='ARCHIVED'","status='STOPPED'","status='canceled'",
  "perform cron.alter_job(job_id=>v_cron_job_id,active=>false)",
  "'stage7Stopped',true",'jsonb_populate_recordset',
  'enable row level security','No credential, passkey, or browser session is stored',
])assert.ok(migration.includes(token),`DB446 final cutover missing ${token}`);

for(const signature of [
  'public.kinojo_sanctuary_management_stage7_control_v446(text,text,text)',
  'public.kinojo_sanctuary_management_stage7_restore_v446(bigint,text)',
  'public.kinojo_sanctuary_management_stage7_complete_v446(bigint,jsonb)',
  'public.kinojo_sanctuary_management_rollout_state_v446()',
  'public.kinojo_sanctuary_management_bootstrap_v446(text)',
  'public.kinojo_sanctuary_management_write_access_v446(text,text)',
]){
  assert.ok(migration.includes(`revoke all on function ${signature} from public,anon,authenticated`),`${signature} browser ACL is open`);
  assert.ok(migration.includes(`grant execute on function ${signature} to service_role`),`${signature} service ACL is missing`);
}
assert.doesNotMatch(migration,/kws_[A-Za-z0-9_-]{20,}/,'Stage 7 migration must never contain a session credential');

for(const token of [
  'const API_VERSION="1.8"','const DATABASE_CONTRACT="446"','WRITE_ACTIONS',
  'kinojo_sanctuary_management_rollout_state_v446','kinojo_sanctuary_management_bootstrap_v446',
  'kinojo_sanctuary_management_month_v446','kinojo_sanctuary_management_command_v446',
])assert.ok(edge.includes(token),`Edge 1.8/446 missing ${token}`);
assert.doesNotMatch(edge,/"transition-(report|approve)"/,'retired transition approval routes remain public');

for(const token of ['const API_VERSION=1.8','const SCHEMA_VERSION=446',"params.get('view')==='schedule'",'sanctuaryManagementSchedulePanel','review.completed']){
  assert.ok(client.includes(token),`Stage 7 client missing ${token}`);
}

for(const page of ['sanctuary-management/index.html','m/sanctuary-management/index.html']){
  const html=read(page);
  assert.ok(html.includes('id="sanctuaryManagementSchedulePanel"'),`${page}: schedule deep-link target missing`);
  assert.ok(html.includes('stage7=2026082904'),`${page}: Stage 7 cache buster missing`);
}
for(const [page,canonical] of [
  ['sanctuary/index.html','https://kinojo.info/sanctuary/'],
  ['sanctuary-schedule/index.html','https://kinojo.info/sanctuary-schedule/'],
  ['m/sanctuary/index.html','https://kinojo.info/m/sanctuary/'],
  ['m/sanctuary-schedule/index.html','https://kinojo.info/m/sanctuary-schedule/'],
]){
  const html=read(page);
  assert.ok(html.includes(canonical),`${page}: legacy page must remain available through user review`);
  assert.doesNotMatch(html,/http-equiv="refresh"/i,`${page}: legacy page was redirected before user review`);
}

for(const token of ["code = 'sanctuary4'","name = '비탄의 설원'","short_name = '비탄의 설원'","enabled 상태는 변경하지 않는다"]){
  assert.ok(sanctuary4Migration.includes(token),`sanctuary 4 official-name migration missing ${token}`);
}

for(const page of ['admin/index.html','m/admin/index.html']){
  const html=read(page);
  assert.doesNotMatch(html,/data-admin-subtab="sheet-sync"|id="sanctuarySyncBtn"|id="sanctuaryPreviewBtn"/,`${page}: retired sync controls remain`);
  assert.ok(html.includes('성역 팀 운영')&&html.includes('시트 동기화 종료'),`${page}: Server replacement card missing`);
}
assert.doesNotMatch(adminBootstrap,/adminSanctuarySheetSync|loadSanctuarySyncConsole|runSanctuary(Sync|Preview)/,'admin bootstrap still invokes retired sync');
assert.doesNotMatch(adminSystem,/adminSanctuarySheetSync/,'server status still calls retired sanctuary sync');
assert.ok(features.includes("code:'SANCTUARY_SHEET_SYNC_RETIRED'"),'retired WEB action must fail closed');
assert.doesNotMatch(router,/adminSanctuarySheetSync:'sanctuary-sheet-bridge'|readSanctuarySheet:'sanctuary-sheet-bridge'|sanctuaryRosterV\d+:'sanctuary-roster-bridge'/,'retired browser route alias remains');

for(const file of ['supabase/functions/sanctuary-sheet-bridge/index.ts','supabase/functions/sanctuary-roster-bridge/index.ts']){
  const source=read(file);assert.ok(source.includes('status:410'),`${file}: retirement tombstone must return 410`);
}

console.log('KINOJO sanctuary management Stage 7 final cutover v446 contract: PASS');
