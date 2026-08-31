const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=file=>fs.readFileSync(file,'utf8');
const main=read('sanctuary-management/js/sanctuary-management.js');
const draft=read('sanctuary-management/js/sanctuary-management-draft.js');
const css=read('sanctuary-management/css/sanctuary-management.css');
const supportCss=read('sanctuary-management/css/sanctuary-management-support.css');
const draftCss=read('sanctuary-management/css/sanctuary-management-draft.css');

for(const token of [
  'sanctuary-management-team-schedule',
  'sanctuary-management-team-title-band',
  'teamModeShortLabel',
  'sanctuary-management-edit-team',
  'sanctuary-management-force-difficulty',
  'function forceCarouselCompact()',
  "matchMedia('(max-width: 900px)')",
  'starts[starts.length-1]=cards.length-2',
  'visibleCount=forceCarouselCompact()?1:2',
  'forceCarouselCurrentStart',
])assert.ok(main.includes(token),`Stage 10 part 2 public UI contract missing ${token}`);

assert.equal(main.includes("meta.className='sanctuary-management-team-meta'"),false,'public team card must not render internal metadata');
assert.equal(main.includes("sanctuary-management-team-badge is-difficulty"),false,'difficulty must not be rendered as a team badge');
const teamCard=main.slice(main.indexOf('function createTeamCard'),main.indexOf('function showState'));
for(const token of ['overview.textContent=\'전체 포스 보기\'','schedule.textContent=\'일정 관리\'','edit.textContent='])assert.ok(teamCard.includes(token),`team action missing ${token}`);
assert.ok(teamCard.indexOf("overview.textContent='전체 포스 보기'")<teamCard.indexOf("schedule.textContent='일정 관리'"),'overview must precede schedule management');
assert.ok(teamCard.indexOf("schedule.textContent='일정 관리'")<teamCard.indexOf('edit.textContent='),'schedule management must precede edit');

for(const token of [
  'function selectedDifficulty(force=selectedForce())',
  'data-draft-force-difficulty="NORMAL"',
  'data-draft-force-difficulty="HARD"',
  'difficulty:selectedDifficulty(force)',
  'selectedDifficulty(item.force)',
  "syncDifficultyControls('NORMAL',true)",
  'difficulty:value(force.difficulty)',
  "layer.addEventListener('wheel',handleDraftWheel,{passive:false})",
  'const linkedScroller=',
])assert.ok(draft.includes(token),`Stage 10 part 2 composer contract missing ${token}`);
assert.equal(draft.includes('data-draft-difficulty='),false,'shared schedule must not expose a team-wide difficulty control');

for(const token of [
  '.sanctuary-management-team-schedule{',
  '.sanctuary-management-team-title-band{',
  '.sanctuary-management-team-meta{display:none!important}',
])assert.ok(css.includes(token),`Stage 10 part 2 team CSS missing ${token}`);
for(const token of [
  'grid-template-columns:repeat(2,minmax(0,1fr))',
  '.sanctuary-management-force-card.is-active{display:block',
  '@media(max-width:900px)',
  'is-page-entering-forward',
  'sanctuary-management-force-difficulty.is-hard',
])assert.ok(supportCss.includes(token),`Stage 10 part 2 force CSS missing ${token}`);
assert.ok(draftCss.includes('.sanctuary-management-force-difficulty-editor{'),'force-specific composer difficulty CSS missing');
for(const token of ['.sanctuary-management-linked-alt-panel{position:fixed','max-height:calc(100dvh - 28px)','overscroll-behavior:contain','scroll-behavior:smooth','.sanctuary-management-linked-alt-panel.has-more::after'])assert.ok(draftCss.includes(token),`linked-alt viewport/scroll contract missing ${token}`);

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  assert.ok(html.includes('stage10=2026083102'),`${page}: Stage 10 part 2 assets are not cache-busted`);
}

console.log('KINOJO sanctuary management Stage 10 part 2 contract: PASS');
