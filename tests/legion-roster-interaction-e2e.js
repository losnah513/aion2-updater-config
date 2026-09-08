const {isolatePlaywrightPage}=require('./helpers/visitor-traffic');
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
  console.log("Checking",width); const page=await browser.newPage({viewport:{width,height},hasTouch:width<=700});await isolatePlaywrightPage(page);const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  let rpcCalls=0;
  const fixture=Array.from({length:55},(_,i)=>({characterId:String(i+1),name:'명단 카드 '+String(i+1).padStart(2,'0'),serverId:2002,serverName:'지켈',className:'궁성',legion:'깡',isMain:i===0,hasLibraryImage:i<2}));
  fixture[0].name='매우긴캐릭터이름표시검증용캐릭터';
  fixture[3]={...fixture[3],name:fixture[1].name,serverId:2003,serverName:'다른 서버'};
  const imageBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64');
  let failDownload=false;
  if(!process.env.ROSTER_LIVE_DATA)await page.route('**/storage/v1/object/public/kinojo-site-banners/**',route=>failDownload?route.fulfill({status:503,body:'unavailable'}):route.fulfill({contentType:'image/png',body:imageBytes,headers:{'Access-Control-Allow-Origin':'*'}}));
  if(!process.env.ROSTER_LIVE_DATA)await page.route('**/rest/v1/rpc/kinojo_web_roster_*',async route=>{
    rpcCalls++;const req=route.request().postDataJSON();const family=route.request().url().includes('family');
    if(route.request().url().includes('images_v467')){
      const count=req.p_character_id==='1'?23:req.p_character_id==='2'?1:0,offset=req.p_cursor?.offset||0;
      await route.fulfill({json:{contractVersion:467,gender:req.p_character_id==='3'?'MALE':'FEMALE',characterId:req.p_character_id,selectedCharacterId:req.p_selected_character_id,sourceToken:'images',total:count,nextCursor:offset+req.p_limit<count?{offset:offset+req.p_limit,sourceToken:'images'}:null,
        items:Array.from({length:count},(_,i)=>({assetId:String(i+1),url:'https://josvoltpktvwysrasffq.supabase.co/storage/v1/object/public/kinojo-site-banners/2026/09/00000000-0000-0000-0000-'+String(i).padStart(12,'0')+'.png',mimeType:'image/png',width:1,height:1,alt:'테스트 이미지 '+i,revision:'1'})).slice(offset,offset+req.p_limit)}});return;
    }
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
  assert.equal(await page.getByText('최신 PVE',{exact:true}).count(),0);
  const barFits=await page.evaluate(()=>{
    const b=document.querySelector('.roster-subbar').getBoundingClientRect();
    return [...document.querySelectorAll('.roster-subbar .kinojo-filter-switch,.roster-subbar input.kinojo-input,.roster-subbar button')].filter(el=>el.getClientRects().length).every(el=>{
      const r=el.getBoundingClientRect();return r.top>=b.top&&r.bottom<=b.bottom+1&&r.left>=b.left&&r.right<=b.right;
    });
  });assert.ok(barFits,'all controls must fit inside subbar');
  assert.equal(await page.locator('#rosterDetail').isVisible(),false);
  assert.deepEqual(await page.evaluate(()=>feedback),{sounds:0,vibrations:0});
  assert.equal(await page.locator('#rosterSound,#rosterVibration').count(),0);
  if(!process.env.ROSTER_LIVE_DATA){
    assert.equal(await page.locator('.roster-option[data-character-id="1"] .roster-image-dot').count(),1);
    assert.equal(await page.locator('.roster-option[data-character-id="3"] .roster-image-dot').count(),0);
    assert.equal(await page.locator('.roster-option[data-character-id="1"]').getAttribute('title'),'등록된 이미지 있음');
    assert.ok(await page.locator('.roster-option[data-character-id="1"] .roster-image-dot').evaluate(dot=>{const d=dot.getBoundingClientRect(),c=dot.parentElement.getBoundingClientRect();return d.left>c.left&&d.top>c.top&&d.right<c.left+c.width/2&&d.bottom<c.top+c.height/2}),'red dot stays inside the card upper-left');
  }
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
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>document.querySelectorAll('.roster-character')[1]?.classList.contains('is-family-active'));
  assert.equal(await page.locator('#rosterSelected').textContent(),selectedName);
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(()=>document.querySelector('.roster-character')?.classList.contains('is-family-active'));
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(name=>document.querySelector('#rosterSelected').textContent!==name,selectedName);
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(name=>document.querySelector('#rosterSelected').textContent===name,selectedName);
  await page.waitForFunction(()=>document.querySelectorAll('.is-image-visible').length===document.querySelectorAll('.roster-character').length);
  assert.ok(await page.locator('.roster-image').evaluateAll(els=>els.every(el=>{
    const r=el.getBoundingClientRect();return Math.abs(r.width/r.height-300/715)<.005;
  })),'image aperture must preserve 300:715 ratio');
  if(!process.env.ROSTER_LIVE_DATA){
    const main=page.locator('.roster-character').nth(0),alt=page.locator('.roster-character').nth(1),empty=page.locator('.roster-character').nth(2);
    await main.scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('.roster-image-open')?.dataset.assetId==='1');
    assert.equal(await main.locator('.roster-image-prev,.roster-image-next').count(),2);
    assert.equal(await alt.locator('.roster-image-prev,.roster-image-next').count(),0);
    assert.equal(await empty.locator('.roster-image img,.roster-image button').count(),0);
    await empty.scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelectorAll('.roster-character')[2]?.querySelector('.roster-image')?.classList.contains('is-background-male'));
    assert.ok((await empty.locator('.roster-image').evaluate(el=>getComputedStyle(el).backgroundImage)).includes('male-background.png'));
    await empty.locator('.roster-image').click();
    assert.equal(await page.locator('.roster-lightbox').isVisible(),false);
    await main.scrollIntoViewIfNeeded();
    await main.locator('.roster-image-next').click();
    await page.waitForFunction(()=>document.querySelector('.roster-image-open')?.dataset.assetId==='2');
    assert.equal(await alt.locator('.roster-image-open').getAttribute('data-asset-id'),'1');
    await main.locator('.roster-image-open').click();assert.ok(await page.locator('.roster-lightbox').isVisible());
    assert.ok(await page.locator('.roster-lightbox-tools').evaluate(el=>{
      const r=el.getBoundingClientRect(),image=document.querySelector('.roster-lightbox>img').getBoundingClientRect();
      return Math.abs(r.x+r.width/2-innerWidth/2)<1&&r.top>=image.bottom;
    }),'viewer controls must be centered below image');
    const saved=page.waitForEvent('download');await page.locator('.roster-lightbox button').filter({hasText:'다운로드'}).click();
    const file=await saved;assert.ok(file.suggestedFilename().endsWith('-2.png'));
    assert.deepEqual(fs.readFileSync(await file.path()),imageBytes);
    failDownload=true;await page.locator('.roster-lightbox button').filter({hasText:'다운로드'}).click();
    await page.waitForFunction(()=>document.querySelector('.roster-lightbox p').textContent.includes('다운로드하지 못했습니다'));
    failDownload=false;
    await page.keyboard.press('Escape');assert.equal(await page.locator('.roster-lightbox').isVisible(),false);
    await page.waitForFunction(()=>!document.querySelector('.roster-lightbox>img').hasAttribute('src'));
    assert.equal(await main.locator('.roster-image-open').evaluate(el=>el===document.activeElement),true);
    assert.equal(await main.locator('.roster-image-open').getAttribute('data-asset-id'),'2');
    await page.waitForFunction(()=>document.querySelector('.roster-image-prev')?.getAttribute('aria-disabled')!=='true');await main.locator('.roster-image-prev').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('.roster-image-open')?.dataset.assetId==='1');
    await page.waitForFunction(()=>document.querySelector('.roster-image-prev')?.getAttribute('aria-disabled')==='false');await main.locator('.roster-image-prev').focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('.roster-image-open')?.dataset.assetId==='23');
    if(width<=700){
      assert.equal(await page.locator('.roster-family-prev').isVisible(),false);
      assert.ok(await page.locator('.roster-family-more').isVisible());
      await page.locator('.roster-family-more').click();
      await page.waitForFunction(()=>document.querySelectorAll('.roster-character')[1]?.classList.contains('is-family-active'));
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(()=>document.querySelectorAll('.roster-character')[2]?.classList.contains('is-family-active'));
      await page.waitForTimeout(500);
      assert.ok(await page.locator('.roster-family-prev').isVisible());
      await page.locator('.roster-family-prev').click();
      await page.waitForFunction(()=>document.querySelectorAll('.roster-character')[1]?.classList.contains('is-family-active'));
      await page.locator('.roster-family-prev').click();
      await page.waitForFunction(()=>document.querySelectorAll('.roster-character')[0]?.classList.contains('is-family-active'));
      await page.waitForTimeout(500);
      assert.equal(await page.locator('.roster-family-prev').isVisible(),false);
      await page.keyboard.press('ArrowRight');await page.waitForTimeout(100);await page.keyboard.press('ArrowRight');await page.waitForTimeout(500);
      assert.equal(await page.locator('.roster-family-more').isVisible(),false,JSON.stringify(await page.locator('#rosterFamily').evaluate(el=>({left:el.scrollLeft,width:el.clientWidth,total:el.scrollWidth,frame:el.getBoundingClientRect().toJSON(),last:el.lastElementChild.getBoundingClientRect().toJSON()}))));
    }
  }
  if(width<=700){await page.locator('#rosterBack').click();await page.waitForTimeout(450)}
  await page.locator('#rosterName').fill('찾을수없는캐릭터zzzz');await page.locator('#rosterSearch button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#rosterStatus').textContent.includes('조회 결과가 없습니다'));
  assert.equal(await page.locator('.roster-option').count(),0);
  await page.locator('#rosterName').fill(selectedName);await page.locator('#rosterSearch button[type="submit"]').click();
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
    await page.locator('#rosterName').fill('여');await page.locator('#rosterSearch button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('.roster-option[data-character-id="96"]'));
    await page.locator('.roster-option[data-character-id="96"]').click();
    await page.waitForFunction(()=>document.querySelector('#rosterBody').classList.contains('has-selection'));
    await page.waitForFunction(()=>document.querySelectorAll('.is-image-visible').length===document.querySelectorAll('.roster-character').length);
    await page.waitForTimeout(500);
    const realImage=page.locator('.roster-character[data-character-id="96"] .roster-image-open');
    await realImage.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('.roster-character[data-character-id="96"] .roster-image-open')?.dataset.assetId);
    await realImage.click();
    if(width===1920||width===390){
      const source=await page.locator('.roster-lightbox>img').getAttribute('src');
      const original=await page.request.get(source);assert.ok(original.ok());
      const saved=page.waitForEvent('download');await page.locator('.roster-lightbox button').filter({hasText:'다운로드'}).click();
      const file=await saved;assert.deepEqual(fs.readFileSync(await file.path()),await original.body());
    }
    await page.keyboard.press('Escape');
  }
  if(!process.env.ROSTER_LIVE_DATA){
    await page.locator('#rosterName').fill('실패');await page.locator('#rosterSearch button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('#rosterStatus').textContent.includes('불러오지 못했습니다'));
    await page.locator('#rosterName').fill('지연');await page.locator('#rosterSearch button[type="submit"]').click();
    await page.locator('#rosterName').fill('');await page.locator('#rosterSearch button[type="submit"]').click();
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
  assert.equal(metrics.overflow,0);if(!process.env.ROSTER_LIVE_DATA)assert.ok(metrics.images>=1&&metrics.images<=2);assert.deepEqual(errors,[]);
  if(!process.env.ROSTER_LIVE_DATA&&(width===1920||width===390)){
    await page.waitForFunction(()=>document.querySelector('#legionTreeStatus').textContent.includes('관리 권한'));
    assert.ok(await page.locator('#legionTreeSearchBtn').isDisabled());
    await page.evaluate(()=>{
      window.addFixture={search:0,add:0,fail:true};
      window.KinojoAuth={getAccount:()=>({canManage:true})};
      const original=window.KinojoSupabase;
      window.KinojoSupabase={...original,
        searchLegionTreeCharacters:async request=>{
          addFixture.search++;
          const group=(role,name,id)=>({ok:true,role,query:{characterName:name},candidates:[{characterId:id,characterName:name,serverId:2002,serverName:'지켈',raceId:2}]});
          return {ok:true,contract:'legion-tree-character-search-v1',readOnly:true,createsTarget:false,createsQueue:false,main:group('main','추가본캐','501'),alt:group('alt','추가부캐','502')};
        },
        addLegionTreeCharacter:async request=>{
          addFixture.add++;addFixture.request=request;
          if(addFixture.fail)throw new Error('이미 등록된 캐릭터입니다.');
          return {ok:true,contract:'legion-tree-character-add-v1',code:'ADD_QUEUE_ACCEPTED',listlessCharacterAdd:true,listAppendPending:false,queue:{sessionId:'fixture-add'}};
        },
        runtimeGetStatus:async()=>({sessionId:'fixture-add',status:'completed'})
      };
      window.dispatchEvent(new Event('kinojo:auth-changed'));
    });
    await page.locator('#legionTreeSearchBtn').click();assert.equal(await page.evaluate(()=>addFixture.search),0);
    await page.locator('#legionTreeMainName').fill('추가본캐');await page.locator('#legionTreeAltName').fill('추가부캐');
    await page.locator('#legionTreeSearchBtn').click();
    await page.locator('#legionTreeMainResults button').click();await page.locator('#legionTreeAltResults button').click();
    await page.locator('#legionTreeAddBtn').click();
    await page.waitForFunction(()=>document.querySelector('#legionTreeStatus').textContent.includes('이미 등록'));
    assert.ok(await page.locator('#legionTreeSearchResults').isVisible());
    await page.evaluate(()=>{addFixture.fail=false});const callsBefore=rpcCalls;
    await page.locator('#legionTreeAddBtn').click();
    await page.waitForFunction(()=>document.querySelector('#legionTreeStatus').textContent.includes('명부 새로고침이 완료'));
    assert.ok(rpcCalls>callsBefore,'completed add must reload roster');
    assert.deepEqual(await page.evaluate(()=>addFixture.request),{mainCharacterName:'추가본캐[지켈]',altCharacterName:'추가부캐[지켈]'});
    assert.equal(await page.locator('#legionTreeMainName').inputValue(),'');
    assert.equal(await page.locator('#legionTreeSearchResults').isVisible(),false);
  }
  if(process.env.ROSTER_EVIDENCE_DIR){fs.mkdirSync(process.env.ROSTER_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.ROSTER_EVIDENCE_DIR,'roster-'+width+'.png'),fullPage:true})}
  results.push({width,height,...metrics,errors});await page.close();
 }
 console.log(JSON.stringify(results,null,2));
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
