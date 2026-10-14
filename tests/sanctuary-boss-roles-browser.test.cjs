const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'../.codex-test-runtime/node_modules/playwright');
const {isolatePlaywrightPage}=require('./helpers/visitor-traffic'),root=path.resolve(__dirname,'..');
(async()=>{
 const ctx=vm.createContext({URL,Request,Response,Map,console,Deno:{serve(){},env:{get(){return '';}}},normalizeSanctuaryCode:x=>x,sanctuaryAssetPath:()=>''});
 vm.runInContext(stripTypeScriptTypes(fs.readFileSync(path.join(root,'supabase/functions/sanctuary-copy-render/index.ts'),'utf8').replace(/^import .*\n/,'')),ctx);
 const server=http.createServer((req,res)=>fs.readFile(path.join(root,new URL(req.url,'http://localhost').pathname),(e,b)=>{res.writeHead(e?404:200,{'content-type':({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(req.url.split('?')[0])]||'application/octet-stream'});res.end(e?'':b);}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{for(const width of [1440,768,390,320,844,1024]){
  const page=await browser.newPage({viewport:{width,height:width===844||width===1024?480:1000}});await isolatePlaywrightPage(page);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));let copied;
  await page.route('**/functions/v1/sanctuary-copy-render',async route=>{
   copied=route.request().postDataJSON();const c=copied.managementSnapshot.forces[0].parties[0].slots[0].character;
   await route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="228" height="68">'+ctx.slotSvg(c,0,0,new Map(),new Request('https://synthetic.invalid'))+'</svg>'});
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/tests/sanctuary-management-fixed-draft-e2e.html?id=kaldrix',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
   const bridge=window.KinojoSanctuaryManagementDraftBridge,d=structuredClone(bridge.snapshot()),t=d.teams[0],f=t.forces[0];
   t.status='ACTIVE';t.sanctuaryId=3;d.selectedSanctuaryCode='kaldrix';
   const a=f.parties[0].slots[0];a.character.name='쿠르';a.bossRoles={boss1:null,boss2:[]};
   const b=f.parties[0].slots[1];b.occupied=true;b.bossRoles={boss1:'6>6',boss2:[2,3]};b.character={...a.character,name:'아주긴캐릭터이름',characterId:502,mainCharacterId:502};
   for(const team of d.teams){for(const force of team.forces){for(const p of force.parties){p.occupiedCount=p.slots.filter(s=>s.occupied).length;p.vacancyCount=5-p.occupiedCount;delete p.combatPower;}force.occupiedCount=force.parties.reduce((n,p)=>n+p.occupiedCount,0);force.vacancyCount=10-force.occupiedCount;delete force.combatPower;}team.occupiedCount=team.forces.reduce((n,f)=>n+f.occupiedCount,0);team.vacancyCount=team.forces.length*10-team.occupiedCount;}
   window.__bossData=d;window.__commands=[];window.__leases=[];
   window.KinojoSupabase.getSanctuaryManagementBootstrap=async()=>structuredClone(window.__bossData);
   window.KinojoSupabase.runSanctuaryManagementLease=async(id,action)=>{window.__leases.push(action);if(window.__locked)throw new Error('다른 이용자가 편집중입니다.');return {ok:true};};
   window.KinojoSupabase.runSanctuaryManagementCommand=async(action,payload,revision,key)=>{
    window.__commands.push({action,payload:structuredClone(payload),revision,key});
    if(action!=='SET_BOSS_ROLES')return {ok:true};
    if(t.revision!==revision)throw new Error('revision conflict');
    const s=f.parties.flatMap(p=>p.slots).find(s=>s.slotId===payload.slotId);
    if(s.character.characterId!==payload.characterId||f.forceId!==payload.forceId)throw new Error('wrong target');
    s.bossRoles=structuredClone(payload.bossRoles);t.revision++;
    return {ok:true,revision:t.revision,bossRoles:structuredClone(payload.bossRoles)};
   };
   await bridge.reload();
  });
  const card=page.locator('[data-sanctuary-boss-role="77"]').first(),dialog=page.locator('.is-boss-role');
  await card.waitFor();assert.match(await card.innerText(),/쿠르\[지켈\]/);
  await card.click();await page.waitForFunction(()=>!document.querySelector('[data-role-save]')?.disabled);
  assert.equal(await dialog.locator('[data-role-code="6>6"]').isDisabled(),true);
  await dialog.locator('[data-role-code="3>3"]').click();await dialog.locator('[data-role-tab="2"]').click();
  assert.equal(await dialog.locator('[data-role-code="2"]').isDisabled(),true);
  await dialog.locator('[data-role-code="1"]').click();await dialog.locator('[data-role-code="12"]').click();
  assert.equal(await dialog.locator('[data-role-code="4"]').isDisabled(),true);
  await dialog.locator('[data-role-code="1"]').click();await dialog.locator('[data-role-code="4"]').click();
  assert.equal(await dialog.locator('[data-role-code][aria-pressed="true"]').count(),2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'modal overflow '+width);
  if(process.env.BOSS_ROLE_SCREENSHOT&&width===390)await page.screenshot({path:process.env.BOSS_ROLE_SCREENSHOT,fullPage:true});
  await dialog.locator('[data-role-save]').click();await dialog.waitFor({state:'hidden'});
  assert.deepEqual(await card.locator('.sanctuary-boss-badge').allTextContents(),['3>3','4시','12시']);
  await page.evaluate(()=>window.KinojoSanctuaryManagementDraftBridge.reload());
  assert.deepEqual(await card.locator('.sanctuary-boss-badge').allTextContents(),['3>3','4시','12시'],'canonical reread');
  assert.equal(await card.locator('.sanctuary-management-force-slot-copy .sanctuary-boss-badge').count(),0,'badges outside text stack');
  assert.equal(await card.locator('.sanctuary-management-force-slot-roles').evaluate((n)=>{const r=n.getBoundingClientRect(),c=n.parentElement.querySelector('.sanctuary-management-force-slot-copy').getBoundingClientRect();return r.left>=c.right-1}),true,'right column');
  if(width===1024){await page.evaluate(()=>document.body.classList.add('kinojo-mobile-sanctuary-management-page'));assert.equal(await page.locator('.sanctuary-management-force-viewport').first().evaluate(n=>getComputedStyle(n).paddingLeft),'0px');}
  if(process.env.ROLE_LAYOUT_SCREENSHOT&&width===1024)await page.screenshot({path:process.env.ROLE_LAYOUT_SCREENSHOT,fullPage:true});
  assert.equal(await page.locator('.sanctuary-management-force-slot').evaluateAll(nodes=>nodes.some(n=>n.scrollWidth>n.clientWidth+1)),false,'card overflow '+width);
  const png=await page.evaluate(async()=>{const blob=await window.KinojoSanctuaryManagementCopy.renderPng(window.KinojoSanctuaryManagementDraftBridge.findTeam(77));return {type:blob.type,size:blob.size,signature:Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0,8))};});
  assert.equal(png.type,'image/png');assert.ok(png.size>100);assert.deepEqual(png.signature,[137,80,78,71,13,10,26,10]);
  assert.deepEqual(copied.managementSnapshot.forces[0].parties[0].slots[0].character.bossRoles,{boss1:'3>3',boss2:[4,12]});
  await page.locator('[data-sanctuary-force-overview="77"]').click();
  await page.locator('.sanctuary-management-force-overview-layer [data-sanctuary-boss-role="77"]').first().click();
  await dialog.waitFor();await dialog.locator('[data-operation-close]').click();await page.locator('button[data-force-overview-close]').first().click();
  await page.locator('[data-sanctuary-edit-team="77"]').first().click();
  assert.equal(await page.locator('.sanctuary-boss-role-picker,[data-boss-role]').count(),0);
  await page.locator('button[data-draft-close]').click();
  await page.evaluate(async()=>{const t=window.KinojoSanctuaryManagementDraftBridge.findTeam(77);await window.KinojoSanctuaryManagementDraftBridge.saveComposition({teamId:77,revision:t.revision,sanctuaryCode:'kaldrix',composition:t.forces.map(f=>({sourceForceId:f.forceId,slots:f.parties.flatMap(p=>p.slots.map(s=>({partyNo:p.partyNo,slotNo:s.slotNo,characterId:s.character?.characterId,bossRoles:s.bossRoles})))}))});});
  assert.deepEqual(await page.evaluate(()=>window.__commands.at(-1).payload.composition[0].slots[0].bossRoles),{boss1:'3>3',boss2:[4,12]},'common adapter preserves role payload');
  await page.evaluate(()=>window.__locked=true);await card.click();await page.waitForFunction(()=>document.querySelector('[data-role-status]').textContent.includes('편집중'));
  assert.equal(await dialog.locator('[data-role-save]').isDisabled(),true);await dialog.locator('[data-operation-close]').click();
  await page.evaluate(async()=>{window.__locked=false;window.__bossData.teams[0].capabilities.canEditRoster=false;await window.KinojoSanctuaryManagementDraftBridge.reload();});
  await card.click();await dialog.waitFor();assert.equal(await dialog.locator('[data-role-save]').isDisabled(),true);await dialog.locator('[data-operation-close]').click();
  for(const id of [1,2,4]){
   await page.evaluate(async id=>{const d=window.__bossData;d.teams[0].sanctuaryId=id;d.selectedSanctuaryCode=d.sanctuaries.find(x=>x.id===id).code;history.replaceState(null,'','?id='+d.selectedSanctuaryCode);await window.KinojoSanctuaryManagementDraftBridge.reload();},id);
   assert.equal(await page.locator('[data-sanctuary-boss-role]').count(),0,'scope '+id);assert.equal(await page.locator('.sanctuary-boss-badge').count(),0);
   assert.deepEqual(await page.evaluate(()=>window.KinojoSanctuaryManagementCopy.buildPayload(window.KinojoSanctuaryManagementDraftBridge.findTeam(77)).managementSnapshot.forces[0].parties[0].slots[0].character.bossRoles),{boss1:null,boss2:[]});
  }
  assert.deepEqual(errors,[]);console.log('PASS public card modal -> save -> reread -> PNG; editor removal, adapter, lease/rights and sanctuary3 only '+width);await page.close();
 }
 assert.throws(()=>ctx.copyBossRoles({boss2:[1,1]}));assert.throws(()=>ctx.copyBossRoles({boss2:[1,2,3]}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
