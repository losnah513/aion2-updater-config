// OFFLINE render/input tests. Synthetic presentation roles are not an authenticated administrator audit.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {isolatePlaywrightPage}=require('./helpers/visitor-traffic');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'');
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(err,bytes)=>{const ext=path.extname(file);res.writeHead(err?404:200,{'content-type':({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[ext]||'text/plain'});
   res.end(err?'':ext==='.html'?bytes.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''):bytes);});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})}).catch(async error=>{
  await new Promise(resolve=>server.close(resolve));throw error;
 });
 const base='http://127.0.0.1:'+server.address().port;
 try{
  for(const width of [1440,390,320]){
   const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await isolatePlaywrightPage(page);
   await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.fallback():route.abort());
   await page.goto(base+(width<700?'/m':'')+'/admin/index.html');
   await page.evaluate(()=>{
    const card=document.querySelector('.admin-lookup-console');document.body.replaceChildren(card);document.body.style.padding='12px';
    window.fixtureCalls=[];
    window.KinojoAdmin={state:{tab:'characters',subtab:'lookup',lookupTargetStates:{},lookupHeartbeatAt:0},$:s=>document.querySelector(s),$$:s=>[...document.querySelectorAll(s)],
     roleLevel:()=>window.fixtureRole||5,esc:s=>String(s??'').replace(/[<>&"]/g,'_'),formatServerTime:s=>s,
     setStatus:(s,t)=>{const e=document.querySelector(s);if(e)e.textContent=t},toast(){},
     adminAutomation:async(c,e)=>{window.fixtureCalls.push({c,e});return {ok:true,status:{canManage:true,characterRefresh:{ok:true,enabled:true,listSheetSyncEnabled:e?.enabled!==false}}}},
     adminLookup:async()=>({ok:true}),adminCharacter:async()=>({ok:true})};
   });
   await page.addScriptTag({url:base+'/admin/js/admin-characters.js'});
   await page.evaluate(()=>{
    const A=window.KinojoAdmin;A.state.characterAutomationCanManage=true;A.renderCharacterAutomation({ok:true,enabled:true,listSheetSyncEnabled:true});
    A.renderCharacterLookupConsole({ok:true,sessionId:'synthetic',active:false,serverQueue:true,session:{status:'completed'},postprocessComplete:true,partialSuccess:true,
     progress:{total:2,completedCount:2,successCount:1,finalFailedCount:1,overallProgressPercent:100,step1Percent:100,step2Percent:100,step3Percent:100,
      step1Status:'done',step2Status:'done',step3Status:'done',listSheetSyncEnabled:false,listWriteSkipped:true,phases:[{no:7,id:'list_sheet_export',status:'skipped',label:'list 반영',message:'설정에 따라 생략'}]}});
   });
   assert.match(await page.locator('#characterLookupListResult').innerText(),/생략 완료/);
   assert.match(await page.locator('#characterLookupExitSafety').innerText(),/부분 완료/);
   assert.match(await page.locator('#characterLookupExitSafety').innerText(),/생략/);
   assert.equal(await page.locator('#characterLookupStep3 header>span').innerText(),'100.0%');
   assert.match(await page.locator('#characterLookupPhaseListStep3').innerText(),/생략/);
   await page.evaluate(()=>{
    window.KinojoAdmin.renderCharacterLookupConsole({ok:true,sessionId:'synthetic',active:false,session:{status:'completed'},
      publicSnapshot:{state:'WAIT_30_MINUTES',pendingCount:3,dueAt:'2026-09-08T14:40:19Z',publishedAt:'2026-09-08T10:00:00Z'},
      progress:{currentCharacter:'LAURA',total:1,completedCount:1,finalFailedCount:0,step2Status:'done',phases:[{no:6,status:'done',label:'old'}]}});
   });
   assert.match(await page.locator('#characterLookupTargetList').innerText(),/조회 완료/);
   assert.doesNotMatch(await page.locator('#characterLookupTargetList').innerText(),/조회 중/);
   assert.match(await page.locator('#characterLookupPublicSnapshot').innerText(),/30분 대기/);
   assert.match(await page.locator('#characterLookupPhaseListStep3').innerText(),/DB 랭킹 계산/);
   await page.locator('#characterAutomationListToggle').focus();await page.keyboard.press('Space');
   await page.waitForFunction(()=>window.fixtureCalls.length===1);
   assert.equal(await page.evaluate(()=>window.fixtureCalls[0].c),'saveListWrite');
   await page.evaluate(()=>{window.fixtureRole=3;window.KinojoAdmin.state.characterAutomationCanManage=false;window.KinojoAdmin.renderCharacterAutomation({ok:true,enabled:true})});
   assert.equal(await page.locator('#characterAutomationListToggle').isDisabled(),true);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);assert.equal(overflow,false,'horizontal overflow at '+width);
   if(process.env.CHARACTER_UI_EVIDENCE){await page.waitForTimeout(350);await page.screenshot({path:path.join(process.env.CHARACTER_UI_EVIDENCE,'admin-'+width+'.png'),fullPage:true});}
   assert.deepEqual(errors,[]);await page.close();
  }
  const page=await browser.newPage({viewport:{width:1440,height:1000}});await isolatePlaywrightPage(page);
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.fallback():r.abort());
  await page.goto(base+'/tests/fixtures/extension-reference/manifest.json');
  await page.evaluate(()=>{document.body.innerHTML='<div id="aion2DebugDrawerBody"></div>';window.chrome={runtime:{getURL:s=>s,onMessage:{addListener(){}}},storage:{local:{get:async()=>({}),set:async()=>{}}}};});
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/extension-reference/manifest.json'),'utf8'));
  for(const file of manifest.content_scripts[0].js)await page.addScriptTag({url:base+'/tests/fixtures/extension-reference/'+file});
  const result=await page.evaluate(()=>{
   const m=window.KINOJO_UPDATER_PHASES;window.AION2_UI.renderDebugDrawer_();
   return {phases:m.phases.length,steps:m.steps.length,html:document.getElementById('aion2DebugDrawerBody').innerHTML};
  });
  assert.equal(result.phases,7);assert.equal(result.steps,3);
  for(const n of [1,2,3])assert.match(result.html,new RegExp('STEP '+n));
  assert.match(result.html,/Server Engine/);await page.close();
  console.log('PASS: offline PC/mobile 1440/390/320 layout, keyboard toggle, role presentation, OFF partial result; historical manifest-order 7 phases/3 STEP/detail HTML (no extension activation)');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
