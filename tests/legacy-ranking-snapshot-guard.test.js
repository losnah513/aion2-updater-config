const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const legacyRpcNames = [
  'kinojo_web_get_hof_summary',
  'kinojo_web_get_hall_ranking_view',
  'kinojo_web_get_ranking'
];

function collectSourceFiles(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'tests') continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectSourceFiles(absolutePath, output);
    else if (/\.(?:html?|js|json)$/i.test(entry.name)) output.push(absolutePath);
  }
  return output;
}

const sourceFiles = collectSourceFiles(repoRoot);
const activeSource = sourceFiles
  .map(filePath => fs.readFileSync(filePath, 'utf8'))
  .join('\n');

for (const rpcName of legacyRpcNames) {
  assert.ok(
    !activeSource.includes(rpcName),
    `Legacy ranking/HOF RPC must not be selectable from active WEB source: ${rpcName}`
  );
}

const core = fs.readFileSync(path.join(repoRoot, 'core', 'kinojo-supabase-features.js'), 'utf8');
for (const exportName of ['getWebRanking', 'getWebHallOfFame', 'getWebHallRankingView', 'getWebHofSummary']) {
  assert.ok(!core.includes(exportName), `Legacy common export must be removed: ${exportName}`);
}

const rankingData = fs.readFileSync(path.join(repoRoot, 'ranking', 'js', 'ranking-data.js'), 'utf8');
const hallData = fs.readFileSync(path.join(repoRoot, 'hof', 'js', 'hall-data.js'), 'utf8');
assert.ok(rankingData.includes('kinojo_web_get_legion_ranking'), 'Published ranking snapshot RPC is required');
assert.ok(hallData.includes('kinojo_web_get_hof_display_v301'), 'Published HOF snapshot RPC is required');
assert.ok(hallData.includes('kinojo_web_get_my_hof_ranking_v329'), 'Published personal HOF snapshot RPC is required');

console.log('legacy-ranking-snapshot-guard.test.js: PASS');
