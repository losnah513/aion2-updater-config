const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260831073450_sanctuary_management_selected_bootstrap_v456.sql');
const edge=read('supabase/functions/sanctuary-management/index.ts');
const core=read('core/kinojo-supabase-features.js');
const client=read('sanctuary-management/js/sanctuary-management.js');
const supportCss=read('sanctuary-management/css/sanctuary-management-support.css');

for(const token of [
  'kinojo_sanctuary_management_public_bootstrap_v456(p_sanctuary_code text default null)',
  'kinojo_sanctuary_management_bootstrap_v456(',
  'kinojo_sanctuary_management_public_revision_v456(p_sanctuary_code text default null)',
  'private.kinojo_sm_selected_teams_v456',
  "'revisionKey', private.kinojo_sm_revision_v456",
  "'teams', private.kinojo_sm_enrich_teams_v454(v_teams",
  'revoke all on function public.kinojo_sanctuary_management_public_bootstrap_v456(text) from public, anon, authenticated',
  'grant execute on function public.kinojo_sanctuary_management_public_bootstrap_v456(text) to service_role',
])assert.ok(migration.includes(token),`Stage 11 selected bootstrap migration missing ${token}`);
assert.ok(
  migration.indexOf('v_teams := private.kinojo_sm_selected_teams_v456')<migration.indexOf("'teams', private.kinojo_sm_enrich_teams_v454(v_teams"),
  'expensive roster enrichment must run after sanctuary filtering',
);

for(const token of [
  'const API_VERSION="2.4"',
  'const DATABASE_CONTRACT="458"',
  '"revision"',
  'kinojo_sanctuary_management_public_bootstrap_v456',
  'kinojo_sanctuary_management_bootstrap_v456',
  'kinojo_sanctuary_management_public_revision_v456',
  'p_sanctuary_code:sanctuaryCode||null',
])assert.ok(edge.includes(token),`Stage 11 Edge contract missing ${token}`);

for(const token of [
  'async function getSanctuaryManagementBootstrap(sanctuaryCode)',
  'async function getSanctuaryManagementRevision(sanctuaryCode)',
  "action:'revision'",
  'getSanctuaryManagementRevision,',
])assert.ok(core.includes(token),`Stage 11 browser feature adapter missing ${token}`);

for(const token of [
  'const API_VERSION=2.4',
  'const SCHEMA_VERSION=458',
  'const bootstrapCache=new Map()',
  'async revision(sanctuaryCode=',
  'const next=await ServerAdapter.revision(selectedSanctuary)',
  'async function selectSanctuary(sanctuaryCode)',
  'ServerAdapter.bootstrap(target)',
  'sanctuaryAsset(sanctuaryKey(sanctuary))?.boss',
  'createSingleForceBossVisual(team)',
  'headActions.appendChild(position)',
])assert.ok(client.includes(token),`Stage 11 client behavior missing ${token}`);

const updateBody=client.slice(client.indexOf('async function checkForUpdates()'),client.indexOf('async function refreshContent()'));
assert.equal(updateBody.includes('ServerAdapter.bootstrap('),false,'background checks must not download the full bootstrap payload');
assert.ok(updateBody.includes('ServerAdapter.revision('),'background checks must use the lightweight revision endpoint');

for(const token of [
  '.sanctuary-management-force-viewport{padding:3px 42px 9px;overflow:visible}',
  '.sanctuary-management-force-boss-visual',
  '.sanctuary-management-force-boss-visual{display:none}',
  'width:calc(100% + 61px)',
  'height:calc(100% + 27px)',
  'object-fit:cover',
  'opacity:.5',
  '.sanctuary-management-force-carousel{margin-top:8px}',
])assert.ok(supportCss.includes(token),`Stage 11 force layout CSS missing ${token}`);

for(const directory of ['sanctuary-1-rudra','sanctuary-2-bagot','sanctuary-3-kaldrix','sanctuary-4-deltras']){
  assert.ok(fs.existsSync(path.join(root,'assets/images/sanctuary',directory,'boss.webp')),`boss asset missing ${directory}/boss.webp`);
}

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  assert.ok(html.includes('sanctuary-management-support.css?cache=2026090101'),`${page}: Stage 11 boss visual CSS cache key missing`);
}

console.log('KINOJO Sanctuary Stage 11 selected bootstrap and force layout contract: PASS');
