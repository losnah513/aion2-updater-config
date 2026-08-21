const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const contract = require('../ui/kinojo-my-info-image-contract.js');
const editor = require('../ui/kinojo-my-info-image-editor.js');
const source = read('ui/kinojo-my-info-image-editor.js');
const style = read('ui/kinojo-my-info.css');
const harness = read('tests/my-info-image-editor-harness.html');

assert.equal(editor.normalizeSlot('front', contract), 'FRONT');
assert.equal(editor.normalizeSlot(' upper_body ', contract), 'UPPER_BODY');
assert.throws(() => editor.normalizeSlot('avatar', contract), /Unsupported My Info image slot/);
assert.deepEqual(editor.constants.SLOT_KEYS, ['PROFILE', 'FRONT', 'BACK', 'UPPER_BODY']);

assert.ok(Math.abs(editor.coverScale(1200, 1800, 400, 600, 0) - 1 / 3) < 1e-12);
assert.ok(Math.abs(editor.coverScale(1200, 1800, 600, 400, 90) - 1 / 3) < 1e-12);
assert.ok(editor.coverScale(1200, 1800, 400, 600, 45) > 0.58);

const centered = editor.clampTranslation(999, -999, {
  imageWidth: 1200,
  imageHeight: 1800,
  frameWidth: 400,
  frameHeight: 600,
  rotation: 0,
  scale: 1 / 3
});
assert.equal(centered.x, 0);
assert.equal(centered.y, 0);

const movable = editor.clampTranslation(1000, 1000, {
  imageWidth: 1200,
  imageHeight: 1800,
  frameWidth: 400,
  frameHeight: 600,
  rotation: 0,
  scale: 2 / 3
});
assert.equal(movable.x, 200);
assert.equal(movable.y, 300);

for(const slot of contract.referenceSlotOrder){
  const definition = contract.slots[slot];
  assert.ok(source.includes('definition.guideAssetPath'), `${slot}: editor must consume the contract guide path`);
  assert.ok(harness.includes(`data-guide-slot="${slot}"`), `${slot}: visual harness guide trigger is missing`);
  assert.ok(definition.preAttachGuide, `${slot}: capture guidance is required`);
}

for(const token of [
  'renderGuideCards',
  'kinojoImageGuideCard',
  'kinojo-image-guide-card__notice',
  'data-kinojo-image-editor-frame',
  'kinojo-my-info-editor-open',
  'kinojo-my-info-editor-change',
  'kinojo-my-info-editor-confirm',
  'kinojo-my-info-editor-close',
  'data-kinojo-range-mode="continuous"',
  'data-kinojo-range-mode="thin"',
  "event.key === 'Escape'",
  "event.key !== 'Tab'",
  'setPointerCapture',
  'releasePointerCapture',
  'revokeObjectURL',
  'aria-modal="true"',
  'previewOnly: true',
  'Object.freeze(api)'
]) assert.ok(source.includes(token), `Image editor foundation is missing ${token}`);

for(const token of [
  '.kinojo-image-guide-card',
  '.kinojo-image-editor__frame',
  '.kinojo-image-editor__source',
  '.kinojo-image-editor__guide',
  '.kinojo-image-editor__profile-safe',
  'touch-action:none',
  'min-height:44px',
  '@media(max-width:760px)',
  '@media(prefers-reduced-motion:reduce)',
  '@media(forced-colors:active)'
]) assert.ok(style.includes(token), `Image editor visual contract is missing ${token}`);

for(const forbidden of ['canvas', 'toBlob', 'convertToBlob', 'image/webp', 'fetch(', 'supabase', 'uploadOriginal']){
  assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, `B-1 must not implement B-2/B-3 behavior: ${forbidden}`);
}

for(const file of [
  'ui/kinojo-components.css',
  'ui/kinojo-my-info.css',
  'ui/kinojo-my-info-image-contract.js',
  'ui/kinojo-range-control.js',
  'ui/kinojo-my-info-image-editor.js'
]) assert.ok(harness.includes(file), `Visual harness must load ${file}`);

assert.ok(harness.includes("dataset.kinojoImageEditorHarness = 'ready'"), 'Visual harness readiness marker is missing');
assert.ok(harness.includes('KinojoMyInfoImageEditor.renderGuideCards'), 'Visual harness must connect the three guide cards');
assert.ok(harness.includes('KinojoMyInfoImageEditor.open'), 'Visual harness must open the shared editor');

console.log('KINOJO My Info image editor foundation: PASS');
