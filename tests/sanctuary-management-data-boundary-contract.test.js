const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const pages = ['sanctuary-management/index.html', 'm/sanctuary-management/index.html'];
for (const page of pages) {
  const html = read(page);
  for (const token of [
    'noindex,nofollow,noarchive',
    'sanctuary-management-page-bar',
    'id="sanctuaryManagementScope"',
    'id="sanctuaryManagementTeamList"',
    'kinojo-supabase-features.js?cache=2026082808',
    'sanctuary-management.js?cache=2026082811',
    'sanctuary-management-draft.js?cache=2026082811',
    'sanctuary-management-support.js?cache=2026082808',
  ]) assert.ok(html.includes(token), `${page}: missing ${token}`);
  assert.equal(html.includes('kinojo-sanctuary-tabs'), false, `${page}: legacy sanctuary tabs remain in the management subbar`);
  assert.equal(html.includes('관리 범위'), false, `${page}: legacy management scope label remains`);
  assert.equal(html.includes('SanctuaryManagementMockAdapter'), false, `${page}: Stage 1 mock adapter remains`);
}

for (const page of ['sanctuary/index.html', 'm/sanctuary/index.html', 'sanctuary-schedule/index.html', 'm/sanctuary-schedule/index.html']) {
  const html = read(page);
  assert.ok(html.includes('kinojo-sanctuary-navigation.css?cache=2026082603'), `${page}: shared sanctuary tabs CSS missing`);
  assert.ok(html.includes('data-kinojo-sanctuary-management-required'), `${page}: permission-gated management tab missing`);
}

const feature = read('core/kinojo-supabase-features.js');
for (const token of [
  "invokeEdgeFunction('sanctuary-management'",
  "action:'bootstrap'",
  'sessionToken:currentServerSessionCredential()',
  'getSanctuaryManagementBootstrap',
  'runSanctuaryManagementCommand',
  "action:'command'",
  'expectedRevision:revision',
]) assert.ok(feature.includes(token), `Supabase feature bridge missing ${token}`);
assert.equal(feature.includes("rpc('kinojo_sanctuary_management_bootstrap_v412'"), false, 'Browser must not call the service-role RPC directly');

const client = read('sanctuary-management/js/sanctuary-management.js');
for (const token of [
  "kind:'SERVER_ONLY'",
  'const API_VERSION=1.4',
  'const SCHEMA_VERSION=436',
  'getSanctuaryManagementBootstrap',
  'runSanctuaryManagementCommand',
  "teamId?'UPDATE_TEAM_DRAFT':'CREATE_TEAM'",
  'validateBootstrap',
  'window.KinojoSanctuaryManagementData=ServerAdapter',
  'data.readEnabled===true',
  'data.writeEnabled===true',
]) assert.ok(client.includes(token), `Management client boundary missing ${token}`);
for (const forbidden of [
  'SanctuaryManagementMockAdapter',
  'KinojoApi.getAction',
  'KinojoApi.postAction',
  'google.script.run',
  'fetch(',
  'lookup-sheet-bridge',
]) assert.equal(client.includes(forbidden), false, `Management client must not use ${forbidden}`);

const listeners = new Map();
const calls = [];
const context = {
  window: {
    KinojoSupabase: {
      async getSanctuaryManagementBootstrap() {
        calls.push('bootstrap');
        return {
          apiVersion: 1.4,
          schemaVersion: 436,
          serverTime: '2026-08-26T11:00:00Z',
          readEnabled: false,
          writeEnabled: false,
          actor: { memberId: 7 },
          sanctuaries: [{ id: 4, code: 'sanctuary4', name: '서버 이름', managementVisible: true }],
          teams: [],
        };
      },
      async runSanctuaryManagementCommand(command,payload,expectedRevision,requestKey) {
        calls.push({ command, payload, expectedRevision, requestKey });
        return { ok:true, action:command, teamId:31, revision:expectedRevision?expectedRevision+1:1 };
      },
    },
  },
  document: {
    readyState: 'loading',
    addEventListener(name, callback) { listeners.set(name, callback); },
    getElementById() { return null; },
  },
  location: { href: 'https://kinojo.info/sanctuary-management/', search: '', pathname: '/sanctuary-management/', hash: '' },
  history: { replaceState() {} },
  URL,
  URLSearchParams,
  CustomEvent: class CustomEvent {},
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
vm.runInNewContext(client, context, { filename: 'sanctuary-management/js/sanctuary-management.js' });

async function verifyAdapter() {
  const adapter = context.window.KinojoSanctuaryManagementData;
  assert.equal(adapter.kind, 'SERVER_ONLY');
  assert.equal(adapter.apiVersion, 1.4);
  assert.equal(adapter.schemaVersion, 436);
  const data = await adapter.bootstrap();
  assert.deepEqual(calls, ['bootstrap']);
  assert.equal(data.readEnabled, false);
  assert.equal(data.writeEnabled, false);
  assert.equal(data.sanctuaries[0].name, '서버 이름');
  assert.equal(data.teams.length, 0);
  assert.ok(listeners.has('DOMContentLoaded'), 'Management client boot binding is missing');

  const command=await adapter.command('UPDATE_TEAM_DRAFT',{teamId:31},4,'sm-contract-1234');
  assert.equal(command.revision,5);
  assert.equal(calls[1].expectedRevision,4);

  context.window.KinojoSupabase.getSanctuaryManagementBootstrap = async () => ({ apiVersion: 2, schemaVersion: 436, sanctuaries: [], teams: [] });
  await assert.rejects(adapter.bootstrap(), /계약 버전/);

  if (process.env.CI === 'true') {
    const response = await fetch('https://josvoltpktvwysrasffq.supabase.co/functions/v1/sanctuary-management', {
      headers: { origin: 'https://kinojo.info' },
    });
    const health = await response.json();
    assert.equal(response.status, 200, `sanctuary-management health HTTP ${response.status}`);
    assert.equal(health.ok, true);
    assert.equal(health.service, 'sanctuary-management');
    assert.equal(String(health.apiVersion), '1.4');
    assert.equal(Number(health.databaseContract), 436);
  }
}

verifyAdapter()
  .then(() => console.log('KINOJO sanctuary management Server-only data boundary: PASS'))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
