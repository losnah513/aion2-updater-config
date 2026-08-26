/* KINOJO Admin Navigation, dashboard, event binding, and bootstrap v2026081004 */
(function(A){
  'use strict';
  if(!A) throw new Error('KINOJO Admin shared module is required.');
  const $=A.$;
  const $$=A.$$;
  const DEFAULT_SUBTABS=A.DEFAULT_SUBTABS;
  const state=A.state;
  const action=(...args)=>A.action(...args);
  const addLog=(...args)=>A.addLog(...args);
  const adminAccount=(...args)=>A.adminAccount(...args);
  const applyEventNoticeTypeTemplate=(...args)=>A.applyEventNoticeTypeTemplate(...args);
  const applyMemberFilters=(...args)=>A.applyMemberFilters(...args);
  const applySanctuaryScheduleMode=(...args)=>A.applySanctuaryScheduleMode(...args);
  const changeSanctuaryScheduleStatus=(...args)=>A.changeSanctuaryScheduleStatus(...args);
  const closeEventNoticeEditor=(...args)=>A.closeEventNoticeEditor(...args);
  const closeEventNoticePreview=(...args)=>A.closeEventNoticePreview(...args);
  const controlCharacterLookup=(...args)=>A.controlCharacterLookup(...args);
  const copyLookupDiagnostics=(...args)=>A.copyLookupDiagnostics(...args);
  const copyLookupFailure=(...args)=>A.copyLookupFailure(...args);
  const decideIdentityReview=(...args)=>A.decideIdentityReview(...args);
  const deleteEventNoticeGroup=(...args)=>A.deleteEventNoticeGroup(...args);
  const deleteMeterNotice=(...args)=>A.deleteMeterNotice(...args);
  const duplicateEventNoticeGroup=(...args)=>A.duplicateEventNoticeGroup(...args);
  const editEventNoticeGroup=(...args)=>A.editEventNoticeGroup(...args);
  const formatServerTime=(...args)=>A.formatServerTime(...args);
  const getDefaultEventNoticeItem=(...args)=>A.getDefaultEventNoticeItem(...args);
  const getEventNoticeGroupById=(...args)=>A.getEventNoticeGroupById(...args);
  const handleLookupHistoryClick=(...args)=>A.handleLookupHistoryClick(...args);
  const handleMemberAction=(...args)=>A.handleMemberAction(...args);
  const handleMeterAdminChange=(...args)=>A.handleMeterAdminChange(...args);
  const handleMeterAdminClick=(...args)=>A.handleMeterAdminClick(...args);
  const isAdmin=(...args)=>A.isAdmin(...args);
  const isMaster=(...args)=>A.isMaster(...args);
  const isStaffConsole=(...args)=>A.isStaffConsole(...args);
  const loadAccounts=(...args)=>A.loadAccounts(...args);
  const loadMemberImageReviews=(...args)=>A.loadMemberImageReviews(...args);
  const loadCharacterLookupConsole=(...args)=>A.loadCharacterLookupConsole(...args);
  const loadCodeRequests=(...args)=>A.loadCodeRequests(...args);
  const loadEventNoticeGroups=(...args)=>A.loadEventNoticeGroups(...args);
  const loadLookupHistory=(...args)=>A.loadLookupHistory(...args);
  const loadMeterAdminConsole=(...args)=>A.loadMeterAdminConsole(...args);
  const loadMeterDungeonLogs=(...args)=>A.loadMeterDungeonLogs(...args);
  const loadNotices=(...args)=>A.loadNotices(...args);
  const loadSanctuaryRolePermissions=(...args)=>A.loadSanctuaryRolePermissions(...args);
  const loadSanctuaryScheduleConsole=(...args)=>A.loadSanctuaryScheduleConsole(...args);
  const loadSanctuarySupportRequests=(...args)=>A.loadSanctuarySupportRequests(...args);
  const handleSanctuarySupportRequest=(...args)=>A.handleSanctuarySupportRequest(...args);
  const loadSanctuarySyncConsole=(...args)=>A.loadSanctuarySyncConsole(...args);
  const loadVisitorDashboard=(...args)=>A.loadVisitorDashboard(...args);
  const loadVisitorHistory=(...args)=>A.loadVisitorHistory(...args);
  const handleMemberImageReviewClick_=(...args)=>A.handleMemberImageReviewClick_(...args);
  const lookupExitSafety=(...args)=>A.lookupExitSafety(...args);
  const meterNoticeById=(...args)=>A.meterNoticeById(...args);
  const openEventNoticePreview=(...args)=>A.openEventNoticePreview(...args);
  const option=(...args)=>A.option(...args);
  const probeCharacterIdentity=(...args)=>A.probeCharacterIdentity(...args);
  const processRequest=(...args)=>A.processRequest(...args);
  const refreshCharacterLookupStatus=(...args)=>A.refreshCharacterLookupStatus(...args);
  const refreshServerStatus=(...args)=>A.refreshServerStatus(...args);
  const refreshSystemSettings=(...args)=>A.refreshSystemSettings(...args);
  const renderCharacterLookupConsole=(...args)=>A.renderCharacterLookupConsole(...args);
  const renderCharacters=(...args)=>A.renderCharacters(...args);
  const renderEventNoticeEditorCard=(...args)=>A.renderEventNoticeEditorCard(...args);
  const renderRequestPreview=(...args)=>A.renderRequestPreview(...args);
  const renderSanctuaryTeamSelect=(...args)=>A.renderSanctuaryTeamSelect(...args);
  const renderServerBox=(...args)=>A.renderServerBox(...args);
  const renumberEventNoticeEditor=(...args)=>A.renumberEventNoticeEditor(...args);
  const resetMeterNoticeEditor=(...args)=>A.resetMeterNoticeEditor(...args);
  const resetSanctuaryScheduleEditor=(...args)=>A.resetSanctuaryScheduleEditor(...args);
  const retryFailedCharacterLookup=(...args)=>A.retryFailedCharacterLookup(...args);
  const retryProfileDiagnostic=(...args)=>A.retryProfileDiagnostic(...args);
  const roleLabel=(...args)=>A.roleLabel(...args);
  const runSanctuaryPreview=(...args)=>A.runSanctuaryPreview(...args);
  const runSanctuarySync=(...args)=>A.runSanctuarySync(...args);
  const sanctuaryScheduleById=(...args)=>A.sanctuaryScheduleById(...args);
  const saveCharacterStatus=(...args)=>A.saveCharacterStatus(...args);
  const saveEventNoticeEditor=(...args)=>A.saveEventNoticeEditor(...args);
  const saveMeterNotice=(...args)=>A.saveMeterNotice(...args);
  const saveNotice=(...args)=>A.saveNotice(...args);
  const saveSanctuarySchedule=(...args)=>A.saveSanctuarySchedule(...args);
  const searchCharacters=(...args)=>A.searchCharacters(...args);
  const scheduleMemberImageReviewSearch_=(...args)=>A.scheduleMemberImageReviewSearch_(...args);
  const setSanctuaryRolePermission=(...args)=>A.setSanctuaryRolePermission(...args);
  const setStatus=(...args)=>A.setStatus(...args);
  const startCharacterServerQueue=(...args)=>A.startCharacterServerQueue(...args);
  const startEventNoticeCreate=(...args)=>A.startEventNoticeCreate(...args);
  const testWebAppConnection=(...args)=>A.testWebAppConnection(...args);
  const todayDateInputValue=(...args)=>A.todayDateInputValue(...args);
  const updateSanctuaryScheduleSaveState=(...args)=>A.updateSanctuaryScheduleSaveState(...args);
  const TAB_LABELS={dashboard:'대시보드',requests:'코드 요청',members:'회원 관리',characters:'캐릭터 관리',sanctuary:'성역 관리',notices:'공지 관리',images:'이미지 관리',meter:'키노조 미터',system:'시스템 설정',logs:'로그 관리'};
  const IMAGE_LOCATION_LABELS={main:'메인 배너 이벤트 만들기',side:'사이드 배너 이벤트 만들기',events:'이벤트 관리',library:'이미지 라이브러리'};

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
    if(tab==='members'&&subtab==='character-images'&&isMaster()) loadMemberImageReviews();
    if(tab==='members'&&subtab==='permissions'&&isMaster()) loadSanctuaryRolePermissions();
    if(tab==='characters'&&subtab==='lookup') loadCharacterLookupConsole(force===true);
    if(tab==='characters'&&subtab==='records') searchCharacters();
    if(tab==='sanctuary'&&subtab==='schedule') loadSanctuaryScheduleConsole(force===true);
    if(tab==='sanctuary'&&subtab==='requests') loadSanctuarySupportRequests(force===true);
    if(tab==='notices'&&subtab==='general') loadNotices();
    if(tab==='notices'&&subtab==='event') loadEventNoticeGroups();
    if(tab==='images'&&subtab==='main') A.loadMainBannerManagement?.(force===true);
    if(tab==='images'&&subtab==='side') A.loadSideBannerManagement?.(force===true);
    if(tab==='images'&&subtab==='events') A.loadBannerEventManagement?.(force===true);
    if(tab==='images'&&subtab==='library') A.loadBannerAssetLibrary?.(force===true);
    if(tab==='meter'&&isMaster()&&subtab==='logs') loadMeterDungeonLogs(1);
    if(tab==='meter'&&isMaster()&&subtab!=='logs') loadMeterAdminConsole();
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
    $$('[data-admin-subtab]',pane).forEach(button=>{
      const on=button.dataset.adminSubtab===next;
      button.classList.toggle('active',on);
      if(button.matches('[role="tab"]')){button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;}
    });
    $$('[data-admin-subpane]',pane).forEach(subpane=>{
      const on=subpane.dataset.adminSubpane===next;
      subpane.classList.toggle('active',on);
      if(subpane.matches('[role="tabpanel"]'))subpane.hidden=!on;
    });
    if(options.updateRoute!==false)writeAdminRoute(tab,next);
    loadFeature(tab,next,options.force===true);
    if(state.tab===tab)syncAdminChrome(tab);
  }

  function switchTab(tab,options={}){
    if(tab==='server'){tab='system';options=Object.assign({},options,{subtab:'server-status'});}
    if(tab==='meter'&&!isMaster())tab='dashboard';
    if(isStaffConsole() && tab!=='sanctuary') tab='sanctuary';
    if(!document.querySelector('[data-admin-pane="'+tab+'"]'))tab=isStaffConsole()?'sanctuary':'dashboard';
    state.tab = tab;
    $$('.admin-nav [data-admin-tab],.admin-mobile-launcher [data-admin-tab]').forEach(b=>b.classList.toggle('active', b.dataset.adminTab===tab));
    $$('.admin-pane').forEach(p=>p.classList.toggle('active', p.dataset.adminPane===tab));
    const subnav=$('[data-admin-subnav="'+tab+'"]',document);
    if(subnav){
      switchSubtab(tab,options.subtab||state.subtabs[tab]||DEFAULT_SUBTABS[tab],options);
    }else{
      state.subtab='';
      if(options.updateRoute!==false)writeAdminRoute(tab,'');
      loadFeature(tab,'',options.force===true);
    }
    syncAdminChrome(tab);
  }

  function syncAdminChrome(tab){
    const locationLabel=$('#adminCurrentLocation');
    if(locationLabel){
      const imageLocation=tab==='images'?IMAGE_LOCATION_LABELS[state.subtab]:'';
      locationLabel.textContent=imageLocation?`[이미지 관리] - ${imageLocation}`:'['+(TAB_LABELS[tab]||'관리')+']';
    }
    document.body.classList.toggle('admin-dashboard-active',tab==='dashboard');
    const slot=$('#adminTopSubnav');
    if(!slot)return;
    slot.replaceChildren();
    const source=$('[data-admin-subnav="'+tab+'"]');
    if(!source){slot.hidden=true;return;}
    slot.hidden=false;
    $$('[data-admin-subtab]',source).filter(button=>!button.hidden).forEach(button=>{
      const clone=button.cloneNode(true);
      clone.removeAttribute('id');
      clone.querySelectorAll('[id]').forEach(element=>element.removeAttribute('id'));
      clone.addEventListener('click',()=>switchSubtab(tab,button.dataset.adminSubtab));
      slot.appendChild(clone);
    });
  }

  function buildMobileLauncher(){
    const root=$('.admin-mobile-launcher');if(!root)return;
    root.replaceChildren();
    $$('.admin-nav [data-admin-tab]').filter(button=>!button.hidden).forEach(button=>{
      const clone=document.createElement('button');
      clone.type='button';clone.dataset.adminTab=button.dataset.adminTab;
      clone.innerHTML='<span>'+button.textContent.trim().split(/\s+/)[0]+'</span><strong>'+String(button.textContent).replace(/^\S+\s*/,'').replace(/\d+$/,'').trim()+'</strong>';
      clone.addEventListener('click',()=>switchTab(clone.dataset.adminTab));
      root.appendChild(clone);
    });
  }

  function renderDashboardServerOverview(runtimeData,syncData){
    const root=$('#serverStatusOverview');if(!root)return;
    const queue=runtimeData.queue||runtimeData.queueStatus||{};
    const recentSync=syncData.recentSync||syncData.recent_sync||{};
    const entries=[
      ['RPC',runtimeData.ok!==false],
      ['작업 큐',queue.ok!==false&&String(queue.status||'').toLowerCase()!=='failed'],
      ['성역 동기화',String(recentSync.status||'').toLowerCase()!=='failed']
    ];
    root.innerHTML='<div class="admin-server-chips">'+entries.map(([label,ok])=>'<span class="'+(ok?'ok':'error')+'"><i></i>'+label+'</span>').join('')+'</div>';
  }

  function renderAccessBlocked(){
    document.body.innerHTML = '<main class="admin-access-block"><h1>관리자 권한이 필요합니다</h1><p>로그인 후 STAFF 이상 권한으로 접근할 수 있습니다. STAFF는 담당 팀 성역 일정만 관리할 수 있습니다.</p><button class="admin-btn primary" id="adminLoginGo" type="button">로그인</button></main>';
    $('#adminLoginGo')?.addEventListener('click',()=>window.KinojoAuth?.openLoginModal?.());
  }

  function applyNotificationBadges(summary){
    const data=summary&&typeof summary==='object'?summary:{};
    const codeCount=Math.max(0,Number(data.codeRequestCount||0));
    const supportCount=Math.max(0,Number(data.supportRequestCount||0));
    const imageReviewCount=Math.max(0,Number(data.memberImagePendingCount||0));
    const imageRequestCount=Math.max(0,Number(data.memberImageRequestPendingCount||0));
    const imageCount=imageReviewCount+imageRequestCount;
    if($('#adminPendingBadge'))$('#adminPendingBadge').textContent=String(codeCount);
    if($('#adminSanctuaryRequestBadge'))$('#adminSanctuaryRequestBadge').textContent=String(supportCount);
    if($('#adminSanctuarySubBadge'))$('#adminSanctuarySubBadge').textContent=String(supportCount);
    document.querySelectorAll('#adminMemberImageBadge,[data-admin-subtab="character-images"] .badge').forEach(badge=>{badge.textContent=String(imageCount);});
    state.memberImageReviewPendingCount=imageReviewCount;
    state.memberImageRequestPendingCount=imageRequestCount;
    if(typeof A.renderMemberImageReviewSummary_==='function')A.renderMemberImageReviewSummary_(imageReviewCount,state.memberImageReviewTotalCount);
  }

  async function refreshNotificationBadges(){
    try{
      const summary=await action('notificationSummary',{});
      if(summary?.ok===true)applyNotificationBadges(summary);
      return summary;
    }catch(_err){return null;}
  }

  async function refreshDashboard(){
    try{
      const [visit, req, runtime, sync, pending] = await Promise.allSettled([
        action('hallVisit',{ mode:'stats', pageKey:'admin' }),
        adminAccount('listCodeRequests',{ status:'PENDING', limit:20 }),
        action('runtimeStatus',{}),
        action('adminSanctuarySheetSync',{mode:'status'}),
        action('notificationSummary',{})
      ]);
      const stats = visit.status==='fulfilled' ? (visit.value.stats || visit.value || {}) : {};
      const requests = req.status==='fulfilled' ? (req.value.requests || []) : [];
      const runtimeData = runtime.status==='fulfilled' ? runtime.value : {};
      const syncData = sync.status==='fulfilled' ? sync.value : {};
      const pendingSummary=pending.status==='fulfilled'?pending.value:{};
      $('#statVisitors').textContent = Number(stats.todayVisits ?? stats.today ?? stats.daily ?? 0).toLocaleString('ko-KR');
      const anonymous=Number(stats.todayAnonymous ?? 0), logged=Number(stats.todayLoggedIn ?? 0), views=Number(stats.todayPageViews ?? 0);
      $('#statVisitorsSub').textContent = '비로그인 '+anonymous.toLocaleString('ko-KR')+' · 로그인 '+logged.toLocaleString('ko-KR')+(views?' · 조회 '+views.toLocaleString('ko-KR'):'');
      $('#statRequests').textContent = String(requests.length||0);
      $('#statRequestsSub').textContent = requests.length ? '대기 중' : '처리할 요청 없음';
      const recentSync=syncData.recentSync||syncData.recent_sync||{};
      $('#statSanctuary').textContent = recentSync.status==='failed' ? '확인' : recentSync.completedAt||recentSync.completed_at ? '정상' : '대기';
      $('#statSanctuarySub').textContent = formatServerTime(recentSync.completedAt||recentSync.completed_at);
      $('#statServer').textContent = runtimeData.ok === false ? '점검' : '정상';
      $('#statServerSub').textContent = runtimeData.ok === false ? '확인이 필요한 항목이 있습니다.' : '핵심 서비스가 정상입니다.';
      state.requests=requests;
      renderDashboardServerOverview(runtimeData,syncData);
      applyNotificationBadges(Object.assign({},pendingSummary,{codeRequestCount:requests.length||0}));
      addLog('INFO','대시보드 새로고침 완료');
    }catch(err){ addLog('ERROR',err.message||err); }
  }

  function renderLogs(){ const root=$('#adminLogBox'); if(root) root.textContent=state.logs.length?state.logs.join('\n'):'아직 로그가 없습니다.'; }

  function bind(){
    $$('.admin-nav [data-admin-tab]').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.adminTab)));
    $$('.admin-subnav').forEach(nav=>nav.addEventListener('click',event=>{
      const button=event.target.closest('[data-admin-subtab]');
      if(!button)return;
      switchSubtab(nav.dataset.adminSubnav,button.dataset.adminSubtab);
    }));
    const logout=()=>{window.KinojoAuth?.clearSession?.(); location.href='../';};
    $('#adminLogoutBtn')?.addEventListener('click',logout);
    $('#adminBackBtn')?.addEventListener('click',()=>{
      const defaultSub=DEFAULT_SUBTABS[state.tab]||'';
      if(state.subtab&&defaultSub&&state.subtab!==defaultSub)return switchSubtab(state.tab,defaultSub);
      if(state.tab!=='dashboard')return switchTab('dashboard');
      if(history.length>1)history.back();else location.href=location.pathname.startsWith('/m/')?'/m/':'/';
    });
    $('#adminCloseBtn')?.addEventListener('click',()=>{window.close();setTimeout(()=>{location.href=location.pathname.startsWith('/m/')?'/m/':'/';},120);});
    $$('[data-admin-jump]').forEach(button=>button.addEventListener('click',()=>{const [tab,subtab]=button.dataset.adminJump.split('/');switchTab(tab,{subtab});}));
    $('#requestReloadBtn')?.addEventListener('click',loadCodeRequests);
    $('#requestList')?.addEventListener('click',e=>{ if(e.target.matches('[data-approve-request]')) processRequest(e.target,'approveCodeRequest'); if(e.target.matches('[data-reject-request]')) processRequest(e.target,'rejectCodeRequest'); });
    $('#memberReloadBtn')?.addEventListener('click',loadAccounts); $('#memberImageReviewReloadBtn')?.addEventListener('click',loadMemberImageReviews); $('#memberImageReviewStatus')?.addEventListener('change',loadMemberImageReviews); $('#memberImageReviewSearch')?.addEventListener('input',scheduleMemberImageReviewSearch_); $('#memberImageReviewList')?.addEventListener('click',e=>handleMemberImageReviewClick_(e.target)); $('#sanctuaryRolePermissionReloadBtn')?.addEventListener('click',loadSanctuaryRolePermissions); $('#sanctuaryRolePermissionMatrix')?.addEventListener('change',e=>{if(e.target.matches('[data-sanctuary-role-permission]'))setSanctuaryRolePermission(e.target);}); $('#memberSearch')?.addEventListener('input',applyMemberFilters); $('#memberRoleFilter')?.addEventListener('change',applyMemberFilters); $('#memberList')?.addEventListener('click',e=>{ if(e.target.matches('[data-member-role-open],[data-member-role-save],[data-member-role-cancel],[data-member-disable],[data-member-delete]')) handleMemberAction(e.target); });
    $('#characterLookupServerQueueBtn')?.addEventListener('click',startCharacterServerQueue);
    $('#characterLookupReloadBtn')?.addEventListener('click',()=>refreshCharacterLookupStatus({statusLine:true}));
    $('#characterLookupHistoryReloadBtn')?.addEventListener('click',loadLookupHistory);
    $('#characterLookupCopyDiagnosticsBtn')?.addEventListener('click',copyLookupDiagnostics);
    $('#characterLookupHistoryList')?.addEventListener('click',e=>{const button=e.target.closest('[data-lookup-history-detail],[data-lookup-history-copy],[data-lookup-history-retry]');if(button)handleLookupHistoryClick(button);});
    $('#characterLookupFailures')?.addEventListener('click',e=>{const retry=e.target.closest('[data-lookup-failed-retry]');if(retry){retryFailedCharacterLookup(retry.dataset.lookupFailedRetry,Number(retry.dataset.lookupFailedCount||0));return;}const button=e.target.closest('[data-lookup-failure-copy]');if(button)copyLookupFailure(Number(button.dataset.lookupFailureCopy||0));});
    $('#characterLookupPauseBtn')?.addEventListener('click',()=>controlCharacterLookup('pause'));
    $('#characterLookupResumeBtn')?.addEventListener('click',()=>controlCharacterLookup('resume'));
    $('#characterLookupStopBtn')?.addEventListener('click',()=>controlCharacterLookup('cancel'));
    $('#characterLookupScope')?.addEventListener('change',e=>{const single=e.target.value==='single';if($('#characterLookupName'))$('#characterLookupName').disabled=!single;renderCharacterLookupConsole(state.lookupConsole||null);});
    $('#characterSearchBtn')?.addEventListener('click',searchCharacters);
    $('#characterSearch')?.addEventListener('keydown',e=>{ if(e.key==='Enter') searchCharacters(); });
    $('#characterIncludeInactive')?.addEventListener('change',searchCharacters);
    $('#characterStateFilter')?.addEventListener('change',renderCharacters);
    $('#characterList')?.addEventListener('click',e=>{
      if(e.target.matches('[data-char-status-save]'))saveCharacterStatus(e.target);
      if(e.target.matches('[data-identity-probe]'))probeCharacterIdentity(e.target);
      if(e.target.matches('[data-identity-review-approve]'))decideIdentityReview(e.target,true);
      if(e.target.matches('[data-identity-review-reject]'))decideIdentityReview(e.target,false);
    });
    $('#sanctuaryPreviewBtn')?.addEventListener('click',runSanctuaryPreview);
    $('#sanctuarySyncBtn')?.addEventListener('click',runSanctuarySync);
    $('#sanctuaryScheduleReloadBtn')?.addEventListener('click',()=>loadSanctuaryScheduleConsole(true));
    $('#sanctuaryRequestReloadBtn')?.addEventListener('click',()=>loadSanctuarySupportRequests(true));
    $('#sanctuaryRequestStatusFilter')?.addEventListener('change',()=>loadSanctuarySupportRequests(true));
    $('#sanctuaryRequestList')?.addEventListener('click',e=>{const button=e.target.closest('[data-sanctuary-request-approve],[data-sanctuary-request-reject]');if(button)handleSanctuarySupportRequest(button);});
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
    const meterPane=$('[data-admin-pane="meter"]');
    meterPane?.addEventListener('click',handleMeterAdminClick);
    meterPane?.addEventListener('change',handleMeterAdminChange);
    $('#meterDungeonLogQuery')?.addEventListener('keydown',event=>{if(event.key==='Enter')loadMeterDungeonLogs(1);});
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
    window.addEventListener('beforeunload',event=>{
      if(state.lookupExitSafety!=='unsafe')return;
      event.preventDefault();
      event.returnValue='';
    });
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
      $$('.admin-nav [data-admin-tab]').forEach(el=>{if(el.dataset.adminTab!=='sanctuary')el.hidden=true;});
    }
    const permissionCard=$('#sanctuaryRolePermissionCard'); if(permissionCard)permissionCard.hidden=!isMaster();
    const permissionTab=$('[data-admin-subnav="members"] [data-admin-subtab="permissions"]'); if(permissionTab)permissionTab.hidden=!isMaster();
    $$('[data-admin-master-only]').forEach(element=>{element.hidden=!isMaster();});
    buildMobileLauncher();bind();renderLogs();refreshNotificationBadges();
    const route=adminRoute();
    switchTab(isStaffConsole()?'sanctuary':route.tab,{subtab:isStaffConsole()?'':route.subtab,updateRoute:true});
  }

  Object.assign(A,{adminRoute,writeAdminRoute,loadFeature,switchSubtab,switchTab,renderAccessBlocked,applyNotificationBadges,refreshNotificationBadges,refreshDashboard,renderLogs,bind,init});

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})(window.KinojoAdmin);
