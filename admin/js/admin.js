/* KINOJO Admin Console v2026070409 */
(function(){
  'use strict';
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const state = { tab:'dashboard', requests:[], accounts:[], characters:[], logs:[], eventNoticeGroups:[], eventNoticeEditingId:null };
  const CACHE = '2026070418';
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
  const EVENT_NOTICE_TYPES = [
    { value:'abyss_low', label:'어비스 하층', icon:'◆', tone:'gold', title:'어비스 하층 일정 안내', body:'하층 전장 이동과 파티 준비를 확인하세요.' },
    { value:'abyss_middle', label:'어비스 중층', icon:'◆', tone:'gold', title:'어비스 중층 일정 안내', body:'중층 전장 이동과 파티 준비를 확인하세요.' },
    { value:'rift', label:'시공', icon:'◎', tone:'gold', title:'시공 일정 안내', body:'시공 입장 시간과 이동 동선을 확인하세요.' },
    { value:'abyss_boss', label:'어비스 보스', icon:'♛', tone:'gold', title:'어비스 보스 일정 안내', body:'보스 등장 전 파티와 위치를 확인하세요.' },
    { value:'event', label:'이벤트', icon:'◆', tone:'gold', title:'이벤트 공지', body:'이벤트 내용을 확인하세요.' },
    { value:'custom', label:'자유공지', icon:'◆', tone:'gold', title:'공지', body:'공지 내용을 확인하세요.' }
  ];
  function eventNoticeTypeLabel(value){
    const hit = EVENT_NOTICE_TYPES.find(t=>t.value===String(value||''));
    return hit ? hit.label : String(value||'공지');
  }
  function todayDateInputValue(){
    const d=new Date();
    d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
    return d.toISOString().slice(0,10);
  }
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
    const saved=localStorage.getItem('kinojo_admin_webapp_url')||localStorage.getItem('AION2_OFFICIAL_WEBAPP')||''; if(saved) return saved;
    const configUrl = location.pathname.includes('/m/') ? '../../config.json' : '../config.json';
    try{ const cfg=await fetch(configUrl,{cache:'no-store'}).then(r=>r.json()); return String(cfg.webAppUrl||cfg.appsScriptUrl||(cfg.bridge&&cfg.bridge.webAppUrl)||''); }catch(_e){return '';}
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
    if(typed && /^https:\/\/script\.google\.com\/macros\/s\//.test(typed) && isMaster()) localStorage.setItem('kinojo_admin_webapp_url',typed); localStorage.setItem('AION2_OFFICIAL_WEBAPP',typed);
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
    if(key==='PAUSED') return '일시중지';
    if(key==='PUBLISHED') return '노출';
    if(key==='DELETED') return '삭제됨';
    return key || '상태 없음';
  }
  function eventNoticePillClass(status){
    const key=String(status||'').toUpperCase();
    if(key==='DRAFT') return 'info';
    if(key==='SCHEDULED') return 'info';
    if(key==='ACTIVE') return 'ok';
    if(key==='PAUSED') return 'info';
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
      priority:Number(g.priority || 0),
      popupVersion:Number(g.popupVersion || g.popup_version || 0),
      createdAt:g.createdAt || g.created_at || '',
      updatedAt:g.updatedAt || g.updated_at || '',
      nextEventAt:g.nextEventAt || g.next_event_at || '',
      items:Array.isArray(g.items)?g.items:[]
    };
  }
  function eventNoticeTypeMeta(value){
    return EVENT_NOTICE_TYPES.find(t=>t.value===String(value||'')) || EVENT_NOTICE_TYPES[0];
  }
  function formatEventNoticeDateRange(g){
    const items=Array.isArray(g.items)?g.items:[];
    const dates=items.map(it=>it.eventAt||it.event_at||'').filter(Boolean).sort();
    if(!dates.length) return '일정 없음';
    const first=formatEventDateTime(dates[0]);
    const last=formatEventDateTime(dates[dates.length-1]);
    return first===last ? first : first+' ~ '+last;
  }
  function renderEventNoticeGroups(groups){
    const root=$('#eventNoticeList'); if(!root)return;
    if(!groups.length){ root.innerHTML='<div class="admin-empty">이벤트 공지 묶음이 없습니다.</div>'; return; }
    root.innerHTML=groups.map(raw=>{
      const g=normalizeEventNoticeGroup(raw);
      const pillClass=eventNoticePillClass(g.status);
      const types=(g.items||[]).slice(0,6).map(item=>{
        const type=item.noticeType||item.notice_type;
        const meta=eventNoticeTypeMeta(type);
        return '<span class="type-'+esc(meta.value || type)+'"><i>'+esc(meta.icon || 'INFO')+'</i>'+esc(meta.label)+'</span>';
      }).join('');
      return '<article class="admin-event-notice-entry" data-event-notice-id="'+esc(g.id)+'">'+
        '<div class="admin-event-notice-entry-top"><span class="admin-pill '+pillClass+'">'+esc(eventNoticeStatusLabel(g.status))+'</span><strong>'+esc(g.title)+'</strong></div>'+
        '<div class="admin-event-notice-entry-meta"><span>카드 '+g.itemCount+'개</span><span>'+esc(formatEventNoticeDateRange(g))+'</span><span>v'+g.popupVersion+'</span></div>'+ 
        (types?'<div class="admin-event-notice-type-list">'+types+'</div>':'')+
        '<div class="admin-event-notice-entry-actions"><button class="admin-btn" type="button" data-event-notice-preview>미리보기</button><button class="admin-btn" type="button" data-event-notice-edit>수정</button><button class="admin-btn" type="button" data-event-notice-duplicate>복제</button><button class="admin-btn danger" type="button" data-event-notice-delete>삭제</button></div>'+ 
      '</article>';
    }).join('');
  }
  async function loadEventNoticeGroups(){
    if(!$('#eventNoticeList')) return;
    const status=$('#eventNoticeStatusFilter')?.value || 'ALL';
    setStatus('#eventNoticeStatus','이벤트 공지 목록을 불러오는 중...','');
    try{
      const data=await adminEventNotice('listGroups',{status,limit:50});
      const groups=data.groups || data.items || data.eventNotices || [];
      state.eventNoticeGroups=(Array.isArray(groups)?groups:[]).map(normalizeEventNoticeGroup);
      state.eventNoticeGroups.sort((a,b)=>{
        const order={draft:10,scheduled:20,active:30,paused:40,expired:50,deleted:60};
        const oa=order[String(a.status||'').toLowerCase()]||90;
        const ob=order[String(b.status||'').toLowerCase()]||90;
        if(oa!==ob) return oa-ob;
        if((b.priority||0)!==(a.priority||0)) return (b.priority||0)-(a.priority||0);
        return String(b.createdAt||'').localeCompare(String(a.createdAt||''));
      });
      renderEventNoticeGroups(state.eventNoticeGroups);
      setStatus('#eventNoticeStatus','이벤트 공지 묶음 '+state.eventNoticeGroups.length+'건','ok');
    }catch(err){
      setStatus('#eventNoticeStatus',err.message||String(err),'error');
      $('#eventNoticeList') && ($('#eventNoticeList').innerHTML='<div class="admin-empty">이벤트 공지 목록을 불러오지 못했습니다.</div>');
    }
  }
  function getEventNoticeGroupById(id){
    const key=String(id||'');
    return (state.eventNoticeGroups||[]).find(g=>String(g.id)===key) || null;
  }
  function eventNoticeTypeOptions(selected){
    return EVENT_NOTICE_TYPES.map(t=>'<option value="'+esc(t.value)+'" '+(String(selected||'')===t.value?'selected':'')+'>'+esc(t.label)+'</option>').join('');
  }
  function renderEventNoticeEditorCard(item, index){
    const type=item?.noticeType || item?.notice_type || 'abyss_low';
    const date=item?.eventDate || item?.event_date || (item?.eventAt || item?.event_at || '').slice(0,10) || todayDateInputValue();
    const time=item?.eventTime || item?.event_time || ((item?.eventAt || item?.event_at || '').match(/T(\d{2}:\d{2})/)||[])[1] || '22:00';
    const meta=eventNoticeTypeMeta(type);
    const title=item?.title || item?.mainText || '';
    const description=item?.description || item?.bodyText || '';
    return '<article class="admin-event-editor-card theme-'+esc(type)+'" data-event-notice-card>'+
      '<div class="admin-event-card-head"><strong><i class="admin-event-type-icon">'+esc(meta.icon || 'INFO')+'</i> 공지 카드 '+(index+1)+'</strong><div class="admin-event-card-actions"><button class="admin-btn" type="button" data-event-card-up>↑</button><button class="admin-btn" type="button" data-event-card-down>↓</button><button class="admin-btn danger" type="button" data-event-card-remove '+(index===0?'disabled':'')+'>삭제</button></div></div>'+
      '<div class="admin-event-card-grid">'+
        '<label>공지 종류<select class="admin-select" data-event-field="noticeType">'+eventNoticeTypeOptions(type)+'</select></label>'+
        '<label>날짜<input class="admin-input" type="date" data-event-field="eventDate" value="'+esc(date)+'"/></label>'+
        '<label>시간<input class="admin-input" type="time" data-event-field="eventTime" value="'+esc(time)+'"/></label>'+
      '</div>'+
      '<label>메인 텍스트<input class="admin-input" data-event-field="title" maxlength="80" placeholder="예: 어비스 하층 요새전 시작" value="'+esc(title)+'"/></label>'+
      '<label>본문 작은 텍스트<textarea class="admin-textarea small" data-event-field="description" maxlength="200" placeholder="예: 10분 전 파티 합류 / 이동 준비">'+esc(description)+'</textarea></label>'+
    '</article>';
  }
  function getDefaultEventNoticeItem(order){
    const t=EVENT_NOTICE_TYPES[order % Math.min(EVENT_NOTICE_TYPES.length,6)] || EVENT_NOTICE_TYPES[0];
    return { noticeType:t.value, eventDate:todayDateInputValue(), eventTime:'22:00', title:t.title, description:t.body, displayOrder:order+1 };
  }
  function renumberEventNoticeEditor(){
    const cards=$$('[data-event-notice-card]', $('#eventNoticeEditorCards'));
    cards.forEach((card,idx)=>{
      const strong=card.querySelector('.admin-event-card-head strong'); if(strong) strong.textContent='공지 카드 '+(idx+1);
      const remove=card.querySelector('[data-event-card-remove]'); if(remove) remove.disabled=cards.length<=1;
      const up=card.querySelector('[data-event-card-up]'); if(up) up.disabled=idx===0;
      const down=card.querySelector('[data-event-card-down]'); if(down) down.disabled=idx===cards.length-1;
    });
    const add=$('#eventNoticeAddCardBtn'); if(add) add.disabled=cards.length>=6;
    const count=$('#eventNoticeEditorCount'); if(count) count.textContent='카드 '+cards.length+'/6';
  }
  function applyEventNoticeTypeTemplate(card){
    const type=card?.querySelector('[data-event-field="noticeType"]')?.value || 'abyss_low';
    const preset=EVENT_NOTICE_TYPES.find(t=>t.value===type) || EVENT_NOTICE_TYPES[0];
    const title=card.querySelector('[data-event-field="title"]');
    const description=card.querySelector('[data-event-field="description"]');
    if(title && !title.value.trim()) title.value=preset.title;
    if(description && !description.value.trim()) description.value=preset.body;
    if(card){
      card.className = card.className.replace(/\btheme-[a-z0-9_]+\b/g,'').trim() + ' theme-' + preset.value;
      const icon=card.querySelector('.admin-event-type-icon');
      if(icon) icon.textContent=preset.icon || 'INFO';
    }
  }
  function openEventNoticeEditor(group){
    state.eventNoticeEditingId = group?.id || null;
    const modal=$('#eventNoticeEditorModal'); if(!modal)return;
    const title=$('#eventNoticeEditorTitle');
    if(title) title.textContent = group ? '이벤트 공지 수정' : '이벤트 공지 등록';
    $('#eventNoticeGroupTitle') && ($('#eventNoticeGroupTitle').value = group?.title || '이벤트 공지');
    $('#eventNoticeGroupStatus') && ($('#eventNoticeGroupStatus').value = String(group?.rawStatus || group?.status || 'draft').toLowerCase());
    $('#eventNoticeGroupPriority') && ($('#eventNoticeGroupPriority').value = String(group?.priority || 0));
    const items = (Array.isArray(group?.items) && group.items.length) ? group.items.slice(0,6) : [getDefaultEventNoticeItem(0)];
    $('#eventNoticeEditorCards').innerHTML = items.map((item,idx)=>renderEventNoticeEditorCard(item,idx)).join('');
    setStatus('#eventNoticeEditorStatus','', '');
    modal.classList.add('active');
    modal.setAttribute('aria-hidden','false');
    renumberEventNoticeEditor();
  }
  function closeEventNoticeEditor(){
    const modal=$('#eventNoticeEditorModal'); if(!modal)return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden','true');
    state.eventNoticeEditingId=null;
  }
  function startEventNoticeCreate(){
    openEventNoticeEditor(null);
  }
  function editEventNoticeGroup(id){
    const group=getEventNoticeGroupById(id);
    if(!group){ setStatus('#eventNoticeStatus','수정할 이벤트 공지 묶음을 찾지 못했습니다. 목록을 새로고침해 주세요.','error'); return; }
    openEventNoticeEditor(group);
  }
  function normalizeEventNoticeItemForPreview(item){
    const type=item?.noticeType || item?.notice_type || 'event';
    const meta=eventNoticeTypeMeta(type);
    const eventAt=item?.eventAt || item?.event_at || '';
    const date=item?.eventDate || item?.event_date || (eventAt ? String(eventAt).slice(0,10) : '');
    const time=item?.eventTime || item?.event_time || ((String(eventAt).match(/T(\d{2}:\d{2})/)||[])[1]) || '';
    return { type, label:meta.label, icon:meta.icon || 'INFO', title:item?.title || item?.mainText || '이벤트 공지', description:item?.description || item?.bodyText || '', date, time };
  }
  function renderEventNoticePreviewBlock(group){
    const g=group ? normalizeEventNoticeGroup(group) : normalizeEventNoticeGroup(collectEventNoticeEditorPayload());
    const items=(g.items||[]).slice(0,6).map(normalizeEventNoticeItemForPreview);
    const cards=items.map(item=>'<article class="kinojo-event-preview-card type-'+esc(item.type)+'"><i>'+esc(item.icon||'INFO')+'</i><div><strong>'+esc(item.label)+'</strong><b>'+esc(item.title)+'</b><span>'+esc(item.description||'')+'</span></div><time>'+esc(item.time||'--:--')+'</time></article>').join('');
    return '<div class="kinojo-event-preview-wrap"><header><span>EVENT NOTICE</span><strong>'+esc(g.title||'이벤트 공지')+'</strong></header><div class="kinojo-event-preview-cards">'+cards+'</div><footer><button type="button">오늘 하루 그만보기</button><button type="button">닫기</button></footer></div>';
  }
  function openEventNoticePreview(group){
    const modal=$('#eventNoticePreviewModal'); const body=$('#eventNoticePreviewBody'); if(!modal||!body)return;
    body.innerHTML=renderEventNoticePreviewBlock(group);
    modal.classList.add('active'); modal.setAttribute('aria-hidden','false');
  }
  function closeEventNoticePreview(){
    const modal=$('#eventNoticePreviewModal'); if(!modal)return;
    modal.classList.remove('active'); modal.setAttribute('aria-hidden','true');
  }
  function duplicateEventNoticeGroup(id){
    const group=getEventNoticeGroupById(id);
    if(!group){ setStatus('#eventNoticeStatus','복제할 이벤트 공지 묶음을 찾지 못했습니다.','error'); return; }
    const clone=Object.assign({}, group, { id:null, title:(group.title||'이벤트 공지')+' 복사본', rawStatus:'draft', status:'DRAFT' });
    clone.items=(group.items||[]).map((item,idx)=>Object.assign({}, item, { id:null, displayOrder:idx+1, display_order:idx+1 }));
    openEventNoticeEditor(clone);
    setStatus('#eventNoticeEditorStatus','복제본입니다. 날짜와 문구를 확인한 뒤 저장하세요.','');
  }
  async function deleteEventNoticeGroup(id){
    const group=getEventNoticeGroupById(id);
    if(!group){ setStatus('#eventNoticeStatus','삭제할 이벤트 공지 묶음을 찾지 못했습니다.','error'); return; }
    if(!confirm('이벤트 공지 묶음 "'+(group.title||'')+'"을 삭제 처리할까요?')) return;
    setStatus('#eventNoticeStatus','이벤트 공지를 삭제 처리하는 중...','');
    try{
      const res=await adminEventNotice('deleteGroup',{groupId:id});
      if(res && res.ok===false) throw new Error(res.message||'이벤트 공지 삭제 실패');
      toast('이벤트 공지 삭제 완료');
      await loadEventNoticeGroups();
    }catch(err){ setStatus('#eventNoticeStatus',err.message||String(err),'error'); }
  }
  function collectEventNoticeEditorPayload(){
    const cards=$$('[data-event-notice-card]', $('#eventNoticeEditorCards'));
    const items=cards.map((card,idx)=>{
      const get=(key)=>card.querySelector('[data-event-field="'+key+'"]')?.value || '';
      return {
        displayOrder:idx+1,
        noticeType:get('noticeType'),
        eventDate:get('eventDate'),
        eventTime:get('eventTime'),
        title:get('title').trim(),
        description:get('description').trim()
      };
    });
    return {
      groupId:state.eventNoticeEditingId || null,
      title:($('#eventNoticeGroupTitle')?.value || '이벤트 공지').trim(),
      status:$('#eventNoticeGroupStatus')?.value || 'draft',
      priority:Number($('#eventNoticeGroupPriority')?.value || 0),
      items
    };
  }
  async function saveEventNoticeEditor(){
    const payload=collectEventNoticeEditorPayload();
    if(!payload.title){ setStatus('#eventNoticeEditorStatus','공지 묶음 제목을 입력하세요.','error'); return; }
    if(!payload.items.length){ setStatus('#eventNoticeEditorStatus','공지 카드를 최소 1개 이상 입력하세요.','error'); return; }
    if(payload.items.length>6){ setStatus('#eventNoticeEditorStatus','공지 카드는 최대 6개까지 등록 가능합니다.','error'); return; }
    for(let i=0;i<payload.items.length;i++){
      const item=payload.items[i];
      if(!item.noticeType){ setStatus('#eventNoticeEditorStatus','공지 카드 '+(i+1)+'번의 종류를 선택하세요.','error'); return; }
      if(!item.eventDate){ setStatus('#eventNoticeEditorStatus','공지 카드 '+(i+1)+'번의 날짜를 입력하세요.','error'); return; }
      if(!item.eventTime){ setStatus('#eventNoticeEditorStatus','공지 카드 '+(i+1)+'번의 시간을 입력하세요.','error'); return; }
      if(!item.title){ setStatus('#eventNoticeEditorStatus','공지 카드 '+(i+1)+'번의 메인 텍스트를 입력하세요.','error'); return; }
    }
    const btn=$('#eventNoticeEditorSaveBtn'); if(btn) btn.disabled=true;
    setStatus('#eventNoticeEditorStatus','이벤트 공지를 저장하는 중...','');
    try{
      const res=await adminEventNotice('saveGroup', payload);
      if(res && res.ok===false) throw new Error(res.message || '이벤트 공지 저장 실패');
      toast('이벤트 공지 저장 완료');
      setStatus('#eventNoticeStatus','저장 후 목록을 새로고침했습니다.','ok');
      closeEventNoticeEditor();
      await loadEventNoticeGroups();
    }catch(err){
      setStatus('#eventNoticeEditorStatus',err.message||String(err),'error');
    }finally{
      if(btn) btn.disabled=false;
    }
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
    const localUrl = localStorage.getItem('kinojo_admin_webapp_url') || localStorage.getItem('AION2_OFFICIAL_WEBAPP') || '';
    const bridgeLabel = localUrl ? 'URL 저장됨' : 'config.json 또는 시스템 설정 확인';
    root.innerHTML='<div class="admin-system-list"><div class="admin-system-item"><span><i class="admin-dot"></i>Supabase DB</span><strong>정상</strong></div><div class="admin-system-item"><span><i class="admin-dot"></i>RPC / Functions</span><strong>'+(data?.ok===false?'확인 필요':'정상')+'</strong></div><div class="admin-system-item"><span><i class="admin-dot"></i>Updater Runtime</span><strong>'+esc(data?.message||'정상')+'</strong></div><div class="admin-system-item"><span><i class="admin-dot"></i>Apps Script Bridge</span><strong>'+esc(bridgeLabel)+'</strong></div><div class="admin-system-item"><span><i class="admin-dot"></i>최근 성역 동기화</span><strong>'+esc(localStorage.getItem('kinojo_admin_last_sanctuary_sync')||'기록 없음')+'</strong></div></div>';
  }
  function saveWebAppUrl(){
    if(!isMaster()){ setStatus('#systemStatus','MASTER 권한만 시스템 URL을 변경할 수 있습니다.','error'); return; }
    const v=$('#webAppUrlInput')?.value.trim()||'';
    if(!v){ setStatus('#systemStatus','저장할 Apps Script WebApp URL을 입력하세요.','error'); return; }
    if(!/^https:\/\/script\.google\.com\/macros\/s\//.test(v)){setStatus('#systemStatus','Apps Script WebApp URL 형식을 확인하세요.','error');return;}
    localStorage.setItem('kinojo_admin_webapp_url',v);
    localStorage.setItem('AION2_OFFICIAL_WEBAPP',v);
    setStatus('#systemStatus','Apps Script WebApp URL 저장 완료','ok');
    addLog('SYSTEM','Apps Script WebApp URL 저장');
    refreshServerStatus();
  }
  function clearWebAppUrl(){
    if(!isMaster()){ setStatus('#systemStatus','MASTER 권한만 시스템 URL을 삭제할 수 있습니다.','error'); return; }
    localStorage.removeItem('kinojo_admin_webapp_url');
    localStorage.removeItem('AION2_OFFICIAL_WEBAPP');
    const input=$('#webAppUrlInput'); if(input) input.value='';
    setStatus('#systemStatus','Apps Script WebApp URL 저장값을 삭제했습니다. config.json 값이 있으면 자동 fallback 됩니다.','ok');
    refreshServerStatus();
  }
  async function refreshSystemSettings(){
    const input=$('#webAppUrlInput');
    const saved=localStorage.getItem('kinojo_admin_webapp_url')||localStorage.getItem('AION2_OFFICIAL_WEBAPP')||'';
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
    $('#sanctuaryPreviewBtn')?.addEventListener('click',async()=>{ setStatus('#sanctuarySyncStatus','서버 성역 데이터를 불러오는 중...',''); try{ const select=$('#sanctuarySyncId'); const id=select?.value||''; const defaultId=select?.dataset.sanctuaryDefaultCode||Array.from(select?.options||[]).map(o=>o.value).find(v=>v&&v!=='all')||''; const data=await action('sanctuary',{id:id==='all'?defaultId:id}); $('#sanctuarySyncResult').innerHTML=renderSyncReport(Object.assign({ok:true},data)); setSyncStep(2); setStatus('#sanctuarySyncStatus','서버 미리보기 완료','ok'); }catch(err){setStatus('#sanctuarySyncStatus',err.message||String(err),'error');} });
    $('#sanctuarySyncBtn')?.addEventListener('click',runSanctuarySync);
    $('#noticeReloadBtn')?.addEventListener('click',loadNotices); $('#noticeSaveBtn')?.addEventListener('click',saveNotice);
    $('#eventNoticeReloadBtn')?.addEventListener('click',loadEventNoticeGroups); $('#eventNoticeCreateBtn')?.addEventListener('click',startEventNoticeCreate); $('#eventNoticeStatusFilter')?.addEventListener('change',loadEventNoticeGroups);
    $('#eventNoticeList')?.addEventListener('click',e=>{ const row=e.target.closest('[data-event-notice-id]'); const id=row?.dataset.eventNoticeId; if(e.target.matches('[data-event-notice-preview]')) openEventNoticePreview(getEventNoticeGroupById(id)); if(e.target.matches('[data-event-notice-edit]')) editEventNoticeGroup(id); if(e.target.matches('[data-event-notice-duplicate]')) duplicateEventNoticeGroup(id); if(e.target.matches('[data-event-notice-delete]')) deleteEventNoticeGroup(id); });
    $('#eventNoticeEditorCloseBtn')?.addEventListener('click',closeEventNoticeEditor);
    $('#eventNoticeEditorCancelBtn')?.addEventListener('click',closeEventNoticeEditor);
    $('#eventNoticeEditorBackdrop')?.addEventListener('click',closeEventNoticeEditor);
    $('#eventNoticeEditorSaveBtn')?.addEventListener('click',saveEventNoticeEditor);
    $('#eventNoticeEditorPreviewBtn')?.addEventListener('click',()=>openEventNoticePreview(null));
    $('#eventNoticePreviewCloseBtn')?.addEventListener('click',closeEventNoticePreview);
    $('#eventNoticePreviewOkBtn')?.addEventListener('click',closeEventNoticePreview);
    $('#eventNoticePreviewBackdrop')?.addEventListener('click',closeEventNoticePreview);
    $('#eventNoticeAddCardBtn')?.addEventListener('click',()=>{ const root=$('#eventNoticeEditorCards'); if(!root)return; const cards=$$('[data-event-notice-card]',root); if(cards.length>=6){setStatus('#eventNoticeEditorStatus','공지 카드는 최대 6개까지 등록 가능합니다.','error');return;} root.insertAdjacentHTML('beforeend',renderEventNoticeEditorCard(getDefaultEventNoticeItem(cards.length),cards.length)); renumberEventNoticeEditor(); });
    $('#eventNoticeEditorCards')?.addEventListener('click',e=>{
      const card=e.target.closest('[data-event-notice-card]'); if(!card)return;
      if(e.target.matches('[data-event-card-remove]')){ card.remove(); renumberEventNoticeEditor(); }
      if(e.target.matches('[data-event-card-up]')){ const prev=card.previousElementSibling; if(prev) card.parentNode.insertBefore(card,prev); renumberEventNoticeEditor(); }
      if(e.target.matches('[data-event-card-down]')){ const next=card.nextElementSibling; if(next) card.parentNode.insertBefore(next,card); renumberEventNoticeEditor(); }
    });
    $('#eventNoticeEditorCards')?.addEventListener('change',e=>{ if(e.target.matches('[data-event-field="noticeType"]')) applyEventNoticeTypeTemplate(e.target.closest('[data-event-notice-card]')); });
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
