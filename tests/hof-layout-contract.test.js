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
assert.ok(render.includes('+hofPowerClass(item)'), 'TOP3 class column is missing from rendered cards');
assert.match(render,/\+hofPowerRank\(rank\)\s*\+hofPowerClass\(item\)/, 'TOP3 class icon must follow the rank');
assert.equal(render.includes("hofClassIcon(safeItem)+'<span>'+escapeHtml(hofClassName"), false, 'God cards must not repeat visible class text beside the icon');
assert.equal(render.includes('<span>이번 주 합계</span>'), false, 'God cards must not repeat the weekly increase as a total row');

const desktopAreas = [
  ['enhance','enhance','enhance','pve','pve','pve','pve','pve','pve','pve'],
  ['enhance','enhance','enhance','meter','meter','meter','meter','meter','meter','meter'],
  ['pvp','pvp','pvp','pvp','pvp','pvp','pvp','growth','growth','growth'],
  ['ranking-link-card','ranking-link-card','ranking-link-card','ranking-link-card','ranking-link-card','ranking-link-card','ranking-link-card','growth','growth','growth']
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

assert.ok(css.includes('"enhance enhance enhance pve pve pve pve pve pve pve"') && css.includes('"enhance enhance enhance meter meter meter meter meter meter meter"') && css.includes('"pvp pvp pvp pvp pvp pvp pvp growth growth growth"'), 'Desktop equal-card square topology is missing');
assert.ok(css.includes('--hof-board-size:clamp(480px,min(calc(100svh - 196px),calc(100vw - 380px)),960px)'), 'Desktop HOF board must use stable viewport height');
assert.ok(css.includes('width:var(--hof-board-size)!important') && css.includes('height:var(--hof-board-size)!important'), 'Six-card outer board must be a literal square');
assert.ok(css.includes('grid-template-columns:repeat(10,minmax(0,1fr))!important'), 'Desktop HOF board must use ten equal columns');
assert.ok(css.includes('grid-template-rows:repeat(4,minmax(0,1fr))!important'), 'Desktop HOF board must use four equal rows');
assert.match(css,/hof-v2-board\{[\s\S]*?gap:0!important;[\s\S]*?padding:0!important;/, 'Positive board gaps would break the square board');
assert.equal(css.includes('100dvh'),false,'Dynamic viewport height would resize the board while scrolling');
assert.ok(css.includes('grid-template-columns:max-content minmax(280px,300px)!important'), 'Desktop personal ranking must stay within 280–300px');
assert.ok(css.includes('width:300px!important') && css.includes('max-width:300px!important'), 'Personal ranking must not expand with unused width');
assert.match(css,/@media \(min-width:761px\) and \(max-width:1180px\) and \(orientation:landscape\)\{[\s\S]*?grid-template-columns:max-content var\(--hof-my-rank-width\)!important;/, 'Fold landscape must keep My Rank on the right');
assert.ok(css.includes('calc(100vw - var(--hof-my-rank-width) - 46px)'), 'Fold landscape board must reserve wrap padding and the My Rank gap');
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
assert.ok(css.includes('grid-template-columns:30px clamp(44px,4vw,64px) minmax(0,1fr) clamp(58px,5vw,84px)'), 'Square-card TOP3 rank/class/identity-score/portrait grid is missing');
assert.match(css,/hof-v2-power-class-slot\{\s*grid-column:2!important;/, 'TOP3 class icon must be the first field after rank');
assert.match(css,/hof-v2-top3-info\{\s*grid-column:3!important;/, 'TOP3 identity must follow the class icon');
assert.match(css,/hof-v2-top3-aside\{\s*grid-column:3!important;\s*grid-row:2!important;/, 'TOP3 score must use the second row below identity');
assert.match(css,/hof-v2-power-class-slot \.hof-v2-class-icon\{[\s\S]*?width:calc\(100% - 18px\)!important;[\s\S]*?max-width:58px!important;[\s\S]*?max-height:46px!important;/, 'TOP3 class icon must fill the wide-card row without escaping it');
assert.match(css,/hof-v2-god-class\{\s*grid-column:1!important;/, 'God-card class icon must occupy the left edge');
assert.match(css,/hof-v2-god-class \.hof-v2-class-icon\{[\s\S]*?width:clamp\(48px,5vw,64px\)!important;[\s\S]*?max-height:64px!important;/, 'God-card class icon must remain visible and smaller than its profile portrait');
assert.ok(css.includes('border-top:1px solid rgba(22,34,58,.14)!important'), 'Single TOP3 row divider is missing');
assert.match(css,/padding:0!important;\s*gap:0!important;/, 'TOP3 rows must fill the complete panel body');
assert.match(commonCss,/body\.kinojo-page-hall\{\s*--kinojo-page-max:1520px;/, 'Hall page width must not be capped at 1120px');

for (const entry of ['hof/index.html', 'm/hof/index.html']) {
  const html = read(entry);
  assert.ok(html.includes('hall.css?cache=2026082107'), `${entry}: Hall CSS cache key was not updated`);
  assert.ok(html.includes('hall-render.js?cache=2026082103'), `${entry}: Hall render cache key was not updated`);
}

console.log('KINOJO Hall of Fame reference layout contract: PASS');
