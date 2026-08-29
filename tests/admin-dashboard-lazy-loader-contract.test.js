'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
// Git may materialize CRLF on Windows; contract matching is line-ending agnostic.
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8').replace(/\r\n/g,'\n');
const loader=read('admin/js/admin.js');
const bootstrap=read('admin/js/admin-bootstrap.js');
const desktop=read('admin/index.html');
const mobile=read('m/admin/index.html');

assert.ok(loader.includes('const coreModules=['),'dashboard boot must have an explicit core module boundary');
assert.ok(loader.includes("const coreModules=[\n    'admin-shared.js'\n  ]"),'dashboard boot must load only the shared helper before bootstrap');
assert.ok(loader.includes('const featureModules={'),'non-dashboard modules must be grouped by feature');
for(const token of [
  "requests:['admin-members.js']",
  "characters:['admin-characters.js']",
  "notices:['admin-notices.js']",
  "system:['admin-system.js']",
  'images:[',
  'if(modulePromises.has(name))return modulePromises.get(name)',
  'function ensureFeatureModules(tab)',
  'if(names.every(name=>loadedModules.has(name)))return null',
  'window.KinojoAdmin.ensureFeatureModules=ensureFeatureModules',
  "await loadScript('admin-bootstrap.js')",
]) assert.ok(loader.includes(token),`lazy loader contract missing: ${token}`);

const coreBlock=loader.slice(loader.indexOf('const coreModules=['),loader.indexOf('const featureModules={'));
for(const deferred of ['admin-members.js','admin-characters.js','admin-sanctuary.js','admin-notices.js','admin-system.js','admin-images.js']){
  assert.equal(coreBlock.includes(deferred),false,`${deferred} must not block the initial dashboard`);
}
assert.equal(loader.includes('for(const name of modules)await loadScript(name)'),false,'legacy all-module serial boot must not return');
assert.ok(bootstrap.includes('function loadFeature(tab,subtab,force)'),'feature routing must preserve its synchronous path after modules are loaded');
assert.ok(bootstrap.includes('const pending=A.ensureFeatureModules?.(tab,subtab)'),'feature routing must request its lazy module group before calling feature functions');
assert.ok(bootstrap.includes("if(pending&&typeof pending.then==='function')return pending.then(activate).catch(fail)"),'feature routing must wait only when a module group is still loading');
assert.ok(bootstrap.includes('if(state.loaded[key]&&!force&&!isImageContext)return'),'loaded image contexts must still refresh their workspace route when switching main/side');
assert.ok(bootstrap.includes("addLog('ERROR','관리자 기능 모듈 로드 실패"),'lazy load failures must remain visible in the admin log');
assert.ok(read('admin/js/admin-shared.js').includes('formatServerTime,action'),'the dashboard time formatter must be available without loading the sanctuary console');
for(const html of [desktop,mobile])assert.ok(html.includes('admin.js?cache=2026082901'),'PC/mobile must share the lazy-loader cache generation');

console.log('admin dashboard lazy-loader contract: PASS');
