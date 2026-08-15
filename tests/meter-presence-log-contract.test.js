const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

for (const entry of ['meter/index.html', 'm/meter/index.html']) {
  const html = read(entry);
  for (const token of ['id="meterLiveUsers"', 'id="meterLiveCount"', 'id="meterLiveNames"', 'meter-app.js?cache=2026081501-50037']) {
    assert.ok(html.includes(token), `${entry}: public presence contract missing ${token}`);
  }
}

const meterApp = read('meter/js/meter-app.js');
for (const token of ["callMeter('publicPresence'", 'setInterval', '15000', 'replaceChildren()', 'textContent = characterName']) {
  assert.ok(meterApp.includes(token), `Meter public presence implementation missing ${token}`);
}

for (const entry of ['admin/index.html', 'm/admin/index.html']) {
  const html = read(entry);
  for (const token of ['data-admin-subtab="logs"', 'id="meterDungeonLogRows"', 'id="meterDungeonLogChannel"', 'id="meterDungeonLogQuery"']) {
    assert.ok(html.includes(token), `${entry}: Meter dungeon log UI missing ${token}`);
  }
}

const features = read('core/kinojo-supabase-features.js');
assert.ok(features.includes("logs:'adminMeterDungeonLogs'"), 'Admin Meter dungeon log action mapping missing');

const adminSystem = read('admin/js/admin-system.js');
for (const token of ['loadMeterDungeonLogs', 'formatMeterLogTime', "timeZone:'Asia/Seoul'", 'staleRunsClosed', 'state.meterDungeonLogTotalPages']) {
  assert.ok(adminSystem.includes(token), `Admin Meter dungeon log implementation missing ${token}`);
}
assert.ok(adminSystem.includes("esc(item?.characterName||'-')"), 'Dungeon log character name must be escaped before HTML rendering');
assert.ok(adminSystem.includes("esc(name)"), 'Dungeon name must be escaped before HTML rendering');

console.log('KINOJO Meter public presence and dungeon log contract: PASS');
