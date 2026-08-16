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
    'kinojo-auth-session.js?cache=2026081201',
    'kinojo-auth-service.js',
    'kinojo-auth-ui.js?cache=2026081204',
  ]) {
    assert.ok(html.includes(token), `${page}: missing ${token}`);
  }
  assert.match(html, /kinojo-common-ui\.js\?cache=20260812(?:04|22)/, `${page}: common UI cache missing`);
}

for (const page of ['admin/index.html', 'm/admin/index.html']) {
  const html = read(page);
  assert.ok(html.includes('kinojo-common-ui.js?cache=2026081204'), `${page}: common UI cache missing`);
  assert.ok(html.includes('kinojo-auth-session.js?cache=2026081201'), `${page}: stale auth session cache`);
  assert.ok(html.includes('kinojo-auth-ui.js?cache=2026081204'), `${page}: stale auth UI cache`);
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
  assert.ok(html.includes('sanctuary-schedule.css?cache=2026081218'), `${page}: schedule CSS cache missing`);
  assert.ok(html.includes('sanctuary-schedule.js?cache=2026081218'), `${page}: schedule JS cache missing`);
}

const schedule = read('sanctuary-schedule/js/sanctuary-schedule.js');
for (const token of ['adminSanctuaryScheduleConsole', 'adminSanctuaryScheduleSave', 'scheduleManagerEditor', 'SERVER AUTHORIZED']) {
  assert.ok(schedule.includes(token), `schedule manager contract missing: ${token}`);
}

const authServiceSource = read('core/kinojo-auth-service.js');
assert.ok(authServiceSource.includes("invokeEdgeFunction(AUTH_EDGE_NAME"), 'WEB PASS KEY login must call the dedicated auth Edge');
assert.ok(authServiceSource.includes("const AUTH_EDGE_NAME='kinojo-member-auth'"), 'dedicated auth Edge name is missing');
assert.equal(authServiceSource.includes('api.verifyPassKey(code)'), false, 'WEB login must not call the legacy direct verifier bridge');
assert.equal(authServiceSource.includes("rpc('kinojo_member_verify_session_264'"), false, 'WEB auth service must not call the verifier RPC directly');

async function verifyAuthEdgeContract() {
  const calls = [];
  const serviceContext = {
    window: {
      KinojoSupabase: {
        async ensureReady() {},
        normalizePassKey(value) { return String(value || '').replace(/\s+/g, '').toUpperCase(); },
        normalizeRole(value) { return String(value || '').toUpperCase(); },
        roleToLevel(_role, fallback) { return Number(fallback || 0); },
        getRoleLabel(role) { return role; },
        normalizePermissions(value) { return Array.isArray(value) ? value : []; },
        publicCodeRequest() {},
        adminAccount() {},
      },
      KinojoSupabaseClientCore: {
        async invokeEdgeFunction(name, body) {
          calls.push({ name, body });
          return {
            ok: true,
            tool: 'KINOJO_WEB',
            profile: {
              id: 7,
              mainCharacter: '청소기',
              mainCharacterName: '청소기',
              role: 'MASTER',
              roleLabel: 'Master',
              level: 5,
              permissions: ['all'],
              canManage: true,
              canLike: true,
              canSuggest: true,
            },
          };
        },
      },
    },
    Date: TestDate,
    Object,
    Number,
    String,
    JSON,
    Math,
    Array,
    Error,
  };
  vm.runInNewContext(authServiceSource, serviceContext, { filename: 'core/kinojo-auth-service.js' });
  const result = await serviceContext.window.KinojoAuthService.verifyPassKey(' ab 12 ');
  assert.equal(calls.length, 1, 'auth Edge must be invoked exactly once');
  assert.equal(calls[0].name, 'kinojo-member-auth');
  assert.equal(calls[0].body.action, 'verifyPassKey');
  assert.equal(calls[0].body.passKey, 'AB12');
  assert.equal(calls[0].body.clientVersion, 'KINOJO_WEB_AUTH_EDGE_V1');
  assert.equal(result.ok, true);
  assert.equal(result.account.source, 'supabase-edge-auth');
  assert.equal(result.session.source, 'supabase-edge-auth');
  assert.equal(result.session.passKey, 'AB12', 'Phase 1 must preserve the existing downstream PASS KEY session contract');

  if (process.env.CI === 'true') {
    const response = await fetch('https://josvoltpktvwysrasffq.supabase.co/functions/v1/kinojo-member-auth', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://kinojo.info',
      },
      body: JSON.stringify({ action: 'health' }),
    });
    const data = await response.json();
    assert.equal(response.status, 200, `auth Edge health HTTP ${response.status}`);
    assert.equal(data.ok, true);
    assert.equal(data.service, 'kinojo-member-auth');
    assert.equal(data.authBoundary, 'SERVER_EDGE');
    assert.equal(data.tool, 'KINOJO_WEB');
    assert.equal(response.headers.get('x-kinojo-auth-boundary'), 'KINOJO_MEMBER_AUTH_EDGE_V1');
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://kinojo.info');
    console.log('KINOJO member auth Edge live health: PASS');
  }
}

verifyAuthEdgeContract()
  .then(() => console.log('KINOJO auth timing, Edge boundary and public shell entrypoints: PASS'))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
