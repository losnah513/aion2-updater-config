'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {isolatePlaywrightPage}=require('./helpers/visitor-traffic');
const root=path.resolve(__dirname,'..');
(async()=>{
 let fixture=fs.readFileSync(path.join(root,'tests/sanctuary-management-fixed-draft-e2e.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
 fixture=fixture.replace('async getSanctuaryManagementBootstrap(){','async getSanctuaryManagementBootstrap(){await new Promise(r=>setTimeout(r,400));').replace('async getSanctuaryManagementMonth(month){','async getSanctuaryManagementMonth(month){await new Promise(r=>setTimeout(r,500));');
 const server=http.createServer((req,res)=>{
  let pathname=new URL(req.url,'http://localhost').pathname;
  const p=path.join(root,pathname);if(!p.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  let data;try{data=fs.readFileSync(p);}catch{res.writeHead(404);res.end();return;}
  if(pathname.endsWith('/sanctuary/index.html')){
   const prefix=pathname.startsWith('/m/')?'../../':'../';
   data=data.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('</body>','<script>'+fixture+'</script><script src="'+prefix+'sanctuary-management/js/sanctuary-management.js"></script></body>');
  }
  res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp'})[path.extname(p)]||'application/octet-stream'});res.end(data);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{for(const width of [1440,900,699,390,360,350,320,844]){
  const page=await browser.newPage({viewport:{width,height:1000}});await isolatePlaywrightPage(page);
  await page.route('**/*.supabase.co/**',route=>route.abort());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__shifts=[];new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__shifts.push(e.value);}).observe({type:'layout-shift',buffered:true});});
  await page.goto('http://127.0.0.1:'+server.address().port+(width<1000?'/m':'')+'/sanctuary/index.html?id=rudra');
  const before=await page.locator('main').boundingBox();
  await page.locator('.sanctuary-management-week-day').first().waitFor();
  await page.waitForTimeout(150);
  const after=await page.locator('main').boundingBox();
  const cls=await page.evaluate(()=>__shifts.reduce((a,b)=>a+b,0));
  assert.equal(after.y,before.y,'scope/status load must not move the page shell at width '+width);
  assert.ok(cls<0.08,JSON.stringify({width,cls}));assert.deepEqual(errors,[]);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  console.log(JSON.stringify({width,cls,mainY:after.y}));await page.close();
 }
 console.log('PASS: actual PC/mobile templates retain shell geometry through delayed bootstrap and calendar; no overflow or runtime errors');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
