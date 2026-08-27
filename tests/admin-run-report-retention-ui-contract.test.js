const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const desktop = read('admin/index.html');
const mobile = read('m/admin/index.html');
const characters = read('admin/js/admin-characters.js');
const bootstrap = read('admin/js/admin-bootstrap.js');
const harness = read('tests/admin-run-report-retention-ui-harness.html');

for (const html of [desktop, mobile]) {
  for (const token of [
    'id="characterLookupHistoryLimit"',
    'aria-label="최근 조회 기록 표시 건수"',
    '<option value="3" selected>최근 3건</option>',
    '<option value="5">최근 5건</option>',
    '<option value="10">최근 10건</option>',
    '7일간 보관합니다.',
    'admin.js?cache=2026082704',
  ]) assert.ok(html.includes(token), `run-report history UI contract missing: ${token}`);
}

assert.ok(
  characters.includes('return [3,5,10].includes(value)?value:3;'),
  'history limit must fail closed to the approved default of 3',
);
assert.ok(
  characters.includes("adminLookup('history',{limit:lookupHistoryLimit()})"),
  'history request must use the selected 3/5/10 limit',
);
assert.ok(
  bootstrap.includes("$('#characterLookupHistoryLimit')?.addEventListener('change',loadLookupHistory)"),
  'changing the history limit must reload the pure-read list',
);
assert.equal(characters.includes("adminLookup('history',{limit:40})"), false);
assert.ok(harness.includes('id="characterLookupHistoryLimit"'));

console.log('admin run-report retention UI contract: PASS');
