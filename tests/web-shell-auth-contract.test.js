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
const dispatchedEvents = [];
const context = {
  window: { dispatchEvent(event) { dispatchedEvents.push(event); } },
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
assert.equal(auth.SERVER_TOUCH_THROTTLE_MS, 5 * 60 * 1000, 'server session touch throttle must be five minutes');

const base = now;
assert.equal(auth.getIdleState({ lastActivityAt: base }, base + 24 * 60 * 1000 + 59_000).warning, false);
assert.equal(auth.getIdleState({ lastActivityAt: base }, base + 25 * 60 * 1000).warning, true);
assert.equal(auth.getIdleState({ lastActivityAt: base }, base + 29 * 60 * 1000).remainingMs, 60_000);
assert.equal(auth.getIdleState({ lastActivityAt: base }, base + 30 * 60 * 1000).expired, true);

const serverToken = 'kws_' + 'A'.repeat(43);
auth.setStoredSession({ token: serverToken, passKey: '000000', passCode: '000000' }, { passKey: '000000', passCode: '000000' });
assert.equal(JSON.parse(localStorage.getItem(auth.STORAGE_KEY)).passKey, undefined, 'stored session must not retain PASS KEY');
assert.equal(JSON.parse(localStorage.getItem(auth.ACCOUNT_KEY)).passCode, undefined, 'stored account must not retain PASS KEY');
now = base + 29 * 60 * 1000 + 59_000;
assert.ok(auth.getSession(), 'session must remain available before the absolute deadline');
now = base + 30 * 60 * 1000;
assert.equal(auth.getSession(), null, 'session must be cleared at the absolute deadline');
assert.equal(localStorage.getItem(auth.STORAGE_KEY), null, 'expired session storage must be removed');
const clearingEvent = dispatchedEvents.find(event => event.type === 'kinojo:auth-clearing');
assert.ok(clearingEvent, 'server session clear must emit a revoke handoff event');
assert.equal(clearingEvent.detail.session.token, serverToken);
assert.equal(clearingEvent.detail.reason, 'idle_expired_local');

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
    'kinojo-auth-session.js?cache=2026081801',
    'kinojo-auth-service.js?cache=2026081801',
    'kinojo-auth-ui.js?cache=2026081801',
  ]) {
    assert.ok(html.includes(token), `${page}: missing ${token}`);
  }
  assert.ok(html.includes('kinojo-common-ui.js?cache=2026082101'), `${page}: common UI cache missing`);
}

for (const page of ['admin/index.html', 'm/admin/index.html']) {
  const html = read(page);
  assert.ok(html.includes('kinojo-common-ui.js?cache=2026082101'), `${page}: common UI cache missing`);
  assert.ok(html.includes('kinojo-auth-session.js?cache=2026081801'), `${page}: stale auth session cache`);
  assert.ok(html.includes('kinojo-auth-ui.js?cache=2026081801'), `${page}: stale auth UI cache`);
}

for (const page of publicShellPages.concat(['admin/index.html', 'm/admin/index.html'])) {
  const html = read(page);
  assert.equal(html.includes('kinojo-common-ui.js?cache=2026081004'), false, `${page}: old common UI cache remains`);
  for (const stale of [
    'kinojo-auth-session.js?cache=2026080205', 'kinojo-auth-session.js?cache=2026081201',
    'kinojo-auth-service.js?cache=2026080205', 'kinojo-auth-service.js?cache=2026081601',
    'kinojo-auth-ui.js?cache=2026080205', 'kinojo-auth-ui.js?cache=2026081204',
  ]) assert.equal(html.includes(stale), false, `${page}: stale auth cache remains ${stale}`);
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
  assert.ok(html.includes('sanctuary-schedule.js?cache=2026081801'), `${page}: schedule JS cache missing`);
}

const schedule = read('sanctuary-schedule/js/sanctuary-schedule.js');
for (const token of ['adminSanctuaryScheduleConsole', 'adminSanctuaryScheduleSave', 'scheduleManagerEditor', 'SERVER AUTHORIZED']) {
  assert.ok(schedule.includes(token), `schedule manager contract missing: ${token}`);
}

const authServiceSource = read('core/kinojo-auth-service.js');
assert.ok(authServiceSource.includes("invokeEdgeFunction(AUTH_EDGE_NAME"), 'WEB PASS KEY login must call the dedicated auth Edge');
assert.ok(authServiceSource.includes("const AUTH_EDGE_NAME='kinojo-member-auth'"), 'dedicated auth Edge name is missing');
for (const token of ['KINOJO_WEB_AUTH_EDGE_V2', 'supabase-web-session-320', 'validateSession', 'touchSession', 'revokeSession', 'kinojo:auth-clearing']) {
  assert.ok(authServiceSource.includes(token), `server session auth contract missing ${token}`);
}
assert.equal(authServiceSource.includes('api.verifyPassKey(code)'), false, 'WEB login must not call the legacy direct verifier bridge');
assert.equal(authServiceSource.includes("rpc('kinojo_member_verify_session_264'"), false, 'WEB auth service must not call the verifier RPC directly');
assert.equal(authServiceSource.includes("token:'supabase:'"), false, 'browser-generated compatibility token must be removed');

const authUiSource = read('core/kinojo-auth-ui.js');
for (const token of ['SERVER_TOUCH_THROTTLE_MS', 'touchServerSession_', 'restoreServerSession_', '.touchSession?.(token)']) {
  assert.ok(authUiSource.includes(token), `auth UI server session contract missing ${token}`);
}

