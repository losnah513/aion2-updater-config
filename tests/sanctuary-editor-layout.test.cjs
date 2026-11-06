'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {isolatePlaywrightPage}=require('./helpers/visitor-traffic');
(async()=>{
 const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>fs.readFile(path.join(root,new URL(req.url,'http://localhost').pathname),(e,b)=>{res.writeHead(e?404:200,{'content-type':({'.html':'text/html','.css':'text/css','.js':'text/javascript'})[path.extname(req.url.split('?')[0])]||'text/plain'});res.end(e?'':b);}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const openSettings=async page=>{const nav=page.locator('[data-editor-panel-open=placement]');if(await nav.isVisible())await nav.click();};
 const closeSettings=async page=>{const close=page.locator('[data-editor-panel-close]');if(await close.isVisible())await close.click();};
 const geometry=page=>page.locator('.sanctuary-management-composer-middle').boundingBox();
 const assertFooter=async page=>{const box=await page.locator('.sanctuary-management-composer-actions').boundingBox(),size=page.viewportSize();assert.ok(box.y>=0&&box.y+box.height<=size.height-2,JSON.stringify({box,size}));assert.equal(await page.locator('[data-draft-form] button[type="submit"]').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,'save button is visible and receives clicks');};
 try{for(const [width,height]of [[1440,900],[1440,650],[1100,720],[959,887],[781,700],[390,844],[320,568],[844,390]]){
  const page=await browser.newPage({viewport:{width,height}});await isolatePlaywrightPage(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/tests/sanctuary-management-fixed-draft-e2e.html',{waitUntil:'networkidle'});
  await page.locator('[data-sanctuary-edit-team="77"]').first().click();await assertFooter(page);
  await page.locator('[data-draft-slot]').last().click();await assertFooter(page);assert.equal(await page.locator('[data-draft-slot]').last().getAttribute('aria-pressed'),'true','last party slot remains selectable');
  await page.locator('[data-draft-close]').last().click();
  // This adapter is deliberately a layout-only fixture; planner behavior is covered by SQL integration tests.
  await page.evaluate(()=>{window.KinojoSupabase.runSanctuaryManagementTeamEditor=async(action,body)=>({ok:true,composition:body.payload?.composition||[]});});
  await page.locator('#sanctuaryManagementAddTeam').click();await page.locator('[data-placement-mode="BALANCED"]').click();await page.locator('[data-placement-force-count="2"]').click();
  assert.equal(await page.locator('[data-placement-options-toggle]').getAttribute('aria-expanded'),'false','optional settings collapse after force choice');await assertFooter(page);
  assert.equal(await page.locator('[data-draft-slot]').evaluateAll(slots=>slots.every(el=>Math.abs(el.getBoundingClientRect().height-58)<1)),true,'character cards retain compact58px height on every viewport');
  assert.equal(await page.locator('.sanctuary-management-composer-actions .sanctuary-management-settings-group').count(),4,'footer separates mode, rebalance, family management and addition');
  const before=await geometry(page);await openSettings(page);await page.locator('[data-addition-phase="ALT"]').click();
  await page.locator('[data-placement-options-toggle]').click();assert.deepEqual(await geometry(page),before,'settings changes never move or resize the force window');await closeSettings(page);await assertFooter(page);
  await page.locator('[data-draft-slot]').last().click();await assertFooter(page);
  const reachable=await page.locator('[data-draft-slot]').last().evaluate(el=>{const r=el.getBoundingClientRect(),clip=el.closest('.sanctuary-management-roster').getBoundingClientRect();return r.top>=clip.top-1&&r.bottom<=clip.bottom+1;});assert.equal(reachable,true,'last slot stays in the roster viewport after selection and redraw');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  if(process.env.KINOJO_LAYOUT_EVIDENCE){await fs.promises.mkdir(process.env.KINOJO_LAYOUT_EVIDENCE,{recursive:true});await openSettings(page);await page.locator('.sanctuary-management-builder-layout').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(process.env.KINOJO_LAYOUT_EVIDENCE,'layout-'+width+'x'+height+'.png')});}
  await page.close();console.log('PASS editor layout '+width+'x'+height+': fixed actions, collapsed settings, last slot reachable, redraw preserves scroll');
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
