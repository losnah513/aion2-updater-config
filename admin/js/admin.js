/* KINOJO Admin Console v2026070409 */
(function(){
  'use strict';
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const state = { tab:'dashboard', requests:[], accounts:[], characters:[], logs:[] };
  const CACHE = '2026070409';
  function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
  function addLog(type,msg){
    const t = new Date(); const line = '['+String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0')+':'+String(t.getSeconds()).padStart(2,'0')+'] '+String(type||'INFO')+' · '+String(msg||'');
    state.logs.unshift(line); state.logs = state.logs.slice(0,80); renderLogs();
  }
  function setStatus(id,msg,kind){ const el=$(id); if(!el)return; el.textContent=msg||''; el.className='admin-statusline '+(kind||''); }
  function toast(msg){ if(window.KinojoToast?.show) window.KinojoToast.show(msg); else addLog('TOAST',msg); }
  function roleLabel(){ const s=window.KinojoAuth?.getSession?.()||{}; return s.roleLabel||s.role||'관리자'; }
  function roleKey(){ const s=window.KinojoAuth?.getSession?.()||{}; return String(s.role||s.roleLabel||'').toUpperCase(); }
  function isMaster(){ return roleKey()==='MASTER' || roleKey()==='LV5' || roleKey().includes('MASTER'); }
  function isAdmin(){ return !!window.KinojoAuth?.isAdmin?.(); }
  function adminAccount(cmd, extra){ return window.KinojoSupabase.adminAccount(cmd, extra||{}); }
  function adminCharacter(cmd, extra){ return window.KinojoSupabase.adminCharacter(cmd, extra||{}); }
  function adminNotice(cmd, extra){ return window.KinojoSupabase.adminNotice(cmd, extra||{}); }
  function adminEventNotice(cmd, extra){ return window.KinojoSupabase.adminEventNotice(cmd, extra||{}); }
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
    if(tab==='system'){ refreshSystemSettings(); loadEventNoticeGroups(); }
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
    const url=await getWebAppUrl();
    if(!url) throw new Error('Apps Script WebApp URL이 없습니다. MASTER 권한으로 시스템 설정 탭에서 URL을 저장하세요.');
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({action:actionName},body||{}))});
    const text=await res.text();
    if(!res.ok) throw new Error('Apps Script 호출 실패: HTTP '+res.status+' · '+text.slice(0,120));
    try{return JSON.parse(text);}catch(_e){throw new Error('Apps Script 응답을 해석하지 못했습니다. '+text.slice(0,120));}
  }
  function renderBridgeMissing(){
    return '<div class="admin-callout error"><strong>Apps Script WebApp URL이 없습니다.</strong><span>MASTER 권한으로 시스템 설정 탭에서 Apps Script WebApp URL을 저장한 뒤 다시 실행하세요.</span><button class="admin-btn primary" type="button" data-jump-system>시스템 설정으로 이동</button></div>';
  }
  function countArray(data, keys){
    for(const k of keys){ if(Array.isArray(data?.[k])) return data[k].length; }
    return 0;
  }
  function summarizeSanctuary(data){
    const info = data?.info || data?.sanctuary || data || {};
    const teams = countArray(data,['teams','teamList']);
    const forces = countArray(data,['forces','forceList']) || teams;
    const parties = countArray(data,['parties','partyList']);
    const slots = countArray(data,['slots','slotList','members','characters']);
    const updated = Number(data?.updated || data?.updatedCount || data?.synced || data?.syncedCount || 0);
    const failed = Number(data?.failed || data?.failedCount || data?.errorCount || 0);
    const title = esc(info.sanctuary_name || info.sanctuaryName || info.boss_name || info.bossName || '성역 동기화');
    return { title, teams, forces, parties, slots, updated, failed };
  }
  function renderSyncReport(data){
    const s = summarizeSanctuary(data||{});
    const ok = data?.ok !== false;
    const rows = [
      ['대상', s.title],
      ['포스', s.forces ? s.forces+'개' : '-'],
      ['파티', s.parties ? s.parties+'개' : '-'],
      ['슬롯/캐릭터', s.slots ? s.slots+'명' : '-'],
      ['반영', s.updated ? s.updated+'건' : '-'],
      ['실패', s.failed ? s.failed+'건' : '0건']
    ].map(([k,v])=>'<div class="admin-report-row"><span>'+k+'</span><strong>'+esc(v)+'</strong></div>').join('');
    return '<section class="admin-sync-report '+(ok?'ok':'error')+'"><div class="admin-report-head"><strong>'+(ok?'동기화 완료':'동기화 확인 필요')+'</strong><span>'+new Date().toLocaleString('ko-KR')+'</span></div><div class="admin-report-grid">'+rows+'</div><details class="admin-report-raw"><summary>원본 응답 보기</summary><pre>'+esc(JSON.stringify(data,null,2))+'</pre></details></section>';
  }
  async function testWebAppConnection(statusTarget){
    const statusSel = statusTarget || '#serverStatus';
    const input=$('#webAppUrlInput'); const typed=String(input?.value||'').trim();
    if(typed && /^https:\/\/script\.google\.com\/macros\/s\//.test(typed) && isMaster()) localStorage.setItem('kinojo_admin_webapp_url',typed);
    const url=await getWebAppUrl();
    if(!url){ setStatus(statusSel,'Apps Script WebApp URL을 먼저 등록하세요.','error'); return; }
    setStatus(statusSel,'Apps Script Bridge 연결 테스트 중...','');
    try{
      const res=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'ping',source:'admin_console'})});
      const text=await res.text();
      let parsed=null; try{ parsed=JSON.parse(text); }catch(_e){}
      const msg = parsed?.message || parsed?.status || (res.ok ? '응답 수신' : 'HTTP '+res.status);
      if(!res.ok) throw new Error(msg+' · '+text.slice(0,120));
      setStatus(statusSel,'Apps Script Bridge 연결 확인: '+msg,'ok');
      addLog('BRIDGE','Apps Script 연결 테스트 성공');
      refreshServerStatus();
    }catch(err){ setStatus(statusSel,'Apps Script Bridge 연결 실패: '+(err.message||err),'error'); addLog('ERROR',err.message||err); }
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
      setStatus('#sanctuarySyncStatus','성역 동기화 완료','ok'); $('#sanctuarySyncResult').innerHTML=renderSyncReport(data); addLog('SANCTUARY','성역 동기화 완료'); await refreshDashboard();
    }catch(err){
      const msg=err.message||String(err);
      setStatus('#sanctuarySyncStatus',msg,'error');
      if(msg.includes('WebApp URL')) $('#sanctuarySyncResult').innerHTML=renderBridgeMissing();
      addLog('ERROR',msg);
    }
    finally{ btn&&(btn.disabled=false); }
  }


  function eventNoticeStatusLabel(status){
    const key=String(status||'').toUpperCase();
    if(key==='DRAFT') return '작성중';
    if(key==='SCHEDULED') return '예정';
    if(key==='ACTIVE') return '진행중';
    if(key==='EXPIRED') return '종료';
    if(key==='DELETED') return '삭제됨';
    return key || '상태 없음';
  }
  function eventNoticePillClass(status){
    const key=String(status||'').toUpperCase();
    if(key==='DRAFT') return 'info';
    if(key==='SCHEDULED') return 'info';
    if(key==='ACTIVE') return 'ok';
    if(key==='EXPIRED' || key==='DELETED') return 'error';
    return 'info';
  }
  function formatEventDateTime(value){
    if(!value) return '-';
    const d=new Date(value);
    if(Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  }
  function normalizeEventNoticeGroup(g){
    return {
      id:g.id || g.groupId || g.group_id || '',
      title:g.title || g.groupTitle || '이벤트 공지',
      status:g.runtimeStatus || g.runtime_status || g.status || '',
      rawStatus:g.status || '',
      itemCount:Number(g.itemCount || g.item_count || (Array.isArray(g.items)?g.items.length:0) || 0),
      popupVersion:Number(g.popupVersion || g.popup_version || 0),
      createdAt:g.createdAt || g.created_at || '',
      updatedAt:g.updatedAt || g.updated_at || '',
      nextEventAt:g.nextEventAt || g.next_event_at || '',
      items:Array.isArray(g.items)?g.items:[]
    };
  }
  function renderEventNoticeGroups(groups){
    const root=$('#eventNoticeList'); if(!root)return;
    if(!groups.length){ root.innerHTML='<div class="admin-empty">이벤트 공지 묶음이 없습니다.</div>'; return; }
    root.innerHTML=groups.map(raw=>{
      const g=normalizeEventNoticeGroup(raw);
      const pillClass=eventNoticePillClass(g.status);
      const firstItems=(g.items||[]).slice(0,4).map(item=>esc(item.noticeTypeLabel||item.notice_type_label||item.noticeType||item.notice_type||'공지')).join(' · ');
      return '<article class="admin-row admin-event-notice-row" data-event-notice-id="'+esc(g.id)+'"><div class="admin-row-main"><strong>'+esc(g.title)+'</strong><span>카드 '+g.itemCount+'개 · 다음 일정 '+esc(formatEventDateTime(g.nextEventAt))+' · v'+g.popupVersion+'</span>'+(firstItems?'<span class="admin-event-notice-types">'+firstItems+'</span>':'')+'</div><div class="admin-row-actions"><span class="admin-pill '+pillClass+'">'+esc(eventNoticeStatusLabel(g.status))+'</span><button class="admin-btn" type="button" data-event-notice-edit>수정</button><button class="admin-btn danger" type="button" data-event-notice-delete>삭제</button></div></article>';
    }).join('');
  }
  async function loadEventNoticeGroups(){
    if(!$('#eventNoticeList')) return;
    const status=$('#eventNoticeStatusFilter')?.value || 'ALL';
    setStatus('#eventNoticeStatus','이벤트 공지 목록을 불러오는 중...','');
    try{
      const data=await adminEventNotice('listGroups',{status,limit:30});
      const groups=data.groups || data.items || data.eventNotices || [];
      renderEventNoticeGroups(Array.isArray(groups)?groups:[]);
      setStatus('#eventNoticeStatus','이벤트 공지 묶음 '+(Array.isArray(groups)?groups.length:0)+'건','ok');
    }catch(err){
      setStatus('#eventNoticeStatus',err.message||String(err),'error');
      $('#eventNoticeList') && ($('#eventNoticeList').innerHTML='<div class="admin-empty">이벤트 공지 목록을 불러오지 못했습니다.</div>');
    }
  }
  function startEventNoticeCreate(){
    setStatus('#eventNoticeStatus','STEP 2-2에서 공지 묶음 등록 폼을 연결합니다. 현재 단계는 목록 조회 뼈대입니다.','');
    toast('이벤트 공지 등록 폼은 STEP 2-2에서 연결됩니다.');
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
    
  }
  function renderServerBox(data){
    const root=$('#serverStatusBox'); if(!root)return;
    const localUrl = localStorage.getItem('kinojo_admin_webapp_url') || '';
    const bridgeLabel = localUrl ? 'URL 저장됨' : 'config.json 또는 시스템 설정 확인';
    root.innerHTML='<div class="admin-system-list"><div class="admin-system-item"><span><i class="admin-dot"></i>Supabase DB</span><strong>정상</strong></div><div class="admin-system-item"><span><i class="admin-dot"></i>RPC / Functions</span><strong>'+(data?.ok===false?'확인 필요':'정상')+'</strong></div><div class="admin-system-item"><span><i class="admin-dot"></i>Updater Runtime</span><strong>'+esc(data?.message||'정상')+'</strong></div><div class="admin-system-item"><span><i class="admin-dot"></i>Apps Script Bridge</span><strong>'+esc(bridgeLabel)+'</strong></div><div class="admin-system-item"><span><i class="admin-dot"></i>최근 성역 동기화</span><strong>'+esc(localStorage.getItem('kinojo_admin_last_sanctuary_sync')||'기록 없음')+'</strong></div></div>';
  }
  function saveWebAppUrl(){
    if(!isMaster()){ setStatus('#systemStatus','MASTER 권한만 시스템 URL을 변경할 수 있습니다.','error'); return; }
    const v=$('#webAppUrlInput')?.value.trim()||'';
    if(!v){ setStatus('#systemStatus','저장할 Apps Script WebApp URL을 입력하세요.','error'); return; }
    if(!/^https:\/\/script\.google\.com\/macros\/s\//.test(v)){setStatus('#systemStatus','Apps Script WebApp URL 형식을 확인하세요.','error');return;}
    localStorage.setItem('kinojo_admin_webapp_url',v);
    setStatus('#systemStatus','Apps Script WebApp URL 저장 완료','ok');
    addLog('SYSTEM','Apps Script WebApp URL 저장');
    refreshServerStatus();
  }
  function clearWebAppUrl(){
    if(!isMaster()){ setStatus('#systemStatus','MASTER 권한만 시스템 URL을 삭제할 수 있습니다.','error'); return; }
    localStorage.removeItem('kinojo_admin_webapp_url');
    const input=$('#webAppUrlInput'); if(input) input.value='';
    setStatus('#systemStatus','Apps Script WebApp URL 저장값을 삭제했습니다. config.json 값이 있으면 자동 fallback 됩니다.','ok');
    refreshServerStatus();
  }
  async function refreshSystemSettings(){
    const input=$('#webAppUrlInput');
    const saved=localStorage.getItem('kinojo_admin_webapp_url')||'';
    if(input) input.value=saved;
    if(!isMaster()){
      if(input) input.disabled=true;
      $('#webAppSaveBtn') && ($('#webAppSaveBtn').disabled=true);
      $('#webAppClearBtn') && ($('#webAppClearBtn').disabled=true);
      setStatus('#systemStatus','현재 계정은 MASTER가 아니므로 시스템 설정을 수정할 수 없습니다.','error');
    }else{
      if(input) input.disabled=false;
      $('#webAppSaveBtn') && ($('#webAppSaveBtn').disabled=false);
      $('#webAppClearBtn') && ($('#webAppClearBtn').disabled=false);
      setStatus('#systemStatus', saved ? '저장된 Apps Script WebApp URL이 있습니다.' : '저장된 URL이 없습니다. config.json fallback을 사용하거나 URL을 저장하세요.','');
    }
  }
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
    $('#sanctuaryPreviewBtn')?.addEventListener('click',async()=>{ setStatus('#sanctuarySyncStatus','서버 성역 데이터를 불러오는 중...',''); try{ const id=$('#sanctuarySyncId')?.value||'rudra'; const data=await action('sanctuary',{id:id==='all'?'rudra':id}); $('#sanctuarySyncResult').innerHTML=renderSyncReport(Object.assign({ok:true},data)); setSyncStep(2); setStatus('#sanctuarySyncStatus','서버 미리보기 완료','ok'); }catch(err){setStatus('#sanctuarySyncStatus',err.message||String(err),'error');} });
    $('#sanctuarySyncBtn')?.addEventListener('click',runSanctuarySync);
    $('#noticeReloadBtn')?.addEventListener('click',loadNotices); $('#noticeSaveBtn')?.addEventListener('click',saveNotice);
    $('#eventNoticeReloadBtn')?.addEventListener('click',loadEventNoticeGroups); $('#eventNoticeCreateBtn')?.addEventListener('click',startEventNoticeCreate); $('#eventNoticeStatusFilter')?.addEventListener('change',loadEventNoticeGroups);
    $('#eventNoticeList')?.addEventListener('click',e=>{ if(e.target.matches('[data-event-notice-edit]')) startEventNoticeCreate(); if(e.target.matches('[data-event-notice-delete]')) setStatus('#eventNoticeStatus','삭제 기능은 STEP 2-3에서 연결합니다.',''); });
    $('#webAppSaveBtn')?.addEventListener('click',saveWebAppUrl); $('#webAppClearBtn')?.addEventListener('click',clearWebAppUrl); $('#webAppTestBtn')?.addEventListener('click',()=>testWebAppConnection('#serverStatus')); $('#webAppTestBtnSystem')?.addEventListener('click',()=>testWebAppConnection('#systemStatus')); $('#serverRefreshBtn')?.addEventListener('click',refreshServerStatus); $('#goSystemSettingsBtn')?.addEventListener('click',()=>switchTab('system'));
    document.addEventListener('click',e=>{ if(e.target.matches('[data-jump-server]')) switchTab('server'); if(e.target.matches('[data-jump-system]')) switchTab('system'); });
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
