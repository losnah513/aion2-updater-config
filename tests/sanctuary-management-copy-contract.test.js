const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  for(const token of [
    'sanctuary-management-copy.css?cache=2026083001',
    'sanctuary-management-copy.js?cache=2026090101',
    'sanctuary-management-support.css?cache=2026090101',
    'stage12=2026090101',
    'kinojo-public-shell.css?cache=2026083001&amp;hotfix=2026083101',
    'canonical=2026083001',
  ])assert.ok(html.includes(token),`${page}: image-copy asset contract missing ${token}`);
}

const client=read('sanctuary-management/js/sanctuary-management.js');
for(const token of [
  'sanctuary-management-team-title-row',
  'sanctuary-management-force-title-row',
  'dataset.sanctuaryCopyTeam',
  'dataset.sanctuaryCopyForce',
  'KinojoSanctuaryManagementCopyBridge',
  'dataset.sanctuarySupportAvailable',
])assert.ok(client.includes(token),`team/force copy-button wiring missing ${token}`);
assert.ok(client.indexOf('titleRow.append(mode,title,copyButton)')>=0,'team copy button must sit beside the team name');
assert.ok(client.indexOf('titleWrap.append(copyButton)')>=0,'force copy button must sit beside the force name');

const copy=read('sanctuary-management/js/sanctuary-management-copy.js');
for(const token of [
  "const EDGE_FUNCTION_NAME='sanctuary-copy-render'",
  "const SNAPSHOT_CONTRACT='KINOJO_SANCTUARY_MANAGEMENT_COPY_V1'",
  'managementSnapshot:managementSnapshot(team)',
  'navigator.clipboard.write',
  "new ClipboardItem({'image/png':Promise.resolve(blobPromise)",
  'sanctuary-management-copy-preview',
  'KinojoSanctuaryManagementCopy=Object.freeze',
  "document.addEventListener('click'",
  "dataset.sanctuaryCopyReady='true'",
  '20260901_01_stage12_renderer',
  "sanctuaryId:text(sanctuary.code||sanctuary.id).toLowerCase()",
  'requiredClassName:CLASS_NAME_BY_CODE',
  'isRandomAlt',
])assert.ok(copy.includes(token),`Stage 12 renderer bridge missing ${token}`);
for(const forbidden of [
  'capture-head',
  'linear-gradient(135deg,#1f3966,#6250b7)',
  'scheduleText',
  'KINOJO INFO ·',
  'repeat(2,minmax(0,1fr))',
  'runSanctuaryManagementCommand',
])assert.equal(copy.includes(forbidden),false,`copy bridge must not mutate Server data: ${forbidden}`);

const renderer=read('supabase/functions/sanctuary-copy-render/index.ts');
const supabaseConfig=read('supabase/config.toml');
for(const token of [
  'const CARD_W = 228',
  'const CARD_H = 68',
  'const PARTY_W = 240',
  'const FORCE_W = 512',
  'const TEAM_COLUMN_GAP = 14',
  'const TEAM_HEADER_H = 72',
  '파티 인원 모집중',
  '"#4fc989"',
  'relationLabel=isMain?"본캐"',
  '-부캐',
  'profileFadeMain',
  'POWER_ICON_URL',
  'SANCTUARY_BOSS_FILE',
  'bossBackdropSvg',
  'opacity=".30"',
  'scope==="team"',
  'Math.ceil(forces.length/columns)',
  'TEAM_HEADER_H+CANVAS_PAD+row*(FORCE_H+TEAM_COLUMN_GAP)',
  '(${forces.length}포스)',
  '평균 전투력',
  'fmtPowerK',
  'async function renderTeamSvg',
  'sanctuary-stage12-layout-svg-v3',
  'KINOJO_SANCTUARY_MANAGEMENT_COPY_V1',
  'profileimg.plaync.com',
  'const headerFilename=safeFilename.replace(/[^\\x20-\\x7e]+/g,"")',
  'isRandomAlt?: boolean',
  'className:isRandomAlt?"랜덤 부캐":className',
  'name.endsWith("랜덤 부캐")',
  "slot.isRandomAlt?'R'",
])assert.ok(renderer.includes(token),`Stage 12 Sanctuary renderer contract missing ${token}`);
for(const token of ['[functions.sanctuary-copy-render]','verify_jwt = false','entrypoint = "./functions/sanctuary-copy-render/index.ts"'])assert.ok(supabaseConfig.includes(token),`renderer deployment config missing ${token}`);
for(const forbidden of [
  'linear-gradient(135deg,#1f3966,#6250b7)',
  'scheduleText',
  'KINOJO INFO ·',
])assert.equal(renderer.includes(forbidden),false,`renderer must not add unrelated replacement chrome: ${forbidden}`);

const migration=read('supabase/migrations/20260830035152_sanctuary_copy_legacy_content_v447.sql');
for(const token of [
  'latest_pve_combat_power',
  'main_character_name',
  'is_main',
  'profile_image_url',
])assert.ok(migration.includes(token),`legacy card content field missing ${token}`);
for(const forbidden of [
  /insert\s+into\s+private\.sanctuary_management_/i,
  /update\s+private\.sanctuary_management_/i,
  /delete\s+from\s+private\.sanctuary_management_/i,
])assert.equal(forbidden.test(migration),false,'copy read-contract migration must not change team roster rows');

const css=read('sanctuary-management/css/sanctuary-management-copy.css');
for(const token of [
  '.sanctuary-management-copy-button',
  '.sanctuary-management-copy-preview',
  '@media(max-width:760px)',
  'width:min(980px,100%)',
])assert.ok(css.includes(token),`image-copy responsive layout missing ${token}`);
assert.equal(css.includes('overflow-x'),false,'image-copy UI must not introduce horizontal overflow');

const supportCss=read('sanctuary-management/css/sanctuary-management-support.css');
for(const token of [
  'Stage 12: keep both parties beside each other',
  '.sanctuary-management-force-parties{grid-template-columns:repeat(2,minmax(0,1fr));gap:4px',
  '.sanctuary-management-team-card{padding:10px 8px}',
  '.sanctuary-management-force-slot{min-width:0;min-height:42px',
  '@media(max-width:350px)',
])assert.ok(supportCss.includes(token),`Stage 12 mobile two-party density missing ${token}`);

const publicShellCss=read('ui/kinojo-public-shell.css');
for(const token of ['.kinojo-common-toast','--kinojo-notice-actual-height','z-index:10035'])assert.ok(publicShellCss.includes(token),`public-shell toast clearance missing ${token}`);

const harness=read('tests/sanctuary-management-fixed-draft-e2e.html');
assert.ok(harness.includes('sanctuary-management-copy.css'),'fixed-draft harness missing copy CSS');
assert.ok(harness.includes('sanctuary-management-copy.js'),'fixed-draft harness missing copy JS');
assert.ok(harness.includes('power:123456'),'fixed-draft harness must cover copy power content');
assert.ok(harness.includes("getConfig(){return {url:'https://josvoltpktvwysrasffq.supabase.co'};}"),'fixed-draft harness must exercise the deployed renderer');

console.log('KINOJO Sanctuary Stage 12 clipboard image and mobile density contract: PASS');
