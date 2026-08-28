const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const features = read('core/kinojo-supabase-features.js');
const page = read('sanctuary/js/sanctuary.js');
const style = read('sanctuary/css/sanctuary.css');

assert.ok(
  features.includes("rpc('kinojo_web_get_sanctuary_v376'"),
  'Sanctuary roster must use the Server contract that exposes the successful sheet apply time'
);

for (const token of [
  'function sanctuarySheetSyncAt(data)',
  'data?.sheetSyncedAt||data?.sheetSync?.completedAt',
  "timeZone:'Asia/Seoul'",
  "topbarChip.dataset.serverTime=raw||'unavailable'",
  "label:fromCache?'시트 동기화(캐시)':'시트 동기화'"
]) {
  assert.ok(page.includes(token), 'Sanctuary sync display is missing ' + token);
}

assert.equal(
  page.includes('setSanctuarySyncState(sanctuaryData.generatedAt'),
  false,
  'Request generation time must never be displayed as the sheet synchronization time'
);
assert.equal(
  page.includes(":'일정 확정';"),
  false,
  'A fixed schedule must not render a duplicate response badge'
);
assert.ok(
  page.includes("const responseHtml=responseText?'<span class=\"sanctuary-operation-response\""),
  'Response badges must be rendered only for response-based schedules'
);

for (const token of [
  'grid-template-columns:max-content minmax(220px,460px)',
  'max-width:460px',
  'flex:0 0 456px',
  'grid-template-columns:max-content minmax(240px,360px)',
  'grid-template-columns:max-content minmax(200px,300px)',
  'main.wrap>.sanctuary-page-bar .sanctuary-operation.kinojo-staged-region',
  'main.wrap>.sanctuary-page-bar .summary-grid.kinojo-staged-region{min-height:0}'
]) {
  assert.ok(style.includes(token), 'Compact sanctuary subbar style is missing ' + token);
}

for (const entry of ['sanctuary/index.html', 'm/sanctuary/index.html']) {
  const html = read(entry);
  assert.ok(html.includes('sanctuary.css?cache=2026082106'), entry + ': sanctuary CSS cache is stale');
  assert.equal(html.includes('id="sanctuarySyncChip"'), false, entry + ': body sync card duplicates the topbar status');
  assert.ok(html.includes('kinojo-supabase-features.js?cache=2026082803'), entry + ': Server feature cache is stale');
  assert.ok(html.includes('sanctuary.js?cache=2026082105'), entry + ': sanctuary page cache is stale');
}

console.log('KINOJO sanctuary sheet-sync time and compact schedule contract: PASS');
