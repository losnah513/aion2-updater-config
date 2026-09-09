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
const data={ok:true,revision:'fixture-revision',roles,items:labels.map((label,i)=>({permissionKey:'fixture_'+i,label,description:'서버에서 제공한 설명입니다. 긴 설명도 펼쳤을 때 다른 등급의 설정과 겹치지 않습니다.',roles:{MEMBER:false,STAFF:i===0,MANAGER:true,SUB_MASTER:true,MASTER:true}}))};
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
      assert.equal(await page.evaluate(()=>calls[0].args.expectedRevision),'fixture-revision','server revision forwarded');
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
      await page.evaluate(async()=>{
        window.operatorCalls=[];
        KinojoAdmin.action=async(name,args)=>{
          if(name==='sanctuaryRolePermissions')return structuredClone(fixture);
          operatorCalls.push({name,args});
          if(name==='sanctuaryOperatorSet')return new Promise((resolve,reject)=>{
            window.operatorFinish=()=>resolve({ok:true,teamId:100,assigned:[{memberId:2,name:'담당자',role:'STAFF',revision:1}],candidates:[]});
            window.operatorFail=()=>reject(new Error('다른 관리자가 운영자를 변경했습니다. 다시 불러와 주세요.'));
          });
          if(!args.teamId)return {ok:true,teams:[{teamId:100,title:'팀 <검수>'},{teamId:200,title:'팀 <검수>'}]};
          return {ok:true,teamId:Number(args.teamId),assigned:[],candidates:args.query?[{memberId:2,name:'담당자 <안전>',role:'STAFF',revision:0}]:[]};
        };
        await KinojoAdmin.loadSanctuaryRolePermissions();
      });
      const panel=page.locator('[data-sanctuary-operators]');
      await panel.locator('summary').click();
      await page.waitForFunction(()=>document.querySelector('[data-operator-team]').options.length===3);
      await panel.locator('[data-operator-team]').selectOption('100');
      await page.waitForFunction(()=>document.querySelector('[data-sanctuary-operators]').getAttribute('aria-busy')==='false');
      await panel.locator('[data-operator-query]').fill('담당자');await panel.locator('button[type="submit"]').click();
      await panel.locator('[data-operator-member]').waitFor();
      await panel.locator('[data-operator-member]').click();
      assert.equal(await panel.locator('button:enabled,input:enabled,select:enabled').count(),0,'serialize operator writes');
      assert.deepEqual(await page.evaluate(()=>operatorCalls.at(-1).args),{teamId:100,memberId:2,active:true,expectedRevision:0});
      await page.evaluate(()=>operatorFinish());
      await panel.getByRole('button',{name:'해제',exact:true}).waitFor();
      await panel.getByRole('button',{name:'해제',exact:true}).click();await page.evaluate(()=>operatorFail());
      await page.waitForFunction(()=>document.querySelector('[data-sanctuary-operators]').getAttribute('aria-busy')==='false');
      assert.equal(await panel.getByRole('button',{name:'해제',exact:true}).count(),1,'failed revoke preserves server assignment');
      assert.equal(await panel.locator('[data-operator-status]').textContent(),'다른 관리자가 운영자를 변경했습니다. 다시 불러와 주세요.');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'operator panel does not overflow');
      assert.equal(await panel.locator('img').count(),0);
      assert.deepEqual(errors,[]);
      await page.close();console.log(`PASS permissions UI ${width}px`);
    }
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
