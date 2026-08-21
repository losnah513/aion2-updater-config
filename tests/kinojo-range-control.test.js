const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const range = require('../ui/kinojo-range-control.js');
const source = read('ui/kinojo-range-control.js');
const style = read('ui/kinojo-components.css');
const editor = read('sanctuary/js/sanctuary-editor.js');
const sanctuaryStyle = read('sanctuary/css/sanctuary.css');
const harness = read('tests/kinojo-range-control-harness.html');

assert.deepEqual(range.parseNumberList('0, 0.5, 2, invalid'), [0, 0.5, 2]);
assert.equal(range.nearestStop(1.42, [0, 1, 2]), 1);
assert.equal(range.nearestStop(1.76, '0,1,2'), 2);
assert.equal(range.toPercent(25, 0, 100), 25);
assert.equal(range.toPercent(120, 0, 100), 100);
assert.equal(range.toPercent(-4, 0, 100), 0);

for(const token of [
  "const ROOT_SELECTOR = '[data-kinojo-range]'",
  "'continuous'",
  "mode === 'steps'",
  "mode === 'interval'",
  "mode === 'thin'",
  "'kinojo-range-input'",
  "'kinojo-range-change'",
  "['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End']",
  'aria-valuetext',
  'MutationObserver',
  'Object.freeze(api)'
]) assert.ok(source.includes(token), `Shared range controller is missing ${token}`);

for(const token of [
  '.kinojo-range__control::before,.kinojo-range__control::after',
  '.kinojo-range__input::-webkit-slider-thumb',
  '.kinojo-range__input::-moz-range-thumb',
  '.kinojo-range--thin',
  '.kinojo-range--interval',
  '.kinojo-range--steps',
  'height:44px',
  '--kinojo-range-thumb:22px',
  '@media(pointer:coarse),(max-width:640px)',
  '@media(prefers-reduced-motion:reduce)',
  '@media(forced-colors:active)'
]) assert.ok(style.includes(token), `Shared range visual contract is missing ${token}`);

assert.ok(editor.includes('data-kinojo-range-stops="0,1,2"'), 'Sanctuary scope must declare its shared steps');
assert.ok(editor.includes("popover.addEventListener('kinojo-range-change'"), 'Sanctuary must consume the shared change event');
assert.equal(editor.includes('updateQuickScopeSlider'), false, 'Sanctuary must not duplicate shared slider behavior');
assert.equal(editor.includes('--quick-scope-progress'), false, 'Sanctuary must not duplicate shared slider progress');
assert.equal(sanctuaryStyle.includes('::-webkit-slider-thumb'), false, 'Sanctuary CSS must remain layout-only for ranges');
assert.equal(sanctuaryStyle.includes('::-moz-range-thumb'), false, 'Sanctuary CSS must remain layout-only for ranges');

for(const mode of ['continuous', 'steps', 'thin', 'interval']){
  assert.ok(harness.includes(`data-kinojo-range-mode="${mode}"`), `Visual harness is missing ${mode}`);
}
assert.ok(harness.includes("dataset.kinojoRangeHarness='ready'"), 'Visual harness readiness marker is missing');

for(const entry of ['sanctuary/index.html', 'm/sanctuary/index.html']){
  const html = read(entry);
  assert.ok(html.includes('kinojo-components.css?cache=2026082103'), `${entry}: component CSS is not pinned`);
  assert.ok(html.includes('kinojo-range-control.js?cache=2026082103'), `${entry}: range controller is not pinned`);
  assert.ok(html.indexOf('kinojo-range-control.js?cache=2026082103') < html.indexOf('sanctuary-editor.js?cache=2026082105'), `${entry}: range controller must load before its consumer`);
}

console.log('KINOJO shared range control contract: PASS');
