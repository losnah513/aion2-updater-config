'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const home = read('home.html');
const index = read('index.html');
const shell = read('ui/kinojo-public-shell.css');
const stagedCss = read('ui/kinojo-staged-loading.css');
const stagedJs = read('ui/kinojo-staged-loading.js');
const sideCss = read('ui/kinojo-pc-banners.css');
const sanctuaryCss = read('ui/kinojo-sanctuary-cards.css');

assert.equal(index, home, 'root and direct HOME must serve the same one-navigation document');
assert.equal(/location\.(?:replace|assign)|target\s*=\s*mobile/.test(index), false, 'root must not use a second document navigation');
assert.match(home, /<body class="kinojo-page-home" data-kinojo-page="home">\s*<section class="kinojo-home-subbar kinojo-standard-subbar kinojo-attached-subbar"[^>]*><\/section>\s*<main class="wrap kinojo-pc-banner-host kinojo-pc-standard-host">/, 'HOME subbar must precede the main host in its final DOM position');
assert.match(home, /body\.kinojo-page-home\{padding-top:69px!important\}/, 'critical CSS must reserve the final 69px topbar height');
assert.match(home, /@media\(max-width:1080px\)[\s\S]*body\.kinojo-page-home\{padding-top:63px!important\}[\s\S]*body\.kinojo-page-home>\.kinojo-home-subbar\{top:63px\}/, 'critical CSS must reserve the final 63px compact topbar height');
assert.match(home, /@media\(min-width:1840px\)[\s\S]*body\.kinojo-page-home>\.kinojo-home-subbar\{height:52px;min-height:52px;max-height:52px\}/, 'critical CSS must reserve the final 52px HOME subbar');
assert.match(home, /\.kinojo-pc-banner-slot\{display:grid;position:fixed;top:121px;width:300px;height:715px\}/, 'critical CSS must reserve SIDE slot geometry');
assert.match(shell, /padding-top:calc\(var\(--kinojo-shell-top\) \+ 1px\)!important/, 'public shell must reserve its final border-inclusive topbar height');
assert.match(stagedCss, /\.kinojo-home-subbar\{display:block;height:1px;min-height:1px;max-height:1px;/, 'sub-1840 HOME subbar boundary must remain stable at 1px');
assert.match(stagedJs, /!bar\.classList\.contains\('kinojo-home-subbar'\)\)topbar\.insertAdjacentElement/, 'staged runtime must not move the HOME subbar');
assert.match(sideCss, /top:121px;/, 'SIDE slots must start at the final y coordinate before JavaScript sizing');
assert.match(sideCss, /\.kinojo-pc-banner-slot\.is-left\{\s*left:calc\(50% - 904px\);/, 'left SIDE slot must have a static final x coordinate');
assert.match(sideCss, /\.kinojo-pc-banner-slot\.is-right\{\s*left:calc\(50% \+ 604px\);/, 'right SIDE slot must have a static final x coordinate');
assert.match(sanctuaryCss, /data-sanctuary-master-list="desktop"\]\{[^}]*min-height:243px;/, 'desktop sanctuary region must reserve the settled row height');
assert.match(sanctuaryCss, /@media\(max-width:720px\)[^}]*min-height:calc\(225vw - 68px\)/, 'narrow HOME must reserve the stacked sanctuary region height');

console.log('KINOJO HOME first-paint shell and placeholder stability contract: PASS');
