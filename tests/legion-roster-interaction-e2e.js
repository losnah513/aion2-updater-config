/* Run with Playwright installed. Optional ROSTER_BASE_URL tests the deployed site. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  let file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  if(file.endsWith(path.sep))file+='index.html';
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data)});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=process.env.ROSTER_BASE_URL||'http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const results=[];
 try{
 for(const [width,height] of [[1920,900],[701,800],[700,800],[390,844],[320,740],[900,740]]){
  console.log("Checking",width); const page=await browser.newPage({viewport:{width,height},hasTouch:width<=700});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  let rpcCalls=0;
  const fixture=Array.from({length:55},(_,i)=>({characterId:String(i+1),name:'명단 카드 '+String(i+1).padStart(2,'0'),serverId:2002,serverName:'지켈',className:'궁성',legion:'깡',isMain:i===0}));
  fixture[0].name='매우긴캐릭터이름표시검증용캐릭터';
  fixture[3]={...fixture[3],name:fixture[1].name,serverId:2003,serverName:'다른 서버'};
  if(!process.env.ROSTER_LIVE_DATA)await page.route('**/rest/v1/rpc/kinojo_web_roster_*',async route=>{
    rpcCalls++;const req=route.request().postDataJSON();const family=route.request().url().includes('family');
    if(req.p_query==='실패'){await route.fulfill({status:500,json:{message:'fixture error'}});return}
    if(req.p_query==='지연')await new Promise(r=>setTimeout(r,350));
    if(family&&req.p_character_id==='1')await new Promise(r=>setTimeout(r,350));
    let rows=family?fixture.slice(0,3).map((r,i)=>({...r,itemLevel:i===2?null:6400,combatPower:990000+i})):fixture.filter(r=>!req.p_query||r.name.includes(req.p_query));
    const offset=req.p_cursor?.offset||0,total=rows.length;
    const token='fixture-'+(family?req.p_character_id:req.p_query||'all');
    await route.fulfill({json:{contractVersion:465,generatedAt:new Date().toISOString(),sourceToken:token,
      items:rows.slice(offset,offset+req.p_limit),total,nextCursor:offset+req.p_limit<total?{offset:offset+req.p_limit,sourceToken:token}:null,
      legions:['깡','낮','밤','키나노동조합'],selectedCharacterId:req.p_character_id,mainCharacterId:'1',relationshipState:'OK'}});
  });
  await page.addInitScript(()=>{
   window.feedback={sounds:0,vibrations:0};
   window.AudioContext=class{state='running';currentTime=0;destination={};resume(){return Promise.resolve()}createOscillator(){return{frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){},start(){window.feedback.sounds++},stop(){}}}createGain(){return{gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}};
   Object.defineProperty(navigator,'vibrate',{value:()=>{window.feedback.vibrations++;return true}});
  });

  await page.goto(base+(width<1000?'/m':'')+'/legion-roster/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelectorAll('.roster-option').length>1);
  assert.equal(await page.locator('#rosterDetail').isVisible(),false);
  assert.deepEqual(await page.evaluate(()=>feedback),{sounds:0,vibrations:0});
  assert.equal(await page.locator('#rosterSound,#rosterVibration').count(),0);
  const selectedName=await page.locator('.roster-option').nth(1).locator('strong').textContent();
  const selectedId=await page.locator('.roster-option').nth(1).getAttribute('data-character-id');
  await page.evaluate(()=>{
    window.cardOrder=[];window.imageOrder=[];window.initialOffsets=[];
    new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(card=>{
      if(!card.classList?.contains('roster-character'))return;
      const id=card.dataset.characterId;
      initialOffsets.push(getComputedStyle(card.querySelector('.roster-info')).transform);
      new MutationObserver(()=>{
        if(card.classList.contains('is-card-visible')&&!cardOrder.includes(id))cardOrder.push(id);
        if(card.classList.contains('is-image-visible')&&!imageOrder.includes(id))imageOrder.push(id);
      }).observe(card,{attributes:true,attributeFilter:['class']});
    }))).observe(document.querySelector('#rosterFamily'),{childList:true});
  });
  await page.locator('#rosterWheel').focus();await page.keyboard.press('ArrowDown');await page.waitForTimeout(650);
  assert.equal(await page.locator('#rosterWheel').getAttribute('aria-activedescendant'),'roster-option-1');
  assert.ok((await page.evaluate(()=>feedback.sounds))>0);
  if(width<=700){assert.ok((await page.evaluate(()=>feedback.vibrations))>0);assert.equal(await page.locator('#rosterDetail').isVisible(),false);await page.keyboard.press('Enter')}
  await page.waitForFunction(()=>document.querySelectorAll('.roster-character').length>0&&document.querySelectorAll('.is-image-visible').length===document.querySelectorAll('.roster-character').length);
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#rosterSelected').textContent(),selectedName);
  const familyIds=await page.locator('.roster-character').evaluateAll(cards=>cards.map(c=>c.dataset.characterId));
  assert.deepEqual(await page.evaluate(()=>cardOrder),familyIds);
  assert.deepEqual(await page.evaluate(()=>imageOrder),familyIds);
  assert.ok(await page.locator('.roster-metrics img').evaluateAll(imgs=>imgs.length&&imgs.every(img=>img.src.startsWith('https://assets.playnccdn.com/static-aion2/characters/img/info/profile_'))));
  assert.ok(await page.locator('.roster-info h2 img').count()>0);
  if(width<=700){await page.locator('#rosterBack').click();await page.waitForTimeout(450)}
  await page.locator('#rosterName').fill('찾을수없는캐릭터zzzz');await page.locator('#rosterSearch button').click();
  await page.waitForFunction(()=>document.querySelector('#rosterStatus').textContent.includes('조회 결과가 없습니다'));
  assert.equal(await page.locator('.roster-option').count(),0);
  await page.locator('#rosterName').fill(selectedName);await page.locator('#rosterSearch button').click();
  await page.waitForFunction(()=>document.querySelectorAll('.roster-option').length>0);
  if(await page.locator('.roster-option').count()>1)await page.locator('.roster-option[data-character-id="'+selectedId+'"]').click();
  await page.waitForFunction(()=>document.querySelector('#rosterBody').classList.contains('has-selection'));
  if(width<=700){await page.locator('#rosterBack').click();await page.waitForTimeout(450)}
  await page.locator('label:has(#rosterScope)').click();await page.waitForFunction(()=>document.querySelector('#rosterWheel').getAttribute('aria-busy')==='false');
  await page.locator('label:has(#rosterScope)').click();await page.waitForFunction(()=>document.querySelector('#rosterWheel').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('#rosterName').inputValue(),selectedName);
  assert.equal(await page.locator('.roster-option[aria-selected="true"]').getAttribute('data-character-id'),selectedId);
  assert.equal(await page.locator('#rosterDetail').evaluate(node=>getComputedStyle(node).opacity),'0');
  if(process.env.ROSTER_LIVE_DATA){
    await page.locator('.roster-option[aria-selected="true"]').click();
    await page.waitForFunction(()=>document.querySelector('#rosterBody').classList.contains('has-selection'));
    await page.waitForFunction(()=>document.querySelectorAll('.is-image-visible').length===document.querySelectorAll('.roster-character').length);
    await page.waitForTimeout(500);
  }
  if(!process.env.ROSTER_LIVE_DATA){
    await page.locator('#rosterName').fill('실패');await page.locator('#rosterSearch button').click();
    await page.waitForFunction(()=>document.querySelector('#rosterStatus').textContent.includes('불러오지 못했습니다'));
    await page.locator('#rosterName').fill('지연');await page.locator('#rosterSearch button').click();
    await page.locator('#rosterName').fill('');await page.locator('#rosterSearch button').click();
    await page.waitForFunction(()=>document.querySelectorAll('.roster-option').length===50);await page.waitForTimeout(500);
    assert.equal(await page.locator('.roster-option').count(),50);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('#rosterWheel').focus();await page.keyboard.press('End');
    await page.waitForFunction(()=>document.querySelectorAll('.roster-option').length===55);
    await page.keyboard.press('Home');await page.keyboard.press('Enter');
    await page.waitForTimeout(190);await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelectorAll('.is-image-visible').length===3);
    await page.waitForTimeout(500);assert.equal(await page.locator('#rosterSelected').textContent(),fixture[1].name);
  }
  const metrics=await page.evaluate(()=>{const v=document.querySelector('.roster-viewer').getBoundingClientRect();return{overflow:document.documentElement.scrollWidth-innerWidth,viewerBottom:v.bottom,images:document.querySelectorAll('.roster-image img').length}});
  assert.equal(metrics.overflow,0);assert.equal(metrics.images,0);assert.deepEqual(errors,[]);
  if(process.env.ROSTER_EVIDENCE_DIR){fs.mkdirSync(process.env.ROSTER_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.ROSTER_EVIDENCE_DIR,'roster-'+width+'.png'),fullPage:true})}
  results.push({width,height,...metrics,errors});await page.close();
 }
 console.log(JSON.stringify(results,null,2));
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
