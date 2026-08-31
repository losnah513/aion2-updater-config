const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'home.html'), 'utf8');

assert.ok(
  home.includes('ui/info-home.css?cache=2026083002'),
  'Home stylesheet cache key must advance when the hero layout contract changes'
);
assert.match(
  home,
  /<style data-kinojo-home-critical>[\s\S]*?\.kinojo-main-banner\{[\s\S]*?width:min\(960px,100%\);[\s\S]*?\.kinojo-main-banner>img\{[\s\S]*?width:100%;[\s\S]*?aspect-ratio:16\/9;/,
  'Home must keep the main banner bounded while external CSS is stale or delayed'
);

function collectHtml(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectHtml(absolutePath, output);
    else if (/\.html$/i.test(entry.name)) output.push(absolutePath);
  }
  return output;
}

const featureReferences = [];
for (const filePath of collectHtml(root)) {
  const html = fs.readFileSync(filePath, 'utf8');
  const matches = html.matchAll(/kinojo-supabase-features\.js\?cache=([^"']+)/g);
  for (const match of matches) featureReferences.push({ filePath, cacheKey: match[1] });
}

assert.ok(featureReferences.length > 0, 'At least one common feature module reference is required');
for (const reference of featureReferences) {
  assert.equal(
    reference.cacheKey,
    '2026083102',
    `${path.relative(root, reference.filePath)} must load the current snapshot-only feature module`
  );
}

console.log(`home-layout-cache-guard.test.js: PASS (${featureReferences.length} feature references)`);
