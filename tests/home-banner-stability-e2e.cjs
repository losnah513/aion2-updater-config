'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {isolatePlaywrightPage}=require('./helpers/visitor-traffic');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const live=process.argv.includes('--live');
const baseline=process.argv.includes('--baseline');
const fixture=process.argv.includes('--fixture');
const round=n=>Math.round(n*1000)/1000;
async function trace(page){
 await page.addInitScript(()=>{
  window.bannerTrace=[];let last='';
  function sample(){
   const img=document.querySelector('#kinojo-main-banner-image, #mobileMainBannerImage');
   const host=img?.closest('a');
   if(host){const r=host.getBoundingClientRect(),style=getComputedStyle(img);const state={src:img.getAttribute('src'),x:r.x,y:r.y,width:r.width,height:r.height,visible:style.visibility,complete:img.complete&&img.naturalWidth>0};const key=JSON.stringify(state);if(key!==last){window.bannerTrace.push({ms:Math.round(performance.now()),...state});last=key;}}
   requestAnimationFrame(sample);
  }requestAnimationFrame(sample);
 });
}
(async()=>{
 const server=live?null:http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');const name=path.resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
  if(!name.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{const body=fs.readFileSync(name);res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml'})[path.extname(name)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404).end();}
 });
 if(server)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=live?'https://kinojo.info':`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  if(fixture){
   for(const [route,width,mode] of [['/',1920,'active'],['/home.html',1440,'error'],['/m/',390,'active'],['/m/',320,'empty'],['/',1920,'expired'],['/',1440,'expires-during-image']]){
    const context=await browser.newContext({viewport:{width,height:1080}}),page=await context.newPage();await isolatePlaywrightPage(page);await trace(page);
    page.on('pageerror',error=>console.log('PAGEERROR '+error.message));
    page.on('console',message=>{if(message.type()==='warning'||message.type()==='error')console.log('BROWSER '+message.text().slice(0,300));});
    const manifests=[];let expiry=null;
    await page.route(/^https:\/\//,async intercepted=>{
     const u=new URL(intercepted.request().url());
     if(intercepted.request().method()==='OPTIONS')return intercepted.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization, apikey, content-type, if-none-match','access-control-allow-methods':'GET, POST, OPTIONS'}});
     if(u.pathname.includes('/kinojo-banner-media')){
      const slot=u.searchParams.get('slotCode');manifests.push(slot);
      if(mode==='active')await new Promise(resolve=>setTimeout(resolve,700));
      if(mode==='error')return intercepted.fulfill({status:503,json:{ok:false}});
      const expired=mode==='expired';const empty=mode==='empty';
      if(expiry===null)expiry=Date.now()+(expired?-1000:mode==='expires-during-image'?300:60000);
      return intercepted.fulfill({headers:{'access-control-allow-origin':'*'},json:{ok:true,contract:'banner-public-manifest-v1',pageCode:'HOME',slotCode:slot,slotKey:'HOME:'+slot,validUntil:new Date(expiry).toISOString(),active:!empty,rotation:empty?null:{slideIntervalMs:3000,transitionDurationMs:600},playlist:empty?[]:[{imageUrl:'https://kinojo.info/assets/images/common/test-wide.svg',alt:'wide'},{imageUrl:'https://kinojo.info/assets/images/common/test-tall.svg',alt:'tall'}]}});
     }
     if(u.pathname.includes('test-wide.svg')||u.pathname.includes('test-tall.svg')){
      if(mode==='expires-during-image')await new Promise(resolve=>setTimeout(resolve,1200));
      const tall=u.pathname.includes('tall');
      return intercepted.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="'+(tall?300:1600)+'" height="'+(tall?900:900)+'"><path fill="'+(tall?'#bcd':'#cdb')+'" d="M0 0h1600v900H0z"/></svg>'});
     }
     if(u.hostname==='kinojo.info'){const file=path.join(root,u.pathname);if(fs.existsSync(file)&&fs.statSync(file).isFile())return intercepted.fulfill({body:fs.readFileSync(file),contentType:({'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream'});}
     return intercepted.fulfill({status:200,json:{ok:false}});
    });
    await page.goto(base+route,{waitUntil:'domcontentloaded'});
    if(mode==='active'){
     await page.waitForFunction(()=>document.querySelector('#kinojo-main-banner-image')?.getAttribute('src')?.includes('test-wide'),null,{timeout:5000}).catch(async error=>{console.log(JSON.stringify({url:page.url(),manifests,diagnostic:await page.evaluate(()=>({trace:window.bannerTrace,runtime:!!window.KinojoBannerRuntime,core:!!window.KinojoSupabaseClientCore}))}));throw error;});
     await page.locator('#kinojo-main-banner-image').hover();
     await page.waitForTimeout(3800);
     await page.mouse.move(0,0);await page.waitForTimeout(300);
    }else await page.waitForTimeout(1700);
    const data=await page.evaluate(()=>window.bannerTrace);
    assert.ok(data.length>0);
    assert.ok(!data.some(x=>x.src?.includes('summer')),'no seasonal placeholder');
    const rendered=data.filter(x=>x.src?.includes('test-'));
    if(mode==='active'){
     assert.ok(rendered.some(x=>x.src.includes('wide'))&&rendered.some(x=>x.src.includes('tall')),'both ratios render');
     for(const key of ['x','y','width','height'])assert.ok(Math.max(...rendered.map(x=>x[key]))-Math.min(...rendered.map(x=>x[key]))<=1,route+' '+key+' drift');
    }else assert.equal(rendered.length,0,'invalid/empty/expired responses cannot reveal campaigns');
    if(width<1808)assert.ok(!manifests.some(s=>s==='LEFT'||s==='RIGHT'),'hidden SIDE requests');
    console.log(JSON.stringify({route,width,mode,result:'PASS',states:data.length}));
    await context.close();
   }
   return;
  }
  const context=await browser.newContext({viewport:{width:1920,height:1080}});const page=await context.newPage();await isolatePlaywrightPage(page);await trace(page);
  if(!live)await page.route(/^https:\/\/kinojo\.info\//,async route=>{const pathname=new URL(route.request().url()).pathname;const file=path.join(root,pathname,pathname.endsWith('/')?'index.html':'');if(fs.existsSync(file)&&fs.statSync(file).isFile())await route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream'});else await route.fallback();});
  await page.goto('https://kinojo.info/',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(23000);
  const data=await page.evaluate(()=>({trace:window.bannerTrace,manifest:window.KinojoBannerRuntime?.peekManifest('HOME','MAIN'),resources:performance.getEntriesByType('resource').filter(r=>/kinojo-banner-media|kinojo-site-banners|banner-runtime|config.json/.test(r.name)).map(r=>({url:r.name,start:Math.round(r.startTime),duration:Math.round(r.duration)}))}));
  const boxes=data.trace.filter(x=>x.width>0);const range=key=>round(Math.max(...boxes.map(x=>x[key]))-Math.min(...boxes.map(x=>x[key])));
  console.log(JSON.stringify({base,baseline,ranges:{x:range('x'),y:range('y'),width:range('width'),height:range('height')},...data}));
  if(!baseline){assert.ok(data.manifest,'public manifest must load');assert.ok(boxes.some(x=>!x.src?.includes('placeholder')&&x.complete),'active image must actually render');assert.ok(range('height')<=1,'height drift');assert.ok(!boxes.some(x=>x.src?.includes('summer')&&x.visible==='visible'),'seasonal first paint');}
  await context.close();
 }finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
