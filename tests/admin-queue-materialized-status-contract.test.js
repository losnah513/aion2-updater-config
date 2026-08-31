const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const desktop = read('admin/index.html');
const mobile = read('m/admin/index.html');
const characters = read('admin/js/admin-characters.js');
const bootstrap = read('admin/js/admin-bootstrap.js');
const features = read('core/kinojo-supabase-features.js');

for (const token of [
  "normalized==='statusdetail'",
  "rpc('kinojo_admin_server_queue_detail_v422'",
  'p_section:String(extra.section||\'\')',
]) assert.ok(features.includes(token), `on-demand status detail route missing: ${token}`);

for (const html of [desktop, mobile]) {
  for (const token of [
    'id="characterLookupPerformanceLoadBtn"',
    'id="characterLookupDiagnostics"',
    'admin.js?cache=2026082901',
    'kinojo-supabase-features.js?cache=2026083103',
  ]) assert.ok(html.includes(token), `materialized queue UI contract missing: ${token}`);
}

for (const token of [
  'id="characterLookupTargetLoadBtn"',
  '대상별 상세는 필요할 때만 불러옵니다.',
]) assert.ok(desktop.includes(token), `desktop lazy target contract missing: ${token}`);

for (const token of [
  "loadCharacterLookupDetail('targets',{limit:200})",
  "loadCharacterLookupDetail('events',{limit:40})",
  "loadCharacterLookupDetail('performance',{limit:1})",
  'return foreground?3000:15000;',
  "if(data.active===true)startCharacterLookupPolling();else stopCharacterLookupPolling();",
  "state.lookupPollTimer=setTimeout(async()=>",
]) assert.ok(characters.includes(token), `materialized status client behavior missing: ${token}`);

assert.equal(characters.includes('setInterval(()=>'), false, 'terminal-safe queue polling must not use an endless interval');
assert.equal(characters.includes("adminLookup('statusdetail'"), true);
assert.ok(bootstrap.includes("$('#characterLookupTargetLoadBtn')?.addEventListener('click',loadCharacterLookupTargets)"));
assert.ok(bootstrap.includes("$('#characterLookupPerformanceLoadBtn')?.addEventListener('click',loadCharacterLookupPerformance)"));
assert.ok(bootstrap.includes("$('#characterLookupDiagnostics')?.addEventListener('toggle'"));
assert.ok(bootstrap.includes("document.addEventListener('visibilitychange',handleCharacterLookupVisibilityChange)"));

console.log('admin queue materialized status contract: PASS');
