'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {isolatePlaywrightPage}=require('./helpers/visitor-traffic');
(async()=>{
 const db=new(require(process.env.PGLITE_MODULE||'@electric-sql/pglite').PGlite)();await require('./helpers/sanctuary-balanced-db.cjs')(db);
 const root=path.resolve(__dirname,'..');let calls=0;
 const server=http.createServer(async(req,res)=>{try{
  if(req.url==='/fixture-editor'){
   let raw='';for await(const part of req)raw+=part;const {action,...body}=JSON.parse(raw);let result;
   if(action==='composition-preview'){calls++;result=(await db.query("select public.kinojo_sanctuary_management_composition_preview_v554('fixture-1',$1) result",[JSON.stringify({...body.payload,teamId:null})])).rows[0].result;}
   else if(action==='team-guest')result=(await db.query("select public.kinojo_sanctuary_management_team_guest_v554('fixture-1',null,null,$1) result",[body.characterId||40])).rows[0].result;
   else result=(await db.query("select public.kinojo_sanctuary_management_release_guests_v554('fixture-1',$1::uuid[]) result",[body.guestIds])).rows[0].result;
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({...result,apiVersion:'2.6',schemaVersion:554}));return;
  }
  const file=path.join(root,new URL(req.url,'http://localhost').pathname);let bytes=await fs.promises.readFile(file);
  res.writeHead(200,{'content-type':({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream'});res.end(bytes);
 }catch(e){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,message:e.message}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{for(const width of [1440,390,320,844]){
  const page=await browser.newPage({viewport:{width,height:width===844?390:1000}});await isolatePlaywrightPage(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/tests/sanctuary-management-fixed-draft-e2e.html',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.KinojoSanctuaryManagementDraftBridge?.findTeam(77));
  // Opening an existing team must preserve its arrangement and issue no planner request.
  const oldCalls=calls;await page.locator('[data-sanctuary-edit-team="77"]').first().click();
  assert.equal(await page.locator('[data-placement-mode="MANUAL"]').getAttribute('aria-pressed'),'true');assert.equal(calls,oldCalls);
  assert.equal(await page.locator('[data-draft-slot][data-occupied="true"]').count(),1);
  await page.locator('[data-draft-close]').last().click();
  await page.evaluate(async()=>{
   const make=(id,main)=>({characterId:id,characterName:'fixture'+id,mainCharacterId:main,serverId:2002,serverName:'fixture',className:'CLERIC',power:1200000-id*1000,itemLevel:4000,isMain:id===main,relation:id===main?'MAIN':'ALT',familyRelation:id===main?'MAIN':'ALT',isOperationalLegion:true});
   const get=window.KinojoSupabase.getSanctuaryManagementBootstrap;
   window.KinojoSupabase.getSanctuaryManagementBootstrap=async(...args)=>{const b=await get(...args);b.composerCharacters={ownerResolved:true,code:'READY',candidateCount:3,characters:[make(1,1),make(2,2),make(11,1)]};return b;};
   window.KinojoSupabase.runSanctuaryManagementTeamEditor=async(action,body)=>{const r=await fetch('/fixture-editor',{method:'POST',body:JSON.stringify({action,...body})});const data=await r.json();if(!r.ok||!data.ok)throw new Error(data.message);window.previewDone=(window.previewDone||0)+(action==='composition-preview'?1:0);return data;};
   window.KinojoSupabase.searchSanctuaryManagementCharacter=async()=>({ok:true,apiVersion:'2.6',schemaVersion:554,source:'CHARACTER_MASTER',character:{...make(40,10),membershipRelation:'GUEST',relation:'GUEST',isOperationalLegion:false}});
   window.KinojoSupabase.runSanctuaryManagementCommand=async(command,payload)=>{window.capturedDraft={command,payload};throw new Error('fixture save captured');};
   await window.KinojoSanctuaryManagementDraftBridge.reload();
  });
  await page.locator('#sanctuaryManagementAddTeam').click();
  assert.equal(await page.locator('[data-placement-mode][aria-pressed="true"]').count(),0);
  assert.equal(await page.locator('[data-draft-slot]').first().isDisabled(),true);
  await page.locator('[data-placement-mode="BALANCED"]').click();
  assert.equal(await page.locator('[data-draft-slot]').first().isDisabled(),true);
  await page.locator('[data-placement-force-count="2"]').click();
  await page.waitForFunction(()=>window.previewDone>0);
  for(const id of [1,2,11]){
   await page.locator('[data-draft-slot][data-occupied="false"]').first().click();
   if(await page.locator('[data-creator-candidates-toggle]').count())await page.locator('[data-creator-candidates-toggle]').click();
   await page.locator('[data-draft-candidate="'+id+'"]').click();
   await page.waitForFunction(()=>/균등 배치를 적용/.test(document.querySelector('[data-draft-status]').textContent));
  }
  await page.locator('[data-addition-phase="ALT"]').click();await page.locator('[data-addition-root]').selectOption('c:2');
  await page.locator('[data-draft-slot][data-occupied="false"]').first().click();await page.locator('[name="characterQuery"]').fill('fixture40');await page.locator('[data-character-search-submit]').click();
  await page.locator('[data-draft-search-character="40"]').click();
  await page.waitForFunction(()=>/균등 배치를 적용/.test(document.querySelector('[data-draft-status]').textContent));
  await page.locator('[data-team-family-open]').first().click();
  assert.equal(await page.locator('[data-team-family^="g:"]').count(),1);assert.equal(await page.locator('[data-team-family^="g:"]').inputValue(),'c:2');
  await page.locator('[data-team-family-open]').last().click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('[name="draftTitle"]').fill('균형 편성 검증');await page.locator('[data-draft-form] button[type="submit"]').click();await page.waitForFunction(()=>window.capturedDraft);
  const saved=await page.evaluate(()=>capturedDraft);assert.equal(saved.payload.placementMode,'BALANCED');assert.equal(saved.payload.composition.length,2);
  const people=saved.payload.composition.flatMap(f=>f.slots).filter(s=>s.characterId||s.guestId);assert.equal(people.length,4);assert.equal(new Set(people.map(s=>s.characterId||s.guestId)).size,4);assert.equal(people.filter(s=>s.assignmentKind==='RANDOM_ALT').length,0);
  if(process.env.KINOJO_BALANCE_EVIDENCE){await fs.promises.mkdir(process.env.KINOJO_BALANCE_EVIDENCE,{recursive:true});await page.locator('[data-draft-form]').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(process.env.KINOJO_BALANCE_EVIDENCE,'balanced-'+width+'.png')});}
  // An old response must never overwrite a newly opened manual editor.
  await page.evaluate(()=>{const run=window.KinojoSupabase.runSanctuaryManagementTeamEditor;window.KinojoSupabase.runSanctuaryManagementTeamEditor=async(...args)=>{const result=await run(...args);await new Promise(r=>setTimeout(r,400));return result;};});
  await page.locator('[data-balance-open]').click();await page.locator('[data-draft-close]').last().click();await page.locator('[data-sanctuary-edit-team="77"]').first().click();
  await page.waitForTimeout(700);assert.equal(await page.locator('[data-placement-mode="MANUAL"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-draft-slot][data-occupied="true"]').count(),1);
  assert.deepEqual(errors,[]);await page.close();console.log('PASS balanced editor '+width+'px: explicit mode, force count, SQL preview, local links, guest, partial save and unchanged existing team');
 }}finally{await browser.close();await new Promise(r=>server.close(r));await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
