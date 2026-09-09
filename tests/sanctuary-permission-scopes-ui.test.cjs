'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {isolatePlaywrightPage}=require('./helpers/visitor-traffic');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 const file=path.resolve(root,'.'+name);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';
 res.setHeader('content-type',mime+'; charset=utf-8');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  for(const width of [1440,390])for(const scope of ['info','roster','schedule','support','archive']){
   const page=await browser.newPage({viewport:{width,height:1000}});
   await isolatePlaywrightPage(page);
   await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.fallback():route.abort());
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port+'/tests/sanctuary-management-fixed-draft-e2e.html?permissionScope='+scope+'&canCreate=0');
   const team=page.locator('[data-sanctuary-team="78"]');await team.waitFor();
   assert.equal(await page.locator('#sanctuaryManagementAddTeam').isDisabled(),true);
   assert.equal(await team.locator('[data-sanctuary-edit-team]').count(),['info','roster'].includes(scope)?1:0);
   assert.equal(await team.locator('[data-sanctuary-schedule-team]').count(),scope==='schedule'?1:0);
   assert.equal(await team.locator('[data-sanctuary-archive-team]').count(),scope==='archive'?1:0);
   if(['info','roster'].includes(scope)){
    await team.locator('[data-sanctuary-edit-team]').click();
    await page.locator('[data-draft-form]').waitFor();
    await page.waitForFunction(()=>document.querySelector('[data-draft-form] button[type="submit"]')?.disabled===false);
    assert.equal(await page.locator('[name="draftTitle"]').isDisabled(),scope!=='info');
    assert.equal(await page.locator('[name="draftHour"]').isDisabled(),true);
    assert.equal(await page.locator('[data-draft-mode="fixed"]').isDisabled(),scope!=='info');
    if(scope==='info')assert.equal(await page.locator('.sanctuary-management-roster button:enabled').count(),0);
    else assert.ok(await page.locator('.sanctuary-management-roster button:enabled').count()>0);
   }
   assert.deepEqual(errors,[]);await page.close();console.log('PASS sanctuary scope '+scope+' '+width+'px');
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
