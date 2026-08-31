const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  for(const token of [
    'sanctuary-management-copy.css?cache=2026083001',
    'sanctuary-management-copy.js?cache=2026083101',
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
assert.ok(client.indexOf('titleRow.append(title,copyButton)')>=0,'team copy button must sit beside the team name');
assert.ok(client.indexOf('titleWrap.append(name,copyButton)')>=0,'force copy button must sit beside the force name');

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
  '20260831_01_server_legacy_renderer',
  'isRandomAlt',
])assert.ok(copy.includes(token),`legacy renderer bridge missing ${token}`);
for(const forbidden of [
  'capture-head',
  'linear-gradient(135deg,#1f3966,#6250b7)',
  'scheduleText',
  'KINOJO INFO ·',
  'repeat(2,minmax(0,1fr))',
  'runSanctuaryManagementCommand',
])assert.equal(copy.includes(forbidden),false,`copy bridge must not invent a new image layout or mutate Server data: ${forbidden}`);

const renderer=read('supabase/functions/sanctuary-copy-render/index.ts');
const supabaseConfig=read('supabase/config.toml');
for(const token of [
  'const CARD_W = 342',
  'const CARD_H = 54',
  'const PARTY_W = 350',
  'const FORCE_W = 736',
  '파티 인원 모집중',
  '대기자 명단에서 추가 가능',
  "badgeSvg('본캐'",
  "badgeSvg('부캐'",
  'profileFadeMain',
  'POWER_ICON_URL',
  'async function renderTeamSvg',
  'sanctuary-web-layout-svg-v2',
  'KINOJO_SANCTUARY_MANAGEMENT_COPY_V1',
  'profileimg.plaync.com',
  'const headerFilename=safeFilename.replace(/[^\\x20-\\x7e]+/g,"")',
  'isRandomAlt?: boolean',
  'className:isRandomAlt?"랜덤 부캐":className',
  'name.endsWith("랜덤 부캐")',
  "slot.isRandomAlt?'R'",
])assert.ok(renderer.includes(token),`exact retired Sanctuary renderer contract missing ${token}`);
for(const token of ['[functions.sanctuary-copy-render]','verify_jwt = false','entrypoint = "./functions/sanctuary-copy-render/index.ts"'])assert.ok(supabaseConfig.includes(token),`retired renderer deployment config missing ${token}`);
for(const forbidden of [
  'linear-gradient(135deg,#1f3966,#6250b7)',
  'scheduleText',
  'KINOJO INFO ·',
])assert.equal(renderer.includes(forbidden),false,`retired renderer must not gain the replacement design: ${forbidden}`);

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

const publicShellCss=read('ui/kinojo-public-shell.css');
for(const token of ['.kinojo-common-toast','--kinojo-notice-actual-height','z-index:10035'])assert.ok(publicShellCss.includes(token),`public-shell toast clearance missing ${token}`);

const harness=read('tests/sanctuary-management-fixed-draft-e2e.html');
assert.ok(harness.includes('sanctuary-management-copy.css'),'fixed-draft harness missing copy CSS');
assert.ok(harness.includes('sanctuary-management-copy.js'),'fixed-draft harness missing copy JS');
assert.ok(harness.includes('power:123456'),'fixed-draft harness must cover retired power content');
assert.ok(harness.includes("getConfig(){return {url:'https://josvoltpktvwysrasffq.supabase.co'};}"),'fixed-draft harness must exercise the deployed retired renderer');

console.log('KINOJO Sanctuary exact retired clipboard image renderer contract: PASS');
