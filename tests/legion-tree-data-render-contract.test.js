const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const scriptPath = path.join(rootDir, 'legion-tree/js/legion-tree.js');
const script = fs.readFileSync(scriptPath, 'utf8');
const pc = fs.readFileSync(path.join(rootDir, 'legion-tree/index.html'), 'utf8');
const mobile = fs.readFileSync(path.join(rootDir, 'm/legion-tree/index.html'), 'utf8');
const css = fs.readFileSync(path.join(rootDir, 'legion-tree/css/legion-tree.css'), 'utf8');
const features = fs.readFileSync(path.join(rootDir, 'core/kinojo-supabase-features.js'), 'utf8');
const workflow = fs.readFileSync(path.join(rootDir, '.github/workflows/verify-legion-tree-pages.yml'), 'utf8');

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
const classIconCases = [
  ['수호성', 'templar'],
  ['검성', 'gladiator'],
  ['살성', 'assassin'],
  ['궁성', 'ranger'],
  ['마도성', 'sorcerer'],
  ['정령성', 'elementalist'],
  ['치유성', 'cleric'],
  ['호법성', 'chanter'],
  ['권성', 'fighter']
];
function memberFixture(characterId, characterName, options = {}) {
  const isMain = options.isMain !== false;
  return {
    characterId,
    characterName,
    className: options.className || '검성',
    isMain,
    mainCharacterId: isMain ? characterId : (options.mainCharacterId || 700),
    mainCharacterName: isMain ? characterName : (options.mainCharacterName || '주인본캐'),
    serverId: 2002,
    serverName: '지켈',
    listRow: characterId + 2
  };
}
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

function fakeElement(initial = {}) {
  const listeners = {};
  const attributes = {};
  const style = {
    removeProperty(name) { delete this[name]; }
  };
  return Object.assign({
    value: '',
    textContent: '',
    innerHTML: '',
    hidden: false,
    disabled: false,
    dataset: {},
    style,
    attributes,
    focused: false,
    setAttribute(name, value) { attributes[name] = String(value); },
    removeAttribute(name) { delete attributes[name]; },
    addEventListener(type, listener) { listeners[type] = listener; },
    focus() { this.focused = true; },
    click() { return listeners.click && listeners.click({ currentTarget: this, target: this }); },
    input() { return listeners.input && listeners.input({ currentTarget: this, target: this }); },
    closest() { return null; },
    _listeners: listeners
  }, initial);
}

function createAddHarness() {
  const main = fakeElement();
  const alt = fakeElement();
  const elyos = fakeElement();
  const asmodian = fakeElement();
  const add = fakeElement({ disabled: true });
  const reset = fakeElement();
  const progress = fakeElement({ hidden: true });
  const harnessStatus = fakeElement();
  const harnessTreeRoot = fakeElement({
    addEventListener() {}
  });
  const server = fakeElement({ children: [] });
  Object.defineProperty(server, 'firstChild', {
    get() { return this.children[0] || null; }
  });
  server.appendChild = function appendChild(child) { this.children.push(child); return child; };
  server.removeChild = function removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    return child;
  };

  const elements = {
    '#legionTreeMainName': main,
    '#legionTreeAltName': alt,
    '#legionTreeRaceElyos': elyos,
    '#legionTreeRaceAsmodian': asmodian,
    '#legionTreeServer': server,
    '#legionTreeAddBtn': add,
    '#legionTreeResetBtn': reset,
    '#legionTreeAddProgress': progress,
    '#legionTreeStatus': harnessStatus,
    '#legionTreeRoot': harnessTreeRoot
  };
  let domReady;
  const harnessDocument = {
    readyState: 'loading',
    addEventListener(type, listener) { if (type === 'DOMContentLoaded') domReady = listener; },
    querySelector(selector) { return elements[selector] || null; },
    querySelectorAll() { return []; },
    createElement(tagName) { return fakeElement({ tagName: String(tagName).toUpperCase() }); }
  };
  const addRequests = [];
  let addImplementation;
  let runtimeImplementation;
  let treeLoads = 0;
  const harnessWindow = {
    dispatchEvent() {},
    KinojoSupabase: {
      async rpc(name) {
        if (name === 'kinojo_web_legion_tree_server_reference_v372') {
          return {
            ok: true,
            contract: 'web-legion-tree-server-reference-v1',
            servers: [
              { serverId: 1001, raceId: 1, serverName: '시엘', shortName: '시엘' },
              { serverId: 2001, raceId: 2, serverName: '이스라펠', shortName: '이스' }
            ]
          };
        }
        if (name === 'kinojo_web_get_legion_tree') {
          treeLoads += 1;
          return payload;
        }
        throw new Error(`unexpected RPC ${name}`);
      },
      async addLegionTreeCharacter(request) {
        addRequests.push(request);
        return addImplementation(request);
      },
      async runtimeGetStatus() {
        return runtimeImplementation();
      }
    }
  };
  const harnessContext = {
    window: harnessWindow,
    document: harnessDocument,
    console,
    Date,
    Map,
    Object,
    Promise,
    setTimeout,
    clearTimeout,
    CustomEvent: function CustomEvent(type, options) {
      this.type = type;
      this.detail = options && options.detail;
    }
  };
  vm.createContext(harnessContext);
  vm.runInContext(script, harnessContext, { filename: scriptPath });

  async function start() {
    domReady();
    await new Promise(resolve => setTimeout(resolve, 0));
    elyos.click();
    server.value = '1001';
  }

  return {
    api: harnessWindow.KinojoLegionTree,
    elements,
    addRequests,
    start,
    getTreeLoads: () => treeLoads,
    setAddImplementation: value => { addImplementation = value; },
    setRuntimeImplementation: value => { runtimeImplementation = value; }
  };
}

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

