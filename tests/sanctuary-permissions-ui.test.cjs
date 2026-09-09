'use strict';
// Local rendering fixture only; no operational account, RPC or permission writes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {isolatePlaywrightPage}=require('./helpers/visitor-traffic');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const roles=['MEMBER','STAFF','MANAGER','SUB_MASTER','MASTER'];
const labels=['일정 · 담당 팀','일정 · 전체 팀','팀 정보','운영자 지정','편성 · 담당 팀','편성 · 전체 팀'];
const data={ok:true,roles,items:labels.map((label,i)=>({permissionKey:'fixture_'+i,label,description:'서버에서 제공한 설명입니다. 긴 설명도 펼쳤을 때 다른 등급의 설정과 겹치지 않습니다.',roles:{MEMBER:false,STAFF:i===0,MANAGER:true,SUB_MASTER:true,MASTER:true}}))};
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/css/admin.css"><style>body{margin:0;padding:16px;background:#f8faff;font-family:Arial,sans-serif}*{box-sizing:border-box}</style><section class="admin-card admin-role-permission-card" id="sanctuaryRolePermissionCard"><div class="admin-card-head"><div><h2>성역 등급별 권한</h2><p>등급별 기본 권한을 설정합니다.</p></div></div><div id="sanctuaryRolePermissionStatus" class="admin-statusline" role="status"></div><div id="sanctuaryRolePermissionMatrix" class="admin-role-permission-wrap"></div></section><script>
window.fixture=${JSON.stringify(data)};window.calls=[];
window.KinojoAdmin={state:{sanctuaryRolePermissions:fixture},$:s=>document.querySelector(s),isMaster:()=>true,esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),setStatus:(s,t)=>document.querySelector(s).textContent=t,action:async(name,args)=>{calls.push({name,args});return new Promise((resolve,reject)=>{window.finish=()=>{fixture.items.find(x=>x.permissionKey===args.permissionKey).roles[args.role]=args.enabled;resolve(structuredClone(fixture))};window.fail=()=>reject(new Error('저장 실패'));});}};
</script><script src="/admin/js/admin-members.js"></script><script>KinojoAdmin.renderSanctuaryRolePermissions(fixture);document.querySelector('#sanctuaryRolePermissionMatrix').addEventListener('change',e=>{if(e.target.matches('[data-sanctuary-role-permission]'))KinojoAdmin.setSanctuaryRolePermission(e.target)});</script></html>`;
const server=http.createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('content-type','text/html; charset=utf-8');return res.end(html);}
  const files={'/admin/css/admin.css':'text/css','/admin/js/admin-members.js':'text/javascript'};
  if(!files[req.url]){res.statusCode=404;return res.end();}
  res.setHeader('content-type',files[req.url]+'; charset=utf-8');res.end(fs.readFileSync(path.join(root,req.url)));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  try{
    for(const width of [1440,768,760,390,320]){
      const page=await browser.newPage({viewport:{width,height:900}});
      await isolatePlaywrightPage(page);
      await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.fallback():route.abort());
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:'+server.address().port);
      const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,card:document.querySelector('section').getBoundingClientRect().width,columns:[...document.querySelectorAll('thead th')].filter(x=>getComputedStyle(x).display!=='none').length,targets:[...document.querySelectorAll('.admin-permission-toggle')].filter(x=>x.getBoundingClientRect().width).every(x=>x.getBoundingClientRect().width>=44&&x.getBoundingClientRect().height>=44)}));
      assert.equal(metrics.overflow,false,`${width}: overflow`);assert.ok(metrics.card<=920);assert.ok(metrics.targets);assert.equal(metrics.columns,width<=760?2:6);
      const picker=page.locator('[data-permission-role-picker]');
      if(width<=760)await picker.selectOption('STAFF');
      const input=page.locator('[data-role="STAFF"][data-permission="fixture_0"]');
      await page.locator('summary').first().click();
      assert.equal(await page.locator('details[open]').count(),1);
      await input.focus();await page.keyboard.press('Space');
      assert.equal(await page.locator('[data-sanctuary-role-permission]:enabled').count(),0,'serialize writes');
      await page.evaluate(()=>KinojoAdmin.loadSanctuaryRolePermissions());
      assert.equal(await page.evaluate(()=>calls.length),1,'no stale reload during save');
      await page.evaluate(()=>finish());
      await page.waitForFunction(()=>!KinojoAdmin.state.sanctuaryPermissionSaving);
      assert.equal(await input.isChecked(),false);assert.equal(await page.locator('details[open]').count(),1);
      assert.equal(await input.evaluate(el=>el===document.activeElement),true,'keyboard focus restored');
      await input.click();await page.evaluate(()=>fail());
      await page.waitForFunction(()=>!KinojoAdmin.state.sanctuaryPermissionSaving);
      assert.equal(await input.isChecked(),false,'failed write restores last Server snapshot');
      if(width<=760){assert.equal(await picker.inputValue(),'STAFF');await picker.selectOption('MASTER');}
      assert.equal(await page.locator('[data-role="MASTER"]:not(:disabled)').count(),0);
      assert.equal(await page.evaluate(()=>calls.length),2,'grade switch never writes');
      if(process.env.SANCTUARY_EVIDENCE_DIR){fs.mkdirSync(process.env.SANCTUARY_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SANCTUARY_EVIDENCE_DIR,`permissions-${width}.png`),fullPage:true});}
      await page.evaluate(()=>{fixture.items[0].label='<img src=x onerror=alert(1)>';KinojoAdmin.renderSanctuaryRolePermissions(fixture)});
      assert.equal(await page.locator('#sanctuaryRolePermissionMatrix img').count(),0);
      assert.deepEqual(errors,[]);
      await page.close();console.log(`PASS permissions UI ${width}px`);
    }
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
