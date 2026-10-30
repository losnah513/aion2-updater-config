'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {isolatePlaywrightPage}=require('./helpers/visitor-traffic');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname);fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'content-type':({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream'});res.end(e?'':b);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{for(const width of [1440,390,320,844]){
  const page=await browser.newPage({viewport:{width,height:1000}});await isolatePlaywrightPage(page);
  await page.addInitScript(()=>{const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-10-30T03:00:00Z']));}static now(){return OriginalDate.parse('2026-10-30T03:00:00Z');}};});
  await page.goto('http://127.0.0.1:'+server.address().port+'/tests/sanctuary-management-fixed-draft-e2e.html',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.KinojoSanctuaryManagementDraftBridge?.findTeam(77));
  await page.evaluate(()=>{window.__calendarCommands=[];window.KinojoSupabase.runSanctuaryManagementCommand=async(action,payload)=>{window.__calendarCommands.push({action,payload});throw Error('LOCAL_CAPTURE_ONLY');};});
  await page.locator('[data-sanctuary-edit-team="77"]').first().click();
  const form=page.locator('[data-draft-form]');
  await form.locator('[name="draftYear"]:not(:disabled)').waitFor();
  assert.equal(await form.locator('[name="draftYear"]').inputValue(),'2026');
  const save=()=>form.locator('button[type="submit"]').click();
  const commands=()=>page.evaluate(()=>__calendarCommands);
  await form.locator('[name="draftTitle"]').fill('편성만 변경');await save();
  await page.waitForFunction(()=>__calendarCommands.length===1);
  assert.equal((await commands())[0].payload.schedule.startsOn,'2026-08-27','unchanged past repeat start must survive actual save adapter');
  await save();await page.waitForFunction(()=>__calendarCommands.length===2);
  assert.equal((await commands())[1].payload.schedule.startsOn,'2026-08-27','repeated saves must not advance the year');
  async function date(year,month,day){await form.locator('[name="draftYear"]').fill(year);await form.locator('[name="draftMonth"]').fill(month);await form.locator('[name="draftDay"]').fill(day);}
  await date('2027','09','03');await save();await page.waitForFunction(()=>__calendarCommands.length===3);
  assert.equal((await commands())[2].payload.schedule.startsOn,'2027-09-03','explicit future year preserved');
  await date('2026','02','29');await save();assert.equal((await commands()).length,3,'invalid non-leap date must not reach server');
  await date('2028','02','29');await save();await page.waitForFunction(()=>__calendarCommands.length===4);
  assert.equal((await commands())[3].payload.schedule.startsOn,'2028-02-29');
  await date('2026','13','01');await save();assert.equal((await commands()).length,4,'invalid month must not clamp silently');
  await date('2026','12','31');await form.locator('[data-draft-kind="ONCE"]').click();await save();await page.waitForFunction(()=>__calendarCommands.length===5);
  assert.equal((await commands())[4].payload.schedule.startsOn,'2026-12-31');assert.equal((await commands())[4].payload.schedule.kind,'ONCE');
  const dimensions=await form.locator('.sanctuary-management-date-parts').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));assert(dimensions.scroll<=dimensions.client+1,JSON.stringify({width,dimensions}));
  if(process.env.CALENDAR_SCREENSHOT_DIR){fs.mkdirSync(process.env.CALENDAR_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.CALENDAR_SCREENSHOT_DIR,'schedule-year-'+width+'.png'),fullPage:true});}
  await page.close();
 }
 console.log('PASS: actual draft save -> common adapter preserves past repeat years, repeated/explicit future/ONCE saves, leap/invalid dates, PC/mobile date controls');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
