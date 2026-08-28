const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260828104017_sanctuary_management_stage5_complete_v437.sql');
const performanceGuard=read('supabase/migrations/20260828105308_sanctuary_management_stage5_performance_guard_v437.sql');
const edge=read('supabase/functions/sanctuary-management/index.ts');
const feature=read('core/kinojo-supabase-features.js');
const common=read('ui/kinojo-common-ui.js');
const client=read('sanctuary-management/js/sanctuary-management.js');
const css=read('sanctuary-management/css/sanctuary-management.css');

for(const token of [
  'sanctuary_management_schedule_versions_v437','kinojo_sm_rule_occurrences_v437',
  'kinojo_sm_team_conflicts_v437','kinojo_sanctuary_management_bootstrap_v437',
  'kinojo_sanctuary_management_month_v437','kinojo_sanctuary_management_notification_summary_v437',
  'kinojo_sanctuary_management_archive_preview_v437','kinojo_sanctuary_management_command_v437',
  "v_scope not in ('OCCURRENCE','FUTURE','ALL')","v_operation not in ('UPDATE','CANCEL','STOP')",
  'futureOccurrenceCount','pendingSupportCount','historyPreserved',
  'private.kinojo_sm_support_characters_v436','availableForceIds',
  'revoke all on function public.kinojo_sanctuary_management_command_v437(text,text,text,jsonb,bigint) from public,anon,authenticated',
  'grant execute on function public.kinojo_sanctuary_management_command_v437(text,text,text,jsonb,bigint) to service_role',
])assert.ok(migration.includes(token),`DB437 Stage 5 contract missing ${token}`);
assert.ok(performanceGuard.includes('sanctuary_management_schedule_versions_v437_created_by_idx'),'DB437 actor FK performance guard missing');

for(const token of [
  'const API_VERSION="1.6"','const DATABASE_CONTRACT="439"','"archive-preview"',
  'kinojo_sanctuary_management_bootstrap_v439','kinojo_sanctuary_management_month_v439',
  'kinojo_sanctuary_management_notification_summary_v439','kinojo_sanctuary_management_archive_preview_v439',
  'kinojo_sanctuary_management_command_v439',
])assert.ok(edge.includes(token),`Current Edge contract missing ${token}`);

for(const token of [
  'getSanctuaryManagementNotificationSummary','getSanctuaryManagementArchivePreview',
  "action:'notification-summary'","action:'archive-preview'",
  'const [legacy,recruitment]=await Promise.all','sanctuaryRecruitmentGroups',
])assert.ok(feature.includes(token),`Stage 5 feature bridge missing ${token}`);

for(const token of [
  'kinojo_sanctuary_recruitment_seen_v439','renderRecruitmentNotificationToast_',
  'sanctuaryRecruitmentHref_','sanctuaryRecruitmentCount','setInterval',
])assert.ok(common.includes(token),`Stage 5 common notification queue missing ${token}`);
assert.equal((common.match(/commonNotificationTimer=setInterval/g)||[]).length,1,'common notification must keep one polling timer');

for(const token of [
  'const API_VERSION=1.6','const SCHEMA_VERSION=439','sanctuary-management-calendar-grid',
  "['OCCURRENCE','FUTURE','ALL']",'openScheduleOperation','EDIT_SCHEDULE',
  'openArchiveOperation','archivePreview','futureOccurrenceCount','pendingSupportCount',
  "event.key==='Escape'","event.key!=='Tab'",'applyDeepLink','data-sanctuary-schedule-team',
])assert.ok(client.includes(token),`Stage 5 client operation missing ${token}`);
assert.ok(!client.includes('window.confirm('),'native archive confirmation must not remain');

for(const token of [
  'overflow-x:hidden','.sanctuary-management-calendar-grid','.sanctuary-management-operation-layer',
  'scrollbar-width:none','mask-image:linear-gradient','@media(max-width:699px)','100dvh',
])assert.ok(css.includes(token),`Stage 5 responsive layout guard missing ${token}`);

for(const page of ['sanctuary-management/index.html','m/sanctuary-management/index.html']){
  const html=read(page);
  for(const token of ['sanctuary-management.css?cache=2026082813','sanctuary-management.js?cache=2026082814','sanctuary-management-support.js?cache=2026082814','kinojo-supabase-features.js?cache=2026082813','kinojo-common-ui.js?cache=2026082901'])assert.ok(html.includes(token),`${page}: missing ${token}`);
}

console.log('KINOJO sanctuary management Stage 5 preserved under Stage 6 contract: PASS');
