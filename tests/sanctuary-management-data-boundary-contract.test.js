const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const pages = ['sanctuary/index.html', 'm/sanctuary/index.html'];
for (const page of pages) {
  const html = read(page);
  for (const token of [
    'noindex,nofollow,noarchive',
    'sanctuary-management-page-bar',
    'id="sanctuaryManagementScope"',
    'id="sanctuaryManagementTeamList"',
    'kinojo-supabase-features.js?cache=2026083102',
    'sanctuary-management.js?cache=2026083030',
    'sanctuary-management-draft.js?cache=2026083030',
    'sanctuary-management-support.js?cache=2026082923',
  ]) assert.ok(html.includes(token), `${page}: missing ${token}`);
  assert.equal(html.includes('kinojo-sanctuary-tabs'), false, `${page}: legacy sanctuary tabs remain in the management subbar`);
  assert.equal(html.includes('관리 범위'), false, `${page}: legacy management scope label remains`);
  assert.equal(html.includes('SanctuaryManagementMockAdapter'), false, `${page}: Stage 1 mock adapter remains`);
}

for (const [page,target] of [
  ['sanctuary-management/index.html','/sanctuary/'],
  ['m/sanctuary-management/index.html','/m/sanctuary/'],
  ['sanctuary-schedule/index.html','/sanctuary/'],
  ['m/sanctuary-schedule/index.html','/m/sanctuary/'],
]) {
  const html = read(page);
  assert.ok(html.includes(`new URL('${target}',location.origin)`), `${page}: canonical redirect target missing`);
  assert.ok(html.includes('location.replace(destination.pathname+destination.search+destination.hash)'), `${page}: query-safe redirect missing`);
  assert.equal(html.includes('kinojo-sanctuary-tabs'), false, `${page}: retired product UI remains`);
}

const feature = read('core/kinojo-supabase-features.js');
for (const token of [
  "invokeEdgeFunction('sanctuary-management'",
  "action:'bootstrap'",
  'sessionToken:optionalServerSessionCredential()',
  'getSanctuaryManagementBootstrap',
  'runSanctuaryManagementCommand',
  "action:'command'",
  'expectedRevision:revision',
]) assert.ok(feature.includes(token), `Supabase feature bridge missing ${token}`);
assert.equal(feature.includes("rpc('kinojo_sanctuary_management_bootstrap_v412'"), false, 'Browser must not call the service-role RPC directly');

const client = read('sanctuary-management/js/sanctuary-management.js');
for (const token of [
  "kind:'SERVER_ONLY'",
    'const API_VERSION=2.2',
  'const SCHEMA_VERSION=453',
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
          apiVersion: 1.8,
          schemaVersion: 446,
          serverTime: '2026-08-26T11:00:00Z',
          readEnabled: false,
          writeEnabled: false,
          globalWriteEnabled: true,
          rollout: { mode:'PILOT', globalWriteEnabled:true, effectiveWriteEnabled:false, pilotApproved:false, reasonCode:'PILOT_NOT_APPROVED', message:'승인된 시험 사용자만 신규 성역 관리 쓰기를 사용할 수 있습니다.' },
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
  assert.equal(adapter.apiVersion, 2.2);
  assert.equal(adapter.schemaVersion, 453);
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

  context.window.KinojoSupabase.getSanctuaryManagementBootstrap = async () => ({ apiVersion: 2, schemaVersion: 446, sanctuaries: [], teams: [] });
  await assert.rejects(adapter.bootstrap(), /계약 버전/);

  if (process.env.CI === 'true') {
    const response = await fetch('https://josvoltpktvwysrasffq.supabase.co/functions/v1/sanctuary-management', {
      headers: { origin: 'https://kinojo.info' },
    });
    const health = await response.json();
    assert.equal(response.status, 200, `sanctuary-management health HTTP ${response.status}`);
    assert.equal(health.ok, true);
    assert.equal(health.service, 'sanctuary-management');
    assert.equal(String(health.apiVersion), '2.2');
    assert.equal(Number(health.databaseContract), 452);
  }
}

verifyAdapter()
  .then(() => console.log('KINOJO sanctuary management Server-only data boundary: PASS'))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
