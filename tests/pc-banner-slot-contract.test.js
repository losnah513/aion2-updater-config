const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('ui/kinojo-pc-banners.css');
const js = read('ui/kinojo-pc-banners.js');
const stagedCss = read('ui/kinojo-staged-loading.css');
const stagedJs = read('ui/kinojo-staged-loading.js');

assert.match(css,/@media \(min-width:1840px\)/, 'Future image slots must remain PC-only');
assert.match(css,/\.kinojo-pc-banner-slot\{[\s\S]*?width:300px;[\s\S]*?height:715px;/, 'PC slots must use the fixed 300 × 715 reference size');
assert.match(css,/\.kinojo-pc-banner-slot\{[\s\S]*?position:fixed;/, 'PC slots must stay fixed while the document scrolls');
assert.match(css,/border-radius:4px;/, 'PC slots must use only slightly rounded corners');
assert.match(css,/body \.kinojo-pc-banner-host\.kinojo-pc-standard-host\{[\s\S]*?width:1180px!important;[\s\S]*?max-width:1180px!important;/, 'Target PC pages must share the fixed 1180px content frame');
assert.equal(css.includes('left:calc((300px + 14px) / 2)'), false, 'The obsolete one-sided HOF banner offset must not remain');
assert.match(css,/body\.kinojo-page-home \.wrap\.kinojo-pc-standard-host\{\s*padding-left:44px;\s*padding-right:44px;/, 'HOME must preserve its existing 1092px inner card area inside the 1180px frame');
assert.match(css,/body\.kinojo-page-ranking \.ranking-wrap\.kinojo-pc-standard-host\{\s*padding-left:30px;\s*padding-right:30px;/, 'Ranking must preserve its existing 1120px inner board inside the 1180px frame');
assert.match(css,/body\.kinojo-page-hall \.hof-v2-layout\.kinojo-pc-standard-host\{[\s\S]*?justify-content:center!important;/, 'HOF cards and My Ranking must be centered without changing their card dimensions');
assert.match(css,/body\.kinojo-page-hall \.wrap\{\s*padding-top:0!important;/, 'HOF content and both PC slots must begin directly below the shared subbar');
assert.ok(js.includes("const label=width+' × '+height") && js.includes('slot.textContent!==label'), 'The slot center must display only its measured size without a mutation loop');
assert.match(stagedCss,/@media\(min-width:1840px\)\{\.kinojo-attached-subbar\.kinojo-standard-subbar\{height:52px!important;min-height:52px!important;max-height:52px!important;/, 'All target PC pages must share the same 52px subbar height at the 1920px layout');
assert.ok(stagedJs.includes('.kinojo-home-subbar,.hof-filter-bar,.ranking-toolbar'), 'HOME blank subbar must use the same attachment lifecycle as the existing page subbars');

const doubleSlotPages = [
  'home.html',
  'ranking/index.html',
  'legion-tree/index.html',
  'meter/index.html',
  'sanctuary/index.html'
];
for (const file of doubleSlotPages) {
  const html = read(file);
  const layoutCache='2026083001';
  assert.ok(html.includes(`kinojo-pc-banners.css?cache=${layoutCache}`), `${file}: shared PC slot CSS is missing`);
  const sizingCache='2026083001';
  assert.ok(html.includes(`kinojo-pc-banners.js?cache=${sizingCache}`), `${file}: shared PC slot sizing script is missing`);
  assert.equal((html.match(/data-kinojo-pc-banner/g) || []).length, 2, `${file}: exactly one left and one right slot are required`);
  assert.match(html,/<aside class="kinojo-pc-banner-slot is-left" data-kinojo-pc-banner aria-hidden="true"><\/aside>/, `${file}: left slot must start empty`);
  assert.match(html,/<aside class="kinojo-pc-banner-slot is-right" data-kinojo-pc-banner aria-hidden="true"><\/aside>/, `${file}: right slot must start empty`);
}

for (const file of ['home.html','ranking/index.html','legion-tree/index.html','meter/index.html']) {
  assert.ok(read(file).includes('kinojo-pc-standard-host'), `${file}: unified 1180px PC frame opt-in is missing`);
}

const standardSubbars={
  'home.html':'kinojo-home-subbar kinojo-standard-subbar',
  'ranking/index.html':'ranking-toolbar kinojo-standard-subbar',
  'legion-tree/index.html':'legion-tree-subbar kinojo-standard-subbar',
  'meter/index.html':'meter-live-subbar kinojo-standard-subbar',
  'hof/index.html':'hof-filter-bar kinojo-standard-subbar',
};
for(const [file,classes] of Object.entries(standardSubbars)){
  const html=read(file);
  assert.ok(html.includes(classes),`${file}: standard topbar-attached subbar is missing`);
  assert.ok(html.includes('kinojo-staged-loading.css?cache=2026083001'),`${file}: shared subbar CSS generation is stale`);
  assert.ok(html.includes('kinojo-staged-loading.js?cache=2026083001'),`${file}: shared subbar attachment generation is stale`);
}
assert.match(read('home.html'),/<body class="kinojo-page-home"[^>]*>\s*<section class="kinojo-home-subbar kinojo-standard-subbar kinojo-attached-subbar" aria-label="HOME 보조 메뉴"><\/section>\s*<main/,'HOME must ship the empty subbar in its final DOM position before first paint');

const hofHtml = read('hof/index.html');
const hofRender = read('hof/js/hall-render.js');
assert.ok(hofHtml.includes('kinojo-pc-banners.css?cache=2026083001'), 'HOF PC slot CSS is missing');
assert.ok(hofHtml.includes('kinojo-pc-banners.js?cache=2026083001'), 'HOF PC slot sizing script is missing');
assert.equal((hofRender.match(/kinojo-pc-standard-host/g) || []).length, 2, 'Both HOF render paths must opt into the unified 1180px PC frame');
assert.equal((hofRender.match(/kinojo-pc-banner-slot is-left/g) || []).length, 2, 'Both HOF render paths must include one left slot');
assert.equal((hofRender.match(/kinojo-pc-banner-slot is-right/g) || []).length, 2, 'Both HOF render paths must include one right slot');
assert.match(read('hof/css/hall.css'),/@media \(max-width:1839px\)\{\s*body\.kinojo-page-hall \.kinojo-pc-banner-slot\{\s*display:none!important;/, 'The HOF slot injected by shared rendering must not occupy mobile or Fold layout space');

for (const file of ['m/index.html','m/ranking/index.html','m/legion-tree/index.html','m/meter/index.html','m/sanctuary/index.html','m/sanctuary-schedule/index.html','m/hof/index.html']) {
  const html = read(file);
  assert.equal(html.includes('kinojo-pc-banners.css'), false, `${file}: PC slot CSS must not be loaded on mobile`);
  assert.equal(html.includes('kinojo-pc-banners.js'), false, `${file}: PC slot script must not be loaded on mobile`);
}

console.log('KINOJO fixed PC banner slot contract: PASS');
