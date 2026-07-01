/* KINOJO Admin Console v2026070108 */
(function(){
  'use strict';
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const state = { tab:'dashboard', requests:[], accounts:[], characters:[], logs:[] };
  const CACHE = '2026070108';
  function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
  function addLog(type,msg){
    const t = new Date(); const line = '['+String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0')+':'+String(t.getSeconds()).padStart(2,'0')+'] '+String(type||'INFO')+' · '+String(msg||'');
    state.logs.unshift(line); state.logs = state.logs.slice(0,80); renderLogs();
  }
  function setStatus(id,msg,kind){ const el=$(id); if(!el)return; el.textContent=msg||''; el.className='admin-statusline '+(kind||''); }
  function toast(msg){ if(window.KinojoToast?.show) window.KinojoToast.show(msg); else addLog('TOAST',msg); }
  function roleLabel(){ const s=window.KinojoAuth?.getSession?.()||{}; return s.roleLabel||s.role||'관리자'; }
  function isAdmin(){ return !!window.KinojoAuth?.isAdmin?.(); }
  function adminAccount(cmd, extra){ return window.KinojoSupabase.adminAccount(cmd, extra||{}); }
  function adminCharacter(cmd, extra){ return window.KinojoSupabase.adminCharacter(cmd, extra||{}); }
  function adminNotice(cmd, extra){ return window.KinojoSupabase.adminNotice(cmd, extra||{}); }
  async function action(name, params){ return window.KinojoApi ? window.KinojoApi.getAction(name, params||{}) : window.KinojoSupabase.webAction(name, params||{}); }

  function switchTab(tab){
    state.tab = tab;
    $$('.admin-nav button').forEach(b=>b.classList.toggle('active', b.dataset.adminTab===tab));
    $$('.admin-bottom-actions button').forEach(b=>b.classList.toggle('active', b.dataset.adminTab===tab));
    $$('.admin-pane').forEach(p=>p.classList.toggle('active', p.dataset.adminPane===tab));
    const sel=$('#adminMobileSelect'); if(sel) sel.value=tab;
    if(tab==='dashboard') refreshDashboard();
    if(tab==='requests') loadCodeRequests();
    if(tab==='members') loadAccounts();
    if(tab==='notices') loadNotices();
    if(tab==='server') refreshServerStatus();
  }

  function renderAccessBlocked(){
    document.body.innerHTML = '<main class="admin-access-block"><h1>관리자 권한이 필요합니다</h1><p>로그인 후 MASTER / SUB MASTER / MANAGER 권한으로 접근할 수 있습니다.</p><button class="admin-btn primary" id="adminLoginGo" type="button">로그인</button></main>';
    $('#adminLoginGo')?.addEventListener('click',()=>window.KinojoAuth?.openLoginModal?.());
  }

  async function refreshDashboard(){
    try{
      const [visit, req, runtime] = await Promise.allSettled([
        action('hallVisit',{ mode:'stats', pageKey:'admin' }),
        adminAccount('listCodeRequests',{ status:'PENDING', limit:20 }),
        action('runtimeStatus',{})
      ]);
      const stats = visit.status==='fulfilled' ? (visit.value.stats || visit.value || {}) : {};
      const requests = req.status==='fulfilled' ? (req.value.requests || []) : [];
      const runtimeData = runtime.status==='fulfilled' ? runtime.value : {};
      $('#statVisitors').textContent = Number(stats.today || stats.daily || 0).toLocaleString('ko-KR');
      $('#statVisitorsSub').textContent = '누적 '+Number(stats.total || 0).toLocaleString('ko-KR');
      $('#statRequests').textContent = String(requests.length||0);
      $('#statRequestsSub').textContent = requests.length ? '대기 중' : '처리할 요청 없음';
      $('#statSanctuary').textContent = '대기';
      $('#statSanctuarySub').textContent = localStorage.getItem('kinojo_admin_last_sanctuary_sync') || '최근 동기화 기록 없음';
      $('#statServer').textContent = runtimeData.ok === false ? '점검' : '정상';
      $('#statServerSub').textContent = runtimeData.message || '모든 시스템 확인';
      state.requests=requests;
      renderRequestPreview(requests.slice(0,3));
      renderServerBox(runtimeData);
      $('#adminPendingBadge').textContent=String(requests.length||0);
      addLog('INFO','대시보드 새로고침 완료');
    }catch(err){ addLog('ERROR',err.message||err); }
  }

  function renderRequestPreview(list){
    const root=$('#recentRequests'); if(!root)return;
    root.innerHTML = list.length ? list.map(r=>requestRowHtml(r,true)).join('') : '<div class="admin-empty">대기 중인 코드 요청이 없습니다.</div>';
  }
  function requestRowHtml(r,compact){
    const id=esc(r.requestId||r.request_id||''); const name=esc(r.characterName||r.character_name||'-'); const code=esc(r.requestedCode||r.requested_code||'-');
    const time=esc(r.time||r.requestedAt||r.created_at||'');
    return '<article class="admin-row" data-request-id="'+id+'"><div class="admin-row-main"><strong>'+name+'</strong><span>요청 코드 '+code+' · '+time+'</span></div><div class="admin-row-actions"><span class="admin-pill pending">대기</span>'+(compact?'':'<button class="admin-btn primary" data-approve-request>승인</button><button class="admin-btn danger" data-reject-request>거절</button>')+'</div></article>';
  }
  async function loadCodeRequests(){
    setStatus('#requestStatus','코드 요청 목록을 불러오는 중...','');
    try{ const data=await adminAccount('listCodeRequests',{status:'PENDING',limit:100}); state.requests=data.requests||[]; $('#requestList').innerHTML=state.requests.length?state.requests.map(r=>requestRowHtml(r,false)).join(''):'<div class="admin-empty">대기 중인 코드 요청이 없습니다.</div>'; $('#adminPendingBadge').textContent=String(state.requests.length); setStatus('#requestStatus','요청 '+state.requests.length+'건','ok'); }
    catch(err){ setStatus('#requestStatus',err.message||String(err),'error'); }
  }
  async function processRequest(btn,cmd){
    const row=btn.closest('[data-request-id]'); const requestId=row?.dataset.requestId; if(!requestId)return;
    btn.disabled=true;
    try{ const res=await adminAccount(cmd,{requestId}); if(res.ok===false) throw new Error(res.message||'처리 실패'); toast(cmd==='approveCodeRequest'?'승인 완료':'거절 완료'); addLog('CODE',requestId+' '+cmd); await loadCodeRequests(); await refreshDashboard(); }
    catch(err){ toast(err.message||String(err)); btn.disabled=false; }
  }

  async function loadAccounts(){
    setStatus('#memberStatus','회원 목록을 불러오는 중...','');
    try{ const data=await adminAccount('listCodes',{}); state.accounts=data.accounts||[]; applyMemberFilters(); }
    catch(err){ setStatus('#memberStatus',err.message||String(err),'error'); }
  }
  function getAccountCode(a){ return a.code || a.passCode || a.pass_code || ''; }
  function getAccountName(a){ return a.mainCharacter || a.main_character_name || a.mainCharacterName || '-'; }
  function getAccountRole(a){ return a.role || a.roleLabel || 'MEMBER'; }
  function applyMemberFilters(){
    const q = String($('#memberSearch')?.value || '').trim().toLowerCase();
    const role = String($('#memberRoleFilter')?.value || '').trim();
    const filtered = (state.accounts || []).filter(a=>{
      const hay = [getAccountName(a), getAccountCode(a), getAccountRole(a)].join(' ').toLowerCase();
      if(q && !hay.includes(q)) return false;
      if(role && String(getAccountRole(a)).toUpperCase() !== role) return false;
      return true;
    });
    renderAccounts(filtered);
    setStatus('#memberStatus','회원 '+filtered.length+'건 표시 / 전체 '+(state.accounts||[]).length+'건','ok');
  }
  function renderAccounts(list){
    const root=$('#memberList'); if(!root)return;
    root.innerHTML=list.length?list.map(a=>{
      const code=esc(getAccountCode(a)); const name=esc(getAccountName(a)); const role=esc(String(getAccountRole(a)).toUpperCase());
      const active=a.isActive!==false;
      const isMaster=role==='MASTER';
      return '<article class="admin-row admin-member-row" data-member-code="'+code+'"><div class="admin-row-main"><strong>'+name+'</strong><span>코드 '+code+' · '+role+'</span></div><div class="admin-row-actions"><span class="admin-pill '+(active?'ok':'error')+'">'+(active?'활성':'비활성')+'</span><select class="admin-select compact" data-member-role '+(isMaster?'disabled':'')+'><option value="MEMBER" '+(role==='MEMBER'?'selected':'')+'>Member</option><option value="STAFF" '+(role==='STAFF'?'selected':'')+'>Staff</option><option value="MANAGER" '+(role==='MANAGER'?'selected':'')+'>Manager</option><option value="SUB_MASTER" '+(role==='SUB_MASTER'?'selected':'')+'>Sub Master</option></select><button class="admin-btn danger" data-member-disable '+(isMaster?'disabled':'')+'>비활성</button><button class="admin-btn" data-member-delete '+(isMaster?'disabled':'')+'>삭제</button></div></article>';
    }).join(''):'<div class="admin-empty">회원 코드가 없습니다.</div>';
  }
  async function handleMemberAction(target){
    const row=target.closest('[data-member-code]'); const code=row?.dataset.memberCode; if(!code)return;
    target.disabled=true;
    try{
      let res;
      if(target.matches('[data-member-role]')) res=await adminAccount('updateRole',{code,role:target.value});
      else if(target.matches('[data-member-disable]')) res=await adminAccount('disableCode',{code});
      else if(target.matches('[data-member-delete]')){ if(!confirm('회원 코드를 삭제할까요?')){target.disabled=false;return;} res=await adminAccount('deleteCode',{code}); }
      if(res && res.ok===false) throw new Error(res.message||'회원 처리 실패');
      toast(res?.message||'회원 정보 처리 완료'); addLog('MEMBER',(res?.message||'회원 처리')+' · '+code); await loadAccounts();
    }catch(err){ setStatus('#memberStatus',err.message||String(err),'error'); target.disabled=false; }
  }

  async function searchCharacters(){
    const search=$('#characterSearch')?.value||''; const include=$('#characterIncludeInactive')?.checked!==false;
    setStatus('#characterStatus','캐릭터 검색 중...','');
    try{ const data=await adminCharacter('search',{search,includeInactive:include,limit:50}); state.characters=data.characters||[]; renderCharacters(state.characters); setStatus('#characterStatus','검색 결과 '+state.characters.length+'건','ok'); }
    catch(err){ setStatus('#characterStatus',err.message||String(err),'error'); }
  }
  function renderCharacters(list){
    const root=$('#characterList'); if(!root)return;
    root.innerHTML=list.length?list.map(c=>{
      const name=esc(c.characterName); const server=esc(c.serverName||c.serverId||''); const cls=esc(c.className||''); const active=c.isActive!==false;
      return '<article class="admin-row" data-character="'+name+'" data-server-id="'+esc(c.serverId||'')+'"><div class="admin-row-main"><strong>'+name+'</strong><span>'+server+' · '+cls+' · PVE '+Number(c.pvePower||0).toLocaleString('ko-KR')+'</span></div><div class="admin-row-actions"><span class="admin-pill '+(active?'ok':'error')+'">'+(active?'활성':'비활성')+'</span><button class="admin-btn danger" data-char-deactivate>탈퇴 처리</button><button class="admin-btn" data-char-restore>복구</button><button class="admin-btn" data-char-rename>이름변경</button></div></article>';
    }).join(''):'<div class="admin-empty">검색 결과가 없습니다.</div>';
  }
  async function handleCharacterAction(btn,cmd){
    const row=btn.closest('[data-character]'); const characterName=row?.dataset.character; const serverId=row?.dataset.serverId;
    const memo=$('#characterMemo')?.value||''; const reason=$('#characterReason')?.value||'탈퇴'; const newName=$('#characterNewName')?.value||'';
    if(cmd==='markRenamed'&&!newName.trim()){setStatus('#characterStatus','이름변경 시 새 캐릭터명을 입력하세요.','error');return;}
    btn.disabled=true;
    try{ const payload=cmd==='markRenamed'?{characterName,previousName:characterName,newName,serverId,memo}:{characterName,serverId,reason,memo}; const res=await adminCharacter(cmd,payload); if(res.ok===false)throw new Error(res.message||'처리 실패'); toast(res.message||'처리 완료'); await searchCharacters(); }
    catch(err){ setStatus('#characterStatus',err.message||String(err),'error'); btn.disabled=false; }
  }

  async function getWebAppUrl(){
    const saved=localStorage.getItem('kinojo_admin_webapp_url')||''; if(saved) return saved;
    const configUrl = location.pathname.includes('/m/') ? '../../config.json' : '../config.json';
    try{ const cfg=await fetch(configUrl,{cache:'no-store'}).then(r=>r.json()); return String(cfg.webAppUrl||cfg.appsScriptUrl||''); }catch(_e){return '';}
  }
  async function callAppsScript(actionName,body){
    const url=await getWebAppUrl(); if(!url) throw new Error('Apps Script WebApp URL이 없습니다. 서버/동기화 탭에서 URL을 저장하세요.');
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({action:actionName},body||{}))});
    const text=await res.text(); try{return JSON.parse(text);}catch(_e){throw new Error('Apps Script 응답을 해석하지 못했습니다. '+text.slice(0,120));}
  }
  function setSyncStep(n){ $$('.admin-sync-step').forEach((el,i)=>{ el.classList.toggle('done',i<n-1); el.classList.toggle('active',i===n-1); }); }
  async function runSanctuarySync(){
    const id=$('#sanctuarySyncId')?.value||'all'; const btn=$('#sanctuarySyncBtn'); btn&&(btn.disabled=true); setSyncStep(1); setStatus('#sanctuarySyncStatus','성역 시트를 읽는 중...','');
    try{
      await new Promise(r=>setTimeout(r,350)); setSyncStep(2); setStatus('#sanctuarySyncStatus','변경사항 미리보기 준비 중...','');
      await new Promise(r=>setTimeout(r,350)); setSyncStep(3); setStatus('#sanctuarySyncStatus','서버 반영 중...','');
      const data=await callAppsScript('sanctuaryImportToServer',{id,actor:'admin_console'});
      if(data.ok===false) throw new Error(data.message||'성역 동기화 실패');
      setSyncStep(4); localStorage.setItem('kinojo_admin_last_sanctuary_sync',new Date().toLocaleString('ko-KR'));
      setStatus('#sanctuarySyncStatus','성역 동기화 완료','ok'); $('#sanctuarySyncResult').innerHTML='<pre>'+esc(JSON.stringify(data,null,2))+'</pre>'; addLog('SANCTUARY','성역 동기화 완료'); await refreshDashboard();
    }catch(err){ setStatus('#sanctuarySyncStatus',err.message||String(err),'error'); addLog('ERROR',err.message||err); }
    finally{ btn&&(btn.disabled=false); }
  }

  async function loadNotices(){
    setStatus('#noticeStatus','공지 목록을 불러오는 중...','');
    try{ const list=await adminNotice('listNotices',{limit:20}); const notices=list.notices||[]; $('#noticeList').innerHTML=notices.length?notices.map(n=>'<article class="admin-row"><div class="admin-row-main"><strong>'+esc(n.noticeType||n.notice||'공지')+'</strong><span>'+esc(n.content||'')+'</span></div><div class="admin-row-actions"><span class="admin-pill info">'+esc(n.author||'관리자')+'</span></div></article>').join(''):'<div class="admin-empty">등록된 공지가 없습니다.</div>'; setStatus('#noticeStatus','공지 '+notices.length+'건','ok'); }
    catch(err){ setStatus('#noticeStatus',err.message||String(err),'error'); }
  }
  async function saveNotice(){
    const content=$('#noticeContent')?.value||''; const noticeType=$('#noticeType')?.value||'공지'; if(!content.trim()){setStatus('#noticeStatus','공지 내용을 입력하세요.','error');return;}
    try{ const res=await adminNotice('createNotice',{content,noticeType}); if(res.ok===false)throw new Error(res.message||'공지 저장 실패'); $('#noticeContent').value=''; toast('공지 저장 완료'); await loadNotices(); }
    catch(err){ setStatus('#noticeStatus',err.message||String(err),'error'); }
  }
  async function refreshServerStatus(){
    try{ const data=await action('runtimeStatus',{}); renderServerBox(data); addLog('SERVER','서버 상태 새로고침'); }catch(err){ addLog('ERROR',err.message||err); }
    const saved=localStorage.getItem('kinojo_admin_webapp_url')||''; const input=$('#webAppUrlInput'); if(input&&!input.value) input.value=saved;
  }
  function renderServerBox(data){
    const root=$('#serverStatusBox'); if(!root)return;
    root.innerHTML='<div class="admin-system-list"><div class="admin-system-item"><span><i class="admin-dot"></i>Supabase DB</span><strong>정상</strong></div><div class="admin-system-item"><span><i class="admin-dot"></i>RPC / Functions</span><strong>'+(data?.ok===false?'확인 필요':'정상')+'</strong></div><div class="admin-system-item"><span><i class="admin-dot"></i>Updater Runtime</span><strong>'+esc(data?.message||'정상')+'</strong></div><div class="admin-system-item"><span><i class="admin-dot"></i>Apps Script Bridge</span><strong>'+(localStorage.getItem('kinojo_admin_webapp_url')?'URL 저장됨':'URL 확인 필요')+'</strong></div></div>';
  }
  function saveWebAppUrl(){ const v=$('#webAppUrlInput')?.value.trim()||''; if(!v){localStorage.removeItem('kinojo_admin_webapp_url');setStatus('#serverStatus','WebApp URL 저장값을 삭제했습니다.','ok');return;} if(!/^https:\/\/script\.google\.com\/macros\/s\//.test(v)){setStatus('#serverStatus','Apps Script WebApp URL 형식을 확인하세요.','error');return;} localStorage.setItem('kinojo_admin_webapp_url',v); setStatus('#serverStatus','WebApp URL 저장 완료','ok'); refreshServerStatus(); }
  function renderLogs(){ const root=$('#adminLogBox'); if(root) root.textContent=state.logs.length?state.logs.join('\n'):'아직 로그가 없습니다.'; }

  function bind(){
    $$('.admin-nav button,.admin-bottom-actions button').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.adminTab)));
    $('#adminMobileSelect')?.addEventListener('change',e=>switchTab(e.target.value));
    $('#adminRefreshBtn')?.addEventListener('click',()=>switchTab(state.tab));
    $('#adminLogoutBtn')?.addEventListener('click',()=>{window.KinojoAuth?.clearSession?.(); location.href='../';});
    $('#requestReloadBtn')?.addEventListener('click',loadCodeRequests);
    $('#requestList')?.addEventListener('click',e=>{ if(e.target.matches('[data-approve-request]')) processRequest(e.target,'approveCodeRequest'); if(e.target.matches('[data-reject-request]')) processRequest(e.target,'rejectCodeRequest'); });
    $('#memberReloadBtn')?.addEventListener('click',loadAccounts); $('#memberSearch')?.addEventListener('input',applyMemberFilters); $('#memberRoleFilter')?.addEventListener('change',applyMemberFilters); $('#memberList')?.addEventListener('click',e=>{ if(e.target.matches('[data-member-disable],[data-member-delete]')) handleMemberAction(e.target); }); $('#memberList')?.addEventListener('change',e=>{ if(e.target.matches('[data-member-role]')) handleMemberAction(e.target); });
    $('#characterSearchBtn')?.addEventListener('click',searchCharacters);
    $('#characterSearch')?.addEventListener('keydown',e=>{ if(e.key==='Enter') searchCharacters(); });
    $('#characterList')?.addEventListener('click',e=>{ if(e.target.matches('[data-char-deactivate]')) handleCharacterAction(e.target,'deactivate'); if(e.target.matches('[data-char-restore]')) handleCharacterAction(e.target,'restore'); if(e.target.matches('[data-char-rename]')) handleCharacterAction(e.target,'markRenamed'); });
    $('#sanctuaryPreviewBtn')?.addEventListener('click',async()=>{ setStatus('#sanctuarySyncStatus','서버 성역 데이터를 불러오는 중...',''); try{ const id=$('#sanctuarySyncId')?.value||'rudra'; const data=await action('sanctuary',{id:id==='all'?'rudra':id}); $('#sanctuarySyncResult').innerHTML='<pre>'+esc(JSON.stringify(data,null,2).slice(0,5000))+'</pre>'; setSyncStep(2); setStatus('#sanctuarySyncStatus','미리보기 완료','ok'); }catch(err){setStatus('#sanctuarySyncStatus',err.message||String(err),'error');} });
    $('#sanctuarySyncBtn')?.addEventListener('click',runSanctuarySync);
    $('#noticeReloadBtn')?.addEventListener('click',loadNotices); $('#noticeSaveBtn')?.addEventListener('click',saveNotice);
    $('#webAppSaveBtn')?.addEventListener('click',saveWebAppUrl); $('#serverRefreshBtn')?.addEventListener('click',refreshServerStatus);
    $('#quickCodeBtn')?.addEventListener('click',()=>switchTab('requests')); $('#quickSanctuaryBtn')?.addEventListener('click',()=>switchTab('sanctuary')); $('#quickMemberBtn')?.addEventListener('click',()=>switchTab('members')); $('#quickNoticeBtn')?.addEventListener('click',()=>switchTab('notices'));
  }
  async function init(){
    let tries=0; while(tries<30 && !window.KinojoAuth){ await new Promise(r=>setTimeout(r,100)); tries++; }
    if(!isAdmin()){ renderAccessBlocked(); return; }
    $('#adminRoleLabel') && ($('#adminRoleLabel').textContent=roleLabel());
    bind(); renderLogs(); switchTab('dashboard');
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
