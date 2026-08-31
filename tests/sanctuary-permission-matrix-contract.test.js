const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const feature = read('core/kinojo-supabase-features.js');
const page = read('sanctuary/js/sanctuary.js');
const editor = read('sanctuary/js/sanctuary-editor.js');

assert.ok(feature.includes("rpc('kinojo_web_get_sanctuary_v376'"), 'Sanctuary data must include Server-owned effective access');
assert.ok(feature.includes("rpc('kinojo_web_save_sanctuary_v376'"), 'Sanctuary info writes must use the opaque-session compatible contract');
assert.equal(feature.includes("assertAdmin();\n    return rpc('kinojo_web_save_sanctuary'"), false, 'Client role levels must not block fine-grained Server permissions');

for (const token of [
  "pageAccess().canEditTeamName === true",
  "pageAccess().canAssignTeamLeader === true",
  "pageAccess().canOpenInfoEditor === true",
  "rosterAccess().canManageRoster===true",
  'manageableForceTeamNos',
  'canManageForce(teamNo)',
  'collectForceOptions({manageableOnly:true})',
  "window.addEventListener('kinojo:sanctuary-access-changed'"
]) {
  assert.ok(editor.includes(token), `Sanctuary editor is missing permission contract token: ${token}`);
}

for (const legacy of [
  'function canEditTeamInfo(){ return currentLevel() >= 3; }',
  'function canAssignLeader(){ return currentLevel() >= 4; }',
  'return sessionLevel()>=3',
  'Sub Master 이상만 가능합니다.'
]) {
  assert.equal(editor.includes(legacy), false, `Legacy client-owned permission gate remains: ${legacy}`);
}

assert.ok(page.includes("new CustomEvent('kinojo:sanctuary-access-changed'"), 'Fresh Server access must notify all editor entry points');

for (const entry of ['sanctuary/index.html', 'm/sanctuary/index.html']) {
  const html = read(entry);
  assert.ok(html.includes('id="editModeBtn" type="button" hidden'), `${entry}: info editor must remain hidden until Server access arrives`);
  assert.ok(html.includes('kinojo-supabase-features.js?cache=2026083103'), `${entry}: feature cache key is stale`);
  assert.ok(html.includes('sanctuary.js?cache=2026082105'), `${entry}: page cache key is stale`);
  assert.ok(html.includes('sanctuary-editor.js?cache=2026082105'), `${entry}: editor cache key is stale`);
}

console.log('KINOJO sanctuary fine-grained permission matrix contract: PASS');
