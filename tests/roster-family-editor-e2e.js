const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {isolatePlaywrightPage}=require('./helpers/visitor-traffic');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(file.endsWith(path.sep))file+='index.html';fs.readFile(file,(err,bytes)=>{res.writeHead(err?404:200,{'content-type':({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream'});res.end(err?'':bytes);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{for(const width of [1440,701,600,390,320]){
  const page=await browser.newPage({viewport:{width,height:900},hasTouch:width<=600});await isolatePlaywrightPage(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/rest/v1/rpc/kinojo_web_roster_*',r=>r.fulfill({json:{contractVersion:465,items:[],total:0,nextCursor:null,legions:['깡','낮','밤','키나노동조합']}}));
  await page.goto('http://127.0.0.1:'+server.address().port+(width<1000?'/m':'')+'/legion-roster/',{waitUntil:'networkidle'});
  assert.equal(await page.locator('#rosterFamilyEdit').isVisible(),false);
  await page.evaluate(()=>{
   window.KinojoAuth.getAccount=()=>({canManage:true});window.dispatchEvent(new Event('kinojo:auth-changed'));
   window.familyFixture={calls:[],conflict:false,uncertain:false};
   const rows=[{characterId:'11',name:'본캐 A',serverName:'지켈',legion:'깡',mainCharacterId:'11',isMain:true,available:true},{characterId:'12',name:'부캐 B',serverName:'지켈',legion:'낮',mainCharacterId:'11',isMain:false,available:true},{characterId:'13',name:'부캐 C',serverName:'지켈',legion:'밤',mainCharacterId:'11',isMain:false,available:true}];
   window.KinojoSupabase.rosterFamily=async(action,payload)=>{familyFixture.calls.push({action,payload});if(action==='family-search')return{ok:true,contract:'roster-family-v477',items:rows.slice(0,1)};if(action==='family-load')return{ok:true,contract:'roster-family-v477',family:{rootId:'11',revision:'a'.repeat(32),items:rows}};if(familyFixture.conflict)throw new Error('캐릭터 관계가 변경되었습니다.');if(familyFixture.uncertain){familyFixture.uncertain=false;throw new Error('네트워크 응답이 없습니다.');}return{ok:true,contract:'roster-family-v477',family:{items:[]}};};
  });
  await page.locator('#rosterFamilyEdit').click();await page.locator('#rosterLinkQuery').fill('본캐');await page.locator('.roster-link-search button').click();await page.getByRole('button',{name:'불러오기',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.roster-link-card').length===3);
  assert.equal(await page.getByRole('button',{name:'본캐로 등록',exact:true}).count(),0);
  assert.equal(await page.locator('.roster-link-card').first().evaluate(el=>el.offsetHeight),54);
  const before=await page.locator('.roster-link-wires path').first().getAttribute('d');
  const card=page.locator('[data-character-id="12"]'),r=await card.boundingBox(),slot=await page.locator('.roster-link-main').boundingBox();
  await page.mouse.move(r.x+45,r.y+25);await page.mouse.down();await page.mouse.move(r.x+65,r.y+50,{steps:8});assert.notEqual(await page.locator('.roster-link-wires path').first().getAttribute('d'),before);await page.mouse.up();
  const b=await card.boundingBox(),x=slot.x+slot.width+18,y=slot.y+27;
  if(width<=600){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+45,y:b.y+25}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await page.mouse.move(b.x+45,b.y+25);await page.mouse.down();await page.mouse.move(x,y,{steps:8});await page.mouse.up();}
  await page.waitForFunction(()=>document.querySelector('.roster-link-main-cards [data-character-id="12"]'));await page.waitForTimeout(320);
  assert.equal(await page.locator('.roster-link-alt-cards .roster-link-card').count(),2);
  assert.equal(await page.locator('.roster-link-wires path').count(),2);
  assert.equal(await page.locator('[data-save]').isDisabled(),false);
  if(process.env.ROSTER_EVIDENCE_DIR){fs.mkdirSync(process.env.ROSTER_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.ROSTER_EVIDENCE_DIR,'family-'+width+'.png')});}
  await page.evaluate(()=>familyFixture.uncertain=true);await page.locator('[data-save]').click();await page.waitForFunction(()=>document.querySelector('.roster-link-message').textContent.includes('네트워크'));
  await page.locator('[data-save]').click();await page.waitForFunction(()=>!document.querySelector('.roster-link-dialog').open);
  const saves=await page.evaluate(()=>familyFixture.calls.filter(c=>c.action==='family-save'));
  assert.equal(saves.length,2);assert.equal(saves[0].payload.requestId,saves[1].payload.requestId);assert.equal(saves[0].payload.mainCharacterId,'12');assert.deepEqual(new Set(saves[0].payload.altCharacterIds),new Set(['11','13']));
  await page.locator('#rosterName').fill('검사');await page.locator('#rosterSearchReset').click();assert.equal(await page.locator('#rosterName').inputValue(),'');
  assert.equal(await page.locator('#rosterScopeLabel').textContent(),'전체');assert.equal(await page.locator('#rosterLegionScopeLabel').textContent(),'레기온별');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);console.log('family editor PASS',width);await page.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
