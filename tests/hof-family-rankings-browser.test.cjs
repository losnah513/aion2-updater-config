'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {isolatePlaywrightPage}=require('./helpers/visitor-traffic');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/hof/family-test'){
   res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui/kinojo-common-ui.css"><link rel="stylesheet" href="/ui/kinojo-components.css"><link rel="stylesheet" href="/hof/css/hall.css"><body class="kinojo-page-hall"><main id="app"></main><script src="/hof/js/hall-state.js"></script><script src="/hof/js/hall-data.js"></script><script src="/hof/js/hall-render.js"></script><script src="/hof/js/hall-reactions.js"></script><script src="/hof/js/hall-events.js"></script></body></html>');return;
  }
  const file=path.join(root,pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'content-type':({'.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream'});res.end(e?'':b);});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{for(const [width,height] of [[1440,1000],[900,1100],[1180,800],[390,844],[320,740],[844,480]]){
  const page=await browser.newPage({viewport:{width,height}});await isolatePlaywrightPage(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/hof/family-test');
  await page.evaluate(()=>{
   window.KinojoCharacterProfileImage={classIconFor:()=>'/assets/images/classes/class_icon_templar.png'};
   const make=(name,id,serverId=2002)=>({name,characterId:id,serverId,serverName:serverId===2002?'지켈':'다른서버',isMain:true,className:'수호성',profileImageUrl:'/assets/images/classes/class_icon_templar.png',pvePower:1200000,pvpPower:900000});
   window.__familyFixture={summarySections:{allForOne:{...make('합산전투력최고본캐',100),familyPower:12000345,altCount:6,familyCharacterCount:7,knownPowerCount:5},oneForAll:{...make('부캐최다본캐',200,2003),altCount:12,familyCharacterCount:13,knownPowerCount:3},pveTop:[make('PVE1',301),make('PVE2',302),make('PVE3',303)],pvpTop:[make('PVP1',401),make('PVP2',402),make('PVP3',403)],enhanceGod:{...make('강화본캐',501),itemLevelDelta:15},growthGod:{...make('성장본캐',601),powerDelta:12500}},overallAll:[make('부캐최다본캐',999,2002)]};
   window.KinojoAuth={getSession:()=>({characterName:'나의본캐'})};
   hallPersonalState={status:'ready'};
   window.__familyFixture.myRanking={familyPve:{rank:8,familyPower:4567890,altCount:5},pve:{rank:11,item:make('나의본캐',700)}};
   window.__calls=[];window.__pending=[];
   window.KinojoSupabase={rpc:(name,args)=>{window.__calls.push({name,args});return new Promise((resolve,reject)=>window.__pending.push({resolve,reject}));}};
   window.bindInlineSuggestionPanel=()=>{};bindHallStaticEvents();
   hallData=structuredClone(window.__familyFixture);app.innerHTML=hofV2Layout();
   window.openReactionModal=(item)=>{window.__opened=item;};bindCharacterButtons();
  });
  const a=page.locator('[data-hof-panel="allForOne"]'),b=page.locator('[data-hof-panel="oneForAll"]');
  assert.equal(await page.locator('.hof-v2-family-champion').count(),2);assert.match(await a.innerText(),/ALL FOR ONE/);assert.match(await a.innerText(),/12000\.3K/);
  assert.match(await a.innerText(),/미확인 2명 제외/);assert.match(await b.innerText(),/ONE FOR ALL/);assert.match(await b.innerText(),/12명/);
  assert.equal(await a.locator('button').count(),2);assert.equal(await b.locator('button').count(),2);
  assert.equal(await page.getByText('DPS TOP3',{exact:true}).count(),0);assert.equal(await page.getByText('레기온 랭킹 바로가기',{exact:true}).count(),0);
  assert.equal(await page.locator('.is-power-card').count(),6,'PVE/PVP TOP3 retained');
  await b.locator('.hof-v2-family-body').click();assert.equal(await page.evaluate(()=>window.__opened.characterId),200,'winner identity is stable across same names on other servers');
  assert.equal(await page.locator('[data-hof-metric="like"],[data-hof-metric="dislike"]').count(),0);
  assert.match(await page.locator('.hof-v2-my-family').innerText(),/8위/);assert.match(await page.locator('.hof-v2-my-family').innerText(),/4567.9K/);
  assert.equal(await page.evaluate(()=>__calls.length),0,'whole ranking must not prefetch');
  await a.locator('[data-hof-family-ranking]').click();
  const dialog=page.locator('#hofFamilyRankingDialog');
  assert.equal(await dialog.isVisible(),true);assert.match(await dialog.innerText(),/전투력 합산 순위 집계중/);
  assert.equal(await dialog.locator('progress:not([value])').count(),1,'no fabricated percent while server is pending');
  await page.evaluate(()=>__pending.shift().resolve({ok:true,page:1,total:41,generatedAt:'2026-10-30T11:00:00Z',items:Array.from({length:20},(_,i)=>({name:'본캐'+i,serverName:'지켈',rank:i+1,familyPower:5000000-i,altCount:5}))}));
  await dialog.getByText('집계 완료',{exact:false}).waitFor();assert.equal(await dialog.locator('li').count(),20);
  await dialog.locator('[data-family-next]').click();assert.equal(await page.evaluate(()=>__calls.at(-1).args.p_page),2);
  await page.evaluate(()=>__pending.shift().reject(Error('offline')));await dialog.locator('[data-family-retry]').click();
  await page.evaluate(()=>__pending.shift().resolve({ok:true,page:2,total:41,items:[{rank:21,name:'<img src=x onerror="window.__xss=1">',familyPower:1234}]}));
  await dialog.locator('li').waitFor();assert.equal(await page.evaluate(()=>window.__xss),undefined);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  await b.locator('[data-hof-family-ranking]').click();assert.equal(await page.evaluate(()=>__calls.at(-1).args.p_metric),'alts');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});await page.evaluate(()=>__pending.shift().resolve({ok:true,page:1,total:0,items:[]}));
  assert.equal(await page.locator('#hofFamilyRankingDialog').count(),0,'closed late responses cannot reopen dialog');
  const bounds=await page.evaluate(()=>{const board=document.querySelector('.hof-v2-board').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,ratio:board.width/board.height,cards:[...document.querySelectorAll('.hof-v2-family-body')].map(el=>({overflow:el.scrollWidth>el.clientWidth+1,height:el.getBoundingClientRect().height}))};});
  assert.equal(bounds.overflow,false,JSON.stringify({width,bounds}));assert(bounds.cards.every(c=>!c.overflow&&c.height>=44),JSON.stringify({width,bounds}));
  if(width>760)assert(Math.abs(bounds.ratio-1)<0.01,'desktop square board preserved');
  if(process.env.HOF_SCREENSHOT_DIR){await page.mouse.move(1,1);await page.evaluate(()=>hideCharacterPreview_());fs.mkdirSync(process.env.HOF_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.HOF_SCREENSHOT_DIR,'hof-family-'+width+'.png'),fullPage:true});}
  await page.evaluate(()=>{window.KinojoAuth=null;hallData.summarySections.allForOne=null;hallData.summarySections.oneForAll=null;app.innerHTML=hofV2Layout();});
  assert.equal(await page.locator('.hof-v2-family-body.is-empty').count(),2);
  await page.evaluate(()=>{hallData=structuredClone(window.__familyFixture);hallData.summarySections.oneForAll.name='<img src=x onerror="window.__xss=1">';app.innerHTML=hofV2Layout();});
  assert.equal(await page.evaluate(()=>window.__xss),undefined);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: actual HOF render/data/reaction roads, two single-person cards, exact PVE score, missing values, alt count, stable identity, escaped text/empty states, PC/Fold/mobile/landscape and square-board geometry');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});