for (const [className, fileName] of classIconCases) {
  const expectedPath = `/assets/images/classes/class_icon_${fileName}.png`;
  assert.strictEqual(window.KinojoLegionTree.classIconPath(className), expectedPath);
  assert(fs.existsSync(path.join(rootDir, expectedPath.slice(1))), `${className} shared icon asset must exist`);
}
assert.strictEqual(window.KinojoLegionTree.classIconPath('검 성'), '/assets/images/classes/class_icon_gladiator.png');
assert.strictEqual(window.KinojoLegionTree.classIconPath('치유성 (주력)'), '/assets/images/classes/class_icon_cleric.png');
assert.strictEqual(window.KinojoLegionTree.classIconPath('미확인 직업'), '');
assert.strictEqual(window.KinojoLegionTree.classIconPath(''), '');

const unknownClassPayload = JSON.parse(JSON.stringify(payload));
unknownClassPayload.legions[0].stages[2].roles[0].groups[0].members[0].className = '미확인 직업';
const unknownClassMarkup = window.KinojoLegionTree.renderTreeMarkup(
  window.KinojoLegionTree.normalizeTreePayload(unknownClassPayload)
);
assert.strictEqual((unknownClassMarkup.match(/class="legion-tree-class-fallback"/g) || []).length, 1);
assert(!unknownClassMarkup.includes('class_icon_undefined'));

const nameStatePayload = JSON.parse(JSON.stringify(payload));
nameStatePayload.legions[0].memberCount = 3;
nameStatePayload.legions[0].stages[2].roles[0].groups[0].members = [
  memberFixture(701, '가나다라마'),
  memberFixture(702, '가나다라마바', { isMain: false }),
  memberFixture(703, '이름<&>"\'', { isMain: false, mainCharacterId: 701, mainCharacterName: '가나다라마' })
];
const nameStateMarkup = window.KinojoLegionTree.renderTreeMarkup(
  window.KinojoLegionTree.normalizeTreePayload(nameStatePayload)
);
assert(nameStateMarkup.includes('<span class="legion-tree-name" data-name-overflow="false">가나다라마</span>'));
assert(nameStateMarkup.includes('<span class="legion-tree-name is-faded" data-name-overflow="true">가나다라마바</span>'));
assert(nameStateMarkup.includes('data-character-name="이름&lt;&amp;&gt;&quot;&#39;"'));
assert(nameStateMarkup.includes('title="이름&lt;&amp;&gt;&quot;&#39;"'));
assert(nameStateMarkup.includes('aria-label="이름&lt;&amp;&gt;&quot;&#39; · 검성 · 부캐"'));
assert(nameStateMarkup.includes('>이름&lt;&amp;&gt;&quot;&#39;</span>'));
assert.strictEqual((nameStateMarkup.match(/class="legion-tree-character is-main"/g) || []).length, 2);
assert.strictEqual((nameStateMarkup.match(/class="legion-tree-character is-alt"/g) || []).length, 4);
assert(nameStateMarkup.includes('data-is-main="false" data-main-character-id="701" data-main-character-name="가나다라마"'));
assert(nameStateMarkup.includes('<span class="legion-tree-kind">본캐</span>'));
assert(nameStateMarkup.includes('<span class="legion-tree-kind">부캐</span>'));

