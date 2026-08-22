const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('ui/kinojo-pc-banners.css');
const js = read('ui/kinojo-pc-banners.js');

assert.match(css,/@media \(min-width:1840px\)/, 'Future image slots must remain PC-only');
assert.match(css,/\.kinojo-pc-banner-slot\{[\s\S]*?width:300px;[\s\S]*?height:715px;/, 'PC slots must use the fixed 300 × 715 reference size');
assert.match(css,/\.kinojo-pc-banner-slot\{[\s\S]*?position:fixed;/, 'PC slots must stay fixed while the document scrolls');
assert.match(css,/border-radius:4px;/, 'PC slots must use only slightly rounded corners');
assert.match(css,/body\.kinojo-page-hall \.hof-v2-layout\.kinojo-pc-banner-host\{\s*left:calc\(\(300px \+ 14px\) \/ 2\);/, 'HOF must center the complete left-banner + board + My Ranking composition without creating a fixed-position containing block');
assert.ok(js.includes("const label=width+' × '+height") && js.includes('slot.textContent!==label'), 'The slot center must display only its measured size without a mutation loop');

const doubleSlotPages = [
  'home.html',
  'ranking/index.html',
  'legion-tree/index.html',
  'meter/index.html',
  'sanctuary/index.html',
  'sanctuary-schedule/index.html'
];
for (const file of doubleSlotPages) {
  const html = read(file);
  assert.ok(html.includes('kinojo-pc-banners.css?cache=2026082203'), `${file}: shared PC slot CSS is missing`);
  assert.ok(html.includes('kinojo-pc-banners.js?cache=2026082202'), `${file}: shared PC slot sizing script is missing`);
  assert.equal((html.match(/data-kinojo-pc-banner/g) || []).length, 2, `${file}: exactly one left and one right slot are required`);
  assert.match(html,/<aside class="kinojo-pc-banner-slot is-left" data-kinojo-pc-banner aria-hidden="true"><\/aside>/, `${file}: left slot must start empty`);
  assert.match(html,/<aside class="kinojo-pc-banner-slot is-right" data-kinojo-pc-banner aria-hidden="true"><\/aside>/, `${file}: right slot must start empty`);
}

const hofHtml = read('hof/index.html');
const hofRender = read('hof/js/hall-render.js');
assert.ok(hofHtml.includes('kinojo-pc-banners.css?cache=2026082203'), 'HOF PC slot CSS is missing');
assert.ok(hofHtml.includes('kinojo-pc-banners.js?cache=2026082202'), 'HOF PC slot sizing script is missing');
assert.equal((hofRender.match(/kinojo-pc-banner-slot is-left/g) || []).length, 2, 'Both HOF render paths must include the one left slot');
assert.equal(hofRender.includes('kinojo-pc-banner-slot is-right'), false, 'HOF must not add a second slot beside My Ranking');
assert.match(read('hof/css/hall.css'),/@media \(max-width:1839px\)\{\s*body\.kinojo-page-hall \.kinojo-pc-banner-slot\{\s*display:none!important;/, 'The HOF slot injected by shared rendering must not occupy mobile or Fold layout space');

for (const file of ['m/index.html','m/ranking/index.html','m/legion-tree/index.html','m/meter/index.html','m/sanctuary/index.html','m/sanctuary-schedule/index.html','m/hof/index.html']) {
  const html = read(file);
  assert.equal(html.includes('kinojo-pc-banners.css'), false, `${file}: PC slot CSS must not be loaded on mobile`);
  assert.equal(html.includes('kinojo-pc-banners.js'), false, `${file}: PC slot script must not be loaded on mobile`);
}

console.log('KINOJO fixed PC banner slot contract: PASS');
