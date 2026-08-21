'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const commonUi=fs.readFileSync(path.join(__dirname,'../ui/kinojo-common-ui.js'),'utf8');
const myInfoCss=fs.readFileSync(path.join(__dirname,'../ui/kinojo-my-info.css'),'utf8');

const panelWidth=nameWidth=>Math.min(420,Math.max(352,Math.ceil(228+nameWidth)));

assert.equal(panelWidth(0),352,'empty and short-name state must use the desktop minimum');
assert.equal(panelWidth(96),352,'ordinary names must not make the panel unnecessarily wide');
assert.equal(panelWidth(144),372,'longer names must expand the desktop panel once');
assert.equal(panelWidth(400),420,'extreme names must be capped at the desktop maximum');

for(const token of [
  'KINOJO_MY_INFO_PANEL_WIDTH=Object.freeze({min:352,max:420,fixed:228})',
  "names.join('\\u001f')",
  "document.createElement('canvas').getContext('2d')",
  'normal 950 12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  'context.measureText(name).width',
  "panel.style.setProperty('--kinojo-my-info-panel-width',width+'px')",
  "panel.dataset.panelWidthSource=names.length?'character-name':'default'",
  'syncMyInfoPanelWidth_(characters)'
])assert.ok(commonUi.includes(token),`common UI is missing D-1 token: ${token}`);

assert.ok(myInfoCss.includes('--kinojo-my-info-panel-width:352px'),'desktop fallback width must be 352px');
assert.ok(myInfoCss.includes('width:min(var(--kinojo-my-info-panel-width),92vw)!important'),'desktop panel must consume the measured variable');
assert.match(myInfoCss,/body\.kinojo-page-mobile \.kinojo-my-info-panel\{\r?\n\s*width:100%!important/,'mobile route must keep full width');
assert.match(myInfoCss,/@media\(max-width:760px\)\{\r?\n\s*\.kinojo-my-info-panel\{\r?\n\s*width:100%!important/,'narrow viewports must keep full width');

const modalRule=myInfoCss.match(/\.kinojo-my-info-modal-dialog\{[\s\S]*?\n\s*\}/)?.[0]||'';
assert.equal(modalRule.includes('--kinojo-my-info-panel-width'),false,'the central image modal must not inherit the name-based panel width');

console.log('KINOJO My Info D-1 variable side-panel width contract: PASS');
