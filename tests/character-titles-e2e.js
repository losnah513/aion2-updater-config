const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/test') {res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial;margin:0}*{box-sizing:border-box}</style><link rel="stylesheet" href="/ui/kinojo-character-reaction.css"><link rel="stylesheet" href="/ui/kinojo-character-skill.css"><button id="open">열기</button><script src="/ui/kinojo-character-reaction.js"></script><script src="/ui/kinojo-character-skill-bridge.js"></script>');return;}
  const file=path.join(root,pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);res.end();return}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(data)});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try {
  const config=JSON.parse(fs.readFileSync(path.join(root,'config.json'),'utf8'));
  const response=await fetch(config.supabase.url+'/rest/v1/rpc/kinojo_character_equipped_titles_v466',{method:'POST',headers:{apikey:config.supabase.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({p_server_id:2002,p_character_name:'더샷'})});
  assert.equal(response.status,200);const titles=await response.json();assert.equal(titles.titles.length,3);assert.deepEqual(titles.titles.map(t=>t.category),['Attack','Defense','Etc']);
  for(const [width,height] of [[1280,900],[760,900],[390,844],[320,740]]){
   const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port+'/test');
   await page.evaluate(titles=>{
    window.titleFixture=titles;window.mode='ready';
    window.KinojoSupabaseRpcCore={rpc:async(name)=>{
     if(!name.includes('equipped_titles'))return {ok:true,skills:[]};
     if(mode==='delayed')return new Promise(r=>window.resolveOld=r);
     if(mode==='error')throw Error('offline');
     return titleFixture;
    }};
    window.KinojoSupabase={getLiveCharacterProfile:async()=>({ok:true,profile:{},equipment:[],arcana:[],daevanion:[],skills:[]})};
    document.querySelector('#open').onclick=()=>KinojoCharacterReaction.open({target:{name:'더샷',serverId:2002,server:'지켈',className:'궁성',detailUrl:'https://aion2.plaync.com/ko-kr/characters/2002/example'}});
   },titles);
   await page.click('#open');await page.waitForSelector('[data-title-category="Attack"] .kinojo-character-title-name');
   assert.equal(await page.locator('#kinojoCharacterReactionDetail').count(),1);
   assert.equal(await page.locator('.kinojo-character-reaction-name-row #kinojoCharacterReactionDetail').count(),1);
   assert.equal(await page.locator('#kinojoCharacterLiveTime').count(),0);
   assert.equal(await page.locator('.kinojo-character-title-body li').count(),titles.titles.reduce((n,t)=>n+t.effects.length,0));
   assert.equal(await page.locator('.kinojo-character-title-name').first().evaluate(e=>getComputedStyle(e).color),'rgb(251, 152, 0)');
   const boxes=await page.evaluate(()=>{const b=s=>document.querySelector(s).getBoundingClientRect();return {offset:b('.kinojo-character-reaction-visual').top-b('#kinojoCharacterReactionTitle').top,overflow:document.documentElement.scrollWidth-innerWidth,dialogOverflow:document.querySelector('.kinojo-character-reaction-dialog').scrollWidth-document.querySelector('.kinojo-character-reaction-dialog').clientWidth}});
   assert.ok(Math.abs(boxes.offset)<2,JSON.stringify(boxes));assert.equal(boxes.overflow,0);assert.equal(boxes.dialogOverflow,0);
   if(process.env.EVIDENCE_DIR){fs.mkdirSync(process.env.EVIDENCE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.EVIDENCE_DIR,`character-titles-${width}.png`)});}
   await page.evaluate(()=>{mode='delayed';KinojoCharacterReaction.open({target:{name:'이전',serverId:2002}})});
   await page.evaluate(()=>{mode='error';KinojoCharacterReaction.open({target:{name:'새캐릭터이름이매우긴경우',serverId:2002}})});
   await page.waitForFunction(()=>document.querySelector('#kinojoCharacterTitles').textContent.includes('확인 불가'));
   await page.evaluate(()=>resolveOld(titleFixture));await page.waitForTimeout(80);
   assert.equal(await page.locator('.kinojo-character-title-name').count(),0,'late response must not leak old titles');
   await page.evaluate(()=>{mode='ready';titleFixture={ok:true,titles:titleFixture.titles.map(t=>({...t,status:'unequipped'}))};KinojoCharacterReaction.open({target:{name:'빈타이틀',serverId:2002}})});
   await page.waitForFunction(()=>document.querySelector('#kinojoCharacterTitles').textContent.includes('타이틀 없음'));
   assert.equal(await page.locator('.kinojo-character-title-name').count(),0);
   await page.keyboard.press('Escape');assert.equal(await page.locator('#kinojoCharacterReactionModal').getAttribute('aria-hidden'),'true');
   assert.deepEqual(errors,[]);console.log('PASS',width,boxes);await page.close();
  }
 } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
