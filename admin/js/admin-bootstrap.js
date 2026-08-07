/* KINOJO Admin Navigation, dashboard, event binding, and bootstrap v2026080701 */
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
  const isAdmin=(...args)=>A.isAdmin(...args);
  const isMaster=(...args)=>A.isMaster(...args);
  const isStaffConsole=(...args)=>A.isStaffConsole(...args);
  const loadAccounts=(...args)=>A.loadAccounts(...args);
  const loadCharacterLookupConsole=(...args)=>A.loadCharacterLookupConsole(...args);
  const loadCodeRequests=(...args)=>A.loadCodeRequests(...args);
  const loadEventNoticeGroups=(...args)=>A.loadEventNoticeGroups(...args);
  const loadLookupHistory=(...args)=>A.loadLookupHistory(...args);
  const loadMeterAdminConsole=(...args)=>A.loadMeterAdminConsole(...args);
  const loadNotices=(...args)=>A.loadNotices(...args);
  const loadSanctuaryRolePermissions=(...args)=>A.loadSanctuaryRolePermissions(...args);
  const loadSanctuaryScheduleConsole=(...args)=>A.loadSanctuaryScheduleConsole(...args);
  const loadSanctuarySyncConsole=(...args)=>A.loadSanctuarySyncConsole(...args);
  const loadVisitorDashboard=(...args)=>A.loadVisitorDashboard(...args);
  const loadVisitorHistory=(...args)=>A.loadVisitorHistory(...args);
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
  const saveMeterOperation=(...args)=>A.saveMeterOperation(...args);
  const saveMeterStatistics=(...args)=>A.saveMeterStatistics(...args);
  const setMeterModeControls=(...args)=>A.setMeterModeControls(...args);
  const saveNotice=(...args)=>A.saveNotice(...args);
  const saveSanctuarySchedule=(...args)=>A.saveSanctuarySchedule(...args);
  const searchCharacters=(...args)=>A.searchCharacters(...args);
  const setSanctuaryRolePermission=(...args)=>A.setSanctuaryRolePermission(...args);
  const setStatus=(...args)=>A.setStatus(...args);
  const startCharacterServerQueue=(...args)=>A.startCharacterServerQueue(...args);
  const startEventNoticeCreate=(...args)=>A.startEventNoticeCreate(...args);
  const testWebAppConnection=(...args)=>A.testWebAppConnection(...args);
  const todayDateInputValue=(...args)=>A.todayDateInputValue(...args);
  const updateSanctuaryScheduleSaveState=(...args)=>A.updateSanctuaryScheduleSaveState(...args);

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
    if(tab==='characters'&&subtab==='records') searchCharacters();
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
    $('#meterAdminStatisticsSaveBtn')?.addEventListener('click',saveMeterStatistics);
    $('#meterAdminDownloadMode')?.addEventListener('change',setMeterModeControls);
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

  Object.assign(A,{adminRoute,writeAdminRoute,loadFeature,switchSubtab,switchTab,renderAccessBlocked,refreshDashboard,renderLogs,bind,init});

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})(window.KinojoAdmin);
