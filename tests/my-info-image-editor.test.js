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

const matrix = editor.outputMatrix({frameWidth:400,frameHeight:600,scale:0.5,rotation:0,x:10,y:-20}, contract.slots.FRONT);
assert.equal(matrix.a, 1);
assert.equal(matrix.b, 0);
assert.equal(Math.abs(matrix.c), 0);
assert.equal(matrix.d, 1);
assert.equal(matrix.e, 420);
assert.equal(matrix.f, 560);
assert.deepEqual([matrix.frameScaleX,matrix.frameScaleY,matrix.outputWidth,matrix.outputHeight],[2,2,800,1200]);

const good = editor.qualityReport({frameWidth:400,frameHeight:600,scale:0.5}, contract.slots.FRONT, contract.output);
const caution = editor.qualityReport({frameWidth:400,frameHeight:600,scale:0.625}, contract.slots.FRONT, contract.output);
const low = editor.qualityReport({frameWidth:400,frameHeight:600,scale:1}, contract.slots.FRONT, contract.output);
assert.equal(good.level, 'GOOD');
assert.equal(good.sourcePixelsPerOutputPixel, 1);
assert.equal(caution.level, 'CAUTION');
assert.equal(caution.sourcePixelsPerOutputPixel, 0.8);
assert.equal(low.level, 'LOW');
assert.equal(low.sourcePixelsPerOutputPixel, 0.5);
assert.equal(low.blocksExport, false);

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
  'kinojo-my-info-editor-error',
  'data-kinojo-range-mode="continuous"',
  'data-kinojo-range-mode="thin"',
  "event.key === 'Escape'",
  "event.key !== 'Tab'",
  'setPointerCapture',
  'releasePointerCapture',
  'revokeObjectURL',
  'aria-modal="true"',
  'previewOnly: true',
  "document.createElement('canvas')",
  "canvas.getContext('2d', {alpha: true})",
  'context.imageSmoothingQuality',
  'context.setTransform',
  'context.drawImage',
  'canvas.toBlob',
  'output.mimeType',
  'output.quality',
  'metadataStripped',
  'originalUploaded: false',
  'uploadConnected: false',
  'WebP 결과 만들기',
  'Object.freeze(api)'
]) assert.ok(source.includes(token), `Image editor foundation is missing ${token}`);

for(const token of [
  '.kinojo-image-guide-card',
  '.kinojo-image-editor__frame',
  '.kinojo-image-editor__source',
  '.kinojo-image-editor__guide',
  '.kinojo-image-editor__profile-safe',
  '.kinojo-image-editor__quality',
  '[data-state="caution"]',
  '[data-state="low"]',
  'touch-action:none',
  'min-height:44px',
  '@media(max-width:760px)',
  '@media(prefers-reduced-motion:reduce)',
  '@media(forced-colors:active)'
]) assert.ok(style.includes(token), `Image editor visual contract is missing ${token}`);

for(const forbidden of ['fetch(', 'supabase', 'invokeEdgeFunction', 'sessionToken', 'storage/v1', 'uploadOriginal']){
  assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, `B-2 must not implement B-3 upload behavior: ${forbidden}`);
}

for(const file of [
  'ui/kinojo-components.css',
  'ui/kinojo-my-info.css',
  'ui/kinojo-my-info-image-contract.js',
  'ui/kinojo-range-control.js',
  'ui/kinojo-my-info-image-editor.js'
]) assert.ok(harness.includes(file), `Visual harness must load ${file}`);

assert.ok(harness.includes("dataset.kinojoImageEditorHarness = 'ready'"), 'Visual harness readiness marker is missing');
assert.ok(harness.includes("dataset.kinojoImageOutput = 'ready'"), 'WebP output readiness marker is missing');
assert.ok(harness.includes('KinojoMyInfoImageEditor.renderGuideCards'), 'Visual harness must connect the three guide cards');
assert.ok(harness.includes('KinojoMyInfoImageEditor.open'), 'Visual harness must open the shared editor');
assert.ok(harness.includes('createImageBitmap(result.blob)'), 'Visual harness must decode the generated WebP');
assert.ok(harness.includes("result.mimeType !== 'image/webp'"), 'Visual harness must reject a non-WebP result');
assert.ok(harness.includes('result.width !== bitmap.width'), 'Visual harness must verify exact output dimensions');

console.log('KINOJO My Info image crop, WebP, and quality contract: PASS');