const orderedPayload = JSON.parse(JSON.stringify(payload));
orderedPayload.legions[0].stages[2].roles[0].groups = [
  { groupKey: 'group-30', groupName: '30', sortOrder: 30, members: [memberFixture(803, '서버첫째'), memberFixture(801, '서버둘째')] },
  { groupKey: 'group-10', groupName: '10', sortOrder: 10, members: [memberFixture(810, '열번째')] },
  { groupKey: 'group-20', groupName: '20', sortOrder: 20, members: [memberFixture(820, '스무번째')] }
];
const orderedModel = window.KinojoLegionTree.normalizeTreePayload(orderedPayload);
const orderedGroups = orderedModel.legions[0].stages[2].roles[0].groups;
assert.deepStrictEqual(Array.from(orderedGroups, group => group.groupKey), ['group-10', 'group-20', 'group-30']);
assert.deepStrictEqual(Array.from(orderedGroups[2].members, member => member.characterId), [803, 801]);
const orderedMarkup = window.KinojoLegionTree.renderTreeMarkup(orderedModel);
assert(orderedMarkup.indexOf('data-group-key="group-10"') < orderedMarkup.indexOf('data-group-key="group-20"'));
assert(orderedMarkup.indexOf('data-character-id="803"') < orderedMarkup.indexOf('data-character-id="801"'));

const fiveBranchPayload = JSON.parse(JSON.stringify(payload));
fiveBranchPayload.legions[0].stages[2].roles[0].groups = Array.from({ length: 5 }, (_, index) => ({
  groupKey: `branch-${index + 1}`,
  groupName: `분기 ${index + 1}`,
  sortOrder: index + 1,
  members: [memberFixture(900 + index, `분기원${index + 1}`)]
}));
const fiveBranchMarkup = window.KinojoLegionTree.renderTreeMarkup(
  window.KinojoLegionTree.normalizeTreePayload(fiveBranchPayload)
);
assert(fiveBranchMarkup.includes('class="legion-tree-role-groups" data-branch-count="5"'));
assert.strictEqual((fiveBranchMarkup.match(/class="legion-tree-member-grid" data-branch-count="5"/g) || []).length, 5);

