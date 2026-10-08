// Offline presentation test; synthetic data is not an authenticated administrator audit.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {isolatePlaywrightPage}=require('./helpers/visitor-traffic');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(err,bytes)=>{res.writeHead(err?404:200,{'content-type':({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'text/plain'});
   res.end(err?'':path.extname(file)==='.html'?bytes.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''):bytes);});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  const base='http://127.0.0.1:'+server.address().port;
  for(const width of [1440,390,320]){
   const page=await browser.newPage({viewport:{width,height:1100},timezoneId:'America/Los_Angeles'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await isolatePlaywrightPage(page);
   await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.fallback():r.abort());
   await page.goto(base+(width<700?'/m':'')+'/admin/index.html');
   await page.evaluate(()=>{
    const pane=document.querySelector('[data-admin-subpane="routines"]');document.body.replaceChildren(pane);pane.classList.add('active');document.body.style.padding='12px';
    window.calls=0;window.mode='ok';
    window.KinojoAdmin={state:{},$:s=>document.querySelector(s),$$:s=>[...document.querySelectorAll(s)],
     esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
     formatServerTime:s=>new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}),
     setStatus:(s,t)=>{document.querySelector(s).textContent=t},
     adminAutomation:async command=>{if(command!=='routines')throw Error('unexpected command');window.calls++;
      await new Promise(r=>setTimeout(r,60));if(window.mode==='error')throw Error('통신 오류');
      return {ok:true,characterScheduleSummary:'본캐 10:00·22:00 / 부캐 15:00 (매일, 한국 시간)',generatedAt:'2026-10-08T06:00:00Z',historyNote:'최근 서버 예약 실행 기록 기준입니다.',routines:window.mode==='empty'?[]:[
       {name:'캐릭터 공식 조회',description:'본캐 10:00·22:00 / 부캐 15:00',active:true,scheduleKst:'매일 10:00 · 매일 15:00 · 매일 22:00',nextRunAt:'2026-10-08T13:00:00Z',lastStatus:'succeeded',lastStartedAt:'2026-10-08T01:00:00Z'},
       {name:'성역 시트 동기화',active:false,scheduleKst:'매일 02:00 · 매일 14:00'},
       {name:'<img src=x onerror=alert(1)>',description:'<script>bad()</script>',active:true,scheduleKst:'15분마다',lastStatus:'failed'}]};}};
   });
   await page.addScriptTag({url:base+'/admin/js/admin-system.js'});
   await page.evaluate(async()=>{
    document.querySelector('#serverRoutineReloadBtn').addEventListener('click',()=>window.KinojoAdmin.refreshServerRoutines());
    await Promise.all([window.KinojoAdmin.refreshServerRoutines(),window.KinojoAdmin.refreshServerRoutines()]);
   });
   assert.equal(await page.evaluate(()=>window.calls),1);
   assert.match(await page.locator('#serverRoutineCharacterPolicy').innerText(),/본캐 10:00·22:00 \/ 부캐 15:00/);
   const rows=page.locator('.admin-routine-row');assert.equal(await rows.count(),3);
   assert.match(await rows.nth(0).innerText(),/성공/);assert.match(await rows.nth(1).innerText(),/OFF[\s\S]*중지됨/);
   assert.match(await rows.nth(0).innerText(),/오후 10:00:00/,'KST is independent of browser timezone');
   assert.match(await rows.nth(2).innerText(),/<img/);assert.equal(await page.locator('#serverRoutineList img, #serverRoutineList script').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'overflow '+width);
   if(process.env.CHARACTER_UI_EVIDENCE)await page.screenshot({path:path.join(process.env.CHARACTER_UI_EVIDENCE,'routines-'+width+'.png'),fullPage:true});
   await page.evaluate(()=>window.mode='error');await page.locator('#serverRoutineReloadBtn').click();
   await page.waitForFunction(()=>!document.querySelector('#serverRoutineReloadBtn').disabled);
   assert.match(await page.locator('#serverRoutineStatus').innerText(),/통신 오류/);assert.equal(await rows.count(),0);
   await page.evaluate(()=>window.mode='empty');await page.locator('#serverRoutineReloadBtn').click();
   await page.waitForFunction(()=>!document.querySelector('#serverRoutineReloadBtn').disabled);
   assert.match(await page.locator('#serverRoutineList').innerText(),/등록된 서버 루틴이 없습니다/);
   assert.deepEqual(errors,[]);await page.close();
  }
  const bootstrap=fs.readFileSync(path.join(root,'admin/js/admin-bootstrap.js'),'utf8');
  assert.match(bootstrap,/tab==='system'&&subtab==='routines'\) A\.refreshServerRoutines\(\)/);
  assert.match(bootstrap,/serverRoutineReloadBtn.*addEventListener\('click',\(\)=>A\.refreshServerRoutines\(\)\)/);
  console.log('PASS: routine PC/mobile render, refresh/deduplication, error/empty recovery, escaping and route wiring');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
