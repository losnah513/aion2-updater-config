const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const editorPath = path.join(rootDir, 'legion-tree/js/legion-tree-editor.js');
const editorScript = fs.readFileSync(editorPath, 'utf8');
const pageScript = fs.readFileSync(path.join(rootDir, 'legion-tree/js/legion-tree.js'), 'utf8');
const css = fs.readFileSync(path.join(rootDir, 'legion-tree/css/legion-tree.css'), 'utf8');
const pc = fs.readFileSync(path.join(rootDir, 'legion-tree/index.html'), 'utf8');
const mobile = fs.readFileSync(path.join(rootDir, 'm/legion-tree/index.html'), 'utf8');
const featureScript = fs.readFileSync(path.join(rootDir, 'core/kinojo-supabase-features.js'), 'utf8');
const edgeScript = fs.readFileSync(path.join(rootDir, 'supabase/functions/kinojo-legion-tree/index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(rootDir, 'supabase/migrations/20260831041509_legion_tree_atomic_save_v453.sql'), 'utf8');

const document = {
  activeElement: null,
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  removeEventListener() {},
  body: { classList: { add() {}, remove() {} } }
};
const window = {};
const context = { window, document, console, Map, Set, Array, Object, Number, String };
vm.createContext(context);
vm.runInContext(editorScript, context, { filename: editorPath });

const api = window.KinojoLegionTreeEditor;
assert(api, 'organization editor API must be exported');

function member(characterId, characterName) {
  return {
    characterId,
    characterName,
    className: '검성',
    isMain: true,
    mainCharacterId: characterId,
    mainCharacterName: characterName,
    serverId: 2002,
    serverName: '지켈',
    listRow: characterId + 2
  };
}

const legion = {
  legionName: '깡',
  revision: 7,
  fallbackApplied: true,
  organizationConfigured: false,
  stages: [
    {
      stageNo: 1,
      stageName: '군단장',
      roles: [{
        roleKey: 'stage-1-commander',
        roleName: '군단장',
        slotNo: 1,
        maxMembers: 1,
        groups: [{ groupKey: 'leader', parentRoleKey: '', members: [member(1, '대장')] }]
      }]
    },
    {
      stageNo: 2,
      stageName: '엘리트장교',
      roles: [
        { roleKey: 'stage-2-a', roleName: '부대장', slotNo: 1, maxMembers: null, groups: [] },
        { roleKey: 'stage-2-b', roleName: '행동대장', slotNo: 2, maxMembers: null, groups: [] }
      ]
    },
    {
      stageNo: 3,
      stageName: '군단병',
      roles: [{
        roleKey: 'stage-3-member',
        roleName: '조원',
        slotNo: 1,
        maxMembers: null,
        groups: [{
          groupKey: 'stage-2-a',
          parentRoleKey: 'stage-2-a',
          members: [member(2, '조원하나')]
        }]
      }]
    }
  ],
  unassignedMembers: [member(3, '미배치원')]
};

const draft = api.createEditorDraft(legion);
assert.strictEqual(draft.legionName, '깡');
assert.strictEqual(draft.revision, 7);
assert.strictEqual(draft.stageCount, 3);
assert.strictEqual(draft.members.length, 3);
assert.strictEqual(draft.assignments.length, 2);
assert.strictEqual(draft.assignments[1].parentRoleKey, 'stage-2-a');

const addStage = api.setStageCount(draft, 4);
assert.strictEqual(addStage.ok, true);
assert.strictEqual(draft.stages.length, 4);
assert.strictEqual(draft.stages[3].stageName, '4단계');
assert.strictEqual(draft.stages[3].roles.length, 1);

const removeEmptyStage = api.setStageCount(draft, 3);
assert.strictEqual(removeEmptyStage.ok, true);
assert.strictEqual(draft.stages.length, 3);

const removeOccupiedStage = api.setStageCount(draft, 2);
assert.strictEqual(removeOccupiedStage.ok, false);
assert.strictEqual(removeOccupiedStage.code, 'STAGE_IN_USE');
assert.strictEqual(draft.stages.length, 3);

const addedRole = api.addRole(draft, 2);
assert.strictEqual(addedRole.ok, true);
assert.strictEqual(draft.stages[1].roles.length, 3);
assert.strictEqual(addedRole.role.roleName, '새 직급');

const maxMemberGuard = api.assignMember(draft, 3, 'stage-1-commander');
assert.strictEqual(maxMemberGuard.ok, false);
assert.strictEqual(maxMemberGuard.code, 'MAX_MEMBERS_EXCEEDED');

const assignUnassigned = api.assignMember(draft, 3, 'stage-3-member');
assert.strictEqual(assignUnassigned.ok, true);
assert.strictEqual(draft.assignments.length, 3);

const parentUpdated = api.setParentRole(draft, 3, 'stage-2-b');
assert.strictEqual(parentUpdated.ok, true);
assert.strictEqual(draft.assignments.find(item => item.characterId === 3).parentRoleKey, 'stage-2-b');

const invalidParent = api.setParentRole(draft, 3, 'stage-3-member');
assert.strictEqual(invalidParent.ok, false);
assert.strictEqual(invalidParent.code, 'PARENT_NOT_IMMEDIATE_STAGE');

const skippedParent = api.setParentRole(draft, 3, 'stage-1-commander');
assert.strictEqual(skippedParent.ok, false);
assert.strictEqual(skippedParent.code, 'PARENT_NOT_IMMEDIATE_STAGE');

const occupiedDelete = api.deleteRole(draft, 'stage-3-member');
assert.strictEqual(occupiedDelete.ok, false);
assert.strictEqual(occupiedDelete.code, 'LAST_ROLE');

const parentDelete = api.deleteRole(draft, 'stage-2-b');
assert.strictEqual(parentDelete.ok, false);
assert.strictEqual(parentDelete.code, 'ROLE_IS_PARENT');

assert.strictEqual(api.setParentRole(draft, 3, '').ok, true);
assert.strictEqual(api.deleteRole(draft, 'stage-2-b').ok, true);
assert.strictEqual(draft.stages[1].roles.length, 2);

const serialized = api.serializeDraft(draft);
assert.strictEqual(serialized.legionName, '깡');
assert.strictEqual(serialized.expectedRevision, 7);
assert.strictEqual(serialized.stageCount, 3);
assert.strictEqual(serialized.stages[1].roles.length, 2);
assert.strictEqual(serialized.assignments.length, 3);
assert(serialized.assignments.every(item => Object.prototype.hasOwnProperty.call(item, 'parentRoleKey')));

for (const html of [pc, mobile]) {
  assert(html.includes('id="legionTreeEditorRoot"'));
  assert(html.includes('legion-tree-editor.js?cache=2026083102'));
  assert(html.includes('legion-tree.js?cache=2026083102'));
  assert(html.includes('legion-tree.css?cache=2026083102'));
  assert(html.includes('kinojo-supabase-features.js?cache=2026083103'));
  assert(html.indexOf('legion-tree-editor.js?cache=2026083102') < html.indexOf('legion-tree.js?cache=2026083102'));
}

for (const token of [
  'role="dialog"',
  'aria-modal="true"',
  '레기온 선택',
  '단계 수',
  '같은 단계 직급 추가',
  '직급 삭제',
  '구성원 지정',
  '상위 소속',
  '기본 조직도로 초기화',
  'data-editor-cancel',
  'data-editor-save ',
  "event.key==='Escape'",
  "event.key==='Enter'&&event.target?.id==='legionTreeEditorStageCount'",
  "event.key!=='Tab'",
  "document.body.classList.add('legion-tree-editor-open')",
  'Server가 권한·revision·조직 무결성을 다시 확인하고 한 transaction으로 반영합니다.',
  'readbackVerified',
  'saveLegionTreeOrganization',
  'PARENT_NOT_IMMEDIATE_STAGE'
]) {
  assert(editorScript.includes(token), 'editor contract missing: '+token);
}

assert(pageScript.includes('window.KinojoLegionTreeEditor?.setModel?.(model)'));
assert(pageScript.includes('window.KinojoLegionTreeEditor.open({opener:event.currentTarget})'));
assert(pageScript.includes('if(edit)edit.disabled=false'));
assert(editorScript.includes('window.KinojoSupabase'));
assert(!editorScript.includes('invokeEdgeFunction'));
assert(!editorScript.includes('fetch('));
assert(featureScript.includes("action:'organization-save'"));
assert(featureScript.includes("action:'organization-reset'"));
assert(featureScript.includes('saveLegionTreeOrganization'));
for (const token of [
  "const DATABASE_CONTRACT='453'",
  "actions:['character-add','organization-save','organization-reset']",
  "rpc('kinojo_legion_tree_organization_save_v453'",
  'organizationReadbackConnected:true'
]) assert(edgeScript.includes(token), 'Edge organization contract missing: '+token);
for (const token of [
  'kinojo_legion_tree_save_core_v453',
  'kinojo_legion_tree_organization_save_v453',
  'kinojo_legion_tree_configured_stages_v453',
  'stage_names jsonb',
  "'REVISION_CONFLICT'",
  "'RESET_TO_DEFAULT'",
  "'ORGANIZATION_SAVED'",
  'delete from private.legion_tree_assignments',
  "grant execute on function public.kinojo_web_get_legion_tree() to anon, authenticated, service_role"
]) assert(migration.includes(token), 'DB453 organization contract missing: '+token);
assert(css.includes('.legion-tree-editor-root{position:fixed;inset:0;z-index:50020'));
assert(css.includes('.legion-tree-editor-dialog{position:relative;width:min(1040px,100%)'));
assert(css.includes('@media(max-width:760px)'));
assert(css.includes('.legion-tree-editor-dialog :is(button,input,select):focus-visible'));
assert(css.includes('@media(prefers-reduced-motion:reduce)'));

console.log('legion-tree editor contract: PASS');
