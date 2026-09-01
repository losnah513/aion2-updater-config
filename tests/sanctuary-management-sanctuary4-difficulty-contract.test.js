const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=file=>fs.readFileSync(file,'utf8');
const migration=read('supabase/migrations/20260901111113_sanctuary4_three_difficulty.sql');
const bootstrapHotfix=read('supabase/migrations/20260901112533_sanctuary4_entry_modes_bootstrap_hotfix.sql');
const main=read('sanctuary-management/js/sanctuary-management.js');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');
const draftCss=read('sanctuary-management/css/sanctuary-management-draft.css');
const supportCss=read('sanctuary-management/css/sanctuary-management-support.css');
const desktop=read('sanctuary/index.html');
const mobile=read('m/sanctuary/index.html');

for(const token of [
  "where code = 'sanctuary4'",
  "'key', 'easy', 'label', '쉬움', 'sortOrder', 1, 'minItemLevel', 5800",
  "'key', 'normal', 'label', '보통', 'sortOrder', 2, 'minItemLevel', 6000",
  "'key', 'hard', 'label', '어려움', 'sortOrder', 3, 'minItemLevel', 6200",
  "check (difficulty in ('EASY', 'NORMAL', 'HARD'))",
  'private.kinojo_sm_difficulty_allowed_v464',
  "when 'EASY' then 'easy'",
  "when 'HARD' then 'hard'",
  "v_delegate := (v_payload - 'difficulty') || jsonb_build_object('difficulty', 'NORMAL')",
  'private.kinojo_sm_force_min_item_level_v454',
  'private.kinojo_sm_character_eligible_v452'
])assert.ok(migration.includes(token),`Sanctuary 4 DB contract missing ${token}`);

assert.equal((migration.match(/not private\.kinojo_sm_difficulty_allowed_v464\(v_sanctuary\.id, v_difficulty\)/g)||[]).length,2,'ADD_FORCE and SAVE_COMPOSITION must both validate the selected Sanctuary 4 difficulty');

for(const token of [
  'kinojo_sanctuary_management_public_bootstrap_v456',
  'kinojo_sanctuary_management_bootstrap_v456',
  "v_base - 'teams' - 'sanctuaries'",
  "'sanctuaries', private.kinojo_sm_sanctuaries_v452(v_base->'sanctuaries')"
])assert.ok(bootstrapHotfix.includes(token),`Selected Sanctuary bootstrap contract missing ${token}`);
assert.equal((bootstrapHotfix.match(/private\.kinojo_sm_sanctuaries_v452\(v_base->'sanctuaries'\)/g)||[]).length,2,'public and authenticated selected bootstrap must both expose entry modes');

for(const token of [
  "EASY:'쉬움',NORMAL:'보통',HARD:'어려움'",
  "['EASY','NORMAL','HARD'].includes(force.difficulty)",
  "difficulty:normalizeDifficulty(force?.difficulty||source.difficulty||'NORMAL')",
  "difficultyBadge.className='sanctuary-management-force-difficulty is-'+difficulty.toLowerCase()"
])assert.ok(main.includes(token),`Sanctuary 4 public UI contract missing ${token}`);

for(const token of [
  "EASY:'쉬움',NORMAL:'보통',HARD:'어려움'",
  'function difficultyOptions(item)',
  `data-draft-force-difficulty="'+escapeHtml`,
  "force.difficulty=normalizeDifficulty(difficulty.dataset.draftForceDifficulty)",
  "DIFFICULTY_LABELS[force.difficulty]+' 난이도로 설정했습니다.'"
])assert.ok(draft.includes(token),`Sanctuary 4 composer contract missing ${token}`);

assert.ok(draftCss.includes('grid-template-columns:repeat(3,minmax(44px,1fr))'),'desktop composer must fit all three difficulty choices');
assert.ok(draftCss.includes('data-draft-force-difficulty="EASY"'),'composer must style the selected easy difficulty');
assert.ok(supportCss.includes('.sanctuary-management-force-difficulty.is-easy'),'public force badge must style easy difficulty');

for(const page of [desktop,mobile])assert.ok(page.includes('sanctuary4Difficulty=2026090111'),'desktop and mobile must invalidate cached Sanctuary 4 difficulty assets');

console.log('KINOJO Sanctuary 4 three-difficulty and item-level contract: PASS');
