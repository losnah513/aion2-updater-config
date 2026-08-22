'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const commonUi=read('ui/kinojo-common-ui.js');
const myInfoCss=read('ui/kinojo-my-info.css');
const harness=read('tests/my-info-e1-harness.html');
const workflow=read('.github/workflows/verify-kinojo-pages.yml');

for(const token of [
  'const kinojoMyInfoFocusState={panelReturn:null,modalReturn:null}',
  'function myInfoFocusable_(root)',
  'function trapMyInfoFocus_(event,root)',
  "event.key!=='Tab'",
  'focusMyInfoElement_',
  'closeMyInfoPanel(false)',
  "const clipped=Array.from(panel.querySelectorAll('.kinojo-my-info-character-name')).some(element=>element.scrollWidth>element.clientWidth+1)",
  'if(wasOpen&&restoreFocus)focusMyInfoElement_',
  "q('#kinojoMyInfoPanel')?.addEventListener('keydown'",
  "q('.kinojo-my-info-modal-dialog',q('#kinojoMyInfoModal'))?.addEventListener('keydown'"
])assert.ok(commonUi.includes(token),`My Info focus contract is missing ${token}`);

assert.match(commonUi,/<aside class="kinojo-my-info-panel"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*tabindex="-1"/,'the blocking side panel must expose modal dialog semantics');
assert.match(commonUi,/<div class="kinojo-my-info-modal-dialog"[^>]*aria-describedby="kinojoMyInfoModalSummary"/,'the image manager must expose its summary to assistive technology');
assert.match(commonUi,/id="kinojoMyInfoReferenceSection" aria-labelledby="kinojoMyInfoReferenceTitle"/,'the reference section must have a programmatic name');
assert.match(commonUi,/id="kinojoMyInfoReferenceGrid" role="group" aria-labelledby="kinojoMyInfoReferenceTitle"/,'the three reference slots must be exposed as one named group');
assert.ok((commonUi.match(/role="status" aria-live="polite" aria-atomic="true"/g)||[]).length>=2,'profile and reference async messages must be atomic polite status regions');

for(const token of [
  '.kinojo-my-info-panel .kinojo-panel-close{min-width:44px;min-height:44px}',
  '.kinojo-my-info-profile-character-btn{appearance:none;flex:0 0 auto;min-width:112px;max-width:168px;min-height:44px',
  '.kinojo-my-info-action-btn{appearance:none;min-width:0;max-width:100%;min-height:44px',
  '.kinojo-my-info-modal-close{position:absolute;top:12px;right:12px;width:44px;height:44px',
  '.kinojo-my-info-menu-btn:focus-visible',
  '.kinojo-image-editor__body{grid-template-columns:1fr;grid-template-rows:max-content max-content}',
  '.kinojo-image-editor__workspace{min-height:calc(48vh + 64px)',
  '@media(prefers-reduced-motion:reduce)',
  '@media(forced-colors:active)',
  '.kinojo-my-info-panel,.kinojo-my-info-modal-dialog,.kinojo-my-info-menu-btn'
])assert.ok(myInfoCss.includes(token),`My Info accessibility CSS is missing ${token}`);

const luminance=hex=>{
  const channels=hex.match(/[a-f\d]{2}/gi).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:Math.pow((value+.055)/1.055,2.4));
  return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];
};
const contrast=(a,b)=>{
  const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);
  return (values[0]+.05)/(values[1]+.05);
};
assert.ok(contrast('#64748b','#f8fafc')>=4.5,'secondary My Info text must keep WCAG AA contrast on its light surface');
assert.equal(myInfoCss.includes('font-weight:900;color:#94a3b8'),false,'tiny profile selector text must not use the former low-contrast color');

for(const token of [
  'e1HarnessPanelTrigger',
  "action==='characters'",
  "action==='batch-bootstrap'",
  "dataset.kinojoE1Harness='ready'",
  'window.KinojoCommonUI.openMyInfoPanel()'
])assert.ok(harness.includes(token),`E-1 browser harness is missing ${token}`);

assert.ok(workflow.includes('node tests/my-info-e1-accessibility.test.js'),'GitHub verification must run the E-1 accessibility regression contract');

console.log('KINOJO My Info E-1 regression and accessibility contract: PASS');
