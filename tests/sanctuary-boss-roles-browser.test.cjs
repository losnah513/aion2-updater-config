const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'../.codex-test-runtime/node_modules/playwright');
const {isolatePlaywrightPage}=require('./helpers/visitor-traffic');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>fs.readFile(path.join(root,new URL(req.url,'http://localhost').pathname),(e,b)=>{res.writeHead(e?404:200,{'content-type':({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(req.url.split('?')[0])]||'application/octet-stream'});res.end(e?'':b);}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{for(const width of [1440,768,390,320,844]){
  const page=await browser.newPage({viewport:{width,height:1000}});await isolatePlaywrightPage(page);
  await page.goto('http://127.0.0.1:'+server.address().port+'/tests/sanctuary-management-fixed-draft-e2e.html',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
   const bridge=window.KinojoSanctuaryManagementDraftBridge,data=structuredClone(bridge.snapshot());
   const team=data.teams[0],force=team.forces[0];team.status='ACTIVE';
   const first=force.parties[0].slots[0];first.character.name='쿠르';first.bossRoles={boss1:'3>3',boss2:[1,12]};
   const second=force.parties[0].slots[1];second.occupied=true;second.assignmentKind='ACTUAL_CHARACTER';second.bossRoles={boss1:'6>6',boss2:[2,3]};second.character={...first.character,name:'아주긴캐릭터이름',characterId:502,mainCharacterId:502};
   for(const t of data.teams){for(const f of t.forces){for(const p of f.parties){p.occupiedCount=p.slots.filter(s=>s.occupied).length;p.vacancyCount=5-p.occupiedCount;delete p.combatPower;}f.occupiedCount=f.parties.reduce((n,p)=>n+p.occupiedCount,0);f.vacancyCount=10-f.occupiedCount;delete f.combatPower;}t.occupiedCount=t.forces.reduce((n,f)=>n+f.occupiedCount,0);t.vacancyCount=t.forces.length*10-t.occupiedCount;}
   window.KinojoSupabase.getSanctuaryManagementBootstrap=async()=>structuredClone(data);
   await bridge.reload();
  });
  await page.waitForSelector('.sanctuary-boss-badge');
  assert.match(await page.locator('.sanctuary-management-force-slot-name').first().innerText(),/쿠르\[지켈\]/);
  assert.equal(await page.locator('.sanctuary-management-force-slot').evaluateAll(nodes=>nodes.some(n=>n.scrollWidth>n.clientWidth+1)),false,'card overflow '+width);
  await page.locator('[data-sanctuary-edit-team="77"]').first().click();
  await page.locator('[data-draft-slot][data-occupied="true"]').first().click();
  const picker=page.locator('.sanctuary-boss-role-picker');await picker.waitFor();
  assert.equal(await picker.locator('[data-boss="1"][data-boss-role="6>6"]').isDisabled(),true);
  assert.equal(await picker.locator('[data-boss="2"][data-boss-role="2"]').isDisabled(),true);
  assert.equal(await picker.locator('[data-boss="2"][data-boss-role="4"]').isDisabled(),true,'max two');
  await picker.locator('[data-boss="2"][data-boss-role="1"]').click();
  await picker.locator('[data-boss="2"][data-boss-role="4"]').click();
  assert.equal(await picker.locator('[data-boss="2"][aria-pressed="true"]').count(),2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'body overflow '+width);
  if(process.env.BOSS_ROLE_SCREENSHOT&&width===390)await page.screenshot({path:process.env.BOSS_ROLE_SCREENSHOT,fullPage:true});
  console.log('PASS role picker/card '+width);await page.close();
 }
 // Actual SVG renderer: all three role badges and name[server] fit the existing card.
 const code=stripTypeScriptTypes(fs.readFileSync(path.join(root,'supabase/functions/sanctuary-copy-render/index.ts'),'utf8').replace(/^import .*\n/,''));
 const ctx=vm.createContext({URL,Request,Response,Map,console,Deno:{serve(){},env:{get(){return '';}}},normalizeSanctuaryCode:x=>x,sanctuaryAssetPath:()=>''});vm.runInContext(code,ctx);
 const svg=ctx.slotSvg({name:'쿠르',serverName:'지켈',className:'검성',power:123456,isMain:true,bossRoles:{boss1:'9>12',boss2:[9,12]}},0,0,new Map(),new Request('https://synthetic.invalid'));
 assert.match(svg,/쿠르\[지켈\]/);assert.match(svg,/9&gt;12/);assert.match(svg,/translate\(110 51\)/);assert.match(svg,/translate\(135 51\)/);
 assert.throws(()=>ctx.copyBossRoles({boss2:[1,1]}));assert.throws(()=>ctx.copyBossRoles({boss2:[1,2,3]}));
 console.log('PASS actual SVG names, 3 badges, clipping bounds and invalid roles');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
