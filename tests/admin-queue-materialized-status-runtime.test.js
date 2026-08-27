const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'admin/js/admin-characters.js'), 'utf8');
const timers = [];
const storage = new Map();
const makeStorage = () => ({
  getItem: key => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
});

const state = {
  tab: 'characters',
  subtab: 'lookup',
  lookupSessionId: 'session-1',
  lookupSessionToken: '',
  lookupConsole: {active: true, sessionId: 'session-1'},
  lookupPollTimer: null,
};

const A = {
  state,
  $: () => null,
  $$: () => [],
  adminCharacter: async () => ({}),
  adminLookup: async action => {
    assert.equal(action, 'status');
    return {
      ok: true,
      active: false,
      sessionId: 'session-1',
      session: {status: 'completed'},
      progress: {total: 1, completedCount: 1, phases: []},
      message: '완료',
    };
  },
  adminAutomation: async () => ({ok: true, characterRefresh: {enabled: true, running: false}}),
  esc: value => String(value || ''),
  formatServerTime: value => String(value || ''),
  roleLevel: () => 5,
  setStatus: () => {},
  toast: () => {},
};

const document = {
  hidden: false,
  addEventListener: () => {},
  execCommand: () => true,
  body: {appendChild: () => {}},
  createElement: () => ({style: {},select: () => {},remove: () => {}}),
};

const sandbox = {
  window: {KinojoAdmin: A},
  document,
  localStorage: makeStorage(),
  sessionStorage: makeStorage(),
  navigator: {},
  console,
  Date,
  JSON,
  Math,
  Number,
  String,
  Boolean,
  Array,
  Object,
  Map,
  Set,
  Promise,
  setTimeout: (callback, delay) => {
    const timer = {callback, delay, cleared: false};
    timers.push(timer);
    return timer;
  },
  clearTimeout: timer => { if (timer) timer.cleared = true; },
  confirm: () => true,
};

vm.runInNewContext(source, sandbox, {filename: 'admin-characters.js'});

const duplicateNameRows = A.lookupTargetRoster({
  targets: [
    {targetId: 1, characterName: '동명이인', serverId: 101},
    {targetId: 2, characterName: '동명이인', serverId: 202},
  ],
}, {});
assert.equal(duplicateNameRows.length, 2, 'same character name on different servers must keep both target rows');
assert.notEqual(A.lookupTargetKey(duplicateNameRows[0]), A.lookupTargetKey(duplicateNameRows[1]));

A.startCharacterLookupPolling();
assert.equal(timers.length, 1);
assert.equal(timers[0].delay, 3000, 'foreground active polling must use 3 seconds');

(async () => {
  await timers[0].callback();
  assert.equal(state.lookupConsole.active, false);
  assert.equal(state.lookupPollTimer, null, 'terminal response must leave no scheduled poll');
  assert.equal(timers.length, 1, 'terminal response must schedule zero additional polls');

  state.lookupConsole = {active: true, sessionId: 'session-1'};
  document.hidden = true;
  A.startCharacterLookupPolling();
  assert.equal(timers.length, 2);
  assert.equal(timers[1].delay, 15000, 'background polling must back off to 15 seconds');
  console.log('admin queue materialized status runtime: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
