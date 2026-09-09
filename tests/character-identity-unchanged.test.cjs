const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const calls=[],messages=[],errors=[];let confirmations=0,probe;
 const A={state:{},$:()=>null,$$:()=>[],esc:s=>s,toast:s=>messages.push(s),setStatus:(...s)=>errors.push(s),
  adminCharacter:async action=>{calls.push(action);if(action!=='identityProbe')throw Error('unexpected write');return probe;}};
 const context=vm.createContext({window:{KinojoAdmin:A},document:{addEventListener(){}},Date,
  confirm:()=>{confirmations++;return false},setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync('admin/js/admin-characters.js','utf8'),context);
 const current={serverId:2002,serverName:'지켈',characterName:'same'};
 const btn={closest:()=>({dataset:{characterId:'1'}})};
 probe={ok:true,found:true,current,candidate:{...current,keyMatched:true}};
 await A.probeCharacterIdentity(btn);
 assert.equal(confirmations,0);assert.match(messages[0],/변경 없음/);
 assert.deepEqual(calls,['identityProbe']);assert.equal(btn.disabled,false);assert.equal(btn.textContent,'변경 탐색');
 for(const changes of [{characterName:'renamed'},{serverId:2008,serverName:'브리트라'},{characterName:'SAME'}]){
  probe={ok:true,found:true,current,candidate:{...current,keyMatched:true,...changes}};
  await A.probeCharacterIdentity(btn);
 }
 assert.equal(confirmations,3);
 probe={ok:true,found:true,current,candidate:{...current,keyMatched:false}};
 await A.probeCharacterIdentity(btn);
 assert.equal(confirmations,3);assert.match(errors.at(-1)[1],/고유키 일치/);
 assert.equal(calls.filter(x=>x==='identityApply').length,0);
 for(const file of ['admin/index.html','m/admin/index.html','admin/js/admin.js'])
  assert.match(fs.readFileSync(file,'utf8'),/family=2026090901/);
 console.log('PASS: verified unchanged identity no confirm/apply/list, changed name/server retains review, unverified key rejected, desktop/mobile cache');
})().catch(e=>{console.error(e);process.exitCode=1});
