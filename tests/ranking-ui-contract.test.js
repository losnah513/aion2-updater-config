const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

for (const file of ['ranking/index.html','m/ranking/index.html']) {
  const html = read(file);
  assert.equal(html.includes('id="rankingStatus"'), false, `${file}: redundant ranking status copy remains`);
  assert.equal(html.includes('id="rankingLoadMore"'), false, `${file}: global load-more control remains`);
  assert.equal((html.match(/data-mobile-mode="PVE"/g) || []).length, 1, `${file}: PVE mobile tab count mismatch`);
  assert.equal((html.match(/data-mobile-mode="PVP"/g) || []).length, 1, `${file}: PVP mobile tab count mismatch`);
  assert.ok(html.includes('ranking.css?cache=2026082123'), `${file}: ranking CSS cache key missing`);
  assert.ok(html.includes('ranking-responsive.css?cache=2026082123'), `${file}: responsive CSS cache key missing`);
}

const pageCss = read('ranking/css/ranking.css');
const cardCss = read('ranking/css/ranking-card.css');
const responsiveCss = read('ranking/css/ranking-responsive.css');
const cardJs = read('ranking/js/ranking-card.js');
const renderJs = read('ranking/js/ranking-render.js');
const eventsJs = read('ranking/js/ranking-events.js');
const dataJs = read('ranking/js/ranking-data.js');

assert.ok(pageCss.includes('body.kinojo-page-ranking{') && pageCss.includes('margin:0;'), 'Ranking body must attach its subbar without the browser body gap');
assert.ok(pageCss.includes('grid-template-columns:minmax(0,1fr) minmax(0,1fr)'), 'PVE/PVP must share one split board');
assert.ok(pageCss.includes('.ranking-panel.pvp{') && pageCss.includes('border-left:1px solid var(--ranking-line)'), 'PVE/PVP divider missing');
assert.equal(pageCss.includes('box-shadow:inset 3px 0 0'), false, 'Panel header color residue must not remain');
assert.ok(pageCss.includes('.ranking-scroll-shell::after') && pageCss.includes('pointer-events:none'), 'Non-interactive bottom gradient missing');
assert.ok(pageCss.includes('.ranking-scroll-shell.has-more-below::after{opacity:1}'), 'Bottom gradient state contract missing');
assert.ok(cardCss.includes('overflow-y:auto') && cardCss.includes('scrollbar-width:none') && cardCss.includes('.ranking-card-list::-webkit-scrollbar{display:none'), 'Hidden independent scrollbar contract missing');
assert.ok(cardCss.includes('grid-template-columns:44px 44px minmax(0,1fr) 100px 100px'), 'Desktop compact card grid missing');
assert.ok(responsiveCss.includes('.ranking-board[data-mobile-mode="PVE"] .ranking-panel.pvp'), 'Mobile PVE/PVP panel switch missing');
assert.ok(responsiveCss.includes('grid-template-columns:minmax(340px,.9fr) minmax(0,1.1fr)') && responsiveCss.includes('"actions filters"'), 'Fold search/class split layout missing');
assert.ok(responsiveCss.includes('grid-template-columns:repeat(5,minmax(0,1fr))'), 'Fold class grid contract missing');
assert.ok(responsiveCss.includes('display:contents'), 'Fold toolbar children must participate in the stable two-row grid');
assert.equal(responsiveCss.includes('body.kinojo-page-ranking>.ranking-toolbar .ranking-filter-main{display:flex'), false, 'Fold toolbar must not force the overlapping one-line layout');
assert.equal(responsiveCss.includes('position:sticky;top:calc(var(--kinojo-common-topbar-height'), false, 'Mobile mode tabs must not overlap the attached toolbar');

assert.ok(renderJs.includes('내 캐릭터 순위 보기'), 'My-character jump row missing');
assert.ok(renderJs.includes('data-scroll-list'), 'Per-panel scroll list missing');
assert.ok(cardJs.includes('ranking-server-tag'), 'Server tag beside legion missing');
assert.equal(cardJs.includes("item.server)+' · '+U.escapeHtml(item.className"), false, 'Visible class text must not remain beside server');
assert.equal(cardJs.includes('ranking-metric-divider'), false, 'Horizontal metric divider must be removed');
assert.ok(eventsJs.includes("invokeEdgeFunction('kinojo-member-profile',{action:'characters'"), 'Existing authenticated character endpoint must be reused');
assert.ok(eventsJs.includes('normalizeServerId(card?.dataset?.serverId) === normalizeServerId(character?.serverId)'), 'Exact server identity comparison missing');
assert.ok(eventsJs.includes('normalizeIdentity(card?.dataset?.charName) === normalizeIdentity(character?.characterName)'), 'Exact character-name identity comparison missing');
assert.ok(eventsJs.includes('const scrollPositions = { PVE:0, PVP:0 }'), 'Independent PVE/PVP scroll state missing');
assert.ok(eventsJs.includes("shell.classList.toggle('has-more-below'"), 'Gradient end-state updater missing');
assert.ok(eventsJs.includes("loadRanking({append:true,triggerMode:mode})"), 'Internal infinite-scroll append missing');
assert.equal(eventsJs.includes('window.scrollTo'), false, 'Panel scrolling must not move the page');
assert.ok(dataJs.includes("kinojo_web_get_legion_ranking"), 'Existing Server ranking contract changed or missing');

const sandbox = {
  window:{
    KinojoRanking:{},
    KinojoCharacterProfileImage:{classIconFor:()=>'/class.png'}
  },
  console
};
vm.createContext(sandbox);
vm.runInContext(read('ranking/js/ranking-utils.js'), sandbox);
vm.runInContext(cardJs, sandbox);
const card = sandbox.window.KinojoRanking.card.cardHtml({
  rank_no:7,
  character_name:'테스트캐릭터',
  main_character_name:'테스트캐릭터',
  is_main:true,
  server_name:'지켈',
  server_id:1001,
  class_name:'수호성',
  ranking_legion_name:'키노조',
  legion_name:'키노조',
  pve_power_total:123456,
  pve_item_level:321,
  rank_growth_label:'유지',
  rank_review_text:'기록 유지'
},'PVE');
assert.ok(card.includes('&lt;키노조&gt;</span><span class="ranking-server-tag">[지켈]</span>'), 'Rendered legion/server line mismatch');
assert.equal(card.includes('지켈 · 수호성'), false, 'Rendered visible class text remains');
assert.ok(card.indexOf('ranking-metric power') < card.indexOf('ranking-metric item'), 'Combat power must render above item level');

console.log('KINOJO ranking unified panel and compact card contract: PASS');
