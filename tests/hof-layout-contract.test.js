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

assert.ok(css.includes('"enhance enhance pve pve pve pve"') && css.includes('"enhance enhance meter meter growth growth"') && css.includes('"pvp pvp pvp pvp growth growth"'), 'Desktop square domino-board topology is missing');
assert.ok(css.includes('--hof-domino-unit:clamp(60px,min(calc((100dvh - 196px)/6),calc((100vw - 380px)/6)),160px)'), 'Desktop HOF board must have one viewport-aware domino-unit source');
assert.ok(css.includes('width:calc(var(--hof-domino-unit) * 6 + 2px)!important') && css.includes('height:calc(var(--hof-domino-unit) * 6 + 2px)!important'), 'Six-card outer board must be a literal square');
assert.ok(css.includes('grid-template-columns:repeat(6,var(--hof-domino-unit))!important'), 'Desktop HOF board must use six equal columns');
assert.ok(css.includes('grid-template-rows:repeat(6,var(--hof-domino-unit))!important'), 'Desktop HOF board must use six equal rows');
assert.match(css,/hof-v2-board\{[\s\S]*?gap:0!important;[\s\S]*?padding:0!important;/, 'Positive board gaps would break the square domino board');
assert.ok(css.includes('grid-template-columns:max-content minmax(280px,300px)!important'), 'Desktop personal ranking must stay within 280–300px');
assert.ok(css.includes('width:300px!important') && css.includes('max-width:300px!important'), 'Personal ranking must not expand with unused width');
assert.equal(css.includes('grid-template-columns:minmax(0,2fr) minmax(340px,1fr)!important'), false, 'Obsolete flexible 2:1 outer split remains');
assert.match(css,/"enhance"\s*"meter"\s*"ranking-link-card"\s*"pve"\s*"pvp"\s*"growth"/, 'Mobile Hall of Fame order is missing');
assert.ok(css.includes('aspect-ratio:1/2!important'), 'Mobile God cards must remain literal 1:2 portrait cards');
assert.ok(css.includes('aspect-ratio:2/1!important'), 'Mobile wide cards must remain literal 2:1 landscape cards');
assert.equal(css.includes('--hof-square-card'), false, 'Obsolete individual-square card source remains');
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
  assert.ok(html.includes('hall.css?cache=2026082106'), `${entry}: Hall CSS cache key was not updated`);
  assert.ok(html.includes('hall-render.js?cache=20260821'), `${entry}: Hall render cache key was not updated`);
}

console.log('KINOJO Hall of Fame reference layout contract: PASS');
