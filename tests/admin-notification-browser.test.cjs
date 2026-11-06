const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {isolatePlaywrightPage}=require('./helpers/visitor-traffic');
(async()=>{const server=http.createServer((req,res)=>{if(req.url==='/bridge.js'){res.setHeader('content-type','text/javascript; charset=utf-8');return res.end(fs.readFileSync(path.join(__dirname,'../ui/kinojo-admin-notifications.js')));}res.setHeader('content-type','text/html; charset=utf-8');res.end('<html><body>Original page<button>Origin</button></body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const base='http://127.0.0.1:'+server.address().port;
for(const [route,width]of [['/hof/',1440],['/m/hof/',320],['/admin/',1440]]){
 const page=await browser.newPage({viewport:{width,height:800}});await isolatePlaywrightPage(page);
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.fallback():r.abort());await page.goto(base+route);
 await page.evaluate(()=>{window.session={token:'offline-session-one'};window.summary={ok:true,totalCount:0};window.KinojoAuthSessionCore={getSession:()=>window.session};window.KinojoApi={getAction:async()=>window.defer?await new Promise(r=>window.release=r):window.summary};});
 await page.addScriptTag({url:base+'/bridge.js'});
 const send=async data=>page.evaluate(async d=>{window.summary=d;await window.KinojoApi.getAction('notificationSummary',{});},data);
 const payload=(bytes,key='a'.repeat(32))=>({ok:true,totalCount:0,storageAlert:{databaseBytes:bytes,alertBytes:400000000,targetBytes:500000000,loginKey:key}});
 await page.evaluate(()=>{window.defer=true;window.pending=window.KinojoApi.getAction('notificationSummary',{});});
 await page.evaluate(d=>{window.session={token:'offline-new-session'};window.defer=false;window.release(d);},payload(480000000,'c'.repeat(32)));
 await page.evaluate(()=>window.pending);assert.equal(await page.locator('dialog').count(),0,'stale login response ignored');
 await send(payload(400000000));assert.equal(await page.locator('dialog').count(),0);
 await send(payload(400000001));await page.locator('dialog').waitFor({state:'visible'});
 assert.match(await page.locator('dialog').innerText(),/DB 용량 주의/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
 if(process.env.CHARACTER_UI_EVIDENCE)await page.screenshot({path:path.join(process.env.CHARACTER_UI_EVIDENCE,'capacity-'+width+'-'+(route.includes('admin')?'admin':'web')+'.png')});
 await page.locator('dialog button').click();await page.locator('dialog').waitFor({state:'detached'});await send(payload(480000000));assert.equal(await page.locator('dialog').count(),0);
 await page.evaluate(()=>{window.session={token:'offline-session-two'};window.dispatchEvent(new CustomEvent('kinojo:auth-changed',{detail:{loggedIn:true}}));});
 await send(payload(499000000,'b'.repeat(32)));await page.locator('dialog').waitFor({state:'visible'});await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});assert.equal(await page.locator('dialog').count(),0);
 if(!route.includes('admin')){
 for(const [type,hash]of [['code','#requests'],['image','#members/character-images']]){
 await send(type==='code'?{ok:true,totalCount:1,latestCodeRequest:{requestId:'fixture-code',characterName:'Synthetic',createdAt:'2026-11-06T00:00:00Z'}}:{ok:true,totalCount:1,latestImageRequest:{requestId:'fixture-image',characterName:'Synthetic',createdAt:'2026-11-06T00:01:00Z'}});
 const card=page.locator('.kinojo-admin-notification-card');await card.waitFor({state:'visible'});
 const popupPromise=page.waitForEvent('popup');
 if(type==='image'){await card.focus();await page.keyboard.press('Enter');}else await card.click();
 const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded');assert.equal(new URL(popup.url()).hash,hash);
 assert.equal(page.url(),base+route);assert.equal(await popup.evaluate(()=>window.opener===null),true);await popup.close();
 await card.locator('button').click();await page.waitForTimeout(300);
 }
 }else{await send({ok:true,latestCodeRequest:{requestId:'never-render',characterName:'Synthetic'}});assert.equal(await page.locator('.kinojo-admin-notification-card').count(),0);}
 await page.close();
}
console.log('PASS: >400MB boundary, per-login dedupe/relogin, admin+PC+320px dialog, Escape, notification mouse/keyboard new tabs and opener isolation; original URL preserved');
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
