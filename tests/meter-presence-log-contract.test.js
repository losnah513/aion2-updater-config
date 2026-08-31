const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

for (const entry of ['meter/index.html', 'm/meter/index.html']) {
  const html = read(entry);
  for (const token of ['id="meterLiveUsers"', 'id="meterLiveCount"', 'id="meterLiveNames"', 'kinojo-page-booting', '이름 공개를 끈 이용자는 웹에 익명 사용자로 표시됩니다.', 'kinojo-staged-loading.css?cache=2026083001', 'kinojo-staged-loading.js?cache=2026083001', 'meter-app.js?cache=2026081502-50040&auth=2026081801']) {
    assert.ok(html.includes(token), `${entry}: public presence contract missing ${token}`);
  }
}

const meterApp = read('meter/js/meter-app.js');
for (const token of ["callMeter('publicPresence'", 'setInterval', '15000', 'replaceChildren()', 'textContent = characterName', 'anonymousCount', "anonymous.className = 'is-anonymous'", "'익명 사용자'"]) {
  assert.ok(meterApp.includes(token), `Meter public presence implementation missing ${token}`);
}
assert.ok(meterApp.includes('characters.length + anonymousCount'), 'Meter live count must include named and anonymous users');

const meterCss = read('meter/css/meter.css');
assert.ok(meterCss.includes('.meter-live-names span.is-anonymous'), 'Anonymous live-user chip style missing');

const stagedLoading = read('ui/kinojo-staged-loading.js');
assert.ok(stagedLoading.includes('.meter-live-subbar'), 'Meter live users must be attached directly below the common topbar');

for (const entry of ['admin/index.html', 'm/admin/index.html']) {
  const html = read(entry);
  for (const token of ['data-admin-subtab="logs"', 'id="meterDungeonLogRows"', 'id="meterDungeonLogChannel"', 'id="meterDungeonLogQuery"', 'METER RUNTIME LOG', '미터기 실행', '미터기 종료', 'id="characterAutomationToggle"', 'KST 22:00 · 04:00 · 10:00 · 16:00', 'kinojo-supabase-features.js?cache=2026083105', 'admin.js?cache=2026082901', '성역 팀 운영', '시트 동기화 종료']) {
    assert.ok(html.includes(token), `${entry}: Meter dungeon log UI missing ${token}`);
  }
  for (const noticeId of ['characterAutomationNotice']) {
    const noticeAt = html.indexOf(`id="${noticeId}"`);
    const rowAt = html.lastIndexOf('<div class="admin-meter-control-row">', noticeAt);
    const switchAt = html.indexOf('<label class="kinojo-filter-switch admin-meter-switch">', noticeAt);
    assert.ok(rowAt >= 0 && noticeAt > rowAt && switchAt > noticeAt, `${entry}: ${noticeId} must stay inside the automation control card`);
  }
  assert.doesNotMatch(html,/id="sanctuaryAutomationToggle"|id="sanctuaryAutomationNotice"/,'retired sanctuary Sheet automation controls must not return');
}

const adminShared = read('admin/js/admin-shared.js');
assert.ok(adminShared.includes('function adminAutomation(cmd, extra){ return window.KinojoSupabase.adminAutomation(cmd, extra||{}); }'), 'Admin automation bridge missing from shared module');
assert.ok(adminShared.includes('adminMeter,adminAutomation,adminVisitor'), 'Admin automation bridge missing from shared exports');

const adminCharacters = read('admin/js/admin-characters.js');
assert.ok(adminCharacters.includes("'22:00 · 04:00 · 10:00 · 16:00'"), 'Character automation fallback schedule must stay anchored at 22:00 KST');

const features = read('core/kinojo-supabase-features.js');
assert.ok(features.includes("logs:'adminMeterDungeonLogs'"), 'Admin Meter dungeon log action mapping missing');
for (const token of ["normalizedCommand === 'enableCode'", "p_action:normalizedCommand === 'deleteCode' ? 'delete' : (normalizedCommand === 'enableCode' ? 'enable' : 'disable')", 'Google list 조회 대상 여부와 무관하게 PASS KEY 기능을 사용할 수 있습니다.']) {
  assert.ok(features.includes(token), `PASS KEY administrative reactivation contract missing ${token}`);
}

const adminMembers = read('admin/js/admin-members.js');
for (const token of ['data-member-enable', "adminAccount('enableCode'", '웹 로그인, 미터기 다운로드·실행을 포함한 PASS KEY 기능']) {
  assert.ok(adminMembers.includes(token), `Admin member activation UI contract missing ${token}`);
}

const adminSystem = read('admin/js/admin-system.js');
for (const token of ['loadMeterDungeonLogs', 'formatMeterLogTime', "timeZone:'Asia/Seoul'", 'staleSessionsClosed', 'state.meterDungeonLogTotalPages', 'archivedCombatTotal', 'expeditionCount', 'transcendenceCount', 'sanctuaryCount', '과거 보스 전투']) {
  assert.ok(adminSystem.includes(token), `Admin Meter dungeon log implementation missing ${token}`);
}
assert.ok(adminSystem.includes("esc(item?.characterName||'-')"), 'Dungeon log character name must be escaped before HTML rendering');
assert.ok(adminSystem.includes("esc(label)"), 'Runtime content labels must be escaped before HTML rendering');

console.log('KINOJO Meter public presence and dungeon log contract: PASS');