const nameBaseRule = css.match(/\.legion-tree-name\{([^}]*)\}/);
const nameFadeRule = css.match(/\.legion-tree-name\.is-faded\{([^}]*)\}/);
assert(nameBaseRule && nameBaseRule[1].includes('max-width:5em'));
assert(nameBaseRule && !nameBaseRule[1].includes('mask-image'));
assert(nameFadeRule && nameFadeRule[1].includes('-webkit-mask-image:linear-gradient'));
assert(nameFadeRule && nameFadeRule[1].includes('mask-image:linear-gradient'));
assert(!css.includes('text-overflow:ellipsis'));
assert(css.includes('.legion-tree-member-grid{width:100%;display:grid;grid-template-columns:repeat(5,minmax(0,124px))'));
assert(css.includes('.legion-tree-member-grid[data-branch-count="2"]{grid-template-columns:repeat(3,minmax(0,124px))}'));
assert(css.includes('.legion-tree-member-grid[data-branch-count="3"],.legion-tree-member-grid[data-branch-count="4"],.legion-tree-member-grid[data-branch-count="5"]{grid-template-columns:repeat(2,minmax(0,124px))}'));
const mobileCss = css.slice(css.indexOf('@media(max-width:640px)'));
assert(mobileCss.includes('.legion-tree-member-grid[data-branch-count="1"],.legion-tree-member-grid[data-branch-count="2"]{grid-template-columns:repeat(2,124px)'));
assert(mobileCss.includes('.legion-tree-member-grid[data-branch-count="3"],.legion-tree-member-grid[data-branch-count="4"],.legion-tree-member-grid[data-branch-count="5"]{grid-template-columns:124px'));
assert(mobileCss.includes('.legion-tree-role-groups[data-branch-count="2"],.legion-tree-role-groups[data-branch-count="3"],.legion-tree-role-groups[data-branch-count="4"],.legion-tree-role-groups[data-branch-count="5"]{grid-template-columns:1fr}'));

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
    assert(html.includes('id="legionTreeAddProgress"'));
    assert(html.includes('aria-label="캐릭터 추가 진행 상태"'));
    assert(html.includes('Server 레기온 데이터를 불러오는 중'));
    assert(!html.includes('data-preview-card'));
    assert(!html.includes('본캐예시'));
    assert(html.includes('legion-tree.css?cache=2026082403'));
    assert(html.includes('legion-tree.js?cache=2026082403'));
    assert(html.includes('kinojo-supabase-features.js?cache=2026082802'));
    assert(!html.includes('legion-tree.js?cache=2026082402'));
  }

  assert(script.includes("kinojo_web_legion_tree_server_reference_v372"));
  assert(script.includes("kinojo_web_get_legion_tree"));
  assert(script.includes("if(!mainName)"));
  assert(script.includes("renderServerOptions(normalized)"));
  assert(script.includes("ADD_ACCEPTED_CODE='ADD_QUEUE_ACCEPTED'"));
  assert(script.includes("state==='completed'&&stage==='SERVER_QUEUE_LIST_SYNC_DONE'"));
  assert(script.includes("const reloaded=await loadTreeData()"));
  assert(css.includes('.legion-tree-add-progress'));
  assert(css.includes('grid-template-columns:repeat(5,minmax(76px,1fr))'));
  assert(css.includes('li[data-state="done"]'));
  assert(css.includes('li[data-state="error"]'));

  const addWrapper = features.match(/async function addLegionTreeCharacter\(extra=\{\}\)\{([\s\S]*?)\n  \}/);
  assert(addWrapper, 'Legion Tree Server add wrapper missing');
  assert(addWrapper[1].includes('currentServerSessionCredential()'));
  assert(addWrapper[1].includes("invokeEdgeFunction('kinojo-legion-tree'"));
  assert(addWrapper[1].includes("action:'character-add'"));
  assert(addWrapper[1].includes('mainCharacterName'));
  assert(addWrapper[1].includes('altCharacterName'));
  assert(addWrapper[1].includes('serverId'));
  assert(!addWrapper[1].includes('passKey'));
  assert(!addWrapper[1].includes('memberId'));
  assert(features.includes('addLegionTreeCharacter,'));
  assert(workflow.includes('- "core/kinojo-supabase-features.js"'));
  assert(workflow.includes('node --check core/kinojo-supabase-features.js'));
  assert((workflow.match(/"core\/kinojo-supabase-features\.js"/g) || []).length >= 2);

  const addHarness = createAddHarness();
  await addHarness.start();
  assert.strictEqual(addHarness.api.progressIndexForRuntime({ status: 'running', stage: 'OFFICIAL_INFO' }), 0);
  assert.strictEqual(addHarness.api.progressIndexForRuntime({ status: 'running', stage: 'MASTER_SYNC' }), 1);
  assert.strictEqual(addHarness.api.progressIndexForRuntime({ status: 'running', stage: 'LIST_SHEET_EXPORT' }), 2);
  assert.strictEqual(addHarness.api.progressIndexForRuntime({ status: 'completed', stage: 'SERVER_QUEUE_LIST_SYNC_DONE' }), 4);

  let sessionNo = 0;
  addHarness.setAddImplementation(async () => {
    sessionNo += 1;
    return {
      ok: true,
      contract: 'legion-tree-character-add-v1',
      code: 'ADD_QUEUE_ACCEPTED',
      message: '캐릭터 조회를 Server Worker에 인계했습니다.',
      queue: { sessionId: `legion-add-${sessionNo}` }
    };
  });
  addHarness.setRuntimeImplementation(async () => ({
    sessionId: `legion-add-${sessionNo}`,
    status: 'completed',
    stage: 'SERVER_QUEUE_LIST_SYNC_DONE',
    message: '공식 조회와 Google list readback 완료'
  }));

  const mainInput = addHarness.elements['#legionTreeMainName'];
  const altInput = addHarness.elements['#legionTreeAltName'];
  const serverInput = addHarness.elements['#legionTreeServer'];
  const addButton = addHarness.elements['#legionTreeAddBtn'];
  const resetButton = addHarness.elements['#legionTreeResetBtn'];
  const addProgress = addHarness.elements['#legionTreeAddProgress'];
  const addStatus = addHarness.elements['#legionTreeStatus'];

  mainInput.value = '본캐추가';
  altInput.value = '';
  serverInput.value = '1001';
  const treeLoadsBeforeMain = addHarness.getTreeLoads();
  assert.strictEqual(await addHarness.api.handleAdd(), true, 'main-only add must complete');
  assert.strictEqual(JSON.stringify(addHarness.addRequests[0]), JSON.stringify({
    mainCharacterName: '본캐추가',
    altCharacterName: '',
    serverId: 1001
  }));
  assert.strictEqual(addHarness.getTreeLoads(), treeLoadsBeforeMain + 1, 'tree must reload after completed add');
  assert.strictEqual((addProgress.innerHTML.match(/data-state="done"/g) || []).length, 5);
  assert(addProgress.innerHTML.includes('공식 확인'));
  assert(addProgress.innerHTML.includes('정보 반영'));
  assert(addProgress.innerHTML.includes('list 반영'));
  assert(addProgress.innerHTML.includes('readback'));
  assert(addProgress.innerHTML.includes('완료'));
  assert(addStatus.textContent.includes('재조회가 완료'));
  assert.strictEqual(addButton.disabled, false);
  assert.strictEqual(resetButton.disabled, false);

  mainInput.value = '본캐관계';
  altInput.value = '부캐추가';
  serverInput.value = '1001';
  assert.strictEqual(await addHarness.api.handleAdd(), true, 'main+alt add must complete');
  assert.strictEqual(JSON.stringify(addHarness.addRequests[1]), JSON.stringify({
    mainCharacterName: '본캐관계',
    altCharacterName: '부캐추가',
    serverId: 1001
  }));

  const callsBeforeAltOnly = addHarness.addRequests.length;
  mainInput.value = '';
  altInput.value = '부캐단독';
  serverInput.value = '1001';
  mainInput.focused = false;
  assert.strictEqual(await addHarness.api.handleAdd(), false, 'alt-only must fail before network');
  assert.strictEqual(addHarness.addRequests.length, callsBeforeAltOnly, 'alt-only must make network 0');
  assert.strictEqual(mainInput.attributes['aria-invalid'], 'true');
  assert.strictEqual(mainInput.focused, true);
  assert.strictEqual(addStatus.textContent, '본캐 이름을 입력해 주세요.');

  let releaseAccepted;
  addHarness.setAddImplementation(() => new Promise(resolve => { releaseAccepted = resolve; }));
  mainInput.value = '중복클릭';
  altInput.value = '';
  serverInput.value = '1001';
  const duplicateCallsBefore = addHarness.addRequests.length;
  const firstClick = addHarness.api.handleAdd();
  const secondClick = addHarness.api.handleAdd();
  assert.strictEqual(await secondClick, false, 'second click while running must be ignored');
  assert.strictEqual(addHarness.addRequests.length, duplicateCallsBefore + 1, 'duplicate click must make one request');
  assert.strictEqual(addButton.disabled, true);
  assert.strictEqual(resetButton.disabled, true);
  sessionNo += 1;
  releaseAccepted({
    ok: true,
    contract: 'legion-tree-character-add-v1',
    code: 'ADD_QUEUE_ACCEPTED',
    message: 'accepted',
    queue: { sessionId: `legion-add-${sessionNo}` }
  });
  assert.strictEqual(await firstClick, true);
  assert.strictEqual(addButton.disabled, false);

  addHarness.setAddImplementation(async () => {
    const error = new Error('이미 등록된 캐릭터입니다.');
    error.code = 'ALREADY_REGISTERED';
    error.data = { ok: false, code: 'ALREADY_REGISTERED', message: '이미 등록된 캐릭터입니다.' };
    throw error;
  });
  mainInput.value = '이미등록';
  altInput.value = '';
  serverInput.value = '1001';
  assert.strictEqual(await addHarness.api.handleAdd(), false);
  assert(addStatus.textContent.includes('이미 등록된 캐릭터'));
  assert.strictEqual((addProgress.innerHTML.match(/data-state="error"/g) || []).length, 1);

  mainInput.value = '초기화본캐';
  altInput.value = '초기화부캐';
  serverInput.value = '1001';
  assert.strictEqual(addHarness.api.resetInputs(), true);
  assert.strictEqual(mainInput.value, '');
  assert.strictEqual(altInput.value, '');
  assert.strictEqual(serverInput.value, '');
  assert.strictEqual(serverInput.disabled, true);
  assert.strictEqual(mainInput.attributes['aria-invalid'], undefined);
  assert.strictEqual(addProgress.hidden, true);
  assert.strictEqual(addProgress.innerHTML, '');

  console.log('legion-tree data render contract: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
