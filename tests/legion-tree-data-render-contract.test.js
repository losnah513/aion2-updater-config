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
const edge = fs.readFileSync(path.join(rootDir, 'supabase/functions/kinojo-legion-tree/index.ts'), 'utf8');
const crossServerMigration = fs.readFileSync(path.join(rootDir, 'supabase/migrations/20260831060000_legion_tree_cross_server_character_add_v454.sql'), 'utf8');
const listlessMigration = fs.readFileSync(path.join(rootDir, 'supabase/migrations/20260831064411_legion_tree_listless_character_add_v455.sql'), 'utf8');
const searchRateMigration = fs.readFileSync(path.join(rootDir, 'supabase/migrations/20260831085735_legion_tree_character_search_rate_gate_v457.sql'), 'utf8');
const candidateRegistrationMigration = fs.readFileSync(path.join(rootDir, 'supabase/migrations/20260831102651_legion_tree_candidate_registration_v458.sql'), 'utf8');
const worker = fs.readFileSync(path.join(rootDir, 'supabase/functions/character-refresh-worker/index.ts'), 'utf8');
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
    serverName: '지켈'
  };
}
const payload = {
  ok: true,
  contract: 'web-legion-tree-v1',
  databaseContract: '453',
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
              serverName: '지켈'
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
  const add = fakeElement({ disabled: true });
  const search = fakeElement({ disabled: true });
  const reset = fakeElement();
  const close = fakeElement();
  const progress = fakeElement({ hidden: true });
  const harnessStatus = fakeElement();
  const harnessTreeRoot = fakeElement();
  const searchRoot = fakeElement({ hidden: true });
  const mainResults = fakeElement();
  const altResults = fakeElement();
  const altResultsGroup = fakeElement({ hidden: true });
  const edit = fakeElement({ disabled: true });
  const elements = {
    '#legionTreeMainName': main,
    '#legionTreeAltName': alt,
    '#legionTreeSearchBtn': search,
    '#legionTreeAddBtn': add,
    '#legionTreeResetBtn': reset,
    '#legionTreeSearchCloseBtn': close,
    '#legionTreeSearchResults': searchRoot,
    '#legionTreeMainResults': mainResults,
    '#legionTreeAltResults': altResults,
    '#legionTreeAltResultsGroup': altResultsGroup,
    '#legionTreeEditBtn': edit,
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
  const searchRequests = [];
  let addImplementation;
  let searchImplementation;
  let runtimeImplementation;
  let treeLoads = 0;
  const detailOpens = [];
  const windowListeners = {};
  let managerAllowed = true;
  const harnessWindow = {
    dispatchEvent() {},
    addEventListener(type, listener) { windowListeners[type] = listener; },
    KinojoAuth: { getAccount() { return managerAllowed ? { role: 'MASTER', level: 4, canManage: true } : { role: 'MEMBER', level: 1, canManage: false }; } },
    KinojoPermissions: { canManage(account) { return account?.canManage === true; } },
    KinojoCharacterReaction: {
      open(options) { detailOpens.push(options); }
    },
    KinojoSupabase: {
      async rpc(name) {
        if (name === 'kinojo_web_legion_tree_server_reference_v372') {
          return {
            ok: true,
            contract: 'web-legion-tree-server-reference-v1',
            servers: [
              { serverId: 1001, raceId: 1, serverName: '시엘', shortName: '시엘' },
              { serverId: 2001, raceId: 2, serverName: '이스라펠', shortName: '이스' },
              { serverId: 2002, raceId: 2, serverName: '지켈', shortName: '지켈' },
              { serverId: 2004, raceId: 2, serverName: '루미엘', shortName: '루미' }
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
      async searchLegionTreeCharacters(request) {
        searchRequests.push(request);
        return searchImplementation(request);
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
  }

  return {
    api: harnessWindow.KinojoLegionTree,
    elements,
    addRequests,
    searchRequests,
    detailOpens,
    start,
    getTreeLoads: () => treeLoads,
    setAddImplementation: value => { addImplementation = value; },
    setSearchImplementation: value => { searchImplementation = value; },
    setRuntimeImplementation: value => { runtimeImplementation = value; },
    setManagerAllowed(value) { managerAllowed = value === true; windowListeners['kinojo:auth-changed']?.(); }
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
  parentRoleKey: index === 0 ? 'r0-3' : '',
  sortOrder: index + 1,
  members: [memberFixture(900 + index, `분기원${index + 1}`)]
}));
const fiveBranchMarkup = window.KinojoLegionTree.renderTreeMarkup(
  window.KinojoLegionTree.normalizeTreePayload(fiveBranchPayload)
);
assert(fiveBranchMarkup.includes('legion-tree-department is-unaffiliated'));
assert.strictEqual((fiveBranchMarkup.match(/class="legion-tree-member-grid" data-branch-count="2"/g) || []).length, 8);

const departmentPayload = JSON.parse(JSON.stringify(payload));
departmentPayload.legions[0].stages[1].stageName = '부서장';
departmentPayload.legions[0].stages[1].roles = [
  { roleKey: 'department-a', roleName: '기획부', slotNo: 1, maxMembers: null, groups: [] },
  { roleKey: 'department-b', roleName: '운영부', slotNo: 2, maxMembers: null, groups: [] }
];
departmentPayload.legions[0].stages[2].roles[0].groups = [
  { groupKey: 'department-a', groupName: '기획부', parentRoleKey: 'department-a', sortOrder: 1, members: [memberFixture(951, '기획원')] },
  { groupKey: 'department-b', groupName: '운영부', parentRoleKey: 'department-b', sortOrder: 2, members: [memberFixture(952, '운영원')] },
  { groupKey: 'independent', groupName: '소속 외', parentRoleKey: 'r0-3', sortOrder: 3, members: [memberFixture(953, '독립원')] }
];
const departmentMarkup = window.KinojoLegionTree.renderTreeMarkup(
  window.KinojoLegionTree.normalizeTreePayload(departmentPayload)
);
assert(departmentMarkup.includes('data-role-count="3"'));
assert(departmentMarkup.includes('<small>부서장</small><strong>기획부</strong>'));
assert(departmentMarkup.includes('legion-tree-department is-unaffiliated'));
assert(departmentMarkup.includes('기획원'));
assert(departmentMarkup.includes('운영원'));
assert(departmentMarkup.includes('독립원'));

const nameBaseRule = css.match(/\.legion-tree-name\{([^}]*)\}/);
const nameFadeRule = css.match(/\.legion-tree-name\.is-faded\{([^}]*)\}/);
assert(nameBaseRule && nameBaseRule[1].includes('max-width:5em'));
assert(nameBaseRule && !nameBaseRule[1].includes('mask-image'));
assert(nameFadeRule && nameFadeRule[1].includes('-webkit-mask-image:linear-gradient'));
assert(nameFadeRule && nameFadeRule[1].includes('mask-image:linear-gradient'));
assert(!nameBaseRule[1].includes('text-overflow:ellipsis'));
assert(css.includes('.legion-tree-member-grid{width:100%;display:grid;grid-template-columns:repeat(5,minmax(0,124px))'));
assert(css.includes('.legion-tree-member-grid[data-branch-count="2"]{grid-template-columns:repeat(3,minmax(0,124px))}'));
assert(css.includes('.legion-tree-member-grid[data-branch-count="3"],.legion-tree-member-grid[data-branch-count="4"],.legion-tree-member-grid[data-branch-count="5"]{grid-template-columns:repeat(2,minmax(0,124px))}'));
assert(css.includes('.legion-tree-stage-roles{position:relative;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))'));
assert(css.includes('.legion-tree-department-card'));
assert(css.includes('.legion-tree-department.is-unaffiliated'));
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
    assert(html.includes('id="legionTreeEditorRoot"'));
    assert(html.includes('id="legionTreeSearchBtn"'));
    assert(html.includes('id="legionTreeSearchResults"'));
    assert(html.includes('id="legionTreeMainResults"'));
    assert(html.includes('id="legionTreeAltResults"'));
    assert(html.includes('id="legionTreeSearchCloseBtn"'));
    assert(html.includes('id="legionTreeAddProgress"'));
    assert(!html.includes('id="legionTreeServerHint"'));
    assert(html.includes('aria-describedby="legionTreeStatus"'));
    assert(/<\/section>\r?\n  <section class="legion-tree-search-results"/.test(html));
    assert(html.includes('placeholder="본캐이름[서버]"'));
    assert(html.includes('placeholder="부캐이름[서버]"'));
    assert(!html.includes('<span>본캐 이름</span>'));
    assert(!html.includes('<span>부캐 이름</span>'));
    assert(!html.includes('id="legionTreeRaceElyos"'));
    assert(!html.includes('id="legionTreeRaceAsmodian"'));
    assert(!html.includes('id="legionTreeServer"'));
    assert(html.includes('aria-label="캐릭터 추가 진행 상태"'));
    assert(html.includes('Server 레기온 데이터를 불러오는 중'));
    assert(!html.includes('data-preview-card'));
    assert(!html.includes('본캐예시'));
    assert(html.includes('kinojo-character-reaction.css?cache=2026082201'));
    assert(html.includes('kinojo-character-reaction.js?cache=2026082701'));
    assert(html.includes('legion-tree.css?cache=2026090101'));
    assert(html.includes('legion-tree-editor.js?cache=2026090101'));
    assert(html.includes('legion-tree.js?cache=2026090102'));
    assert(html.includes('kinojo-supabase-features.js?cache=2026083108'));
    assert(!html.includes('legion-tree.js?cache=2026082403'));
  }

  assert(script.includes("kinojo_web_legion_tree_server_reference_v372"));
  assert(script.includes("kinojo_web_get_legion_tree"));
  assert(script.includes("if(!mainName)"));
  assert(script.includes("parseCharacterAddInput"));
  assert(script.includes("이름만 입력하면 모든 활성 서버"));
  assert(script.includes("SEARCH_CONTRACT='legion-tree-character-search-v1'"));
  assert(script.includes('handleSearch'));
  assert(script.includes('selectSearchCandidate'));
  assert(script.includes('candidateExactInput'));
  assert(script.includes("document.addEventListener('pointerdown'"));
  assert(script.includes("event.key!=='Escape'"));
  assert(script.includes('positionSearchResults'));
  assert(script.includes('resetInputs({keepStatus:true,force:true})'));
  assert(!script.includes("renderServerOptions"));
  assert(!script.includes("selectedRaceId"));
  assert(script.includes("ADD_ACCEPTED_CODE='ADD_QUEUE_ACCEPTED'"));
  assert(script.includes("if(state==='completed')return 3"));
  assert(!script.includes('SERVER_QUEUE_LIST_SYNC_DONE'));
  assert(script.includes("const reloaded=await loadTreeData()"));
  assert(css.includes('.legion-tree-add-progress'));
  assert(css.includes('.legion-tree-add-progress{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))'));
  assert(css.includes('.legion-tree-subbar-feedback'));
  assert(css.includes('position:fixed;top:var(--legion-tree-search-top'));
  assert(css.includes('li[data-state="done"]'));
  assert(css.includes('li[data-state="error"]'));
  assert(css.includes('.legion-tree-search-results'));
  assert(css.includes('width:min(650px,calc(100vw - 24px))'));
  assert(css.includes('align-items:center'));
  assert(css.includes('.legion-tree-search-card.is-registered'));
  assert(css.includes('.legion-tree-search-registered'));
  assert(css.includes('@keyframes legion-tree-search-fade'));
  assert(css.includes('@media(prefers-reduced-motion:reduce)'));

  const searchWrapper = features.match(/async function searchLegionTreeCharacters\(extra=\{\}\)\{([\s\S]*?)\n  \}/);
  assert(searchWrapper, 'Legion Tree Server search wrapper missing');
  assert(searchWrapper[1].includes('currentServerSessionCredential()'));
  assert(searchWrapper[1].includes("action:'character-search'"));
  assert(searchWrapper[1].includes('mainCharacterName'));
  assert(searchWrapper[1].includes('altCharacterName'));
  assert(!searchWrapper[1].includes('serverId'));

  const addWrapper = features.match(/async function addLegionTreeCharacter\(extra=\{\}\)\{([\s\S]*?)\n  \}/);
  assert(addWrapper, 'Legion Tree Server add wrapper missing');
  assert(addWrapper[1].includes('currentServerSessionCredential()'));
  assert(addWrapper[1].includes("invokeEdgeFunction('kinojo-legion-tree'"));
  assert(addWrapper[1].includes("action:'character-add'"));
  assert(addWrapper[1].includes('mainCharacterName'));
  assert(addWrapper[1].includes('altCharacterName'));
  assert(!addWrapper[1].includes('serverId'));
  assert(!addWrapper[1].includes('passKey'));
  assert(!addWrapper[1].includes('memberId'));
  assert(features.includes('searchLegionTreeCharacters,'));
  assert(features.includes('addLegionTreeCharacter,'));
  assert(workflow.includes('- "core/kinojo-supabase-features.js"'));
  assert(workflow.includes('node --check core/kinojo-supabase-features.js'));
  assert((workflow.match(/"core\/kinojo-supabase-features\.js"/g) || []).length >= 2);
  for (const token of [
    "const API_VERSION='1.8'",
    "const DATABASE_CONTRACT='458'",
    "CHARACTER_INPUT_CONTRACT='character-name-server-tag-v3'",
    "const CHARACTER_SEARCH_CONTRACT='legion-tree-character-search-v1'",
    "action==='character-search'",
    "url.searchParams.set('size','100')",
    "identityName(stripOfficialName(row.name))!==identityName(input.characterName)",
    "rpc('kinojo_legion_tree_candidate_registration_v458'",
    'registeredCandidateCount',
    'createsTarget:false',
    'createsQueue:false',
    'record(session.profile).canManage!==true',
    'parseCharacterInput(body.mainCharacterName,servers,true)',
    "rpc('kinojo_legion_tree_character_queue_prepare_v455'",
    'p_main_server_id:mainServerId',
    'crossServerMainAltConnected:true',
    'listAppendPending:false',
    'listlessCharacterAdd:true'
  ]) assert(edge.includes(token), `Edge cross-server contract missing: ${token}`);
  for (const token of [
    'kinojo_legion_tree_candidate_registration_v458',
    'legion-tree-candidate-registration-v1',
    'character_master character',
    'kinojo_character_identity_key_v298(character.character_name)',
    'revoke all on function public.kinojo_legion_tree_candidate_registration_v458(jsonb) from public, anon, authenticated',
    'grant execute on function public.kinojo_legion_tree_candidate_registration_v458(jsonb) to service_role'
  ]) assert(candidateRegistrationMigration.includes(token), `DB458 registration contract missing: ${token}`);
  for (const token of [
    'private.kinojo_legion_tree_search_authorize_v457',
    'private.kinojo_legion_tree_search_rate_acquire_v457',
    'public.kinojo_legion_tree_search_rate_acquire_v457',
    "last_session_id = 'web:'",
    "next_request_at = v_reserved_at + interval '700 milliseconds'",
    'grant execute on function public.kinojo_legion_tree_search_rate_acquire_v457',
    'to service_role',
    'from public, anon, authenticated'
  ]) assert(searchRateMigration.includes(token), `DB457 search rate contract missing: ${token}`);
  for (const token of [
    'private.kinojo_legion_tree_character_queue_prepare_v454',
    'public.kinojo_legion_tree_character_queue_prepare_v454',
    "'mainServerId',p_main_server_id",
    "target_source='server:legion_tree_character_add_v454'",
    "p_target_server_id<>p_main_server_id",
    "v_legacy_main_name:=v_main_name||'[server-'||p_main_server_id::text||']'",
    'v_main_server_id=v_target.server_id',
    "'legion-tree-relation-v2'",
    'grant execute on function public.kinojo_legion_tree_character_queue_prepare_v454'
  ]) assert(crossServerMigration.includes(token), `DB454 cross-server contract missing: ${token}`);
  for (const token of [
    'private.kinojo_legion_tree_character_queue_prepare_v455',
    'public.kinojo_legion_tree_character_queue_prepare_v455',
    "target_source='server:legion_tree_character_add_v455'",
    'public.kinojo_legion_tree_listless_policy_v455',
    'public.kinojo_legion_tree_listless_complete_v455',
    "stage='SERVER_QUEUE_CHARACTER_MASTER_DONE'",
    "list_sync_status='skipped'",
    "'listWriteSkipped',true",
    "'listReadbackSkipped',true",
    'grant execute on function public.kinojo_legion_tree_listless_complete_v455',
    'from public,anon,authenticated'
  ]) assert(listlessMigration.includes(token), `DB455 listless contract missing: ${token}`);
  assert(!listlessMigration.includes('and cm.list_row is not null'));
  for (const token of [
    'const API_VERSION="295.7"',
    'kinojo_legion_tree_listless_policy_v455',
    'kinojo_legion_tree_listless_complete_v455',
    'if(listlessPolicy.skipListWrite===true)',
    'legionTreeCharacterAddListWrite:false',
    'legionTreeCharacterAddListReadback:false'
  ]) assert(worker.includes(token), `Worker listless contract missing: ${token}`);

  const addHarness = createAddHarness();
  await addHarness.start();
  const legionNode = { dataset: { legionName: '깡' } };
  const detailCard = fakeElement({
    dataset: {
      characterId: '25195',
      characterName: '화비',
      className: '치유성',
      mainCharacterName: '복숭아',
      serverId: '2004',
      serverName: '루미엘'
    },
    closest(selector) {
      if (selector === '.legion-tree-character') return this;
      if (selector === '[data-legion-name]') return legionNode;
      return null;
    }
  });
  const detailTarget = addHarness.api.characterTargetFromCard(detailCard);
  assert.strictEqual(JSON.stringify(detailTarget), JSON.stringify({
    characterId: '25195',
    name: '화비',
    className: '치유성',
    owner: '복숭아',
    serverId: '2004',
    server: '루미엘',
    legionName: '깡',
    classIconUrl: '/assets/images/classes/class_icon_cleric.png'
  }));
  addHarness.elements['#legionTreeRoot']._listeners.click({ target: detailCard });
  let enterPrevented = false;
  addHarness.elements['#legionTreeRoot']._listeners.keydown({
    key: 'Enter', target: detailCard, preventDefault() { enterPrevented = true; }
  });
  let spacePrevented = false;
  addHarness.elements['#legionTreeRoot']._listeners.keydown({
    key: ' ', target: detailCard, preventDefault() { spacePrevented = true; }
  });
  assert.strictEqual(addHarness.detailOpens.length, 3, 'click, Enter, Space must open character detail');
  assert.strictEqual(enterPrevented, true);
  assert.strictEqual(spacePrevented, true);
  assert.strictEqual(addHarness.detailOpens[0].source, 'legion-tree');
  assert.strictEqual(JSON.stringify(addHarness.detailOpens[0].target), JSON.stringify(detailTarget));
  assert.strictEqual(addHarness.api.progressIndexForRuntime({ status: 'running', stage: 'OFFICIAL_INFO' }), 0);
  assert.strictEqual(addHarness.api.progressIndexForRuntime({ status: 'running', stage: 'MASTER_SYNC' }), 1);
  assert.strictEqual(addHarness.api.progressIndexForRuntime({ status: 'running', stage: 'SERVER_QUEUE_CHARACTER_MASTER_DONE' }), 2);
  assert.strictEqual(addHarness.api.progressIndexForRuntime({ status: 'completed', stage: 'FINISHED' }), 3);

  let sessionNo = 0;
  addHarness.setAddImplementation(async () => {
    sessionNo += 1;
    return {
      ok: true,
      contract: 'legion-tree-character-add-v1',
      code: 'ADD_QUEUE_ACCEPTED',
      message: '캐릭터 조회를 Server Worker에 인계했습니다.',
      listlessCharacterAdd: true,
      listAppendPending: false,
      queue: { sessionId: `legion-add-${sessionNo}` }
    };
  });
  addHarness.setRuntimeImplementation(async () => ({
    sessionId: `legion-add-${sessionNo}`,
    status: 'completed',
    stage: 'FINISHED',
    message: '공식 조회와 캐릭터 Master 반영 완료'
  }));

  const mainInput = addHarness.elements['#legionTreeMainName'];
  const altInput = addHarness.elements['#legionTreeAltName'];
  const addButton = addHarness.elements['#legionTreeAddBtn'];
  const resetButton = addHarness.elements['#legionTreeResetBtn'];
  const addProgress = addHarness.elements['#legionTreeAddProgress'];
  const addStatus = addHarness.elements['#legionTreeStatus'];

  const defaultParsed = addHarness.api.parseCharacterAddInput('복숭아');
  assert.strictEqual(defaultParsed.ok, true);
  assert.strictEqual(defaultParsed.characterName, '복숭아');
  assert.strictEqual(defaultParsed.serverId, null);
  assert.strictEqual(defaultParsed.allActiveServers, true);
  const taggedParsed = addHarness.api.parseCharacterAddInput('화비[루미]');
  assert.strictEqual(taggedParsed.ok, true);
  assert.strictEqual(taggedParsed.characterName, '화비');
  assert.strictEqual(taggedParsed.serverId, 2004);
  assert.strictEqual(taggedParsed.serverName, '루미엘');
  assert.strictEqual(addHarness.api.parseCharacterAddInput('화비[없는서버]').code, 'SERVER_SUFFIX_NOT_FOUND');
  assert.strictEqual(addHarness.api.parseCharacterAddInput('화비[루미').code, 'SERVER_TAG_INVALID');

  const candidate = (role, name, serverId, serverName, level = 45, registered = false) => ({
    ok: true,
    role,
    query: { raw: name, characterName: name, serverSpecified: false, serverId: null, serverName: '' },
    candidates: [{
      candidateKey: `${serverId}:${name}-${serverId}`,
      characterId: `${name}-${serverId}`,
      characterName: name,
      serverId,
      serverName,
      serverShortName: serverName,
      raceId: serverId >= 2000 ? 2 : 1,
      raceName: serverId >= 2000 ? '마족' : '천족',
      level,
      profileImageUrl: '',
      registered
    }]
  });
  addHarness.setSearchImplementation(async request => ({
    ok: true,
    contract: 'legion-tree-character-search-v1',
    code: 'SEARCH_RESULTS_READY',
    readOnly: true,
    createsTarget: false,
    createsQueue: false,
    main: candidate('main', request.mainCharacterName.replace(/\[.*$/, ''), 2002, '지켈'),
    alt: request.altCharacterName ? candidate('alt', request.altCharacterName.replace(/\[.*$/, ''), 2004, '루미엘') : null
  }));

  mainInput.value = '복숭아';
  altInput.value = '';
  assert.strictEqual(await addHarness.api.handleSearch(), true, 'suffixless main search must complete');
  assert.strictEqual(JSON.stringify(addHarness.searchRequests[0]), JSON.stringify({ mainCharacterName: '복숭아', altCharacterName: '' }));
  assert.strictEqual(addHarness.elements['#legionTreeSearchResults'].hidden, false);
  assert(addHarness.elements['#legionTreeMainResults'].innerHTML.includes('복숭아'));
  assert.strictEqual(addButton.disabled, true, 'add must stay disabled until a candidate is selected');
  assert.strictEqual(addHarness.api.selectSearchCandidate('main', '2002:복숭아-2002'), true);
  assert.strictEqual(addButton.disabled, false);
  assert.strictEqual(addHarness.api.selectSearchCandidate('main', '2002:복숭아-2002'), true, 'selected candidate must toggle off');
  assert.strictEqual(addHarness.api.getAddState().selectedCandidates.main, null);
  assert.strictEqual(addButton.disabled, true, 'add must disable again after deselection');
  assert(addStatus.textContent.includes('선택을 해제'));
  assert.strictEqual(addHarness.api.selectSearchCandidate('main', '2002:복숭아-2002'), true, 'candidate must be selectable again');
  assert.strictEqual(addButton.disabled, false);
  const treeLoadsBeforeMain = addHarness.getTreeLoads();
  assert.strictEqual(await addHarness.api.handleAdd(), true, 'main-only add must complete');
  assert.strictEqual(JSON.stringify(addHarness.addRequests[0]), JSON.stringify({
    mainCharacterName: '복숭아[지켈]',
    altCharacterName: ''
  }));
  assert.strictEqual(addHarness.getTreeLoads(), treeLoadsBeforeMain + 1, 'tree must reload after completed add');
  assert.strictEqual(addProgress.hidden, true, 'terminal success must reset progress');
  assert.strictEqual(mainInput.value, '', 'terminal success must reset main input');
  assert.strictEqual(altInput.value, '', 'terminal success must reset alt input');
  assert.strictEqual(addHarness.elements['#legionTreeSearchResults'].hidden, true, 'terminal success must close results');
  assert(addStatus.textContent.includes('재확인이 완료'));
  assert.strictEqual(addButton.disabled, true);
  assert.strictEqual(resetButton.disabled, false);

  mainInput.value = '복숭아';
  altInput.value = '화비[루미]';
  assert.strictEqual(await addHarness.api.handleSearch(), true, 'main+alt search must complete');
  assert.strictEqual(addHarness.api.selectSearchCandidate('main', '2002:복숭아-2002'), true);
  assert.strictEqual(addHarness.api.selectSearchCandidate('alt', '2004:화비-2004'), true);
  assert.strictEqual(addHarness.api.selectSearchCandidate('alt', '2004:화비-2004'), true, 'alt candidate must toggle off');
  assert.strictEqual(addHarness.api.getAddState().selectedCandidates.alt, null);
  assert.strictEqual(addButton.disabled, true);
  assert.strictEqual(addHarness.api.selectSearchCandidate('alt', '2004:화비-2004'), true, 'alt candidate must be selectable again');
  assert.strictEqual(await addHarness.api.handleAdd(), true, 'main+alt add must complete');
  assert.strictEqual(JSON.stringify(addHarness.addRequests[1]), JSON.stringify({
    mainCharacterName: '복숭아[지켈]',
    altCharacterName: '화비[루미엘]'
  }));

  addHarness.setSearchImplementation(async () => ({
    ok: true,
    contract: 'legion-tree-character-search-v1',
    code: 'SEARCH_RESULTS_READY',
    readOnly: true,
    createsTarget: false,
    createsQueue: false,
    main: { ...candidate('main', '검색결과없음', 2002, '지켈'), candidates: [] },
    alt: null
  }));
  mainInput.value = '검색결과없음';
  altInput.value = '';
  assert.strictEqual(await addHarness.api.handleSearch(), true, 'zero-result search must complete without a write path');
  assert(addHarness.elements['#legionTreeMainResults'].innerHTML.includes('정확히 일치하는 캐릭터를 찾지 못했습니다.'));
  assert.strictEqual(addButton.disabled, true);
  const requestsBeforeClose = addHarness.searchRequests.length;
  addHarness.elements['#legionTreeSearchCloseBtn'].click();
  assert.strictEqual(addHarness.elements['#legionTreeSearchResults'].hidden, true, 'close must hide only the result panel');
  assert.strictEqual(mainInput.value, '검색결과없음', 'close must preserve retry input');
  assert.strictEqual(addHarness.searchRequests.length, requestsBeforeClose, 'close must make network 0');
  assert.strictEqual(await addHarness.api.handleSearch(), true);
  const requestsBeforeReset = addHarness.searchRequests.length;
  resetButton.click();
  assert.strictEqual(mainInput.value, '');
  assert.strictEqual(altInput.value, '');
  assert.strictEqual(addHarness.elements['#legionTreeSearchResults'].hidden, true);
  assert.strictEqual(addHarness.searchRequests.length, requestsBeforeReset, 'reset must make network 0');

  for (const failure of [
    { code: 'PLAYNC_RATE_PAUSED', message: '공식 캐릭터 조회가 잠시 제한되었습니다.' },
    { code: 'PLAYNC_HTTP_500', message: '공식 캐릭터 조회 응답을 확인하지 못했습니다.' },
    { code: 'PLAYNC_TIMEOUT', message: '공식 캐릭터 조회 시간이 초과되었습니다.' }
  ]) {
    addHarness.setSearchImplementation(async () => {
      const error = new Error(failure.message);
      error.code = failure.code;
      error.data = { ok: false, code: failure.code, message: failure.message };
      throw error;
    });
    mainInput.value = `오류-${failure.code}`;
    altInput.value = '';
    assert.strictEqual(await addHarness.api.handleSearch(), false, `${failure.code} must remain retryable`);
    assert(addStatus.textContent.includes(failure.message));
    assert.strictEqual(mainInput.value, `오류-${failure.code}`);
  }

  const callsBeforeBadSuffix = addHarness.searchRequests.length;
  mainInput.value = '복숭아';
  altInput.value = '화비[알수없음]';
  altInput.focused = false;
  assert.strictEqual(await addHarness.api.handleSearch(), false, 'unknown server tag must fail before network');
  assert.strictEqual(addHarness.searchRequests.length, callsBeforeBadSuffix, 'unknown server tag must make network 0');
  assert.strictEqual(altInput.focused, true);
  assert(addStatus.textContent.includes('확인할 수 없습니다'));

  const callsBeforeAltOnly = addHarness.searchRequests.length;
  mainInput.value = '';
  altInput.value = '부캐단독';
  mainInput.focused = false;
  assert.strictEqual(await addHarness.api.handleSearch(), false, 'alt-only must fail before network');
  assert.strictEqual(addHarness.searchRequests.length, callsBeforeAltOnly, 'alt-only must make network 0');
  assert.strictEqual(mainInput.attributes['aria-invalid'], 'true');
  assert.strictEqual(mainInput.focused, true);
  assert.strictEqual(addStatus.textContent, '본캐 이름을 입력해 주세요.');

  let releaseSearch;
  addHarness.setSearchImplementation(() => new Promise(resolve => { releaseSearch = resolve; }));
  mainInput.value = '조회중복클릭';
  altInput.value = '';
  const duplicateSearchCallsBefore = addHarness.searchRequests.length;
  const firstSearchClick = addHarness.api.handleSearch();
  const secondSearchClick = addHarness.api.handleSearch();
  assert.strictEqual(await secondSearchClick, false, 'second search click while running must be ignored');
  assert.strictEqual(addHarness.searchRequests.length, duplicateSearchCallsBefore + 1, 'duplicate search click must make one request');
  releaseSearch({
    ok: true,
    contract: 'legion-tree-character-search-v1',
    code: 'SEARCH_RESULTS_READY',
    readOnly: true,
    createsTarget: false,
    createsQueue: false,
    main: candidate('main', '조회중복클릭', 2002, '지켈'),
    alt: null
  });
  assert.strictEqual(await firstSearchClick, true);

  let releaseAccepted;
  addHarness.setAddImplementation(() => new Promise(resolve => { releaseAccepted = resolve; }));
  mainInput.value = '중복클릭';
  altInput.value = '';
  addHarness.setSearchImplementation(async () => ({ok:true,contract:'legion-tree-character-search-v1',readOnly:true,createsTarget:false,createsQueue:false,main:candidate('main','중복클릭',2002,'지켈'),alt:null}));
  assert.strictEqual(await addHarness.api.handleSearch(), true);
  assert.strictEqual(addHarness.api.selectSearchCandidate('main', '2002:중복클릭-2002'), true);
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
    listlessCharacterAdd: true,
    listAppendPending: false,
    queue: { sessionId: `legion-add-${sessionNo}` }
  });
  assert.strictEqual(await firstClick, true);
  assert.strictEqual(addButton.disabled, true);

  addHarness.setAddImplementation(async () => {
    const error = new Error('이미 등록된 캐릭터입니다.');
    error.code = 'ALREADY_REGISTERED';
    error.data = { ok: false, code: 'ALREADY_REGISTERED', message: '이미 등록된 캐릭터입니다.' };
    throw error;
  });
  mainInput.value = '이미등록';
  altInput.value = '';
  addHarness.setSearchImplementation(async () => ({ok:true,contract:'legion-tree-character-search-v1',readOnly:true,createsTarget:false,createsQueue:false,main:candidate('main','이미등록',2002,'지켈',45,true),alt:null}));
  assert.strictEqual(await addHarness.api.handleSearch(), true);
  assert(addHarness.elements['#legionTreeMainResults'].innerHTML.includes('is-registered'));
  assert(addHarness.elements['#legionTreeMainResults'].innerHTML.includes('추가된 캐릭터'));
  assert.strictEqual(addHarness.api.selectSearchCandidate('main', '2002:이미등록-2002'), true);
  assert.strictEqual(await addHarness.api.handleAdd(), false);
  assert(addStatus.textContent.includes('이미 등록된 캐릭터'));
  assert.strictEqual((addProgress.innerHTML.match(/data-state="error"/g) || []).length, 1);
  assert.strictEqual(mainInput.value, '이미등록', 'failed add must preserve retry input');
  assert.strictEqual(addHarness.elements['#legionTreeSearchResults'].hidden, false, 'failed add must preserve result panel');
  assert.strictEqual(addHarness.api.getAddState().selectedCandidates.main.characterName, '이미등록', 'failed add must preserve selection');

  const searchesBeforeForbidden = addHarness.searchRequests.length;
  addHarness.setManagerAllowed(false);
  assert.strictEqual(addHarness.elements['#legionTreeSearchBtn'].disabled, true, 'non-manager search control must fail closed');
  assert.strictEqual(addHarness.elements['#legionTreeEditBtn'].disabled, true, 'non-manager editor control must fail closed');
  assert.strictEqual(await addHarness.api.handleSearch(), false, 'non-manager search must stop before network');
  assert.strictEqual(addHarness.searchRequests.length, searchesBeforeForbidden);
  addHarness.setManagerAllowed(true);

  mainInput.value = '초기화본캐';
  altInput.value = '초기화부캐';
  assert.strictEqual(addHarness.api.resetInputs(), true);
  assert.strictEqual(mainInput.value, '');
  assert.strictEqual(altInput.value, '');
  assert.strictEqual(mainInput.attributes['aria-invalid'], undefined);
  assert.strictEqual(addProgress.hidden, true);
  assert.strictEqual(addProgress.innerHTML, '');

  console.log('legion-tree data render contract: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
