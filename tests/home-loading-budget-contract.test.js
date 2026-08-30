'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const runtime = read('ui/kinojo-banner-runtime.js');
const side = read('ui/kinojo-pc-banners.js');
const common = read('ui/kinojo-common-ui.js');
const home = read('home.html');
const imagePath = path.join(root, 'assets/images/common/kinojo_banner_summer.webp');
const image = fs.readFileSync(imagePath);

assert.ok(image.length <= 600 * 1024, `optimized MAIN asset exceeds 600KB: ${image.length}`);
assert.equal(image.subarray(0, 4).toString('ascii'), 'RIFF', 'optimized MAIN asset must use a WebP RIFF container');
assert.equal(image.subarray(8, 12).toString('ascii'), 'WEBP', 'optimized MAIN asset must have a WebP signature');
assert.match(runtime, /kinojo_banner_summer\.png':'https:\/\/kinojo\.info\/assets\/images\/common\/kinojo_banner_summer\.webp'/, 'runtime must use the approved optimized derivative for the same Server playlist item');
assert.equal(runtime.includes('preloadImage(next.playlist[1].imageUrl)'), false, 'runtime must not preload the second slide during initial install');
assert.match(runtime, /slideIntervalMs-1200/, 'next slide must preload only near the Server-owned transition');
assert.match(side, /matchMedia\?\.\('\(min-width: 1840px\)'\)/, 'SIDE runtime must use the canonical desktop media query');
assert.match(side, /if\(desktopQuery&&!desktopQuery\.matches\)return;/, 'hidden SIDE slots must not bind or fetch a manifest');
assert.equal(common.includes("else setTimeout(()=>loadMyInfoCharacters_().catch(()=>{}),0)"), false, 'auth sync must not preload My Info character data');
const initialization = common.slice(common.lastIndexOf('makeTopbar(rescued,info);'));
assert.equal(initialization.includes('makeMyInfoPanel();'), false, 'My Info side-panel DOM must not exist during initial HOME load');
assert.equal(initialization.includes('makeMyInfoModal();'), false, 'heavy My Info modal DOM must not exist during initial HOME load');
assert.match(common, /function openMyInfoPanel\(\)\{\s*const layer=makeMyInfoPanel\(\);/, 'first panel open must initialize the My Info side-panel UI');
assert.match(common, /function makeMyInfoModal\(\)\{[\s\S]*loading="lazy" decoding="async"/, 'guide images must be created lazily with decode hints');
assert.match(common, /function openMyInfoModal\(\)\{\s*const modal=makeMyInfoModal\(\);/, 'first modal open must initialize the heavy My Info UI');
assert.match(home, /<script defer src="core\/kinojo-api\.js/, 'HOME core scripts must download without parser-blocking execution');
assert.match(home, /document\.addEventListener\('DOMContentLoaded', mountHomeMainBanner/, 'deferred runtime must mount MAIN only after ordered dependencies execute');
assert.equal(read('index.html'), home, 'root route must not add a second document or a divergent critical path');

console.log(`KINOJO HOME loading budget contract: PASS (${image.length} byte MAIN WebP)`);
