const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {isolatePlaywrightPage}=require('./helpers/visitor-traffic');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname);fs.readFile(file,(err,bytes)=>{res.writeHead(err?404:200,{'content-type':({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream'});res.end(err?'':bytes);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{for(const width of [1440,390,320])for(const listEnabled of [true,false]){
  const page=await browser.newPage({viewport:{width,height:1000},hasTouch:width<700});await isolatePlaywrightPage(page);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/tests/sanctuary-management-fixed-draft-e2e.html',{waitUntil:'networkidle'});
  await page.evaluate(()=>{
   window.stage13={calls:[],failList:true};
   const target={candidateId:'00000000-0000-4000-8000-000000000011',characterName:'외부부캐',serverId:2,serverName:'지켈',className:'마도성',legionName:'외부',profileImageUrl:'',raceId:1,power:550000,itemLevel:6500,isOperationalLegion:false,allowedRelations:['GUEST','ALT'],membershipRelation:'GUEST'};
   window.KinojoSupabase.searchSanctuaryManagementCharacter=async(teamId,query)=>({ok:true,apiVersion:2.5,schemaVersion:480,source:'OFFICIAL',teamId,candidate:query.includes('본캐')?{...target,candidateId:'00000000-0000-4000-8000-000000000012',characterName:'외부본캐'}:target});
   window.KinojoSupabase.registerSanctuaryManagementCharacter=async(...args)=>{
    stage13.calls.push(args);
    return {ok:true,apiVersion:2.5,schemaVersion:480,registrationId:'00000000-0000-4000-8000-000000000013',character:{...target,characterId:991,mainCharacterId:992,isMain:false,relation:'GUEST',membershipRelation:'GUEST',familyRelation:'ALT',ownerMemberId:null},listSync:{requested:args[5],status:args[5]?'FAILED':'NOT_REQUESTED'}};
   };
   window.KinojoSupabase.retrySanctuaryManagementCharacterList=async()=>({ok:true,apiVersion:2.5,schemaVersion:480,listSync:{requested:true,status:'SYNCED',message:'List 시트 반영 완료'}});
  });
  await page.locator('#sanctuaryManagementAddTeam').click();
  if(await page.locator('[data-draft-slot]').count())await page.locator('[data-draft-slot]').first().click();
  const input=page.locator('[name="characterQuery"]');await input.fill('외부부캐');
  await page.locator('[data-character-search-submit]').click();
  await page.locator('[data-draft-relation="GUEST"]').waitFor();
  assert.equal(await page.locator('[data-list-sync="Y"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-draft-relation="GUEST"]').click();
  assert.equal(await page.locator('[data-draft-register-character]').isEnabled(),true);
  await page.locator('[data-list-sync="N"]').click();
  assert.equal(await page.locator('[data-list-sync="N"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-list-sync="Y"]').click();
  await page.locator('[data-draft-relation="ALT"]').click();
  assert.equal(await page.locator('[data-draft-register-character]').isEnabled(),false);
  await page.locator('[name="mainCharacterQuery"]').fill('외부본캐');
  await page.locator('[data-main-search-submit]').click();
  await page.locator('.sanctuary-management-main-confirmed').waitFor();
  assert.equal(await page.locator('[data-draft-register-character]').isEnabled(),true);
  assert.equal(await page.locator('[data-draft-register-character]').innerText(),'외부본캐의 부캐로 추가');
  if(!listEnabled)await page.locator('[data-list-sync="N"]').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('[data-draft-register-character]').click();
  await page.waitForFunction(()=>stage13.calls.length===1);
  const args=await page.evaluate(()=>stage13.calls[0]);
  assert.equal(args[2],'ALT');assert.equal(args[4],'00000000-0000-4000-8000-000000000012');assert.equal(args[5],listEnabled);assert.match(args[6],/^sm-character-/);
  if(listEnabled){
   await page.locator('[data-list-sync-retry]').click();
   await page.waitForFunction(()=>!document.querySelector('[data-list-sync-retry]'));
  }else{
   assert.equal(await page.locator('[data-list-sync-retry]').count(),0);
   assert.match(await page.locator('[data-draft-status]').innerText(),/List 반영 안 함/);
  }
  assert.deepEqual(errors,[]);
  console.log('Stage13 UI PASS '+width+' List '+listEnabled);
  await page.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