const supabaseClientSource = read('core/kinojo-supabase-client.js');
const edgeRouteContext = {
  window: {},
  location: { origin: 'https://kinojo.info' },
  fetch: async () => { throw new Error('routing contract must not call fetch'); },
  URL,
  URLSearchParams,
  Object,
  Number,
  String,
  JSON,
  Math,
  Array,
  Error,
  RegExp,
  Promise,
};
vm.runInNewContext(supabaseClientSource, edgeRouteContext, { filename: 'core/kinojo-supabase-client.js' });
const resolveEdgeFunctionName = edgeRouteContext.window.KinojoSupabaseClientCore.resolveEdgeFunctionName;
for (const [functionName, action, expected] of [
  ['lookup-sheet-bridge', 'prepareList', 'lookup-list-prepare'],
  ['lookup-sheet-bridge', 'syncList', 'lookup-list-sync'],
  ['lookup-sheet-bridge', 'adminBridgePing', 'sanctuary-sheet-bridge'],
  ['lookup-sheet-bridge', 'webSanctuaryRosterV312', 'sanctuary-roster-bridge'],
  ['lookup-sheet-bridge', 'unknown', 'lookup-sheet-bridge'],
  ['meter-admin-control', 'adminMeterConsole', 'meter-admin-control'],
]) {
  assert.equal(resolveEdgeFunctionName(functionName, { action }), expected, `${functionName}/${action}: direct Edge route mismatch`);
}

async function verifyAuthEdgeContract() {
  const calls = [];
  const listeners = new Map();
  const opaqueToken = 'kws_' + 'B'.repeat(43);
  const serviceContext = {
    window: {
      addEventListener(name, callback) { listeners.set(name, callback); },
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
      KinojoAuthSessionCore: {
        STORAGE_KEY: 'kinojo_login_session_v1',
        readJson() { return null; },
        getAccount() { return null; },
      },
      KinojoSupabaseClientCore: {
        async invokeEdgeFunction(name, body) {
          calls.push({ name, body });
          if (body.action === 'logout') return { ok: true, revoked: true, code: 'SESSION_REVOKED' };
          return {
            ok: true,
            tool: 'KINOJO_WEB',
            databaseContract: '320',
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
            session: {
              token: opaqueToken,
              issuedAt: '2026-08-16T10:00:00Z',
              lastActivityAt: '2026-08-16T10:00:00Z',
              expiresAt: '2026-08-16T10:30:00Z',
              idleTimeoutSeconds: 1800,
              serverSession: true,
              contractVersion: '320',
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
    RegExp,
  };
  vm.runInNewContext(authServiceSource, serviceContext, { filename: 'core/kinojo-auth-service.js' });
  const service = serviceContext.window.KinojoAuthService;
  const result = await service.verifyPassKey(' ab 12 ');
  assert.equal(calls.length, 1, 'auth Edge login must be invoked exactly once');
  assert.equal(calls[0].name, 'kinojo-member-auth');
  assert.equal(calls[0].body.action, 'login');
  assert.equal(calls[0].body.passKey, 'AB12');
  assert.equal(calls[0].body.clientVersion, 'KINOJO_WEB_AUTH_EDGE_V2');
  assert.equal(result.ok, true);
  assert.equal(result.account.source, 'supabase-web-session-320');
  assert.equal(result.session.source, 'supabase-web-session-320');
  assert.equal(result.session.token, opaqueToken, 'Server-issued opaque token must be stored');
  assert.equal(result.session.passKey, undefined, 'Server session must not persist PASS KEY');
  assert.equal(result.session.passCode, undefined, 'Server session must not persist PASS CODE');
  assert.equal(result.account.passKey, undefined, 'Account cache must not persist PASS KEY');
  assert.equal(service.isServerSessionToken(opaqueToken), true);
  assert.equal(service.isServerSessionToken('supabase:7:123'), false);

  await service.validateSession(opaqueToken);
  await service.touchSession(opaqueToken);
  await service.revokeSession(opaqueToken, 'test_logout');
  assert.deepEqual(calls.slice(1).map(call => call.body.action), ['validate', 'touch', 'logout']);
  assert.equal(calls[1].body.sessionToken, opaqueToken);
  assert.equal(calls[2].body.sessionToken, opaqueToken);
  assert.equal(calls[3].body.reason, 'test_logout');
  assert.ok(listeners.has('kinojo:auth-clearing'), 'auth clearing revoke listener must be installed');

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
    assert.equal(data.apiVersion, '2.0');
    assert.equal(data.databaseContract, '320');
    assert.equal(data.authBoundary, 'SERVER_EDGE_SESSION');
    assert.equal(data.tool, 'KINOJO_WEB');
    assert.deepEqual(data.actions, ['login', 'validate', 'touch', 'logout']);
    assert.equal(response.headers.get('x-kinojo-auth-boundary'), 'KINOJO_MEMBER_AUTH_EDGE_V2');
    assert.equal(response.headers.get('x-kinojo-auth-contract'), '320');
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://kinojo.info');
    console.log('KINOJO member auth Edge live server-session health: PASS');
  }
}

verifyAuthEdgeContract()
  .then(() => console.log('KINOJO auth timing, opaque Server session and public shell entrypoints: PASS'))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
