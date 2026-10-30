'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'../.codex-test-runtime/node_modules/playwright');
const {isolatePlaywrightPage}=require('./helpers/visitor-traffic');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname);fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'content-type':({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream'});res.end(e?'':b);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});await isolatePlaywrightPage(page);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/tests/sanctuary-management-fixed-draft-e2e.html',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.KinojoSanctuaryManagementDraftBridge?.findTeam(77));
  await page.evaluate(()=>{
   const main={characterId:9201,mainCharacterId:9201,ownerMemberId:null,characterName:'비회원본캐',serverId:2,serverName:'지켈',className:'수호성',legionName:'깡',relation:'GUEST',familyRelation:'MAIN',membershipRelation:'GUEST',isMain:true,canSelectAlts:true,itemLevel:5000,power:900000};
   window.KinojoSupabase.searchSanctuaryManagementCharacter=async()=>({ok:true,apiVersion:2.5,schemaVersion:480,source:'CHARACTER_MASTER',character:main});
   window.__linkedResponse={ok:true,apiVersion:2.5,schemaVersion:480,mainCharacter:main,characters:[],characterCount:0,randomCandidate:{mainCharacterId:9201,ownerMemberId:null,characterName:'비회원본캐의 랜덤 부캐',serverId:2,serverName:'지켈'}};
   window.KinojoSupabase.getSanctuaryManagementLinkedAlts=async()=>structuredClone(window.__linkedResponse);
  });
  // Exercise the real response validator, including an inconsistent claimed owner.
  assert.equal(await page.evaluate(async()=> (await window.KinojoSanctuaryManagementDraftBridge.linkedAlts(77,9201)).randomCandidate.ownerMemberId),0);
  assert.equal(await page.evaluate(async()=>{window.__linkedResponse.randomCandidate.ownerMemberId=99;try{await window.KinojoSanctuaryManagementDraftBridge.linkedAlts(77,9201);return false;}catch{return true;}finally{window.__linkedResponse.randomCandidate.ownerMemberId=null;}}),true);
  await page.locator('[data-sanctuary-edit-team="77"]').first().click();
  await page.locator('[data-draft-slot][data-occupied="false"]').first().click();
  await page.locator('input[name="characterQuery"]').fill('비회원본캐');
  await page.locator('[data-character-search-submit]').click();
  await page.locator('[data-linked-alts-open="9201"]').click();
  await page.locator('[data-linked-alt-class="CLERIC"]').click();
  assert.equal(await page.locator('[data-linked-alt-random]').isEnabled(),true);
  await page.locator('[data-linked-alt-random]').click();
  const placed=page.locator('[data-draft-slot].is-random-alt');
  await placed.waitFor();assert.match(await placed.innerText(),/비회원본캐의 랜덤 부캐/);
  // Same-force family guard must still disable a second virtual reservation.
  await page.locator('[data-draft-slot][data-occupied="false"]').first().click();
  await page.locator('input[name="characterQuery"]').fill('비회원본캐');await page.locator('[data-character-search-submit]').click();
  await page.locator('[data-linked-alts-open="9201"]').click();
  assert.equal(await page.locator('[data-linked-alt-random]').isDisabled(),true);
  assert.match(await page.locator('[data-linked-alt-panel]').innerText(),/랜덤 부캐\s*· 이 포스에 소속됨/);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: PC/mobile real linked-alt validator, null member, owner mismatch rejection, class selection, placement and duplicate-family UI');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
