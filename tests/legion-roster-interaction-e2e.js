/* Run with Playwright installed. Optional ROSTER_BASE_URL tests the deployed site. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  let file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  if(file.endsWith(path.sep))file+='index.html';
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data)});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=process.env.ROSTER_BASE_URL||'http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const results=[];
 try{
 for(const [width,height] of [[1920,900],[701,800],[700,800],[390,844],[320,740],[900,740]]){
  console.log("Checking",width); const page=await browser.newPage({viewport:{width,height},hasTouch:width<=700});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.feedback={sounds:0,vibrations:0};
   window.AudioContext=class{state='running';currentTime=0;destination={};resume(){return Promise.resolve()}createOscillator(){return{frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){},start(){window.feedback.sounds++},stop(){}}}createGain(){return{gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}};
   Object.defineProperty(navigator,'vibrate',{value:()=>{window.feedback.vibrations++;return true}});
  });
  await page.goto(base+(width<1000?'/m':'')+'/legion-roster/',{waitUntil:'networkidle'});
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#rosterDetail').isVisible(),false);
  assert.deepEqual(await page.evaluate(()=>feedback),{sounds:0,vibrations:0});
  await page.evaluate(()=>{window.phases=[];new MutationObserver(()=>phases.push(document.querySelector('#rosterBody').dataset.phase)).observe(document.querySelector('#rosterBody'),{attributes:true,attributeFilter:['data-phase']})});
  await page.locator('label:has(#rosterSound)').click();await page.locator('label:has(#rosterVibration)').click();
  await page.locator('#rosterWheel').focus();await page.keyboard.press('ArrowDown');await page.waitForTimeout(650);
  assert.equal(await page.locator('#rosterWheel').getAttribute('aria-activedescendant'),'roster-option-5');
  assert.ok((await page.evaluate(()=>feedback.sounds))>0);
  if(width<=700){assert.ok((await page.evaluate(()=>feedback.vibrations))>0);assert.equal(await page.locator('#rosterDetail').isVisible(),false);await page.keyboard.press('Enter')}
  await page.waitForTimeout(800);
  assert.equal(await page.locator('#rosterSelected').textContent(),'명단 카드 06');
  assert.equal(await page.locator('#rosterBody').getAttribute('data-phase'),'images');
  assert.deepEqual(await page.evaluate(()=>phases.slice(0,2)),['cards','images']);
  if(width<=700){await page.locator('#rosterBack').click();await page.waitForTimeout(450);assert.equal(await page.locator('#rosterWheel').getAttribute('aria-activedescendant'),'roster-option-5')}
  await page.locator('#rosterName').fill('없는 이름');await page.locator('#rosterSearch button').click();
  assert.match(await page.locator('#rosterStatus').textContent(),/조회 결과 없음/);
  await page.locator('#rosterName').fill('명단 카드 02');await page.locator('#rosterSearch button').click();await page.waitForTimeout(1000);
  assert.equal(await page.locator('#rosterSelected').textContent(),'명단 카드 02');
  if(width<=700){await page.keyboard.press('Escape');await page.waitForTimeout(450)}
  await page.locator('label:has(#rosterScope)').click();await page.waitForTimeout(200);await page.locator('label:has(#rosterScope)').click();await page.waitForTimeout(300);
  assert.equal(await page.locator('#rosterName').inputValue(),'명단 카드 02');
  assert.equal(await page.locator('#rosterWheel').getAttribute('aria-activedescendant'),'roster-option-1');
  await page.locator('label:has(#rosterSound)').click();await page.locator('label:has(#rosterVibration)').click();
  const quiet=await page.evaluate(()=>({...feedback}));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#rosterWheel').focus();await page.keyboard.press('End');await page.keyboard.press('Enter');await page.waitForTimeout(200);
  assert.equal(await page.locator('#rosterSelected').textContent(),'명단 카드 09');
  assert.deepEqual(await page.evaluate(()=>feedback),quiet);
  const metrics=await page.evaluate(()=>{const v=document.querySelector('.roster-viewer').getBoundingClientRect();return{overflow:document.documentElement.scrollWidth-innerWidth,viewerBottom:v.bottom,images:document.querySelectorAll('.roster-image img').length}});
  assert.equal(metrics.overflow,0);assert.equal(metrics.images,0);assert.deepEqual(errors,[]);
  if(process.env.ROSTER_EVIDENCE_DIR){fs.mkdirSync(process.env.ROSTER_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.ROSTER_EVIDENCE_DIR,'roster-'+width+'.png'),fullPage:true})}
  results.push({width,height,...metrics,errors});await page.close();
 }
 console.log(JSON.stringify(results,null,2));
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
