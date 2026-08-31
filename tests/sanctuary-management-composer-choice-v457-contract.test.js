const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260831110000_sanctuary_composer_optional_creator_v457.sql');
const edge=read('supabase/functions/sanctuary-management/index.ts');
const feature=read('core/kinojo-supabase-features.js');
const client=read('sanctuary-management/js/sanctuary-management.js');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');
const css=read('sanctuary-management/css/sanctuary-management-draft.css');

for(const token of [
  'alter column team_id drop not null',
  'v446 mode guard patch target was not found',
  'team_mode=v_mode',
  "status=''CANCELLED''",
  'v446 creator placement guards were not found',
  "set published_at=coalesce(published_at,clock_timestamp()),status=''ACTIVE''",
  'kinojo_sanctuary_management_character_search_v457',
  'kinojo_sanctuary_management_official_materialize_v457',
  'kinojo_sanctuary_management_linked_alts_v457',
  'p_team_id is not null',
  "values(v_actor_id,null",
  "'SANCTUARY_MANAGEMENT_OFFICIAL_V457'",
])assert.ok(migration.includes(token),`v457 migration contract missing ${token}`);

for(const token of [
  'const DATABASE_CONTRACT="457"',
  'kinojo_sanctuary_management_character_search_v457',
  'kinojo_sanctuary_management_official_prepare_v457',
  'kinojo_sanctuary_management_official_record_v457',
  'kinojo_sanctuary_management_official_materialize_v457',
  'kinojo_sanctuary_management_linked_alts_v457',
  'rawTeamId===0?null:positiveInteger(rawTeamId)',
])assert.ok(edge.includes(token),`v457 Edge contract missing ${token}`);

for(const token of [
  'normalizedTeamId<0',
  'normalizedTeamId===0&&normalizedForceId!=null',
  "action:'character-search'",
  "action:'character-register'",
  "action:'linked-alts'",
])assert.ok(feature.includes(token),`v457 feature bridge missing ${token}`);

for(const token of [
  'const SCHEMA_VERSION=457',
  "window.KinojoSanctuaryManagementDraftUI?.openMode?.(event.currentTarget)",
])assert.ok(client.includes(token),`v457 browser contract missing ${token}`);

for(const token of [
  'function openMode(opener)',
  'openDraft(null,opener)',
  'data-draft-mode="fixed"',
  'data-draft-mode="participation"',
  'state.team.mode=next',
  'data-creator-candidates-toggle',
  '내 캐릭터 추가',
  'name="characterQuery"',
  '조회하기',
  'state.showCreatorCandidates?quick',
  'await bridge().searchCharacter(Number(state.sourceTeamId),value(query))',
  'await bridge().saveComposition(model)',
])assert.ok(draft.includes(token),`optional-creator composer missing ${token}`);

for(const retired of [
  'function participationReady()',
  '팀 생성 중에는 내 캐릭터 목록에서만 검색할 수 있습니다.',
  '최소 팀 생성자의 캐릭터 1개를 추가해야 합니다.',
  '만들어 둔 포스 중 한 곳에 생성자의 캐릭터 1개',
])assert.equal(draft.includes(retired),false,`optional-creator composer retained ${retired}`);

assert.equal(draft.includes('combatPowerMarkup(force.combatPower?.average'),false,'composer force summary must not render average combat power');
assert.ok(css.includes('.sanctuary-management-draft-slot.is-selected>span{background:#e9eff7'),'selected empty-slot icon tile must remain neutral');

console.log('KINOJO sanctuary management composer choice v457 contract: PASS');
