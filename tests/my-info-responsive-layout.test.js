'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const commonUi=fs.readFileSync(path.join(__dirname,'../ui/kinojo-common-ui.js'),'utf8');
const myInfoCss=fs.readFileSync(path.join(__dirname,'../ui/kinojo-my-info.css'),'utf8');

const panelLayout=nameWidth=>Math.ceil(228+nameWidth)>420?'stacked':'inline';
assert.equal(panelLayout(144),'inline','names that fit the desktop maximum must keep the compact row');
assert.equal(panelLayout(193),'stacked','names beyond the desktop maximum must use the no-clipping row');

for(const token of [
  "layout:'inline'",
  "const layout=measured>KINOJO_MY_INFO_PANEL_WIDTH.max?'stacked':'inline'",
  'kinojoMyInfoPanelWidthState.layout=layout',
  'panel.dataset.panelLayout=kinojoMyInfoPanelWidthState.layout',
  'panel.dataset.panelLayout=layout'
])assert.ok(commonUi.includes(token),`common UI is missing D-2 layout token: ${token}`);

for(const token of [
  '.kinojo-my-info-panel[data-panel-layout="stacked"] .kinojo-my-info-character-row',
  '.kinojo-my-info-panel[data-panel-layout="stacked"] .kinojo-my-info-character-name',
  '@media(max-width:420px)',
  'white-space:normal;overflow-wrap:anywhere',
  '.kinojo-my-info-manager{min-width:0;display:grid;grid-template-columns:minmax(0,1fr)',
  '.kinojo-my-info-profile-character-btn b{overflow:visible;text-overflow:clip;white-space:normal',
  '.kinojo-my-info-profile-card-copy strong{overflow:visible;text-overflow:clip;white-space:normal',
  '.kinojo-my-info-action-btn{appearance:none;min-width:0;max-width:100%',
  '.kinojo-my-info-reference-status{margin-top:9px'
])assert.ok(myInfoCss.includes(token),`My Info CSS is missing D-2 no-clipping token: ${token}`);

assert.match(myInfoCss,/@media\(max-width:620px\)\{\.kinojo-my-info-profile-images\{grid-template-columns:1fr\}[\s\S]*?\.kinojo-my-info-reference-preview-grid\{grid-template-columns:1fr\}\}/,'narrow image-manager grids must remain single-column');
assert.match(myInfoCss,/body\.kinojo-page-mobile \.kinojo-my-info-panel\{\r?\n\s*width:100%!important/,'mobile route must remain full width');
assert.equal(myInfoCss.includes('@media(max-width:380px)'),false,'the former 380px-only character fallback must not remain');

console.log('KINOJO My Info D-2 clipping-free responsive layout contract: PASS');
