const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

let now = 1_800_000_000_000;
class TestDate extends Date {
  static now() { return now; }
}
const localStorage = new MemoryStorage();
const context = {
  window: { dispatchEvent() {} },
  localStorage,
  CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  Date: TestDate,
  Object,
  Number,
  String,
  JSON,
  Math,
};
vm.runInNewContext(read('core/kinojo-auth-session.js'), context, { filename: 'core/kinojo-auth-session.js' });

const auth = context.window.KinojoAuthSessionCore;
assert.equal(auth.IDLE_TIMEOUT_MS, 30 * 60 * 1000, 'idle timeout must be 30 minutes');
assert.equal(auth.IDLE_WARNING_MS, 5 * 60 * 1000, 'idle warning must start five minutes before logout');

const base = now;
assert.equal(auth.getIdleState({ lastActivityAt: base }, base + 24 * 60 * 1000 + 59_000).warning, false);
assert.equal(auth.getIdleState({ lastActivityAt: base }, base + 25 * 60 * 1000).warning, true);
assert.equal(auth.getIdleState({ lastActivityAt: base }, base + 29 * 60 * 1000).remainingMs, 60_000);
assert.equal(auth.getIdleState({ lastActivityAt: base }, base + 30 * 60 * 1000).expired, true);

auth.setStoredSession({ token: 'test', passKey: '000000' }, { passKey: '000000' });
now = base + 29 * 60 * 1000 + 59_000;
assert.ok(auth.getSession(), 'session must remain available before the absolute deadline');
now = base + 30 * 60 * 1000;
assert.equal(auth.getSession(), null, 'session must be cleared at the absolute deadline');
assert.equal(localStorage.getItem(auth.STORAGE_KEY), null, 'expired session storage must be removed');

const publicShellPages = [
  'home.html', 'm/index.html',
  'hof/index.html', 'm/hof/index.html',
  'ranking/index.html', 'm/ranking/index.html',
  'sanctuary/index.html', 'm/sanctuary/index.html',
  'sanctuary-schedule/index.html', 'm/sanctuary-schedule/index.html',
  'meter/index.html', 'm/meter/index.html',
  'arcana/index.html', 'm/arcana/index.html',
];
for (const page of publicShellPages) {
  const html = read(page);
  for (const token of [
    'kinojo-common-ui.css',
    'kinojo-public-shell.css?cache=2026081202',
    'kinojo-common-ui.js?cache=2026081202',
    'kinojo-auth-session.js?cache=2026081201',
    'kinojo-auth-service.js',
    'kinojo-auth-ui.js?cache=2026081201',
  ]) {
    assert.ok(html.includes(token), `${page}: missing ${token}`);
  }
}

for (const page of ['admin/index.html', 'm/admin/index.html']) {
  const html = read(page);
  assert.ok(html.includes('kinojo-common-ui.js?cache=2026081202'), `${page}: common UI cache missing`);
  assert.ok(html.includes('kinojo-auth-session.js?cache=2026081201'), `${page}: stale auth session cache`);
  assert.ok(html.includes('kinojo-auth-ui.js?cache=2026081201'), `${page}: stale auth UI cache`);
}

for (const page of publicShellPages.concat(['admin/index.html', 'm/admin/index.html'])) {
  const html = read(page);
  assert.equal(html.includes('kinojo-common-ui.js?cache=2026081004'), false, `${page}: old common UI cache remains`);
  assert.equal(html.includes('kinojo-auth-session.js?cache=2026080205'), false, `${page}: old auth session cache remains`);
  assert.equal(html.includes('kinojo-auth-ui.js?cache=2026080205'), false, `${page}: old auth UI cache remains`);
}

for (const page of publicShellPages) {
  const html = read(page);
  assert.equal(html.includes('kinojo-public-shell.css?cache=2026081005'), false, `${page}: old public shell cache remains`);
}

const commonUi = read('ui/kinojo-common-ui.js');
for (const token of ['kinojo_common_notices_v1', 'KINOJO_NOTICE_RETRY_DELAYS_MS', 'data-kinojo-notice-retry', 'navigator.onLine===false', 'kinojo:sanctuary-master-rendered']) {
  assert.ok(commonUi.includes(token), `common UI reliability contract missing: ${token}`);
}
assert.ok(commonUi.includes('<circle cx="12" cy="6"'), 'menu dots must be vertical');

const publicShell = read('ui/kinojo-public-shell.css');
for (const token of ['--kinojo-drawer-width', 'scrollbar-color:#6d5ee7', '.kinojo-drawer-nav::-webkit-scrollbar', '.kinojo-notice-retry']) {
  assert.ok(publicShell.includes(token), `public shell mobile contract missing: ${token}`);
}

for (const page of ['sanctuary-schedule/index.html', 'm/sanctuary-schedule/index.html']) {
  const html = read(page);
  assert.ok(html.includes('sanctuary-schedule.css?cache=2026081201'), `${page}: schedule CSS cache missing`);
  assert.ok(html.includes('sanctuary-schedule.js?cache=2026081201'), `${page}: schedule JS cache missing`);
}

const schedule = read('sanctuary-schedule/js/sanctuary-schedule.js');
for (const token of ['adminSanctuaryScheduleConsole', 'adminSanctuaryScheduleSave', 'scheduleManagerEditor', 'SERVER AUTHORIZED']) {
  assert.ok(schedule.includes(token), `schedule manager contract missing: ${token}`);
}

console.log('KINOJO auth timing and public shell entrypoints: PASS');
