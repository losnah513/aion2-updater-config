const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const scriptPath = path.join(rootDir, 'legion-tree/js/legion-tree.js');
const script = fs.readFileSync(scriptPath, 'utf8');
const pc = fs.readFileSync(path.join(rootDir, 'legion-tree/index.html'), 'utf8');
const mobile = fs.readFileSync(path.join(rootDir, 'm/legion-tree/index.html'), 'utf8');

const treeRoot = {
  innerHTML: '',
  attributes: {},
  setAttribute(name, value) { this.attributes[name] = String(value); },
  addEventListener() {}
};
const status = { textContent: '', style: {} };
const document = {
  readyState: 'loading',
  addEventListener() {},
  querySelector(selector) {
    if (selector === '#legionTreeRoot') return treeRoot;
    if (selector === '#legionTreeStatus') return status;
    return null;
  },
  querySelectorAll() { return []; }
};
const dispatched = [];
const window = {
  dispatchEvent(event) { dispatched.push(event); }
};
const context = {
  window,
  document,
  console,
  Date,
  Map,
  Object,
  Promise,
  CustomEvent: function CustomEvent(type, options) {
    this.type = type;
    this.detail = options && options.detail;
  }
};
vm.createContext(context);
vm.runInContext(script, context, { filename: scriptPath });

assert(window.KinojoLegionTree, 'KinojoLegionTree contract must be exported');

const names = ['깡', '낮', '밤', '키나노동조합'];
const classes = ['검성', '치유성', '권성', '궁성'];
const payload = {
  ok: true,
  contract: 'web-legion-tree-v1',
  databaseContract: '365',
  generatedAt: '2026-08-21T00:00:00Z',
  legions: names.map((legionName, index) => ({
    legionName,
    legionOrder: index + 1,
    revision: 0,
    treeState: 'DEFAULT_FALLBACK',
    fallbackApplied: true,
    stageCount: 3,
    memberCount: 1,
    stages: [
      {
        stageNo: 1,
        stageName: '군단장',
        roles: [{ roleKey: `r${index}-1`, roleName: '군단장', slotNo: 1, maxMembers: 1, groups: [] }]
      },
      {
        stageNo: 2,
        stageName: '엘리트장교',
        roles: [{
          roleKey: `r${index}-2`,
          roleName: '엘리트장교',
          slotNo: 1,
          maxMembers: null,
          groups: [{
            groupKey: `g${index}-empty`,
            groupName: '엘리트장교',
            sortOrder: 1,
            members: []
          }]
        }]
      },
      {
        stageNo: 3,
        stageName: '군단병',
        roles: [{
          roleKey: `r${index}-3`,
          roleName: '군단병',
          slotNo: 1,
          maxMembers: null,
          groups: [{
            groupKey: `g${index}-1`,
            groupName: '군단병',
            sortOrder: 1,
            members: [{
              characterId: index + 101,
              characterName: `실제구성원${index + 1}`,
              className: classes[index],
              isMain: index % 2 === 0,
              mainCharacterId: index % 2 === 0 ? index + 101 : 101,
              mainCharacterName: index % 2 === 0 ? `실제구성원${index + 1}` : '실제구성원1',
              serverId: 2002,
              serverName: '지켈',
              listRow: index + 2
            }]
          }]
        }]
      }
    ],
    unassignedMembers: []
  }))
};

const model = window.KinojoLegionTree.normalizeTreePayload(payload);
assert.deepStrictEqual(Array.from(model.legions, item => item.legionName), names);
const markup = window.KinojoLegionTree.renderTreeMarkup(model);

for (const name of names) {
  assert(markup.includes(`data-legion-name="${name}"`), `${name} legion must render`);
}
assert.strictEqual((markup.match(/data-tree-state="DEFAULT_FALLBACK"/g) || []).length, 4);
assert.strictEqual((markup.match(/data-fallback-applied="true"/g) || []).length, 4);
assert.strictEqual((markup.match(/class="legion-tree-fallback-badge">기본 단계/g) || []).length, 4);
assert.strictEqual((markup.match(/class="legion-tree-empty-role"/g) || []).length, 8);
assert.strictEqual((markup.match(/data-is-empty="true"/g) || []).length, 8);
assert.strictEqual((markup.match(/>지정 전<\/p>/g) || []).length, 8);
for (let index = 1; index <= 4; index += 1) {
  assert(markup.includes(`실제구성원${index}`), `member ${index} must render`);
}
assert.strictEqual((markup.match(/class="legion-tree-character /g) || []).length, 4);
assert(markup.includes('/assets/images/classes/class_icon_gladiator.png'));
assert(markup.includes('/assets/images/classes/class_icon_cleric.png'));
assert(!markup.includes('본캐예시'));
assert(!markup.includes('data-preview-card'));

assert.throws(
  () => window.KinojoLegionTree.normalizeTreePayload({ ...payload, legions: payload.legions.slice(0, 3) }),
  /LEGION_TREE_REQUIRED_LEGION_MISSING/
);
assert.throws(
  () => window.KinojoLegionTree.normalizeTreePayload({
    ...payload,
    legions: payload.legions.map((legion, index) => index ? legion : { ...legion, fallbackApplied: false })
  }),
  /LEGION_TREE_FALLBACK_STATE_INVALID/
);
assert.throws(
  () => window.KinojoLegionTree.normalizeTreePayload({
    ...payload,
    legions: payload.legions.map((legion, index) => index ? legion : { ...legion, stages: [] })
  }),
  /LEGION_TREE_STAGES_EMPTY/
);

const rpcCalls = [];
window.KinojoSupabase = {
  async rpc(name, params) {
    rpcCalls.push({ name, params });
    return payload;
  }
};

(async () => {
  const loaded = await window.KinojoLegionTree.loadTreeData();
  assert(loaded, 'tree load must succeed');
  assert.strictEqual(JSON.stringify(rpcCalls), JSON.stringify([{ name: 'kinojo_web_get_legion_tree', params: {} }]));
  assert(treeRoot.innerHTML.includes('실제구성원4'));
  assert.strictEqual(treeRoot.attributes['aria-busy'], 'false');
  assert(status.textContent.includes('레기온 4개'));
  assert(status.textContent.includes('구성원 4명'));
  assert(dispatched.some(event => event.type === 'kinojo:page-time'));

  for (const html of [pc, mobile]) {
    assert(html.includes('id="legionTreeRoot"'));
    assert(html.includes('Server 레기온 데이터를 불러오는 중'));
    assert(!html.includes('data-preview-card'));
    assert(!html.includes('본캐예시'));
    assert(html.includes('cache=2026082401'));
    assert(!html.includes('cache=2026082101'));
  }

  assert(script.includes("kinojo_web_legion_tree_server_reference_v372"));
  assert(script.includes("kinojo_web_get_legion_tree"));
  assert(script.includes("if(altName&&!mainName)"));
  assert(script.includes("renderServerOptions(normalized)"));

  console.log('legion-tree data render contract: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
