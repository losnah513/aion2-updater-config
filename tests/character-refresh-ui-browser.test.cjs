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
  for(const width of [1440,900,390,320]){
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
  for(const width of [1440,900,390,320]){
   const page=await browser.newPage({viewport:{width,height:1100}});await isolatePlaywrightPage(page);
   await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.fallback():r.abort());
   await page.goto(base+(width<700?'/m':'')+'/admin/index.html');
   await page.evaluate(()=>{
    const pane=document.querySelector('[data-admin-pane="characters"]');document.body.replaceChildren(pane);pane.classList.add('active');
    window.fixtureCalls=[];
    window.KinojoAdmin={state:{characters:[]},$:s=>document.querySelector(s),$$:s=>[...document.querySelectorAll(s)],
     esc:s=>String(s??'').replace(/[<>&"]/g,'_'),formatServerTime:s=>s,setStatus(){},
     adminCharacter:async(action)=>{window.fixtureCalls.push(action);return {ok:true,characters:[
      {characterId:1,characterName:'새이름',identityBadge:{label:'이전 이름 → 새이름'},lookupPolicy:{eligible:true,reason:'MANAGED_LEGION'}},
      {characterId:2,characterName:'수동제외',lookupPolicy:{eligible:false,reason:'ADMIN_EXCLUDED'}},
      {characterId:3,characterName:'삭제후보_D',lookupPolicy:{eligible:false,reason:'DELETION_CANDIDATE'}},
      {characterId:4,characterName:'미해결',hasPersistentKey:true,lookupFailureStreak:1,lookupPolicy:{eligible:true}},
      {characterId:5,characterName:'K채채',hasPersistentKey:true,identityBadge:{label:'전 지켈 · 깡채채'},lookupPolicy:{eligible:false,reason:'ACTIVITY_REVIEW_WAIT'}},
      {characterId:6,characterName:'자동제외',lookupPolicy:{eligible:false,reason:'AUTO_NO_ACTIVITY',activityReasonCodes:['SERVER_TRANSFER','NO_MANAGED_LEGION','NO_CURRENT_SANCTUARY','<img src=x onerror=alert(1)>'],autoExcludedAt:'2026-09-09',cleanupCandidateAt:'2026-10-01'}},
      {characterId:7,characterName:'관계확인대기',lookupPolicy:{eligible:false,reason:'ACTIVITY_REVIEW_WAIT',activityHoldCode:'FAMILY_RELATION_UNRESOLVED'}}
     ]}}};
    document.querySelector('#characterStateFilter').addEventListener('change',()=>window.KinojoAdmin.renderCharacters());
   });
   await page.addScriptTag({url:base+'/admin/js/admin-characters.js'});
   const select=async view=>page.evaluate(async view=>{
    document.querySelectorAll('[data-admin-subpane]').forEach(el=>el.classList.toggle('active',el.dataset.adminSubpane===view));
    await window.KinojoAdmin.loadCharacterWorkspace(view);
   },view);
   await select('records');
   assert.match(await page.locator('#characterList').innerText(),/미해결/);
   assert.doesNotMatch(await page.locator('#characterList').innerText(),/새이름|K채채/);
   const detail=page.locator('[data-character-id="4"] .admin-character-detail');
   assert.equal(await detail.getAttribute('open'),null);
   assert.equal(await detail.locator('.admin-character-failure-meta').isVisible(),false);
   await detail.locator(':scope > summary').focus();await page.keyboard.press('Enter');
   assert.equal(await detail.locator('.admin-character-failure-meta').isVisible(),true);
   assert.equal(await detail.locator('[data-identity-probe]').isVisible(),true);
   await detail.locator(':scope > summary').click();
   assert.equal(await detail.locator('.admin-character-failure-meta').isVisible(),false);
   assert.doesNotMatch(await page.locator('#characterList').innerText(),/수동제외/);
   await page.selectOption('#characterStateFilter','identity');
   await select('exclusions');
   assert.match(await page.locator('#characterList').innerText(),/수동제외/);
   assert.doesNotMatch(await page.locator('#characterList').innerText(),/새이름/);
   const excludedDetail=page.locator('[data-character-id="5"] .admin-character-detail');
   assert.equal(await excludedDetail.getAttribute('open'),null);
   await excludedDetail.locator(':scope > summary').click();
   assert.match(await excludedDetail.innerText(),/깡채채/);
   assert.equal(await excludedDetail.locator('[data-identity-probe]').count(),0);
   const autoDetail=page.locator('[data-character-id="6"] .admin-character-detail');
   await autoDetail.locator(':scope > summary').click();
   assert.match(await autoDetail.innerText(),/서버 자동 제외.*서버 이전 확인/);
   assert.match(await autoDetail.innerText(),/관리 레기온 소속 본부캐 없음/);
   assert.match(await autoDetail.innerText(),/현재 성역 참여 본부캐 없음/);
   assert.match(await autoDetail.innerText(),/정리 검토 가능일: 2026-10-01/);
   assert.match(await autoDetail.innerText(),/즉시 삭제되는 것은 아닙니다/);
   assert.doesNotMatch(await autoDetail.innerText(),/레기온 탈퇴 확인|정책 확인 필요|기한 도래|onerror/);
   await autoDetail.locator('.admin-character-status-editor > summary').first().click();
   assert.match(await autoDetail.innerText(),/정기 재검토 예약 없음/);
   assert.equal(await autoDetail.locator('img').count(),0);
   const holdDetail=page.locator('[data-character-id="7"] .admin-character-detail');
   await holdDetail.locator(':scope > summary').click();
   assert.match(await holdDetail.innerText(),/본부캐 연결을 확인할 수 없어/);
   assert.doesNotMatch(await holdDetail.innerText(),/정리 검토 가능일/);
   await page.selectOption('#characterStateFilter','manual');
   assert.doesNotMatch(await page.locator('#characterList').innerText(),/삭제후보_D/);
   await select('records');assert.equal(await page.locator('#characterStateFilter').inputValue(),'identity');
   await select('exclusions');assert.equal(await page.locator('#characterStateFilter').inputValue(),'manual');
   assert.equal(await page.locator('#characterList').count(),1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
   assert.deepEqual(await page.evaluate(()=>[...new Set(window.fixtureCalls)]),['search']);
   await page.selectOption('#characterStateFilter','all');
   for(const count of [0,1,18,19,72]){
    await page.evaluate(count=>{
     const A=window.KinojoAdmin;
     A.state.characters=Array.from({length:count},(_,i)=>({characterId:100+i,characterName:i===0?'아주긴캐릭터이름으로가로넘침을확인합니다':'제외'+i,lookupPolicy:{eligible:false,reason:'AUTO_NO_ACTIVITY',activityReasonCodes:['SERVER_TRANSFER','NO_CURRENT_SANCTUARY','NO_MANAGED_LEGION','UNKNOWN']}}));
     A.renderCharacters();
    },count);
    const metrics=await page.locator('#characterList').evaluate(el=>({columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,height:el.getBoundingClientRect().height,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth}));
    assert.equal(metrics.columns,width===1440?3:width===900?2:1);
    assert.ok(metrics.height<=420,'bounded scroller');
    assert.ok(metrics.scrollWidth<=metrics.clientWidth+1,'no internal horizontal overflow '+JSON.stringify({width,count,...metrics}));
    assert.equal(await page.locator('#characterList > [data-character-id]').count(),count);
    if(count===72){
     assert.ok(metrics.scrollHeight>metrics.clientHeight);
     const first=page.locator('[data-character-id="100"] .admin-character-detail');
     assert.equal(await first.locator('summary button').count(),0,'no nested buttons');
     assert.doesNotMatch(await first.locator(':scope > summary').innerText(),/탈퇴|UNKNOWN/);
     await first.locator('.admin-character-reason-chip').first().click();
     assert.notEqual(await first.getAttribute('open'),null,'chip opens native detail');
     const peer=await page.locator('[data-character-id="101"]').boundingBox();assert.ok(peer.height<75,'peer does not stretch');
     assert.equal(await page.locator('#characterList').evaluate(el=>el.getBoundingClientRect().height),metrics.height);
     await first.locator(':scope > summary').focus();await page.keyboard.press('Enter');
     assert.equal(await first.getAttribute('open'),null);
     await page.locator('#characterList').focus();await page.keyboard.press('End');
     await page.waitForFunction(()=>document.querySelector('#characterList').scrollTop>0);
    }
   }
   await page.close();
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
