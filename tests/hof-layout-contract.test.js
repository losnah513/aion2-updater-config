const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const render = read('hof/js/hall-render.js');
const css = read('hof/css/hall.css');
const commonCss = read('ui/kinojo-common-ui.css');

assert.ok(render.includes('profile_level_icon_pc.png'), 'Enhance God must use the official item-level icon');
assert.ok(render.includes('profile_power_icon_pc.png'), 'Growth God must use the official combat-power icon');
assert.equal(render.includes("if(metric==='enhance')return '✦'"), false, 'Arbitrary enhance icon remains');
assert.equal(render.includes("if(metric==='growth')return '▲'"), false, 'Arbitrary growth icon remains');

assert.ok(render.includes('hof-v2-area-meter'), 'DPS slot needs a semantic grid area');
assert.ok(render.includes('hof-v2-area-ranking-link-card'), 'Ranking link slot needs a semantic grid area');
assert.ok(render.includes("+'<div id=\"hallSlotPve\" class=\"hof-v2-area hof-v2-area-pve"), 'PVE slot class is not semantic');
assert.ok(render.includes("+'<div id=\"hallSlotPvp\" class=\"hof-v2-area hof-v2-area-pvp"), 'PVP slot class is not semantic');
assert.equal(render.includes('function hofPowerClass('), false, 'TOP3 class icon must not live in a detached grid column');
const powerInfoRender = render.slice(render.indexOf('function hofPowerInfo'),render.indexOf('function hofPowerAside'));
assert.match(powerInfoRender,/hof-v2-power-class-slot[\s\S]*?hofClassIcon\(item\)[\s\S]*?hof-v2-top3-name[\s\S]*?hof-v2-top3-server[\s\S]*?hof-v2-owner-slot/, 'TOP3 identity must keep class, name, server, and owner together');
assert.ok(render.includes("hof-v2-top3-server\">['+escapeHtml(server)+']</span>"), 'TOP3 server must render as [server] beside the character name');
assert.equal(render.includes('hof-v2-server-badge'), false, 'TOP3 server must not render as a badge');
assert.ok(render.includes('<span class="hof-v2-owner-badge">부캐</span>'), 'Sub character badge must use only the label 부캐');
assert.equal(render.includes('부캐 · '), false, 'Sub character badge must not include an owner name');
assert.ok(render.includes("size!=='power-card'&&badge?.label"), 'TOP3 portraits must suppress extra identity badges');
assert.equal(render.includes("hofClassIcon(safeItem)+'<span>'+escapeHtml(hofClassName"), false, 'God cards must not repeat visible class text beside the icon');
assert.equal(render.includes('<span>이번 주 합계</span>'), false, 'God cards must not repeat the weekly increase as a total row');

const desktopAreas = [
  ['enhance','enhance','enhance','meter','meter','meter','meter','meter','meter','meter'],
  ['enhance','enhance','enhance','ranking-link-card','ranking-link-card','ranking-link-card','ranking-link-card','ranking-link-card','ranking-link-card','ranking-link-card'],
  ['pve','pve','pve','pve','pve','pve','pve','growth','growth','growth'],
  ['pvp','pvp','pvp','pvp','pvp','pvp','pvp','growth','growth','growth']
];
const areaRect = name => {
  const cells=[];
  desktopAreas.forEach((row,y)=>row.forEach((value,x)=>{if(value===name)cells.push({x,y});}));
  const xs=cells.map(cell=>cell.x);const ys=cells.map(cell=>cell.y);
  return {width:Math.max(...xs)-Math.min(...xs)+1,height:Math.max(...ys)-Math.min(...ys)+1,cells:cells.length};
};
const wideRects=['pve','meter','pvp','ranking-link-card'].map(areaRect);
const godRects=['enhance','growth'].map(areaRect);
assert.deepEqual(wideRects,[{width:7,height:1,cells:7},{width:7,height:1,cells:7},{width:7,height:1,cells:7},{width:7,height:1,cells:7}], 'Four wide cards must have identical 7x1 spans');
assert.deepEqual(godRects,[{width:3,height:2,cells:6},{width:3,height:2,cells:6}], 'Two God cards must have identical 3x2 spans');
assert.equal((7/10)/(1/4),2.8,'Wide card ratio must be 2.8:1 inside the square board');
assert.equal((3/10)/(2/4),0.6,'God card ratio must be 3:5 inside the square board');

