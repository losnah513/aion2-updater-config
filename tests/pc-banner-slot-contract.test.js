const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('ui/kinojo-pc-banners.css');
const js = read('ui/kinojo-pc-banners.js');
const stagedCss = read('ui/kinojo-staged-loading.css');
const stagedJs = read('ui/kinojo-staged-loading.js');

assert.match(css,/@media \(min-width:1840px\)/, 'Future image slots must remain PC-only');
assert.match(css,/\.kinojo-pc-banner-slot\{[\s\S]*?width:300px;[\s\S]*?height:715px;/, 'PC slots must use the fixed 300 × 715 reference size');
assert.match(css,/\.kinojo-pc-banner-slot\{[\s\S]*?position:fixed;/, 'PC slots must stay fixed while the document scrolls');
assert.match(css,/html:has\(\.kinojo-pc-banner-host\)\{\s*overflow-y:scroll;\s*scrollbar-gutter:stable;/, 'PC banner pages must reserve a stable scrollbar gutter so shared rails do not shift between pages');
assert.match(css,/border-radius:4px;/, 'PC slots must use only slightly rounded corners');
assert.match(css,/body \.kinojo-pc-banner-host\.kinojo-pc-standard-host\{[\s\S]*?width:1180px!important;[\s\S]*?max-width:1180px!important;/, 'Target PC pages must share the fixed 1180px content frame');
assert.equal(css.includes('left:calc((300px + 14px) / 2)'), false, 'The obsolete one-sided HOF banner offset must not remain');
assert.match(css,/body\.kinojo-page-home \.wrap\.kinojo-pc-standard-host\{\s*padding-left:44px;\s*padding-right:44px;/, 'HOME must preserve its existing 1092px inner card area inside the 1180px frame');
assert.match(css,/body\.kinojo-page-ranking \.ranking-wrap\.kinojo-pc-standard-host\{\s*padding-left:30px;\s*padding-right:30px;/, 'Ranking must preserve its existing 1120px inner board inside the 1180px frame');
assert.ok(css.includes('[data-kinojo-pc-banner-mode="resolution"][data-kinojo-pc-banner-visible="true"]>.kinojo-pc-banner-slot'), 'Shared resolution-mode slot selector missing');
assert.ok(css.includes('display:grid!important') && css.includes('width:var(--kinojo-pc-banner-width,300px)') && css.includes('height:var(--kinojo-pc-banner-height,715px)'), 'Shared adaptive slot dimensions missing');
assert.ok(css.includes('[data-kinojo-pc-banner-mode="resolution"] .kinojo-pc-banner-image') && css.includes('object-fit:contain'), 'Scaled PC banners must keep the whole creative visible');
assert.match(css,/body\.kinojo-page-hall \.hof-v2-layout\.kinojo-pc-standard-host\{[\s\S]*?justify-content:center!important;/, 'HOF cards and My Ranking must be centered without changing their card dimensions');
assert.match(css,/body\.kinojo-page-hall \.wrap\{\s*padding-top:0!important;/, 'HOF content and both PC slots must begin directly below the shared subbar');
assert.ok(js.includes("const label=width+' × '+height") && js.includes('slot.textContent!==label'), 'The slot center must display only its measured size without a mutation loop');
assert.ok(js.includes('const resolutionThreshold=1808') && js.includes('scaledClientWidth=clientWidth*devicePixelRatio'), 'PC device-pixel eligibility calculation missing');
assert.ok(js.includes("width*referenceHeight/referenceWidth") && js.includes("width>=referenceWidth?'full':'scaled'"), 'Proportional full-creative scaling missing');
assert.ok(js.includes('const standardFrameWidth=1180') && js.includes('frameLeft=(clientWidth-frameWidth)/2'), 'PC banners must stay on the shared fixed PC frame');
assert.ok(js.includes('const standardTop=121') && js.includes('adaptive?standardTop'), 'PC banners must keep the same shared top coordinate between pages');
assert.ok(js.includes("setData(host,'kinojoPcBannerMode','resolution')"), 'Every desktop banner host must opt into the common resolution mode');
assert.equal(js.includes('kinojoPcBannerAnchor'),false,'Page-specific content widths must not anchor shared PC banners');
assert.ok(js.includes("--kinojo-ranking-safe-board-width") && js.includes("clientWidth-(minimumRail+compactGap)*2"), '200% zoom board safety reservation missing');
assert.ok(js.includes("visualViewport?.addEventListener?.('resize',refresh"), 'Browser zoom resize refresh missing');
assert.ok(js.includes("new ResizeObserver(()=>refresh())") && js.includes("observe(document.documentElement)"), 'Viewport width observer missing');
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
  const layoutCache='2026090101';
  assert.ok(html.includes(`kinojo-pc-banners.css?cache=${layoutCache}`), `${file}: shared PC slot CSS is missing`);
  const sizingCache='2026090101';
  assert.ok(html.includes(`kinojo-pc-banners.js?cache=${sizingCache}`), `${file}: shared PC slot sizing script is missing`);
  assert.equal((html.match(/data-kinojo-pc-banner(?=[\s>])/g) || []).length, 2, `${file}: exactly one left and one right slot are required`);
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

const mediaListeners=[];
const windowMock={
  location:{pathname:'/ranking/'},
  innerWidth:1536,
  innerHeight:864,
  outerWidth:1920,
  devicePixelRatio:1.25,
  screen:{availWidth:1920},
  matchMedia:()=>({matches:false,addEventListener:(type,handler)=>mediaListeners.push([type,handler])}),
  addEventListener:()=>{},
  visualViewport:{addEventListener:()=>{}}
};
const documentMock={
  readyState:'loading',
  currentScript:{src:'https://kinojo.info/ui/kinojo-pc-banners.js?cache=2026090101'},
  documentElement:{clientWidth:1536},
  addEventListener:()=>{},
  querySelectorAll:()=>[]
};
const sandbox={window:windowMock,document:documentMock,URL,console};
vm.createContext(sandbox);
vm.runInContext(js,sandbox);
const resolutionHost={dataset:{}};
assert.equal(windowMock.KinojoPcBanners.viewportSignals().physicalWidth,1920,'125% browser zoom must retain the 1920 device-pixel width');
assert.equal(windowMock.KinojoPcBanners.resolutionEligible(resolutionHost),true,'Every wide PC banner page must remain eligible below the 1840 CSS viewport');
assert.equal(resolutionHost.dataset.kinojoPcBannerMode,'resolution','The common resolution mode must be attached to every banner host');
assert.equal(resolutionHost.dataset.kinojoPcBannerVisible,'true','Wide PC eligibility state must be reflected on the host');
documentMock.documentElement.clientWidth=1280;
windowMock.innerWidth=1280;
windowMock.outerWidth=1280;
windowMock.devicePixelRatio=1;
assert.equal(windowMock.KinojoPcBanners.resolutionEligible(resolutionHost),false,'A genuinely narrow window must not masquerade as zoomed wide PC');
assert.equal(resolutionHost.dataset.kinojoPcBannerVisible,'false','Narrow window must clear the shared resolution display flag');

const hofHtml = read('hof/index.html');
const hofRender = read('hof/js/hall-render.js');
assert.ok(hofHtml.includes('kinojo-pc-banners.css?cache=2026090101'), 'HOF PC slot CSS is missing');
assert.ok(hofHtml.includes('kinojo-pc-banners.js?cache=2026090101'), 'HOF PC slot sizing script is missing');
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
