// Fixed regression manifest; no operating credentials, migrations or network writes.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const tests=[
  "tests/character-refresh-stability-stage2.test.cjs",
  "tests/character-refresh-stability-sql.test.cjs",
  "tests/character-refresh-identity-stage2-fixtures.test.js",
  "tests/character-identity-recovery-percent-encoding-contract.test.js",
  "tests/list-metadata-writer.test.cjs",
  "tests/list-sanctuary-integration.test.cjs",
  "tests/character-refresh-stability-adversarial.test.cjs",
  "tests/character-refresh-policy.test.cjs",
  "tests/character-family-eligibility.test.cjs",
  "tests/character-activity-lifecycle.test.cjs",
  "tests/character-identity-unchanged.test.cjs",
  "tests/character-status-tabs.test.cjs",
  "tests/character-refresh-stage2-boundaries.test.cjs",
  "tests/character-refresh-server-transfer-legion-contract.test.js",
  "tests/admin-queue-materialized-status-runtime.test.js",
  "tests/web-shell-auth-contract.test.js",
  "tests/admin-member-image-review-contract.test.js",
  "tests/my-info-phase2-stage3-admin-contract.test.js",
  "tests/staged-page-contract.test.js",
  "tests/legion-tree-data-render-contract.test.js",
  "tests/admin-dashboard-lazy-loader-contract.test.js",
  "tests/admin-queue-materialized-status-contract.test.js",
  "tests/banner-library-management.test.js",
  "tests/character-refresh-worker-terminal.test.cjs",
  "tests/character-refresh-extension-terminal.test.cjs",
  "tests/character-refresh-audit-safety.test.cjs",
  "tests/character-detail-identity-edge.test.cjs",
  "tests/character-detail-write-fence.test.cjs",
  "tests/character-history-stable-identity.test.cjs",
  "tests/character-weekly-growth-identity.test.cjs",
  "tests/character-deferred-snapshot.test.cjs",
  "tests/character-refresh-completion-status.test.cjs",
  "tests/character-payload-identity-index.test.cjs",
  "tests/character-automation-cron-save.test.cjs",
  "tests/character-rollup-identity.test.cjs",
  "tests/character-refresh-dispatch.test.cjs",
  "tests/character-refresh-list-preference.test.cjs",
  "tests/roster-family-edge.test.js",
  "tests/sanctuary-management-layout-family-guard-contract.test.js",
  "tests/character-refresh-admin-settings.test.cjs",
  "tests/character-refresh-budget.test.cjs"
];
if(process.argv.includes('--browser'))tests.push('tests/character-refresh-ui-browser.test.cjs');
let failed=0;
for(const test of tests){
 const r=spawnSync(process.execPath,[test],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:180000});
 console.log(JSON.stringify({test,exitCode:r.status,...(r.status!==0||process.argv.includes('--verbose')?{output:r.stdout,error:r.stderr}:{}),launchError:r.error?.message}));
 if(r.status!==0||r.error)failed++;
}
console.log(JSON.stringify({total:tests.length,passed:tests.length-failed,failed,operatingWrites:false}));
process.exitCode=failed?1:0;