assert.ok(css.includes('"enhance enhance enhance meter meter meter meter meter meter meter"') && css.includes('"enhance enhance enhance ranking-link-card ranking-link-card ranking-link-card ranking-link-card ranking-link-card ranking-link-card ranking-link-card"') && css.includes('"pve pve pve pve pve pve pve growth growth growth"') && css.includes('"pvp pvp pvp pvp pvp pvp pvp growth growth growth"'), 'Desktop DPS/ranking/PVE/PVP slot topology is missing');
assert.ok(css.includes('--hof-board-size:clamp(480px,min(calc(100svh - 196px),calc(100vw - 380px)),960px)'), 'Desktop HOF board must use stable viewport height');
assert.ok(css.includes('width:var(--hof-board-size)!important') && css.includes('height:var(--hof-board-size)!important'), 'Six-card outer board must be a literal square');
assert.ok(css.includes('grid-template-columns:repeat(10,minmax(0,1fr))!important'), 'Desktop HOF board must use ten equal columns');
assert.ok(css.includes('grid-template-rows:repeat(4,minmax(0,1fr))!important'), 'Desktop HOF board must use four equal rows');
assert.match(css,/hof-v2-board\{[\s\S]*?gap:0!important;[\s\S]*?padding:0!important;/, 'Positive board gaps would break the square board');
assert.match(css,/@media \(min-width:761px\)\{[\s\S]*?hof-v2-area\{\s*padding:2\.5px!important;/, 'Each desktop grid area must inset by 2.5px so adjacent cards have a visible 5px separation');
assert.match(css,/hof-v2-area \.hof-v2-panel\{\s*border:1px solid var\(--hof-line\)!important;\s*border-radius:4px!important;/, 'Desktop area cards must use a visible border and only slightly rounded corners');
assert.match(css,/hof-v2-board\{[\s\S]*?border-radius:4px!important;/, 'The six-card square outer frame must use only slightly rounded corners');
assert.equal(css.includes('100dvh'),false,'Dynamic viewport height would resize the board while scrolling');
assert.ok(css.includes('grid-template-columns:max-content minmax(280px,300px)!important'), 'Desktop personal ranking must stay within 280–300px');
assert.ok(css.includes('width:300px!important') && css.includes('max-width:300px!important'), 'Personal ranking must not expand with unused width');
assert.match(css,/@media \(min-width:761px\) and \(max-width:1180px\)\{[\s\S]*?--hof-my-rank-width:clamp\(140px,16vw,150px\);[\s\S]*?grid-template-columns:max-content var\(--hof-my-rank-width\)!important;/, 'Fold portrait and landscape must keep the half-width My Rank card on the right');
assert.ok(css.includes('calc(100vw - var(--hof-my-rank-width) - 62px)'), 'Fold landscape board must reserve wrap padding, My Rank gap, and scrollbar width');
assert.equal(css.includes('grid-template-columns:minmax(0,2fr) minmax(340px,1fr)!important'), false, 'Obsolete flexible 2:1 outer split remains');
assert.match(css,/"meter meter"\s*"pve pve"\s*"pvp pvp"\s*"enhance growth"\s*"ranking-link-card ranking-link-card"/, 'Mobile DPS/PVE/PVP/God-pair/ranking order is missing');
assert.ok(css.includes('aspect-ratio:3/5!important'), 'Mobile God cards must share the 3:5 portrait ratio');
assert.ok(css.includes('aspect-ratio:14/5!important'), 'Mobile wide cards must share the 2.8:1 landscape ratio');
assert.equal(css.includes('--hof-domino-unit'), false, 'Obsolete unequal domino sizing source remains');
assert.equal(css.includes('--hof-square-card'), false, 'Obsolete individual-square card source remains');

const shell = render.slice(render.indexOf('function renderHallShell'),render.indexOf('function renderHallSlots'));
const mobileDomOrder=['hallSlotMeter','hallSlotPve','hallSlotPvp','hallSlotEnhance','hallSlotGrowth','hallSlotRankingLink'];
mobileDomOrder.reduce((previous,id)=>{
  const current=shell.indexOf('id="'+id+'"');
  assert.ok(current>previous,`${id} must follow the narrow-mobile DOM order`);
  return current;
},-1);
assert.ok(css.includes('height:calc(100% - 44px)!important'), 'TOP3 body must fit the panel below its header');
assert.ok(css.includes('grid-template-columns:30px minmax(0,1fr) minmax(72px,7vw,104px) clamp(58px,5vw,84px)'), 'TOP3 rank/identity/score/profile one-line grid is missing');
assert.ok(css.includes('grid-template-rows:1fr!important'), 'TOP3 entries must stay on one row');
assert.match(css,/hof-v2-top3-info\{\s*grid-column:2!important;/, 'TOP3 identity must immediately follow the rank');
assert.match(css,/hof-v2-top3-aside\{\s*grid-column:3!important;\s*grid-row:1!important;/, 'TOP3 score must stay beside the identity on the same row');
assert.match(css,/hof-v2-power-portrait\{\s*grid-column:4!important;\s*grid-row:1!important;/, 'TOP3 profile must finish the same centered row');
assert.match(render,/hof-v2-top3-name[^\n]*hof-v2-top3-server[^\n]*hof-v2-owner-slot[^\n]*hofOwnerBadge\(item\)/, 'Name, [server], and main/sub badge must stay together');
assert.match(css,/hof-v2-power-class-slot \.hof-v2-class-icon\{[\s\S]*?width:32px!important;[\s\S]*?border:0!important;[\s\S]*?border-radius:0!important;[\s\S]*?background:transparent!important;/, 'TOP3 class icon must use its raw shape without a circular badge');
assert.match(css,/@media \(max-width:760px\)\{[\s\S]*?hof-v2-power-class-slot \.hof-v2-class-icon\{[\s\S]*?width:clamp\(16px,5\.2vw,30px\)!important;/, 'Narrow-mobile TOP3 class icons must scale within each row instead of being clipped');
assert.match(css,/@media \(max-width:760px\)\{[\s\S]*?hof-v2-top3-info,[\s\S]*?hof-v2-top3-aside\{\s*padding:0!important;/, 'Narrow-mobile TOP3 identity and score content must not exceed its row with vertical padding');
assert.match(css,/hof-v2-god-class\{\s*grid-column:1!important;/, 'God-card class icon must occupy the left edge');
assert.match(css,/hof-v2-god-class \.hof-v2-class-icon\{[\s\S]*?width:clamp\(48px,5vw,64px\)!important;[\s\S]*?max-height:64px!important;/, 'God-card class icon must remain visible and smaller than its profile portrait');
assert.ok(css.includes('border-top:1px solid rgba(22,34,58,.14)!important'), 'Single TOP3 row divider is missing');
assert.match(css,/padding:0!important;\s*gap:0!important;/, 'TOP3 rows must fill the complete panel body');
assert.match(commonCss,/body\.kinojo-page-hall\{\s*--kinojo-page-max:1520px;/, 'Hall page width must not be capped at 1120px');

const myRankingRender = render.slice(render.indexOf('function hofMyRankingPanel'),render.indexOf('function setHallSlot'));
assert.ok(myRankingRender.includes('<div class="hof-v2-my-head"><h2>내 랭킹</h2></div>'), 'My Ranking title must contain only the title text');
assert.equal(myRankingRender.includes('MY KINOJO'), false, 'My Ranking kicker must be removed');
assert.equal(myRankingRender.includes('hof-v2-title-icon'), false, 'My Ranking title icon must be removed');
assert.equal(myRankingRender.includes('scopeLabel'), false, 'My Ranking scope subtitle must be removed');
assert.equal(myRankingRender.includes('hof-v2-my-current-grid'), false, 'My Ranking must use one unified single-row list');
assert.ok(myRankingRender.includes("'<div class=\"hof-v2-my-profile\">'+hofRankPortrait(item,0,'my')+'<strong>'"), 'My Ranking profile block must contain only the rectangular profile and name');
assert.ok(myRankingRender.includes("const metrics=['pve','pvp','enhance','growth','like','dislike']"), 'My Ranking must expose the complete six-metric snapshot contract');
assert.ok(myRankingRender.includes("['좋아요','like']"), 'My Ranking must expose the Like metric');
assert.ok(myRankingRender.includes("['싫어요','dislike']"), 'My Ranking must expose the Dislike metric');
assert.ok(myRankingRender.includes('hof-v2-my-mode-badge'), 'My Ranking PVE/PVP labels must use colored badges');
assert.ok(myRankingRender.includes('hof-v2-my-stats'), 'My Ranking must visually separate combat power and item level');
assert.ok(myRankingRender.includes('>전투력</dt>') && myRankingRender.includes('>아이템레벨</dt>'), 'My Ranking stat labels must remain clearly visible');
assert.ok(myRankingRender.includes("hofMetricIconHtml(metric)"), 'Enhance/Growth rows must use their official metric artwork');
assert.match(css,/hof-v2-my-profile \.hof-v2-portrait\.my\{[\s\S]*?border-radius:4px!important;/, 'My Ranking profile must not be cropped into a circle');
assert.match(css,/hof-v2-my-profile\{[\s\S]*?min-height:150px!important;[\s\S]*?flex-direction:column!important;/, 'My Ranking profile area must be taller and place the name below the centered portrait');
assert.match(css,/hof-v2-my-profile \.hof-identity-portrait\{[\s\S]*?width:94px!important;[\s\S]*?height:94px!important;/, 'My Ranking desktop portrait must grow with the taller profile area');
assert.match(css,/hof-v2-my-god-row\{[\s\S]*?grid-template-columns:30px minmax\(0,1fr\) auto!important;/, 'Enhance/Growth icon, label, and score must stay aligned');

for (const entry of ['hof/index.html', 'm/hof/index.html']) {
  const html = read(entry);
  assert.ok(html.includes('hall.css?cache=2026082501'), `${entry}: Hall CSS cache key was not updated`);
  assert.ok(html.includes('hall-render.js?cache=2026082811'), `${entry}: Hall render cache key was not updated`);
  assert.ok(html.includes('hall-data.js?cache=2026082501'), `${entry}: Hall data cache key was not updated`);
  assert.ok(html.includes('app.js?cache=2026082501'), `${entry}: Hall app cache key was not updated`);
}

console.log('KINOJO Hall of Fame reference layout contract: PASS');
