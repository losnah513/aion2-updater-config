/* KINOJO Admin Console v2026072503 */
(function(){
  'use strict';
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const state = { tab:'dashboard', subtab:'', loaded:{}, subtabs:{ members:'accounts', characters:'lookup', notices:'general', system:'server-status' }, requests:[], accounts:[], characters:[], logs:[], eventNoticeGroups:[], eventNoticeEditingId:null, meterConsole:null, meterNotices:[], sanctuarySchedules:[], sanctuaryMasters:[], sanctuaryStatusOptions:[], sanctuaryScheduleLoaded:false, sanctuaryScheduleAccess:null, sanctuaryRolePermissions:null, sanctuaryScheduleSaving:false, lastSanctuarySyncData:null, lastSanctuaryStatusData:null, lastSanctuaryId:'all', visitorDays:7, visitorPage:1, visitorTotalPages:1, visitorCanViewMemberHistory:false, lookupConsole:null, lookupSessionId:'', lookupSessionToken:'', lookupPollTimer:null, lookupHeartbeatAt:0, lookupStarting:false };
  const CACHE = '2026072503';
  const DEFAULT_SUBTABS = { members:'accounts', characters:'lookup', notices:'general', system:'server-status', logs:'activity' };
  function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
  function addLog(type,msg){
    const t = new Date(); const line = '['+String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0')+':'+String(t.getSeconds()).padStart(2,'0')+'] '+String(type||'INFO')+' · '+String(msg||'');
    state.logs.unshift(line); state.logs = state.logs.slice(0,80); renderLogs();
  }
  function setStatus(id,msg,kind){ const el=$(id); if(!el)return; el.textContent=msg||''; el.className='admin-statusline '+(kind||''); }
  function toast(msg){ if(window.KinojoToast?.show) window.KinojoToast.show(msg); else addLog('TOAST',msg); }
  function roleLabel(){ const s=window.KinojoAuth?.getSession?.()||{}; return s.roleLabel||s.role||'관리자'; }
  function roleKey(){ const s=window.KinojoAuth?.getSession?.()||{}; return String(s.role||s.roleLabel||'').toUpperCase().replace(/\s+/g,'_'); }
  function roleLevel(){
    const s=window.KinojoAuth?.getSession?.()||{};
    const direct=Number(s.level||0);
    if(direct>0)return direct;
    const role=roleKey();
    if(role==='MASTER'||role==='LV5')return 5;
    if(role==='SUB_MASTER'||role==='SUBMASTER'||role==='LV4')return 4;
    if(role==='MANAGER'||role==='LV3')return 3;
    if(role==='STAFF'||role==='LV2')return 2;
    return 1;
  }
  function isMaster(){ return roleLevel()>=5; }
  function isFullAdmin(){ return roleLevel()>=3; }
  function isStaffConsole(){ return roleLevel()===2; }
  function isAdmin(){ return roleLevel()>=2; }
  function adminAccount(cmd, extra){ return window.KinojoSupabase.adminAccount(cmd, extra||{}); }
  function adminCharacter(cmd, extra){ return window.KinojoSupabase.adminCharacter(cmd, extra||{}); }
  function adminLookup(cmd, extra){ return window.KinojoSupabase.adminLookup(cmd, extra||{}); }
  function adminNotice(cmd, extra){ return window.KinojoSupabase.adminNotice(cmd, extra||{}); }
  function adminEventNotice(cmd, extra){ return window.KinojoSupabase.adminEventNotice(cmd, extra||{}); }
  function adminMeter(cmd, extra){ return window.KinojoSupabase.adminMeter(cmd, extra||{}); }
  function adminVisitor(cmd, extra){ return window.KinojoSupabase.adminVisitor(cmd, extra||{}); }
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

  function adminRoute(){
    const raw=decodeURIComponent(String(location.hash||'').replace(/^#/,''));
    let [tab,subtab]=raw.split('/').filter(Boolean);
    if(tab==='server'){tab='system';subtab='server-status';}
    if(!document.querySelector('[data-admin-pane="'+String(tab||'')+'"]'))tab=isStaffConsole()?'sanctuary':'dashboard';
    return {tab,subtab:subtab||DEFAULT_SUBTABS[tab]||''};
  }
  function writeAdminRoute(tab,subtab){
    const value='#'+tab+(subtab?'/'+subtab:'');
    if(location.hash===value)return;
    history.replaceState(null,'',location.pathname+location.search+value);
  }
  function loadFeature(tab,subtab,force){
    const key=tab+(subtab?'/'+subtab:'');
    if(state.loaded[key]&&!force)return;
    state.loaded[key]=true;
    if(tab==='dashboard') refreshDashboard();
    if(tab==='requests') loadCodeRequests();
    if(tab==='members'&&subtab==='accounts') loadAccounts();
    if(tab==='members'&&subtab==='permissions'&&isMaster()) loadSanctuaryRolePermissions();
    if(tab==='characters'&&subtab==='lookup') loadCharacterLookupConsole(force===true);
    if(tab==='sanctuary') loadSanctuaryScheduleConsole(force===true);
    if(tab==='notices'&&subtab==='general') loadNotices();
    if(tab==='notices'&&subtab==='event') loadEventNoticeGroups();
    if(tab==='meter'&&isMaster()) loadMeterAdminConsole();
    if(tab==='system'&&subtab==='server-status') refreshServerStatus();
    if(tab==='system'&&subtab==='sheet-sync') loadSanctuarySyncConsole(force===true);
    if(tab==='system'&&subtab==='environment') refreshSystemSettings();
    if(tab==='logs'&&subtab==='visitors') loadVisitorDashboard(force===true);
  }
  function switchSubtab(tab,subtab,options={}){
    const pane=$('[data-admin-pane="'+tab+'"]');
    if(!pane)return;
    const available=$$('[data-admin-subtab]',pane).filter(button=>!button.hidden).map(button=>button.dataset.adminSubtab);
    const next=available.includes(subtab)?subtab:(DEFAULT_SUBTABS[tab]||available[0]||'');
    state.subtabs[tab]=next;
    state.subtab=next;
    $$('[data-admin-subtab]',pane).forEach(button=>button.classList.toggle('active',button.dataset.adminSubtab===next));
    $$('[data-admin-subpane]',pane).forEach(subpane=>subpane.classList.toggle('active',subpane.dataset.adminSubpane===next));
    if(options.updateRoute!==false)writeAdminRoute(tab,next);
    loadFeature(tab,next,options.force===true);
  }
  function switchTab(tab,options={}){
    if(tab==='server'){tab='system';options=Object.assign({},options,{subtab:'server-status'});}
    if(tab==='meter'&&!isMaster())tab='dashboard';
    if(isStaffConsole() && tab!=='sanctuary') tab='sanctuary';
    if(!document.querySelector('[data-admin-pane="'+tab+'"]'))tab=isStaffConsole()?'sanctuary':'dashboard';
    state.tab = tab;
    $$('.admin-nav button').forEach(b=>b.classList.toggle('active', b.dataset.adminTab===tab));
    $$('.admin-bottom-actions button').forEach(b=>b.classList.toggle('active', b.dataset.adminTab===tab));
    $$('.admin-pane').forEach(p=>p.classList.toggle('active', p.dataset.adminPane===tab));
    const sel=$('#adminMobileSelect'); if(sel) sel.value=tab;
    const subnav=$('[data-admin-subnav="'+tab+'"]',document);
    if(subnav){
      switchSubtab(tab,options.subtab||state.subtabs[tab]||DEFAULT_SUBTABS[tab],options);
    }else{
      state.subtab='';
      if(options.updateRoute!==false)writeAdminRoute(tab,'');
      loadFeature(tab,'',options.force===true);
    }
  }

  function renderAccessBlocked(){
    document.body.innerHTML = '<main class="admin-access-block"><h1>관리자 권한이 필요합니다</h1><p>로그인 후 STAFF 이상 권한으로 접근할 수 있습니다. STAFF는 담당 팀 성역 일정만 관리할 수 있습니다.</p><button class="admin-btn primary" id="adminLoginGo" type="button">로그인</button></main>';
    $('#adminLoginGo')?.addEventListener('click',()=>window.KinojoAuth?.openLoginModal?.());
  }

  async function refreshDashboard(){
    try{
      const [visit, req, runtime, sync] = await Promise.allSettled([
        action('hallVisit',{ mode:'stats', pageKey:'admin' }),
        adminAccount('listCodeRequests',{ status:'PENDING', limit:20 }),
        action('runtimeStatus',{}),
        action('adminSanctuarySheetSync',{mode:'status'})
      ]);
      const stats = visit.status==='fulfilled' ? (visit.value.stats || visit.value || {}) : {};
      const requests = req.status==='fulfilled' ? (req.value.requests || []) : [];
      const runtimeData = runtime.status==='fulfilled' ? runtime.value : {};
      const syncData = sync.status==='fulfilled' ? sync.value : {};
      $('#statVisitors').textContent = Number(stats.todayVisits ?? stats.today ?? stats.daily ?? 0).toLocaleString('ko-KR');
      const anonymous=Number(stats.todayAnonymous ?? 0), logged=Number(stats.todayLoggedIn ?? 0), views=Number(stats.todayPageViews ?? 0);
      $('#statVisitorsSub').textContent = '비로그인 '+anonymous.toLocaleString('ko-KR')+' · 로그인 '+logged.toLocaleString('ko-KR')+(views?' · 조회 '+views.toLocaleString('ko-KR'):'');
      $('#statRequests').textContent = String(requests.length||0);
      $('#statRequestsSub').textContent = requests.length ? '대기 중' : '처리할 요청 없음';
      const recentSync=syncData.recentSync||syncData.recent_sync||{};
      $('#statSanctuary').textContent = recentSync.status==='failed' ? '확인' : recentSync.completedAt||recentSync.completed_at ? '정상' : '대기';
      $('#statSanctuarySub').textContent = formatServerTime(recentSync.completedAt||recentSync.completed_at);
      $('#statServer').textContent = runtimeData.ok === false ? '점검' : '정상';
      $('#statServerSub').textContent = runtimeData.message || '모든 시스템 확인';
      state.requests=requests;
      renderRequestPreview(requests.slice(0,3));
      renderServerBox(runtimeData,syncData);
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
    try{
      const data=await adminAccount('listCodes',{});
      state.accounts=data.accounts||[];
      state.memberCodeVisibility=String(data.codeVisibility||'VISIBLE').toUpperCase();
      const search=$('#memberSearch');
      if(search)search.placeholder=state.memberCodeVisibility==='MASKED'?'회원명 / 등급 검색':'회원명 / 코드 / 등급 검색';
      applyMemberFilters();
    }
    catch(err){ setStatus('#memberStatus',err.message||String(err),'error'); }
  }
  const MEMBER_ROLE_LABELS={MEMBER:'Member',STAFF:'Staff',MANAGER:'Manager',SUB_MASTER:'Sub Master',MASTER:'Master'};
  function normalizeMemberRole(value){ return String(value||'MEMBER').trim().toUpperCase().replace(/[\s-]+/g,'_').replace('SUBMASTER','SUB_MASTER'); }
  function getAccountId(a){ return String(a.memberId ?? a.member_id ?? a.id ?? ''); }
  function getAccountCode(a){ return a.codeDisplay || a.code_display || a.code || a.passCode || a.pass_code || ''; }
  function getAccountName(a){ return a.mainCharacter || a.main_character_name || a.mainCharacterName || '-'; }
  function getAccountRole(a){ return normalizeMemberRole(a.role || a.roleLabel || 'MEMBER'); }
  function getAccountRoleLabel(a){ const role=getAccountRole(a); return a.roleLabel || a.role_label || MEMBER_ROLE_LABELS[role] || role; }
  function getAccountCanEdit(a){ return a.canEdit===true || a.can_edit===true; }
  function getAccountAllowedRoles(a){
    const source=Array.isArray(a.allowedRoles)?a.allowedRoles:Array.isArray(a.allowed_roles)?a.allowed_roles:[];
    return source.map(normalizeMemberRole).filter(role=>MEMBER_ROLE_LABELS[role]);
  }
  function applyMemberFilters(){
    const q = String($('#memberSearch')?.value || '').trim().toLowerCase();
    const role = String($('#memberRoleFilter')?.value || '').trim();
    const filtered = (state.accounts || []).filter(a=>{
      const searchableCode=(a.codeMasked===true||a.code_masked===true)?'':getAccountCode(a);
      const hay = [getAccountName(a), searchableCode, getAccountRole(a), getAccountRoleLabel(a)].join(' ').toLowerCase();
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
      const memberId=esc(getAccountId(a)); const code=esc(getAccountCode(a)||'••••••'); const name=esc(getAccountName(a));
      const roleKey=getAccountRole(a); const role=esc(roleKey); const roleName=esc(getAccountRoleLabel(a));
      const active=(a.isActive ?? a.is_active ?? a.active)!==false;
      const masked=a.codeMasked===true||a.code_masked===true;
      const canEdit=getAccountCanEdit(a);
      const allowed=getAccountAllowedRoles(a);
      const options=allowed.map(option=>'<option value="'+option+'" '+(option===roleKey?'selected':'')+'>'+esc(MEMBER_ROLE_LABELS[option])+'</option>').join('');
      const controls=canEdit
        ? '<button class="admin-btn admin-member-role-open" data-member-role-open type="button">등급 변경</button><button class="admin-btn danger" data-member-disable type="button">비활성</button><button class="admin-btn" data-member-delete type="button">삭제</button>'
        : '<span class="admin-member-locked">변경 권한 없음</span>';
      const editor=canEdit&&options
        ? '<div class="admin-member-role-editor" data-member-role-editor hidden><span><b>현재 '+roleName+'</b>에서 변경</span><select class="admin-select compact" data-member-role-select>'+options+'</select><button class="admin-btn primary" data-member-role-save type="button">적용</button><button class="admin-btn ghost" data-member-role-cancel type="button">취소</button></div>'
        : '';
      return '<article class="admin-row admin-member-row" data-member-id="'+memberId+'" data-member-name="'+name+'" data-member-role="'+role+'"><div class="admin-member-summary"><div class="admin-row-main"><strong>'+name+'</strong><div class="admin-member-meta"><span class="admin-member-code '+(masked?'is-masked':'')+'">회원 코드 <b>'+code+'</b></span><span class="admin-member-role-badge role-'+role.toLowerCase()+'">'+roleName+'</span></div></div><div class="admin-row-actions"><span class="admin-pill '+(active?'ok':'error')+'">'+(active?'활성':'비활성')+'</span>'+controls+'</div></div>'+editor+'</article>';
    }).join(''):'<div class="admin-empty">회원 코드가 없습니다.</div>';
  }
  async function handleMemberAction(target){
    const row=target.closest('[data-member-id]'); const memberId=row?.dataset.memberId; if(!memberId)return;
    const memberName=row.dataset.memberName||'회원';
    const currentRole=normalizeMemberRole(row.dataset.memberRole);
    const editor=$('[data-member-role-editor]',row);
    if(target.matches('[data-member-role-open]')){
      if(editor)editor.hidden=!editor.hidden;
      return;
    }
    if(target.matches('[data-member-role-cancel]')){
      if(editor)editor.hidden=true;
      return;
    }
    target.disabled=true;
    try{
      let res;
      if(target.matches('[data-member-role-save]')){
        const nextRole=normalizeMemberRole($('[data-member-role-select]',row)?.value);
        if(nextRole===currentRole){ if(editor)editor.hidden=true; target.disabled=false; return; }
        const before=MEMBER_ROLE_LABELS[currentRole]||currentRole;
        const after=MEMBER_ROLE_LABELS[nextRole]||nextRole;
        if(!confirm(memberName+' 회원의 등급을 '+before+' → '+after+'로 변경할까요?')){target.disabled=false;return;}
        res=await adminAccount('updateRole',{memberId,role:nextRole});
      }
      else if(target.matches('[data-member-disable]')){
        if(!confirm(memberName+' 회원 코드를 비활성화할까요?')){target.disabled=false;return;}
        res=await adminAccount('disableCode',{memberId});
      }
      else if(target.matches('[data-member-delete]')){
        if(!confirm(memberName+' 회원 코드를 삭제할까요? 이 작업은 되돌릴 수 없습니다.')){target.disabled=false;return;}
        res=await adminAccount('deleteCode',{memberId});
      }
      if(res && res.ok===false) throw new Error(res.message||'회원 처리 실패');
      toast(res?.message||'회원 정보 처리 완료'); addLog('MEMBER',(res?.message||'회원 처리')+' · '+memberName); await loadAccounts();
    }catch(err){ setStatus('#memberStatus',err.message||String(err),'error'); target.disabled=false; }
  }

  const SANCTUARY_ROLE_LABELS={MEMBER:'Member',STAFF:'Staff',MANAGER:'Manager',SUB_MASTER:'Sub Master',MASTER:'Master'};
  function renderSanctuaryRolePermissions(data){
    const root=$('#sanctuaryRolePermissionMatrix');
    const card=$('#sanctuaryRolePermissionCard');
    if(card)card.hidden=!isMaster();
    if(!root||!isMaster())return;
    const roles=Array.isArray(data?.roles)?data.roles:['MEMBER','STAFF','MANAGER','SUB_MASTER','MASTER'];
    const items=Array.isArray(data?.items)?data.items:[];
    root.innerHTML=items.length?'<table class="admin-role-permission-table"><thead><tr><th>기능</th>'+roles.map(role=>'<th>'+esc(SANCTUARY_ROLE_LABELS[role]||role)+'</th>').join('')+'</tr></thead><tbody>'+items.map(item=>'<tr><th><strong>'+esc(item.label||item.permissionKey)+'</strong><small>'+esc(item.description||'')+'</small></th>'+roles.map(role=>{const checked=role==='MASTER'||item.roles?.[role]===true;return '<td><label class="admin-permission-toggle"><input type="checkbox" data-sanctuary-role-permission data-role="'+esc(role)+'" data-permission="'+esc(item.permissionKey)+'" '+(checked?'checked':'')+' '+(role==='MASTER'?'disabled':'')+'/><span>'+(checked?'ON':'OFF')+'</span></label></td>';}).join('')+'</tr>').join('')+'</tbody></table>':'<div class="admin-empty">등록된 성역 권한 항목이 없습니다.</div>';
  }
  async function loadSanctuaryRolePermissions(){
    const card=$('#sanctuaryRolePermissionCard');
    if(card)card.hidden=!isMaster();
    if(!isMaster())return;
    setStatus('#sanctuaryRolePermissionStatus','등급별 권한을 불러오는 중...','');
    try{
      const data=await action('sanctuaryRolePermissions',{});
      if(!data||data.ok===false)throw new Error(data?.message||'권한표 조회 실패');
      state.sanctuaryRolePermissions=data;
      renderSanctuaryRolePermissions(data);
      setStatus('#sanctuaryRolePermissionStatus','등급별 기본 권한이 적용 중입니다. MASTER 권한은 항상 ON입니다.','ok');
    }catch(err){setStatus('#sanctuaryRolePermissionStatus',err.message||String(err),'error');}
  }
  async function setSanctuaryRolePermission(input){
    if(!isMaster()||!input)return;
    input.disabled=true;
    try{
      const data=await action('sanctuaryRolePermissionSet',{role:input.dataset.role,permissionKey:input.dataset.permission,enabled:input.checked});
      if(!data||data.ok===false)throw new Error(data?.message||'권한 저장 실패');
      state.sanctuaryRolePermissions=data;
      renderSanctuaryRolePermissions(data);
      setStatus('#sanctuaryRolePermissionStatus','권한 설정을 저장했습니다. 다음 Server 요청부터 적용됩니다.','ok');
    }catch(err){
      input.checked=!input.checked;
      input.disabled=false;
      setStatus('#sanctuaryRolePermissionStatus',err.message||String(err),'error');
    }
  }

  function lookupSplit(value){return String(value||'').split(',').map(item=>item.trim()).filter(Boolean);}
  function lookupSessionStorageKey(){return 'kinojo_admin_lookup_session_v268';}
  function lookupTokenStorageKey(){return 'kinojo_admin_lookup_token_v268';}
  function loadStoredLookupSession(){
    try{state.lookupSessionId=state.lookupSessionId||sessionStorage.getItem(lookupSessionStorageKey())||localStorage.getItem(lookupSessionStorageKey())||'';}catch(_err){}
    try{state.lookupSessionToken=state.lookupSessionToken||sessionStorage.getItem(lookupTokenStorageKey())||'';}catch(_err){}
  }
  function storeLookupSession(sessionId,sessionToken){
    state.lookupSessionId=String(sessionId||''); state.lookupSessionToken=String(sessionToken||'');
    try{if(state.lookupSessionId){sessionStorage.setItem(lookupSessionStorageKey(),state.lookupSessionId);localStorage.setItem(lookupSessionStorageKey(),state.lookupSessionId);}else{sessionStorage.removeItem(lookupSessionStorageKey());localStorage.removeItem(lookupSessionStorageKey());}}catch(_err){}
    try{if(state.lookupSessionToken)sessionStorage.setItem(lookupTokenStorageKey(),state.lookupSessionToken);else sessionStorage.removeItem(lookupTokenStorageKey());}catch(_err){}
  }
  function readLookupFilter(){
    const scope=String($('#characterLookupScope')?.value||'all');
    const characterName=String($('#characterLookupName')?.value||'').trim();
    const gearTypes=$$('[name="characterLookupGear"]:checked').map(input=>input.value);
    if(scope==='single'&&!characterName)throw new Error('특정 캐릭터 조회는 캐릭터명을 입력해야 합니다.');
    if(scope!=='missing_only'&&!gearTypes.length)throw new Error('PVE 또는 PVP 조회 유형을 하나 이상 선택하세요.');
    return {
      lookupMode:scope==='missing_only'?'missing_only':'all',
      characterName:scope==='single'?characterName:'',
      gearTypes:scope==='missing_only'?[]:gearTypes,
      classes:lookupSplit($('#characterLookupClasses')?.value),
      servers:lookupSplit($('#characterLookupServers')?.value),
      races:lookupSplit($('#characterLookupRaces')?.value)
    };
  }
  function lookupStatusLabel(data){
    if(!data)return '대기';
    if(data.controlState==='paused')return '일시정지';
    if(data.controlState==='cancelled')return '중단';
    if(data.waitingExtension)return 'Extension 연결 대기';
    if(data.active&&data.extensionClaimed)return '조회 진행';
    const status=String(data.session?.status||data.job?.status||'').toLowerCase();
    if(status==='completed')return '완료';
    if(status==='failed')return '실패';
    if(status==='cancelled')return '중단';
    return data.active?'실행 중':'대기';
  }
  function lookupStepClass(value){const key=String(value||'pending');return ['done','active','error'].includes(key)?key:'pending';}
  function renderCharacterLookupConsole(data){
    state.lookupConsole=data||null;
    const empty=!data||!data.sessionId;
    const progressBox=data?.progress||{};
    const progress=progressBox.progress||progressBox;
    const current=Number(progress.completedCount||progressBox.progressCurrent||0);
    const total=Number(progress.total||progressBox.progressTotal||data?.queueMeta?.queueCount||0);
    const percent=Math.max(0,Math.min(100,Number(progress.overallProgressPercent||0)));
    const statusLabel=lookupStatusLabel(data);
    const currentCharacter=String(progress.currentCharacter||data?.job?.current_character||data?.job?.currentCharacter||'');
    const message=String(data?.message||data?.session?.message||data?.job?.message||'조회 작업을 시작하면 이 영역에서 진행 상태를 확인할 수 있습니다.');
    const statusEl=$('#characterLookupState'); if(statusEl){statusEl.textContent=statusLabel;statusEl.className='admin-pill '+(statusLabel==='완료'?'ok':statusLabel==='실패'||statusLabel==='중단'?'error':statusLabel==='일시정지'?'warn':'active');}
    if($('#characterLookupSession'))$('#characterLookupSession').textContent=empty?'세션 없음':String(data.sessionId).slice(0,8)+'…';
    if($('#characterLookupOwner'))$('#characterLookupOwner').textContent=String(data?.session?.requested_by_character||data?.job?.requested_by_character||'-');
    if($('#characterLookupMessage'))$('#characterLookupMessage').textContent=message;
    if($('#characterLookupCurrent'))$('#characterLookupCurrent').textContent=currentCharacter||'-';
    if($('#characterLookupCount'))$('#characterLookupCount').textContent=current.toLocaleString('ko-KR')+' / '+total.toLocaleString('ko-KR');
    if($('#characterLookupSuccess'))$('#characterLookupSuccess').textContent=Number(progress.successCount||0).toLocaleString('ko-KR');
    if($('#characterLookupRetry'))$('#characterLookupRetry').textContent=Number(progress.retryPendingCount||0).toLocaleString('ko-KR');
    if($('#characterLookupFailed'))$('#characterLookupFailed').textContent=Number(progress.finalFailedCount||0).toLocaleString('ko-KR');
    if($('#characterLookupPercent'))$('#characterLookupPercent').textContent=percent.toFixed(1)+'%';
    if($('#characterLookupProgressBar'))$('#characterLookupProgressBar').style.width=percent+'%';
    const steps=[
      {id:'characterLookupStep1',status:progress.step1Status,percent:progress.step1Percent,label:'원본 대조'},
      {id:'characterLookupStep2',status:progress.step2Status,percent:progress.step2Percent,label:'공식 조회'},
      {id:'characterLookupStep3',status:progress.step3Status,percent:progress.step3Percent,label:'서버 후처리'}
    ];
    steps.forEach(step=>{const el=$('#'+step.id);if(!el)return;const cls=lookupStepClass(step.status);el.className='admin-lookup-step '+cls;el.querySelector('strong').textContent=step.label;el.querySelector('span').textContent=Number(step.percent||0).toFixed(1)+'%';});
    const events=$('#characterLookupEvents');
    if(events){const rows=Array.isArray(data?.events)?data.events:[];events.innerHTML=rows.length?rows.map(row=>'<article><time>'+esc(formatServerTime(row.created_at||row.createdAt))+'</time><strong>'+esc(row.stage||row.event_type||row.eventType||'EVENT')+'</strong><span>'+esc(row.message||'')+'</span></article>').join(''):'<div class="admin-empty">아직 조회 이벤트가 없습니다.</div>';}
    const canControl=data?.canControl===true;
    const active=data?.active===true;
    const paused=data?.controlState==='paused';
    if($('#characterLookupStartBtn'))$('#characterLookupStartBtn').disabled=state.lookupStarting||active||roleLevel()<4;
    if($('#characterLookupPauseBtn'))$('#characterLookupPauseBtn').disabled=!canControl||!active||paused;
    if($('#characterLookupResumeBtn'))$('#characterLookupResumeBtn').disabled=!canControl||!active||!paused;
    if($('#characterLookupStopBtn'))$('#characterLookupStopBtn').disabled=!canControl||!active;
    if($('#characterLookupExtensionGuide'))$('#characterLookupExtensionGuide').hidden=!(data?.waitingExtension===true);
  }
  async function refreshCharacterLookupStatus(options={}){
    loadStoredLookupSession();
    try{
      const data=await adminLookup('status',{sessionId:state.lookupSessionId||null});
      if(!data||data.ok===false)throw new Error(data?.message||'조회 상태 확인 실패');
      if(data.sessionId&&!state.lookupSessionId)storeLookupSession(data.sessionId,state.lookupSessionToken);
      renderCharacterLookupConsole(data);
      if(data.active===true&&data.waitingExtension===true&&state.lookupSessionToken&&Date.now()-state.lookupHeartbeatAt>20000){
        state.lookupHeartbeatAt=Date.now();
        const p=data.progress?.progress||data.progress||{};
        adminLookup('heartbeat',{sessionId:data.sessionId,sessionToken:state.lookupSessionToken,current:Number(p.completedCount||0),total:Number(p.total||data.queueMeta?.queueCount||0)}).catch(()=>{});
      }
      if(options.statusLine!==false)setStatus('#characterLookupStatus',data.message||'조회 상태를 갱신했습니다.',data.active?'ok':'');
      return data;
    }catch(err){setStatus('#characterLookupStatus',err.message||String(err),'error');if(!state.lookupConsole)renderCharacterLookupConsole(null);return null;}
  }
  function startCharacterLookupPolling(){
    if(state.lookupPollTimer)return;
    state.lookupPollTimer=setInterval(()=>{if(state.tab==='characters'&&state.subtab==='lookup')refreshCharacterLookupStatus({statusLine:false});},3000);
  }
  async function loadCharacterLookupConsole(force){
    loadStoredLookupSession();
    if(roleLevel()<4){setStatus('#characterLookupStatus','Manager는 진행 상태만 확인할 수 있고 조회 시작·제어는 MASTER·SUB MASTER만 가능합니다.','');}
    await refreshCharacterLookupStatus({statusLine:force===true});
    startCharacterLookupPolling();
  }
  async function startCharacterLookup(){
    if(state.lookupStarting)return;
    if(roleLevel()<4){setStatus('#characterLookupStatus','조회 시작 권한은 MASTER·SUB MASTER에게만 있습니다.','error');return;}
    let lookupFilter;
    try{lookupFilter=readLookupFilter();}catch(err){setStatus('#characterLookupStatus',err.message||String(err),'error');return;}
    state.lookupStarting=true; renderCharacterLookupConsole(state.lookupConsole||null); setStatus('#characterLookupStatus','Server 조회 세션과 Target Queue를 준비하는 중입니다...','');
    try{
      const data=await adminLookup('start',{lookupFilter});
      if(!data||data.ok===false)throw new Error(data?.message||'조회 시작 실패');
      storeLookupSession(data.sessionId||'',data.sessionToken||'');
      if(data.noTargets===true){setStatus('#characterLookupStatus',data.lookupFilter?.lookupMode==='missing_only'?'신규 캐릭터가 없어 조회 없이 완료했습니다.':'조회 대상이 없습니다.','ok');}
      else{setStatus('#characterLookupStatus','Queue 준비 완료 · Extension에서 같은 PASS KEY로 조회 시작을 누르세요.','ok');toast('캐릭터 최신화 Queue를 준비했습니다.');}
      await refreshCharacterLookupStatus({statusLine:false});
    }catch(err){setStatus('#characterLookupStatus',err.message||String(err),'error');}
    finally{state.lookupStarting=false;renderCharacterLookupConsole(state.lookupConsole||null);}
  }
  async function controlCharacterLookup(command){
    const sessionId=state.lookupConsole?.sessionId||state.lookupSessionId;
    if(!sessionId){setStatus('#characterLookupStatus','제어할 조회 세션이 없습니다.','error');return;}
    if(command==='cancel'&&!confirm('현재 캐릭터 최신화 작업을 중단할까요? 미처리 Target은 남아 있어도 세션은 종료됩니다.'))return;
    try{
      setStatus('#characterLookupStatus',command==='pause'?'일시정지 요청 중...':command==='resume'?'재개 요청 중...':'중단 요청 중...','');
      const data=await adminLookup('control',{sessionId,command});
      if(!data||data.ok===false)throw new Error(data?.message||'작업 제어 실패');
      setStatus('#characterLookupStatus',data.message||'작업 상태를 변경했습니다.','ok');
      await refreshCharacterLookupStatus({statusLine:false});
    }catch(err){setStatus('#characterLookupStatus',err.message||String(err),'error');}
  }

  async function searchCharacters(){
    const search=$('#characterSearch')?.value||''; const include=$('#characterIncludeInactive')?.checked!==false;
    setStatus('#characterStatus','캐릭터 검색 중...','');
    try{const data=await adminCharacter('search',{search,includeInactive:include,limit:50});state.characters=data.characters||[];renderCharacters(state.characters);setStatus('#characterStatus','검색 결과 '+state.characters.length+'건','ok');}
    catch(err){setStatus('#characterStatus',err.message||String(err),'error');}
  }
  function renderCharacters(list){
    const root=$('#characterList');if(!root)return;
    root.innerHTML=list.length?list.map(c=>{const name=esc(c.characterName);const server=esc(c.serverName||c.serverId||'');const cls=esc(c.className||'');const active=c.isActive!==false;return '<article class="admin-row admin-character-row" data-character="'+name+'" data-character-id="'+Number(c.characterId||0)+'" data-server-id="'+esc(c.serverId||'')+'"><div class="admin-row-main"><strong>'+name+'</strong><span>'+server+' · '+cls+' · PVE '+Number(c.pvePower||0).toLocaleString('ko-KR')+' · PVP '+Number(c.pvpPower||0).toLocaleString('ko-KR')+'</span></div><div class="admin-row-actions"><span class="admin-pill '+(active?'ok':'error')+'">'+(active?'활성':'비활성')+'</span><button class="admin-btn danger" data-char-deactivate>탈퇴 처리</button><button class="admin-btn" data-char-restore>복구</button><button class="admin-btn" data-char-rename>이름변경</button></div></article>';}).join(''):'<div class="admin-empty">검색 결과가 없습니다.</div>';
  }
  async function handleCharacterAction(btn,cmd){
    const row=btn.closest('[data-character]'); const characterName=row?.dataset.character; const serverId=row?.dataset.serverId;
    const memo=$('#characterMemo')?.value||''; const reason=$('#characterReason')?.value||'탈퇴'; const newName=$('#characterNewName')?.value||'';
    if(cmd==='markRenamed'&&!newName.trim()){setStatus('#characterStatus','이름변경 시 새 캐릭터명을 입력하세요.','error');return;}
    btn.disabled=true;
    try{ const payload=cmd==='markRenamed'?{characterName,previousName:characterName,newName,serverId,memo}:{characterName,serverId,reason,memo}; const res=await adminCharacter(cmd,payload); if(res.ok===false)throw new Error(res.message||'처리 실패'); toast(res.message||'처리 완료'); await searchCharacters(); }
    catch(err){ setStatus('#characterStatus',err.message||String(err),'error'); btn.disabled=false; }
  }

  function countArray(data, keys){
    for(const k of keys){ if(Array.isArray(data?.[k])) return data[k].length; }
    return 0;
  }
  function summarizeSanctuary(data){
    const resultList=Array.isArray(data?.results)?data.results:[];
    const first=resultList[0]||null;
    const current=first||data||{};
    const summary=current.summary||current.parsedSummary||current.parsed_summary||{};
    const info = current.info || current.sanctuary || current.payload?.info || current;
    const totals=resultList.length?resultList.reduce((acc,row)=>{const s=row.summary||row.parsedSummary||row.parsed_summary||{};acc.teams+=Number(s.teamCount||s.team_count||0);acc.forces+=Number(s.forceCount||s.force_count||s.teamCount||s.team_count||0);acc.parties+=Number(s.partyCount||s.party_count||0);acc.slots+=Number(s.slotCount||s.slot_count||0);return acc;},{teams:0,forces:0,parties:0,slots:0}):null;
    const teams = totals?totals.teams:Number(summary.teamCount||summary.team_count||countArray(current,['teams','teamList'])||0);
    const forces = totals?totals.forces:Number(summary.forceCount||summary.force_count||countArray(current,['forces','forceList'])||teams);
    const parties = totals?totals.parties:Number(summary.partyCount||summary.party_count||countArray(current,['parties','partyList'])||0);
    const slots = totals?totals.slots:Number(summary.slotCount||summary.slot_count||countArray(current,['slots','slotList','members','characters'])||0);
    const updated = resultList.length?resultList.reduce((sum,row)=>sum+Number(row.result?.slots||row.updated||row.updatedCount||0),0):Number(summary.updated||summary.updatedCount||current.result?.slots||current.updated||current.updatedCount||current.synced||current.syncedCount||0);
    const failed = Array.isArray(data?.results)?data.results.filter(item=>item?.ok===false).length:Number(current.failed||current.failedCount||current.errorCount||0);
    const verificationRows=(resultList.length?resultList:[current]).map(row=>row?.verification||row?.result?.verification||{}).filter(row=>row&&Object.keys(row).length);
    const committedRows=verificationRows.filter(row=>row.committed===true);
    const verificationMatched=committedRows.length?committedRows.every(row=>row.matched===true):null;
    const expectedMembers=verificationRows.reduce((sum,row)=>sum+Number(row.expectedMembers||row.expected_members||0),0);
    const savedMembers=committedRows.reduce((sum,row)=>sum+Number(row.savedMembers||row.saved_members||0),0);
    const profileDiagnostic=data?.profileDiagnostic||data?.profile_diagnostic||null;
    let profileResolved=verificationRows.reduce((sum,row)=>sum+Number(row.profileResolved||row.profile_resolved||0),0);
    let profileMissing=verificationRows.reduce((sum,row)=>sum+Number(row.profileMissing||row.profile_missing||0),0);
    if(profileDiagnostic?.ok===true){profileResolved=Number(profileDiagnostic.profileResolved||profileDiagnostic.profile_resolved||0);profileMissing=Number(profileDiagnostic.profileMissing||profileDiagnostic.profile_missing||0)}
    const title = esc(resultList.length>1?'전체 성역':info.sanctuaryName || info.sanctuary_name || info.bossName || info.boss_name || current.sanctuaryName || current.sanctuaryId || '성역 동기화');
    return { title, teams, forces, parties, slots, updated, failed, verificationRows, committedRows, verificationMatched, expectedMembers, savedMembers, profileResolved, profileMissing, profileDiagnostic };
  }
  function profileCharacterKey(item){
    const server=String(item?.serverId||item?.server_id||'').trim();
    const name=String(item?.resolvedCharacterName||item?.resolved_character_name||item?.characterName||item?.character_name||'').trim().replace(/\[[^\]]+\]\s*$/,'').replace(/\s+/g,'').toLowerCase();
    return server+'|'+name;
  }
  function profileDiagnosticStats(diagnostic){
    const missingCharacters=Array.isArray(diagnostic?.profileMissingCharacters)?diagnostic.profileMissingCharacters:[];
    const slotMissing=Math.max(Number(diagnostic?.profileMissing||diagnostic?.profile_missing||0),missingCharacters.length);
    const uniqueMissing=new Set(missingCharacters.map(profileCharacterKey).filter(key=>key!=='|')).size;
    const reasonCounts={};
    missingCharacters.forEach(item=>{const reason=String(item.reason||'프로필 확인 필요');reasonCounts[reason]=(reasonCounts[reason]||0)+1;});
    return {missingCharacters,slotMissing,uniqueMissing,reasonCounts,profileResolved:Number(diagnostic?.profileResolved||diagnostic?.profile_resolved||0)};
  }
  function profileDiagnosticFailure(error,sanctuaryId){
    const missingModule=typeof window.KinojoSupabase?.adminSanctuaryProfileDiagnostic!=='function';
    const code=missingModule?'PROFILE_DIAGNOSTIC_ACTION_NOT_REGISTERED':String(error?.code||error?.data?.code||'PROFILE_DIAGNOSTIC_REQUEST_FAILED');
    const message=missingModule?'프로필 상세 진단 기능이 현재 WEB 모듈에 등록되지 않았습니다.':String(error?.message||error||'프로필 상세 진단 요청에 실패했습니다.');
    return {
      ok:false,
      code,
      message,
      sanctuaryId:String(sanctuaryId||'all'),
      supabaseVersion:String(window.KinojoSupabase?.version||'미확인'),
      apiVersion:String(window.KinojoApi?.version||'미확인'),
      detail:missingModule?'관리자 페이지와 kinojo-supabase.js가 서로 다른 버전으로 로드됐습니다. 강력 새로고침 후 다시 시도해 주세요.':'성역 동기화 결과는 유지되며 상세 진단만 다시 불러올 수 있습니다.'
    };
  }
  async function requestProfileDiagnostic(sanctuaryId){
    const id=String(sanctuaryId||'all').trim().toLowerCase()||'all';
    if(typeof window.KinojoSupabase?.adminSanctuaryProfileDiagnostic!=='function'){
      const error=new Error('프로필 상세 진단 기능이 현재 WEB 모듈에 등록되지 않았습니다.');
      error.code='PROFILE_DIAGNOSTIC_ACTION_NOT_REGISTERED';
      throw error;
    }
    const diagnostic=await action('adminSanctuaryProfileDiagnostic',{sanctuaryId:id});
    if(diagnostic?.ok===false){const error=new Error(diagnostic.message||'프로필 상세 진단 실패');error.code=diagnostic.code||'PROFILE_DIAGNOSTIC_RPC_FAILED';error.data=diagnostic;throw error;}
    return diagnostic;
  }
  function renderProfileDiagnostic(diagnostic,{open=false,sanctuaryId='all',context='sync'}={}){
    if(!diagnostic)return '';
    const retryId=String(diagnostic.sanctuaryId||sanctuaryId||'all');
    if(diagnostic.ok===false){
      const moduleMissing=diagnostic.code==='PROFILE_DIAGNOSTIC_ACTION_NOT_REGISTERED'||/등록되지 않았/.test(String(diagnostic.message||''));
      const cause=moduleMissing?'관리자 WEB 모듈 버전 불일치':'프로필 진단 RPC 호출 실패';
      return '<section class="admin-profile-diagnostic-error"><strong>성역 동기화는 정상 완료되었습니다.</strong><p>프로필 이미지 확인 필요 대상의 상세 목록만 불러오지 못했습니다.</p><dl><div><dt>원인</dt><dd>'+esc(cause)+'</dd></div><div><dt>상세</dt><dd>'+esc(diagnostic.message||'진단 요청 실패')+'</dd></div></dl><div class="admin-profile-diagnostic-actions"><button class="admin-btn" type="button" data-profile-diagnostic-retry data-sanctuary-id="'+esc(retryId)+'" data-diagnostic-context="'+esc(context)+'">상세 진단 다시 불러오기</button><small>Supabase '+esc(diagnostic.supabaseVersion||window.KinojoSupabase?.version||'미확인')+' · API '+esc(diagnostic.apiVersion||window.KinojoApi?.version||'미확인')+'</small></div></section>';
    }
    const stats=profileDiagnosticStats(diagnostic);
    if(!stats.slotMissing)return '<div class="admin-profile-diagnostic-ok"><strong>프로필 이미지 연결 확인 완료</strong><span>'+stats.profileResolved.toLocaleString('ko-KR')+'개 슬롯 모두 정상</span></div>';
    const reasonSummary=Object.entries(stats.reasonCounts).sort((a,b)=>b[1]-a[1]).map(([reason,count])=>'<span>'+esc(reason)+' '+count+'개</span>').join('');
    const missingRows=stats.missingCharacters.map(item=>{
      const location=[item.sanctuaryName||item.sanctuaryId||'',item.teamGroupNo?item.teamGroupNo+'팀':'',item.forceNo?item.forceNo+'포스':'',item.partyNo?item.partyNo+'파티':'',item.slotNo?item.slotNo+'번 슬롯':''].filter(Boolean).join(' · ');
      const server=[item.serverName||'',item.serverId||''].filter(Boolean).join(' ');
      const status=[item.identityStatus||'',item.masterMatchStatus||''].filter(Boolean).join(' / ');
      return '<article class="admin-profile-missing-row"><div class="admin-profile-missing-main"><div class="admin-profile-missing-title"><strong>'+esc(item.characterName||'-')+'</strong><em>'+esc(item.reason||'프로필 확인 필요')+'</em></div><span>'+esc([item.className||'직업 미확인',server||'서버 미확인'].join(' · '))+'</span><span>'+esc(location||'위치 미확인')+'</span><small>'+esc(status||'상태 정보 없음')+'</small></div></article>';
    }).join('');
    return '<details class="admin-profile-diagnostic"'+(open?' open':'')+'><summary><strong>프로필 이미지 확인 필요</strong><span>'+stats.slotMissing+'개 슬롯 · 고유 캐릭터 '+stats.uniqueMissing+'명 · 정상 '+stats.profileResolved.toLocaleString('ko-KR')+'개</span></summary><div class="admin-profile-reason-summary">'+reasonSummary+'</div><div class="admin-profile-missing-list">'+missingRows+'</div></details>';
  }
  function renderSyncReport(data){
    const s = summarizeSanctuary(data||{});
    const ok = data?.ok !== false;
    const diagStats=s.profileDiagnostic?.ok===true?profileDiagnosticStats(s.profileDiagnostic):null;
    const profileText=s.verificationRows.length?(s.profileResolved+'개 슬롯 정상 · '+s.profileMissing+'개 슬롯 확인 필요'+(diagStats&&diagStats.slotMissing?' · 고유 캐릭터 '+diagStats.uniqueMissing+'명':'')):'-';
    const rows = [
      ['대상', s.title],
      ['포스', s.forces ? s.forces+'개' : '-'],
      ['파티', s.parties ? s.parties+'개' : '-'],
      ['슬롯/캐릭터', s.slots ? s.slots+'명' : '-'],
      ['반영', s.updated ? s.updated+'건' : '-'],
      ['저장 재검증', s.committedRows.length?(s.verificationMatched?s.savedMembers+'명 일치':'불일치'):(s.verificationRows.length?'미리보기 · 미반영':'-')],
      ['프로필 이미지 연결', profileText],
      ['실패', s.failed ? s.failed+'건' : '0건']
    ].map(([k,v])=>'<div class="admin-report-row"><span>'+k+'</span><strong>'+esc(v)+'</strong></div>').join('');
    const completedAt=data?.completedAt||data?.completed_at||data?.generatedAt||data?.generated_at||new Date().toISOString();
    const diagnosticHtml=renderProfileDiagnostic(s.profileDiagnostic,{open:true,sanctuaryId:state.lastSanctuaryId||'all',context:'sync'});
    return '<section class="admin-sync-report '+(ok?'ok':'error')+'"><div class="admin-report-head"><strong>'+(ok?(data?.mode==='preview'?'변경 미리보기 완료':'동기화 완료'):'동기화 확인 필요')+'</strong><span>'+esc(new Date(completedAt).toLocaleString('ko-KR'))+'</span></div><div class="admin-report-grid">'+rows+'</div>'+diagnosticHtml+'<details class="admin-report-raw"><summary>서버 응답 보기</summary><pre>'+esc(JSON.stringify(data,null,2))+'</pre></details></section>';
  }
  async function retryProfileDiagnostic(button){
    const id=String(button?.dataset?.sanctuaryId||state.lastSanctuaryId||'all');
    const context=String(button?.dataset?.diagnosticContext||'sync');
    if(button){button.disabled=true;button.textContent='진단 불러오는 중...';}
    try{
      const diagnostic=await requestProfileDiagnostic(id);
      if(context==='status'&&state.lastSanctuaryStatusData){state.lastSanctuaryStatusData.profileDiagnostic=diagnostic;renderSanctuarySyncStatus(state.lastSanctuaryStatusData);}
      else if(state.lastSanctuarySyncData){state.lastSanctuarySyncData.profileDiagnostic=diagnostic;$('#sanctuarySyncResult').innerHTML=renderSyncReport(state.lastSanctuarySyncData);}
      else await loadSanctuarySyncConsole(true);
      setStatus('#sanctuarySyncStatus','프로필 상세 진단을 다시 불러왔습니다.','ok');
    }catch(error){
      const failure=profileDiagnosticFailure(error,id);
      if(context==='status'&&state.lastSanctuaryStatusData){state.lastSanctuaryStatusData.profileDiagnostic=failure;renderSanctuarySyncStatus(state.lastSanctuaryStatusData);}
      else if(state.lastSanctuarySyncData){state.lastSanctuarySyncData.profileDiagnostic=failure;$('#sanctuarySyncResult').innerHTML=renderSyncReport(state.lastSanctuarySyncData);}
      setStatus('#sanctuarySyncStatus','성역 동기화 결과는 유지됐지만 프로필 상세 진단을 불러오지 못했습니다.','ok');
    }finally{if(button){button.disabled=false;button.textContent='상세 진단 다시 불러오기';}}
  }
  async function testWebAppConnection(statusTarget){
    const statusSel = statusTarget || '#serverStatus';
    setStatus(statusSel,'Server Engine을 통한 Apps Script Bridge 연결 테스트 중...','');
    try{
      const res=await action('adminSanctuarySheetSync',{mode:'ping'});
      if(res?.ok===false)throw new Error(res.message||'Bridge 연결 실패');
      const msg=res?.message||'AppsScript_MASTER 브릿지 정상';
      setStatus(statusSel,'Apps Script Bridge 연결 확인: '+msg,'ok');
      addLog('BRIDGE','Apps Script 연결 테스트 성공');
      refreshServerStatus();
    }catch(err){ setStatus(statusSel,'Apps Script Bridge 연결 실패: '+(err.message||err),'error'); addLog('ERROR',err.message||err); }
  }
  function setSyncStep(n,complete=false){ $$('.admin-sync-step').forEach((el,i)=>{ el.classList.toggle('done',complete||i<n-1); el.classList.toggle('active',!complete&&i===n-1); }); }
  function formatServerTime(value){
    if(!value)return '기록 없음';
    const date=new Date(value);
    return Number.isNaN(date.getTime())?String(value):date.toLocaleString('ko-KR');
  }
  function renderSanctuarySyncStatus(data){
    state.lastSanctuaryStatusData=data;
    const root=$('#sanctuarySyncResult'); if(!root)return;
    const jobs=Array.isArray(data?.jobs)?data.jobs:[];
    const queue=data?.queue||{};
    const latest=data?.recentSync||data?.recent_sync||jobs[0]||{};
    const rows=jobs.slice(0,8).map(job=>{const verification=job.verification||{};const verified=verification.matched===true?' · 저장 재검증 완료':'';return '<article class="admin-row"><div class="admin-row-main"><strong>'+esc(job.sanctuaryName||job.sanctuary_name||job.sanctuaryId||job.sanctuary_id||'-')+'</strong><span>'+esc(formatServerTime(job.completedAt||job.completed_at||job.createdAt||job.created_at))+' · '+esc(job.mode||'-')+verified+'</span></div><div class="admin-row-actions"><span class="admin-pill '+(String(job.status||'').toLowerCase()==='completed'?'ok':String(job.status||'').toLowerCase()==='failed'?'error':'pending')+'">'+esc(job.status||'대기')+'</span></div></article>'}).join('');
    root.innerHTML='<section class="admin-sync-report"><div class="admin-report-head"><strong>Server Engine 동기화 상태</strong><span>'+esc(formatServerTime(data?.generatedAt||data?.generated_at))+'</span></div><div class="admin-report-grid"><div class="admin-report-row"><span>최근 완료</span><strong>'+esc(formatServerTime(latest.completedAt||latest.completed_at))+'</strong></div><div class="admin-report-row"><span>Updater Queue</span><strong>'+Number(queue.updaterActive||queue.updater_active||0).toLocaleString('ko-KR')+'건</strong></div><div class="admin-report-row"><span>List Queue</span><strong>'+Number(queue.listPending||queue.list_pending||0).toLocaleString('ko-KR')+'건</strong></div><div class="admin-report-row"><span>성역 Queue</span><strong>'+Number(queue.sanctuaryPending||queue.sanctuary_pending||0).toLocaleString('ko-KR')+'건</strong></div></div>'+renderProfileDiagnostic(data?.profileDiagnostic,{open:false,sanctuaryId:'all',context:'status'})+'</section>'+(rows?'<div class="admin-list">'+rows+'</div>':'<div class="admin-empty">아직 성역 시트 동기화 기록이 없습니다.</div>');
  }
  async function loadSanctuarySyncConsole(force){
    if(force)setSyncStep(1);
    setStatus('#sanctuarySyncStatus','Server Engine 동기화 상태를 불러오는 중...','');
    try{
      const [data,profileDiagnostic]=await Promise.all([
        action('adminSanctuarySheetSync',{mode:'status'}),
        requestProfileDiagnostic('all').catch(error=>profileDiagnosticFailure(error,'all'))
      ]);
      if(data?.ok===false)throw new Error(data.message||'동기화 상태 조회 실패');
      data.profileDiagnostic=profileDiagnostic;
      renderSanctuarySyncStatus(data);
      setStatus('#sanctuarySyncStatus','Server Engine 상태를 불러왔습니다.','ok');
    }catch(err){setStatus('#sanctuarySyncStatus',err.message||String(err),'error');}
  }
  async function runSanctuaryPreview(){
    const id=$('#sanctuarySyncId')?.value||'all'; const btn=$('#sanctuaryPreviewBtn'); btn&&(btn.disabled=true); setSyncStep(1); setStatus('#sanctuarySyncStatus','Apps Script에서 원본 시트를 읽는 중...','');
    try{
      const data=await action('adminSanctuarySheetSync',{mode:'preview',sanctuaryId:id});
      if(data?.ok===false)throw new Error(data.message||'성역 변경 미리보기 실패');
      setSyncStep(2); setStatus('#sanctuarySyncStatus','Server Engine 변경 미리보기 완료','ok');
      state.lastSanctuaryId=id; state.lastSanctuarySyncData=data; $('#sanctuarySyncResult').innerHTML=renderSyncReport(data); addLog('SANCTUARY','성역 변경 미리보기 완료');
    }catch(err){setStatus('#sanctuarySyncStatus',err.message||String(err),'error');addLog('ERROR',err.message||err);}
    finally{btn&&(btn.disabled=false);}
  }
  async function runSanctuarySync(){
    const id=$('#sanctuarySyncId')?.value||'all'; const btn=$('#sanctuarySyncBtn'); btn&&(btn.disabled=true); setSyncStep(1); setStatus('#sanctuarySyncStatus','성역 시트를 읽는 중...','');
    try{
      setSyncStep(2); setStatus('#sanctuarySyncStatus','Server Engine에서 원본을 파싱·검증하고 반영하는 중...','');
      const data=await action('adminSanctuarySheetSync',{mode:'apply',sanctuaryId:id});
      if(data.ok===false) throw new Error(data.message||'성역 동기화 실패');
      setSyncStep(3); setStatus('#sanctuarySyncStatus','Server Engine 저장 결과와 프로필 미확인 대상을 확인하는 중...','');
      try{
        const diagnostic=await requestProfileDiagnostic(id);
        data.profileDiagnostic=diagnostic;
      }catch(diagnosticError){data.profileDiagnostic=profileDiagnosticFailure(diagnosticError,id)}
      state.lastSanctuaryId=id; state.lastSanctuarySyncData=data;
      setSyncStep(4,true); setStatus('#sanctuarySyncStatus',data.profileDiagnostic?.ok===true?'성역 동기화 및 프로필 진단 완료':'성역 동기화 완료 · 프로필 상세 진단만 다시 확인해 주세요.','ok'); $('#sanctuarySyncResult').innerHTML=renderSyncReport(data); addLog('SANCTUARY','성역 동기화 및 프로필 진단 완료'); await Promise.all([refreshDashboard(),refreshServerStatus()]);
    }catch(err){
      const msg=err.message||String(err);
      setStatus('#sanctuarySyncStatus',msg,'error');
      addLog('ERROR',msg);
    }
    finally{ btn&&(btn.disabled=false); }
  }

  function dateTimeLocalValue(value){
    if(!value) return '';
    const date=new Date(value);
    if(Number.isNaN(date.getTime())) return '';
    const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
    return local.toISOString().slice(0,16);
  }
  function selectedSanctuaryMaster(){
    const code=String($('#sanctuaryScheduleCode')?.value||'').toLowerCase();
    return (state.sanctuaryMasters||[]).find(item=>String(item.code||'').toLowerCase()===code)||null;
  }
  function selectedScheduleMode(){
    return String($('input[name="sanctuaryScheduleMode"]:checked')?.value||'fixed');
  }
  function fillSanctuaryScheduleSelects(){
    const editor=$('#sanctuaryScheduleCode');
    if(!editor)return;
    const previous=editor.value||'';
    const rows=state.sanctuaryMasters||[];
    editor.innerHTML='<option value="">성역 선택</option>'+rows.map(item=>'<option value="'+esc(item.code)+'">'+esc(item.name||item.shortName||item.code)+'</option>').join('');
    editor.value=rows.some(item=>String(item.code)===previous)?previous:'';
  }
  function renderSanctuaryTeamSelect(selectedTeamNo){
    const select=$('#sanctuaryScheduleTeam');
    if(!select)return;
    const teams=Array.isArray(selectedSanctuaryMaster()?.teams)?selectedSanctuaryMaster().teams:[];
    select.innerHTML='<option value="">팀 선택</option>'+teams.map(team=>'<option value="'+esc(team.teamNo)+'">'+esc(team.teamName||team.teamNo+'팀')+'</option>').join('');
    const selected=Number(selectedTeamNo||0);
    select.value=teams.some(team=>Number(team.teamNo)===selected)?String(selected):'';
  }
  function applySanctuaryScheduleMode(mode){
    const value=mode==='vote'?'vote':'fixed';
    const radio=$('input[name="sanctuaryScheduleMode"][value="'+value+'"]');
    if(radio)radio.checked=true;
    const field=$('#sanctuaryScheduleDeadlineField');
    const input=$('#sanctuaryScheduleDeadline');
    const vote=value==='vote';
    field?.classList.toggle('is-hidden',!vote);
    if(input){input.disabled=!vote;if(!vote)input.value='';}
    updateSanctuaryScheduleSaveState();
  }
  function updateSanctuaryScheduleSaveState(){
    const button=$('#sanctuaryScheduleSaveBtn');
    if(!button)return;
    const ready=!!String($('#sanctuaryScheduleCode')?.value||'').trim()
      && !!Number($('#sanctuaryScheduleTeam')?.value||0)
      && !!String($('#sanctuaryScheduleStartsAt')?.value||'').trim();
    button.disabled=!ready||state.sanctuaryScheduleSaving===true;
  }
  function resetSanctuaryScheduleEditor(schedule){
    const item=schedule||null;
    const editing=!!item;
    $('#sanctuaryScheduleId') && ($('#sanctuaryScheduleId').value=item?.id||'');
    $('#sanctuaryScheduleEditorTitle') && ($('#sanctuaryScheduleEditorTitle').textContent=editing?'일정 변경':'새 일정 등록');
    const code=String(item?.sanctuaryCode||'');
    if($('#sanctuaryScheduleCode')){
      $('#sanctuaryScheduleCode').disabled=editing;
      $('#sanctuaryScheduleCode').value=code;
    }
    renderSanctuaryTeamSelect(item?.teams?.[0]?.teamNo||item?.teams?.[0]?.operatingTeamNo||'');
    $('#sanctuaryScheduleStartsAt') && ($('#sanctuaryScheduleStartsAt').value=dateTimeLocalValue(item?.startsAt));
    $('#sanctuaryScheduleLocation') && ($('#sanctuaryScheduleLocation').value=String(item?.location||''));
    $('#sanctuaryScheduleDeadline') && ($('#sanctuaryScheduleDeadline').value=dateTimeLocalValue(item?.responseDeadline));
    $('#sanctuaryScheduleDescription') && ($('#sanctuaryScheduleDescription').value=String(item?.description||''));
    applySanctuaryScheduleMode(item?.scheduleMode||((item?.requiresResponse||['survey','coordinating'].includes(String(item?.status||'')))?'vote':'fixed'));
    updateSanctuaryScheduleSaveState();
  }
  function sanctuaryScheduleRowHtml(item){
    const status=esc(item.effectiveStatus||item.status||'survey');
    const team=item?.teams?.[0]||{};
    const teamText=String(team.teamName||team.teamNo&&team.teamNo+'팀'||'팀 미확인');
    const modeLabel=item.requiresResponse?'투표 필요':'일정 확정';
    const time=item.startTime||'시간 미정';
    const canConfirm=item.requiresResponse&&!['canceled','completed','confirmed'].includes(String(item.effectiveStatus||item.status||''));
    return '<article class="admin-schedule-row" data-sanctuary-schedule-id="'+esc(item.id)+'">'
      +'<div class="admin-schedule-row-main"><div><span class="admin-pill schedule-'+status+'">'+esc(modeLabel)+'</span><strong>'+esc(item.sanctuaryName||item.sanctuaryShortName||'성역')+' · '+esc(teamText)+'</strong></div><p>'+esc(item.dateLabel||item.targetDate)+' · '+esc(time)+(item.location?' · '+esc(item.location):'')+'</p></div>'
      +'<div class="admin-schedule-row-actions"><button class="admin-btn" type="button" data-schedule-edit>변경</button>'+(canConfirm?'<button class="admin-btn primary" type="button" data-schedule-status="confirmed">확정</button>':'')+'<button class="admin-btn danger" type="button" data-schedule-status="canceled">취소</button><button class="admin-btn" type="button" data-schedule-status="completed">완료</button></div></article>';
  }
  function renderSanctuaryScheduleList(){
    const root=$('#sanctuaryScheduleList');
    if(!root)return;
    const rows=state.sanctuarySchedules||[];
    root.innerHTML=rows.length?rows.map(sanctuaryScheduleRowHtml).join(''):'<div class="admin-empty">현재 아이온 주간에 등록된 성역 일정이 없습니다.</div>';
  }
  async function loadSanctuaryScheduleConsole(force){
    if(state.tab!=='sanctuary'&&!force)return;
    setStatus('#sanctuaryScheduleAdminStatus','성역 일정과 팀 구성을 불러오는 중...','');
    try{
      const data=await action('adminSanctuaryScheduleConsole',{});
      if(!data||data.ok===false)throw new Error(data?.message||'성역 일정 조회 실패');
      state.sanctuaryMasters=Array.isArray(data.sanctuaries)?data.sanctuaries:[];
      state.sanctuarySchedules=Array.isArray(data.schedules)?data.schedules:[];
      state.sanctuaryScheduleAccess=data.access&&typeof data.access==='object'?data.access:null;
      state.sanctuaryConsoleToday=String(data.today||todayDateInputValue());
      state.sanctuaryScheduleLoaded=true;
      fillSanctuaryScheduleSelects();
      renderSanctuaryScheduleList();
      if(!$('#sanctuaryScheduleId')?.value)resetSanctuaryScheduleEditor(null);
      setStatus('#sanctuaryScheduleAdminStatus',(state.sanctuaryScheduleAccess?.canManageAll?'전체 팀 관리':'담당 팀 관리')+' · 성역 일정 '+state.sanctuarySchedules.length+'건 · 아이온 주간 '+esc(data.aionWeekStart)+' ~ '+esc(data.aionWeekEnd),'ok');
    }catch(err){setStatus('#sanctuaryScheduleAdminStatus',err.message||String(err),'error');}
  }
  function sanctuaryScheduleById(id){return (state.sanctuarySchedules||[]).find(item=>Number(item.id)===Number(id))||null;}
  function collectSanctuarySchedulePayload(){
    const startsAt=$('#sanctuaryScheduleStartsAt')?.value||'';
    const deadline=$('#sanctuaryScheduleDeadline')?.value||'';
    const teamNo=Number($('#sanctuaryScheduleTeam')?.value||0)||null;
    const mode=selectedScheduleMode();
    return {
      sanctuaryCode:String($('#sanctuaryScheduleCode')?.value||''),
      scheduleMode:mode,
      startsAt:startsAt?new Date(startsAt).toISOString():null,
      responseDeadline:mode==='vote'&&deadline?new Date(deadline).toISOString():null,
      description:String($('#sanctuaryScheduleDescription')?.value||''),
      location:String($('#sanctuaryScheduleLocation')?.value||''),
      teams:teamNo?[{teamNo}]:[]
    };
  }
  async function saveSanctuarySchedule(){
    const button=$('#sanctuaryScheduleSaveBtn');
    const payload=collectSanctuarySchedulePayload();
    if(!payload.sanctuaryCode||payload.teams.length!==1||!payload.startsAt){setStatus('#sanctuaryScheduleAdminStatus','성역, 팀, 날짜 및 시작 시간을 모두 선택하세요.','error');return;}
    state.sanctuaryScheduleSaving=true;
    updateSanctuaryScheduleSaveState();
    try{
      const scheduleId=Number($('#sanctuaryScheduleId')?.value||0)||null;
      const data=await action('adminSanctuaryScheduleSave',{scheduleId,payload});
      if(!data||data.ok===false)throw new Error(data?.message||'일정 저장 실패');
      toast(scheduleId?'성역 일정이 변경되었습니다.':'성역 일정이 등록되었습니다.');
      addLog('SANCTUARY_SCHEDULE',scheduleId?'일정 변경':'일정 등록');
      resetSanctuaryScheduleEditor(null);
      await loadSanctuaryScheduleConsole(true);
      window.KinojoCommonUI?.reloadSanctuaryAlert?.();
    }catch(err){setStatus('#sanctuaryScheduleAdminStatus',err.message||String(err),'error');}
    finally{state.sanctuaryScheduleSaving=false;updateSanctuaryScheduleSaveState();}
  }
  async function changeSanctuaryScheduleStatus(scheduleId,status){
    let reason='';
    if(status==='canceled'){reason=prompt('취소 사유를 입력하세요.','')||'';if(!reason.trim())return;}
    try{
      const data=await action('adminSanctuaryScheduleStatus',{scheduleId,status,reason});
      if(!data||data.ok===false)throw new Error(data?.message||'일정 상태 변경 실패');
      toast('성역 일정 상태가 변경되었습니다.');
      addLog('SANCTUARY_SCHEDULE_STATUS',scheduleId+' → '+status);
      resetSanctuaryScheduleEditor(null);
      await loadSanctuaryScheduleConsole(true);
      window.KinojoCommonUI?.reloadSanctuaryAlert?.();
    }catch(err){setStatus('#sanctuaryScheduleAdminStatus',err.message||String(err),'error');}
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

  const METER_NOTICE_LABELS={INFO:'안내',UPDATE:'업데이트',MAINTENANCE:'점검',WARNING:'주의'};
  function meterDateInput(value){
    const date=value?new Date(value):new Date();
    if(Number.isNaN(date.getTime()))return '';
    const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
    return local.toISOString().slice(0,16);
  }
  function meterIsoFromInput(value){
    const raw=String(value||'').trim();
    if(!raw)return null;
    const date=new Date(raw);
    return Number.isNaN(date.getTime())?null:date.toISOString();
  }
  function meterFileSize(value){
    const bytes=Number(value||0);
    if(!Number.isFinite(bytes)||bytes<=0)return '-';
    return bytes>=1048576?(bytes/1048576).toFixed(2)+' MB':Math.trunc(bytes).toLocaleString('ko-KR')+' bytes';
  }
  function normalizeMeterNotice(row){
    return {
      noticeId:Number(row?.noticeId||row?.notice_id||0),
      noticeType:String(row?.noticeType||row?.notice_type||'INFO').toUpperCase(),
      title:String(row?.title||''),
      content:String(row?.content||''),
      isPublished:row?.isPublished===true||row?.is_published===true,
      isPinned:row?.isPinned===true||row?.is_pinned===true,
      startsAt:row?.startsAt||row?.starts_at||'',
      endsAt:row?.endsAt||row?.ends_at||'',
      updatedAt:row?.updatedAt||row?.updated_at||''
    };
  }
  function meterNoticeById(id){
    const key=Number(id||0);
    return state.meterNotices.find(item=>item.noticeId===key)||null;
  }
  function resetMeterNoticeEditor(notice){
    const item=notice||null;
    $('#meterAdminNoticeId').value=item?String(item.noticeId):'';
    $('#meterAdminNoticeType').value=item?.noticeType||'INFO';
    $('#meterAdminNoticeTitle').value=item?.title||'';
    $('#meterAdminNoticeContent').value=item?.content||'';
    $('#meterAdminNoticeStartsAt').value=meterDateInput(item?.startsAt||new Date());
    $('#meterAdminNoticeEndsAt').value=item?.endsAt?meterDateInput(item.endsAt):'';
    $('#meterAdminNoticePublished').checked=item?item.isPublished:true;
    $('#meterAdminNoticePinned').checked=item?item.isPinned:false;
    setStatus('#meterAdminNoticeStatus',item?'선택한 공지를 수정합니다.':'새 공지를 작성합니다.','');
  }
  function renderMeterNotices(){
    const root=$('#meterAdminNoticeList'); if(!root)return;
    if(!state.meterNotices.length){root.innerHTML='<div class="admin-empty">등록된 키노조 미터 공지가 없습니다.</div>';return;}
    root.innerHTML=state.meterNotices.map(item=>{
      const type=METER_NOTICE_LABELS[item.noticeType]||'안내';
      const range=item.endsAt?formatServerTime(item.startsAt)+' ~ '+formatServerTime(item.endsAt):formatServerTime(item.startsAt)+'부터';
      return '<article class="admin-meter-notice-row '+(item.isPublished?'':'is-unpublished')+'" data-meter-notice-id="'+item.noticeId+'">'+
        '<div class="admin-meter-notice-row-head"><div><span class="admin-meter-notice-tone '+esc(item.noticeType)+'">'+esc(type)+'</span>'+(item.isPinned?'<span class="admin-pill info">고정</span>':'')+(item.isPublished?'<span class="admin-pill ok">게시</span>':'<span class="admin-pill">비게시</span>')+'</div><small>'+esc(formatServerTime(item.updatedAt))+'</small></div>'+
        '<h3>'+esc(item.title)+'</h3><p>'+esc(item.content)+'</p><div class="admin-meter-notice-meta"><span>'+esc(range)+'</span></div>'+
        '<div class="admin-meter-notice-actions"><button class="admin-btn" type="button" data-meter-notice-edit>수정</button><button class="admin-btn danger" type="button" data-meter-notice-delete>삭제</button></div></article>';
    }).join('');
  }
  function renderMeterAdminConsole(data){
    state.meterConsole=data||{};
    const operation=data?.operation||{};
    state.meterNotices=(Array.isArray(data?.notices)?data.notices:[]).map(normalizeMeterNotice);
    const enabled=operation.downloadEnabled===true;
    $('#meterAdminDownloadEnabled').checked=enabled;
    $('#meterAdminDisabledMessage').value=String(operation.disabledMessage||'키노조 미터 다운로드를 점검하고 있습니다. 잠시 후 다시 시도해 주세요.');
    $('#meterAdminResumeAt').value=operation.resumeAt?meterDateInput(operation.resumeAt):'';
    const badge=$('#meterAdminOperationBadge');
    badge.textContent=enabled?'다운로드 ON':'점검 중 · OFF';
    badge.classList.toggle('is-off',!enabled);
    const release=data?.release?.desktopUpdate||null;
    $('#meterAdminReleaseVersion').textContent=release?.version||'-';
    $('#meterAdminReleaseFile').textContent=release?.fileName||'-';
    $('#meterAdminReleaseSize').textContent=meterFileSize(release?.fileSize);
    $('#meterAdminReleasePublished').textContent=formatServerTime(release?.publishedAt);
    $('#meterAdminReleaseState').textContent=data?.release?.releaseAvailable===true?(enabled?'다운로드 가능':'운영 점검 중'):'활성 릴리스 없음';
    renderMeterNotices();
  }
  async function loadMeterAdminConsole(){
    if(!isMaster())return;
    setStatus('#meterAdminOperationStatus','키노조 미터 운영 정보를 불러오는 중...','');
    try{
      const data=await adminMeter('console',{channel:'stable'});
      if(!data||data.ok===false)throw new Error(data?.message||'키노조 미터 운영 정보 조회 실패');
      renderMeterAdminConsole(data);
      if(!$('#meterAdminNoticeId').value)resetMeterNoticeEditor(null);
      setStatus('#meterAdminOperationStatus','Server 운영 정보를 불러왔습니다.','ok');
    }catch(err){setStatus('#meterAdminOperationStatus',err.message||String(err),'error');}
  }
  async function saveMeterOperation(){
    if(!isMaster())return;
    const enabled=$('#meterAdminDownloadEnabled').checked;
    const disabledMessage=$('#meterAdminDisabledMessage').value.trim();
    if(!disabledMessage){setStatus('#meterAdminOperationStatus','비활성화 안내 문구를 입력하세요.','error');return;}
    const prompt=enabled?'키노조 미터 다운로드를 활성화할까요?':'다운로드를 즉시 점검 중으로 전환하고 Server 승인을 차단할까요?';
    if(!confirm(prompt))return;
    const button=$('#meterAdminOperationSaveBtn');button.disabled=true;
    setStatus('#meterAdminOperationStatus','운영 상태를 저장하는 중...','');
    try{
      const data=await adminMeter('saveOperation',{
        channel:'stable',
        downloadEnabled:enabled,
        disabledMessage,
        resumeAt:enabled?null:meterIsoFromInput($('#meterAdminResumeAt').value)
      });
      if(!data||data.ok===false)throw new Error(data?.message||'운영 상태 저장 실패');
      renderMeterAdminConsole(data);
      setStatus('#meterAdminOperationStatus',data.message||'운영 상태를 저장했습니다.','ok');
      toast(data.message||'키노조 미터 운영 상태 저장 완료');
      addLog('METER',enabled?'다운로드 활성화':'다운로드 점검 전환');
    }catch(err){setStatus('#meterAdminOperationStatus',err.message||String(err),'error');}
    finally{button.disabled=false;}
  }
  async function saveMeterNotice(){
    if(!isMaster())return;
    const title=$('#meterAdminNoticeTitle').value.trim();
    const content=$('#meterAdminNoticeContent').value.trim();
    if(!title||!content){setStatus('#meterAdminNoticeStatus','공지 제목과 내용을 모두 입력하세요.','error');return;}
    const startsAt=meterIsoFromInput($('#meterAdminNoticeStartsAt').value);
    const endsAt=meterIsoFromInput($('#meterAdminNoticeEndsAt').value);
    if(!startsAt){setStatus('#meterAdminNoticeStatus','게시 시작 시각을 확인하세요.','error');return;}
    if(endsAt&&Date.parse(endsAt)<=Date.parse(startsAt)){setStatus('#meterAdminNoticeStatus','게시 종료는 시작보다 늦어야 합니다.','error');return;}
    const button=$('#meterAdminNoticeSaveBtn');button.disabled=true;
    setStatus('#meterAdminNoticeStatus','키노조 미터 공지를 저장하는 중...','');
    try{
      const data=await adminMeter('saveNotice',{
        noticeId:Number($('#meterAdminNoticeId').value||0)||null,
        noticeType:$('#meterAdminNoticeType').value,
        title,
        content,
        isPublished:$('#meterAdminNoticePublished').checked,
        isPinned:$('#meterAdminNoticePinned').checked,
        startsAt,
        endsAt
      });
      if(!data||data.ok===false)throw new Error(data?.message||'Meter 공지 저장 실패');
      renderMeterAdminConsole(data);
      resetMeterNoticeEditor(null);
      setStatus('#meterAdminNoticeStatus',data.message||'키노조 미터 공지를 저장했습니다.','ok');
      toast('키노조 미터 공지 저장 완료');
    }catch(err){setStatus('#meterAdminNoticeStatus',err.message||String(err),'error');}
    finally{button.disabled=false;}
  }
  async function deleteMeterNotice(id){
    const item=meterNoticeById(id);if(!item)return;
    if(!confirm('키노조 미터 공지 "'+item.title+'"을 삭제할까요?'))return;
    setStatus('#meterAdminNoticeStatus','공지 삭제 중...','');
    try{
      const data=await adminMeter('deleteNotice',{noticeId:item.noticeId});
      if(!data||data.ok===false)throw new Error(data?.message||'Meter 공지 삭제 실패');
      renderMeterAdminConsole(data);
      resetMeterNoticeEditor(null);
      setStatus('#meterAdminNoticeStatus',data.message||'공지를 삭제했습니다.','ok');
    }catch(err){setStatus('#meterAdminNoticeStatus',err.message||String(err),'error');}
  }

  async function refreshServerStatus(){
    try{
      const [runtime,sync]=await Promise.all([action('runtimeStatus',{}),action('adminSanctuarySheetSync',{mode:'status'})]);
      renderServerBox(runtime,sync); addLog('SERVER','서버 상태 새로고침');
    }catch(err){ addLog('ERROR',err.message||err); }
  }
  function renderServerBox(data,syncData={}){
    const roots=$$('[data-server-status-box]'); if(!roots.length)return;
    const queue=syncData.queue||{};
    const recent=syncData.recentSync||syncData.recent_sync||{};
    const queueTotal=Number(queue.updaterActive||queue.updater_active||0)+Number(queue.listPending||queue.list_pending||0)+Number(queue.sanctuaryPending||queue.sanctuary_pending||0);
    const html='<div class="admin-system-list"><div class="admin-system-item"><span><i class="admin-dot"></i>Supabase DB</span><strong>'+(syncData?.ok===false?'확인 필요':'정상')+'</strong></div><div class="admin-system-item"><span><i class="admin-dot"></i>RPC / Edge Functions</span><strong>'+(data?.ok===false?'확인 필요':'정상')+'</strong></div><div class="admin-system-item"><span><i class="admin-dot"></i>Updater Runtime</span><strong>'+esc(data?.message||'정상')+'</strong></div><div class="admin-system-item"><span><i class="admin-dot"></i>Queue 상태</span><strong>'+queueTotal.toLocaleString('ko-KR')+'건 처리 중/대기</strong></div><div class="admin-system-item"><span><i class="admin-dot"></i>Apps Script Bridge</span><strong>Edge Secret으로 관리</strong></div><div class="admin-system-item"><span><i class="admin-dot"></i>최근 성역 동기화</span><strong>'+esc(formatServerTime(recent.completedAt||recent.completed_at))+'</strong></div></div>';
    roots.forEach(root=>{root.innerHTML=html;});
  }
  async function refreshSystemSettings(){
    if(!isMaster()){
      $('#webAppTestBtnSystem') && ($('#webAppTestBtnSystem').disabled=true);
      setStatus('#systemStatus','현재 계정은 MASTER가 아니므로 인프라 연결 진단을 실행할 수 없습니다.','error');
    }else{
      $('#webAppTestBtnSystem') && ($('#webAppTestBtnSystem').disabled=false);
      setStatus('#systemStatus','Bridge URL은 Supabase Edge Function Secret에서만 관리됩니다. 브라우저에는 저장하지 않습니다.','ok');
    }
  }
  function visitorDate(value){
    if(!value)return '-';
    try{return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));}catch(_err){return String(value);}
  }
  function visitorNumber(value){return Number(value||0).toLocaleString('ko-KR');}
  function renderVisitorTrend(rows){
    const root=$('#visitorTrend'); if(!root)return;
    root.innerHTML=(rows||[]).length?(rows||[]).map(row=>'<article><span>'+esc(row.visit_date||row.visitDate||'-')+'</span><strong>'+visitorNumber(row.unique_visitors||row.uniqueVisitors)+'</strong><em>익명 '+visitorNumber(row.anonymous_visitors||row.anonymousVisitors)+' · 로그인 '+visitorNumber(row.logged_in_visitors||row.loggedInVisitors)+' · 조회 '+visitorNumber(row.page_views||row.pageViews)+'</em></article>').join(''):'<div class="admin-empty">집계된 방문 데이터가 없습니다.</div>';
  }
  function renderVisitorPages(rows){
    const root=$('#visitorPages'); if(!root)return;
    root.innerHTML=(rows||[]).length?(rows||[]).map(row=>'<article><span>'+esc(row.page_key||row.pageKey||'-')+'</span><strong>'+visitorNumber(row.unique_visitors||row.uniqueVisitors)+'명</strong><em>'+visitorNumber(row.page_views||row.pageViews)+'회 조회</em></article>').join(''):'<div class="admin-empty">오늘 페이지별 데이터가 없습니다.</div>';
  }
  async function loadVisitorDashboard(force){
    try{
      if(force)state.loaded['logs/visitors']=false;
      setStatus('#visitorAggregateStatus','방문 통계를 불러오는 중입니다.');
      const data=await adminVisitor('dashboard',{days:state.visitorDays});
      const summary=data.summary||{};
      $('#visitorTodayTotal').textContent=visitorNumber(summary.unique_visitors||summary.uniqueVisitors);
      $('#visitorTodayBreakdown').textContent='비로그인 '+visitorNumber(summary.anonymous_visitors||summary.anonymousVisitors)+' · 로그인 '+visitorNumber(summary.logged_in_visitors||summary.loggedInVisitors);
      $('#visitorTodayViews').textContent=visitorNumber(summary.page_views||summary.pageViews);
      $('#visitorServerDate').textContent=String(data.serverDate||summary.visit_date||summary.visitDate||'-');
      renderVisitorTrend(data.trend||[]); renderVisitorPages(data.pages||[]);
      state.visitorCanViewMemberHistory=Boolean(data.canViewMemberHistory);
      const history=$('#visitorHistoryCard'); if(history)history.hidden=!state.visitorCanViewMemberHistory;
      setStatus('#visitorAggregateStatus','한국 시간 기준으로 집계했습니다.','success');
      if(state.visitorCanViewMemberHistory)await loadVisitorHistory(1);
    }catch(err){setStatus('#visitorAggregateStatus',err.message||String(err),'error');}
  }
  async function loadVisitorHistory(page){
    if(!state.visitorCanViewMemberHistory)return;
    state.visitorPage=Math.max(1,Number(page||1));
    try{
      setStatus('#visitorHistoryStatus','방문 이력을 불러오는 중입니다.');
      const data=await adminVisitor('history',{dateFrom:$('#visitorDateFrom')?.value||null,dateTo:$('#visitorDateTo')?.value||null,memberSearch:$('#visitorMemberSearch')?.value.trim()||null,loginFilter:$('#visitorLoginFilter')?.value||'ALL',pageKey:$('#visitorPageFilter')?.value||null,page:state.visitorPage,pageSize:20});
      state.visitorTotalPages=Math.max(1,Number(data.totalPages||1));
      const root=$('#visitorHistoryList'); const rows=data.rows||[];
      if(root)root.innerHTML=rows.length?rows.map(row=>'<article class="admin-visitor-history-row"><div><strong>'+esc(row.memberName||'익명 방문자')+'</strong><span>'+(row.isLoggedIn?esc(row.memberRole||'회원'):'비로그인')+'</span></div><div><span>로그인 '+visitorDate(row.loginAt)+'</span><span>최초 '+visitorDate(row.firstVisitAt)+'</span><span>마지막 '+visitorDate(row.lastVisitAt)+'</span></div><div><strong>'+visitorNumber(row.pageViews)+'회</strong><span>'+esc((row.pages||[]).join(', ')||'-')+'</span></div></article>').join(''):'<div class="admin-empty">조건에 맞는 방문 이력이 없습니다.</div>';
      $('#visitorPageInfo').textContent=state.visitorPage+' / '+state.visitorTotalPages;
      $('#visitorPrevBtn').disabled=state.visitorPage<=1; $('#visitorNextBtn').disabled=state.visitorPage>=state.visitorTotalPages;
      setStatus('#visitorHistoryStatus','총 '+visitorNumber(data.total)+'건','success');
    }catch(err){setStatus('#visitorHistoryStatus',err.message||String(err),'error');}
  }

  function renderLogs(){ const root=$('#adminLogBox'); if(root) root.textContent=state.logs.length?state.logs.join('\n'):'아직 로그가 없습니다.'; }

  function bind(){
    $$('.admin-nav button,.admin-bottom-actions button').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.adminTab)));
    $$('.admin-subnav').forEach(nav=>nav.addEventListener('click',event=>{
      const button=event.target.closest('[data-admin-subtab]');
      if(!button)return;
      switchSubtab(nav.dataset.adminSubnav,button.dataset.adminSubtab);
    }));
    $('#adminMobileSelect')?.addEventListener('change',e=>switchTab(e.target.value));
    const logout=()=>{window.KinojoAuth?.clearSession?.(); location.href='../';};
    $('#adminLogoutBtn')?.addEventListener('click',logout); $('#adminMobileLogoutBtn')?.addEventListener('click',logout);
    $('#requestReloadBtn')?.addEventListener('click',loadCodeRequests);
    $('#requestList')?.addEventListener('click',e=>{ if(e.target.matches('[data-approve-request]')) processRequest(e.target,'approveCodeRequest'); if(e.target.matches('[data-reject-request]')) processRequest(e.target,'rejectCodeRequest'); });
    $('#memberReloadBtn')?.addEventListener('click',loadAccounts); $('#sanctuaryRolePermissionReloadBtn')?.addEventListener('click',loadSanctuaryRolePermissions); $('#sanctuaryRolePermissionMatrix')?.addEventListener('change',e=>{if(e.target.matches('[data-sanctuary-role-permission]'))setSanctuaryRolePermission(e.target);}); $('#memberSearch')?.addEventListener('input',applyMemberFilters); $('#memberRoleFilter')?.addEventListener('change',applyMemberFilters); $('#memberList')?.addEventListener('click',e=>{ if(e.target.matches('[data-member-role-open],[data-member-role-save],[data-member-role-cancel],[data-member-disable],[data-member-delete]')) handleMemberAction(e.target); });
    $('#characterLookupStartBtn')?.addEventListener('click',startCharacterLookup);
    $('#characterLookupReloadBtn')?.addEventListener('click',()=>refreshCharacterLookupStatus({statusLine:true}));
    $('#characterLookupPauseBtn')?.addEventListener('click',()=>controlCharacterLookup('pause'));
    $('#characterLookupResumeBtn')?.addEventListener('click',()=>controlCharacterLookup('resume'));
    $('#characterLookupStopBtn')?.addEventListener('click',()=>controlCharacterLookup('cancel'));
    $('#characterLookupScope')?.addEventListener('change',e=>{const single=e.target.value==='single';if($('#characterLookupName'))$('#characterLookupName').disabled=!single;});
    $('#characterSearchBtn')?.addEventListener('click',searchCharacters);
    $('#characterSearch')?.addEventListener('keydown',e=>{ if(e.key==='Enter') searchCharacters(); });
    $('#characterList')?.addEventListener('click',e=>{ if(e.target.matches('[data-char-deactivate]')) handleCharacterAction(e.target,'deactivate'); if(e.target.matches('[data-char-restore]')) handleCharacterAction(e.target,'restore'); if(e.target.matches('[data-char-rename]')) handleCharacterAction(e.target,'markRenamed'); });
    $('#sanctuaryPreviewBtn')?.addEventListener('click',runSanctuaryPreview);
    $('#sanctuarySyncBtn')?.addEventListener('click',runSanctuarySync);
    $('#sanctuaryScheduleReloadBtn')?.addEventListener('click',()=>loadSanctuaryScheduleConsole(true));
    $('#sanctuaryScheduleNewBtn')?.addEventListener('click',()=>resetSanctuaryScheduleEditor(null));
    $('#sanctuaryScheduleEditorResetBtn')?.addEventListener('click',()=>resetSanctuaryScheduleEditor(null));
    $('#sanctuaryScheduleCancelEditBtn')?.addEventListener('click',()=>resetSanctuaryScheduleEditor(null));
    $('#sanctuaryScheduleSaveBtn')?.addEventListener('click',saveSanctuarySchedule);
    $('#sanctuaryScheduleCode')?.addEventListener('change',()=>{renderSanctuaryTeamSelect('');updateSanctuaryScheduleSaveState();});
    $('#sanctuaryScheduleTeam')?.addEventListener('change',updateSanctuaryScheduleSaveState);
    $('#sanctuaryScheduleStartsAt')?.addEventListener('input',updateSanctuaryScheduleSaveState);
    $$('input[name="sanctuaryScheduleMode"]').forEach(input=>input.addEventListener('change',()=>applySanctuaryScheduleMode(input.value)));
    $('#sanctuaryScheduleList')?.addEventListener('click',e=>{
      const row=e.target.closest('[data-sanctuary-schedule-id]'); const id=Number(row?.dataset.sanctuaryScheduleId||0); if(!id)return;
      if(e.target.matches('[data-schedule-edit]'))resetSanctuaryScheduleEditor(sanctuaryScheduleById(id));
      if(e.target.matches('[data-schedule-status]'))changeSanctuaryScheduleStatus(id,e.target.dataset.scheduleStatus);
    });
    $('#noticeReloadBtn')?.addEventListener('click',loadNotices); $('#noticeSaveBtn')?.addEventListener('click',saveNotice);
    $('#meterAdminReloadBtn')?.addEventListener('click',loadMeterAdminConsole);
    $('#meterAdminOperationSaveBtn')?.addEventListener('click',saveMeterOperation);
    $('#meterAdminNoticeNewBtn')?.addEventListener('click',()=>resetMeterNoticeEditor(null));
    $('#meterAdminNoticeCancelBtn')?.addEventListener('click',()=>resetMeterNoticeEditor(null));
    $('#meterAdminNoticeSaveBtn')?.addEventListener('click',saveMeterNotice);
    $('#meterAdminNoticeList')?.addEventListener('click',e=>{
      const row=e.target.closest('[data-meter-notice-id]');if(!row)return;
      const id=Number(row.dataset.meterNoticeId||0);
      if(e.target.matches('[data-meter-notice-edit]'))resetMeterNoticeEditor(meterNoticeById(id));
      if(e.target.matches('[data-meter-notice-delete]'))deleteMeterNotice(id);
    });
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
    $('#webAppTestBtn')?.addEventListener('click',()=>testWebAppConnection('#serverStatus')); $('#webAppTestBtnSystem')?.addEventListener('click',()=>testWebAppConnection('#systemStatus')); $('#serverRefreshBtn')?.addEventListener('click',refreshServerStatus); $('#goSystemSettingsBtn')?.addEventListener('click',()=>switchTab('system',{subtab:'environment'}));
    document.addEventListener('click',e=>{ const retry=e.target.closest('[data-profile-diagnostic-retry]'); if(retry){retryProfileDiagnostic(retry);return;} if(e.target.matches('[data-jump-server]')) switchTab('system',{subtab:'server-status'}); if(e.target.matches('[data-jump-system]')) switchTab('system',{subtab:'environment'}); });
    $$('[data-visitor-days]').forEach(button=>button.addEventListener('click',()=>{state.visitorDays=Number(button.dataset.visitorDays||7);$$('[data-visitor-days]').forEach(item=>item.classList.toggle('active',item===button));loadVisitorDashboard(true);}));
    $('#visitorReloadBtn')?.addEventListener('click',()=>loadVisitorDashboard(true));
    $('#visitorSearchBtn')?.addEventListener('click',()=>loadVisitorHistory(1));
    $('#visitorPrevBtn')?.addEventListener('click',()=>loadVisitorHistory(state.visitorPage-1));
    $('#visitorNextBtn')?.addEventListener('click',()=>loadVisitorHistory(state.visitorPage+1));
    window.addEventListener('hashchange',()=>{const route=adminRoute();switchTab(route.tab,{subtab:route.subtab,updateRoute:false});});
    $('#quickCodeBtn')?.addEventListener('click',()=>switchTab('requests')); $('#quickSanctuaryBtn')?.addEventListener('click',()=>switchTab('system',{subtab:'sheet-sync'})); $('#quickMemberBtn')?.addEventListener('click',()=>switchTab('members',{subtab:'accounts'})); $('#quickNoticeBtn')?.addEventListener('click',()=>switchTab('notices',{subtab:'general'}));
  }
  async function init(){
    let tries=0; while(tries<30 && !window.KinojoAuth){ await new Promise(r=>setTimeout(r,100)); tries++; }
    if(!isAdmin()){ renderAccessBlocked(); return; }
    $('#adminRoleLabel') && ($('#adminRoleLabel').textContent=roleLabel());
    $('#adminMobileRoleLabel') && ($('#adminMobileRoleLabel').textContent=roleLabel());
    const today=todayDateInputValue(); const from=new Date(today+'T00:00:00'); from.setDate(from.getDate()-6);
    if($('#visitorDateTo'))$('#visitorDateTo').value=today; if($('#visitorDateFrom'))$('#visitorDateFrom').value=from.toISOString().slice(0,10);
    if(isStaffConsole()){
      document.body.classList.add('kinojo-staff-console');
      $$('[data-admin-full-only]').forEach(el=>el.hidden=true);
      $$('.admin-nav [data-admin-tab],.admin-bottom-actions [data-admin-tab]').forEach(el=>{if(el.dataset.adminTab!=='sanctuary')el.hidden=true;});
      const mobile=$('#adminMobileSelect'); if(mobile)Array.from(mobile.options).forEach(option=>{if(option.value!=='sanctuary')option.remove();});
    }
    const permissionCard=$('#sanctuaryRolePermissionCard'); if(permissionCard)permissionCard.hidden=!isMaster();
    const permissionTab=$('[data-admin-subnav="members"] [data-admin-subtab="permissions"]'); if(permissionTab)permissionTab.hidden=!isMaster();
    $$('[data-admin-master-only]').forEach(element=>{element.hidden=!isMaster();});
    bind(); renderLogs();
    const route=adminRoute();
    switchTab(isStaffConsole()?'sanctuary':route.tab,{subtab:isStaffConsole()?'':route.subtab,updateRoute:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
