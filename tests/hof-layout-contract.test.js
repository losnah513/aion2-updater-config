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

assert.ok(css.includes('"enhance meter meter"') && css.includes('"pve pve growth"'), 'Desktop reference-proportion grid is missing');
assert.ok(css.includes('--hof-square-track:clamp(148px,calc((100dvh - 196px)/4),216px)'), 'Desktop HOF board must have one viewport-aware square-track source');
assert.ok(css.includes('grid-template-columns:repeat(3,var(--hof-square-track))!important'), 'Desktop HOF board must use three square columns');
assert.ok(css.includes('grid-template-rows:repeat(4,var(--hof-square-track))!important'), 'Desktop HOF board must use four square rows');
assert.match(css,/hof-v2-board\{[\s\S]*?gap:0!important;[\s\S]*?padding:0!important;/, 'Positive board gaps would break literal 2:1 and 1:2 card ratios');
assert.ok(css.includes('grid-template-columns:max-content minmax(280px,300px)!important'), 'Desktop personal ranking must stay within 280–300px');
assert.ok(css.includes('width:300px!important') && css.includes('max-width:300px!important'), 'Personal ranking must not expand with unused width');
assert.equal(css.includes('grid-template-columns:minmax(0,2fr) minmax(340px,1fr)!important'), false, 'Obsolete flexible 2:1 outer split remains');
assert.match(css,/"enhance"\s*"meter"\s*"ranking-link-card"\s*"pve"\s*"pvp"\s*"growth"/, 'Mobile Hall of Fame order is missing');
assert.ok(css.includes('aspect-ratio:1/2!important') && css.includes('aspect-ratio:2/1!important'), 'Mobile cards must preserve literal tall/wide ratios');
assert.ok(css.includes('height:calc(100% - 44px)!important'), 'TOP3 body must fit the panel below its header');
assert.ok(css.includes('grid-template-columns:30px clamp(32px,3vw,42px) minmax(64px,1fr) minmax(76px,90px) clamp(48px,5vw,68px)'), 'Compact desktop TOP3 rank/class/identity/score/portrait grid is missing');
assert.match(css,/hof-v2-power-class-slot\{\s*grid-column:2!important;/, 'TOP3 class icon must be the first field after rank');
assert.match(css,/hof-v2-top3-info\{\s*grid-column:3!important;/, 'TOP3 identity must follow the class icon');
assert.match(css,/hof-v2-power-class-slot \.hof-v2-class-icon\{[\s\S]*?height:calc\(100% - 8px\)!important;[\s\S]*?max-height:36px!important;/, 'TOP3 class icon must stay inside the character row');
assert.match(css,/hof-v2-god-class\{\s*grid-column:1!important;/, 'God-card class icon must occupy the left edge');
assert.match(css,/hof-v2-god-class \.hof-v2-class-icon\{[\s\S]*?width:clamp\(30px,3vw,40px\)!important;[\s\S]*?max-height:40px!important;/, 'God-card class icon must remain smaller than its profile portrait');
assert.ok(css.includes('border-top:1px solid rgba(22,34,58,.14)!important'), 'Single TOP3 row divider is missing');
assert.match(css,/padding:0!important;\s*gap:0!important;/, 'TOP3 rows must fill the complete panel body');
assert.match(commonCss,/body\.kinojo-page-hall\{\s*--kinojo-page-max:1520px;/, 'Hall page width must not be capped at 1120px');

for (const entry of ['hof/index.html', 'm/hof/index.html']) {
  const html = read(entry);
  assert.ok(html.includes('hall.css?cache=2026082104'), `${entry}: Hall CSS cache key was not updated`);
  assert.ok(html.includes('hall-render.js?cache=20260821'), `${entry}: Hall render cache key was not updated`);
}

console.log('KINOJO Hall of Fame reference layout contract: PASS');
