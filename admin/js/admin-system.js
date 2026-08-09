/* KINOJO Admin Meter administration, server status, environment, and visitors v2026080801 */
(function(A){
  'use strict';
  if(!A) throw new Error('KINOJO Admin shared module is required.');
  const $=A.$;
  const $$=A.$$;
  const state=A.state;
  const action=(...args)=>A.action(...args);
  const addLog=(...args)=>A.addLog(...args);
  const adminMeter=(...args)=>A.adminMeter(...args);
  const adminVisitor=(...args)=>A.adminVisitor(...args);
  const esc=(...args)=>A.esc(...args);
  const formatServerTime=(...args)=>A.formatServerTime(...args);
  const isMaster=(...args)=>A.isMaster(...args);
  const setStatus=(...args)=>A.setStatus(...args);
  const toast=(...args)=>A.toast(...args);

  const METER_NOTICE_LABELS={INFO:'안내',UPDATE:'업데이트',MAINTENANCE:'점검',WARNING:'주의'};
  const METER_MODE_LABELS={CLOSED:'다운로드 닫힘',ALL:'전체 등급',RANK_ALLOWLIST:'선택 등급'};
  const METER_STATISTICS_MODE_LABELS={OFF:'OFF · 비공개',ON:'ON · 공개'};

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
    return (bytes/1048576).toFixed(1)+' MB';
  }

  function selectedMeterLevels(){
    return $$('[data-meter-level]:checked').map(input=>Number(input.value)).filter(level=>level>=1&&level<=5);
  }

  function selectedMeterChannel(){
    return String($('#meterAdminChannel')?.value||'stable').toLowerCase()==='staging'?'staging':'stable';
  }

  function setMeterModeControls(){
    const mode=String($('#meterAdminDownloadMode')?.value||'CLOSED').toUpperCase();
    const ranks=$('#meterAdminAllowedLevels');
    if(ranks)ranks.hidden=mode!=='RANK_ALLOWLIST';
    const resume=$('#meterAdminResumeAt');
    if(resume)resume.disabled=mode!=='CLOSED';
  }

  function ensureMeterStatisticsModeControl(){
    const existing=$('#meterAdminStatisticsMode');
    if(existing)return existing;
    const legacy=$('#meterAdminStatisticsEnabled');
    if(!legacy)return null;
    const wrap=legacy.closest('.admin-meter-checks');
    const oldLabel=legacy.closest('label');
    const modeLabel=document.createElement('label');
    modeLabel.className='admin-meter-mode';
    modeLabel.append(document.createTextNode('통계 노출'));
    const select=document.createElement('select');
    select.className='admin-select';
    select.id='meterAdminStatisticsMode';
    select.setAttribute('aria-label','전투 통계 노출 상태');
    select.innerHTML='<option value="OFF">OFF · 비공개</option><option value="ON">ON · 공개</option>';
    select.value=legacy.checked?'ON':'OFF';
    select.addEventListener('change',()=>{legacy.checked=select.value==='ON';});
    modeLabel.appendChild(select);
    legacy.hidden=true;
    legacy.setAttribute('aria-hidden','true');
    legacy.tabIndex=-1;
    if(wrap){
      wrap.classList.remove('admin-meter-checks');
      wrap.replaceChildren(modeLabel,legacy);
    }else if(oldLabel){
      oldLabel.replaceWith(modeLabel,legacy);
    }else{
      legacy.insertAdjacentElement('beforebegin',modeLabel);
    }
    const saveButton=$('#meterAdminStatisticsSaveBtn');
    if(saveButton)saveButton.textContent='통계 노출 상태 저장';
    return select;
  }

  function meterAdminErrorMessage(error,fallback){
    const raw=String(error?.message||error||'').trim();
    if(/new row for relation|violates .*constraint|SQLSTATE|PGRST|PostgREST|permission denied for (relation|function)|duplicate key value/i.test(raw)){
      console.error('[KINOJO ADMIN METER]',error);
      return fallback;
    }
    return raw||fallback;
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
    const mode=String(operation.downloadMode||(operation.downloadEnabled===true?'ALL':'CLOSED')).toUpperCase();
    $('#meterAdminDownloadMode').value=METER_MODE_LABELS[mode]?mode:'CLOSED';
    const allowedLevels=Array.isArray(operation.allowedLevels)?operation.allowedLevels.map(Number):[];
    $$('[data-meter-level]').forEach(input=>{input.checked=allowedLevels.includes(Number(input.value));});
    setMeterModeControls();
    $('#meterAdminDisabledMessage').value=String(operation.disabledMessage||'키노조 미터 다운로드를 점검하고 있습니다. 잠시 후 다시 시도해 주세요.');
    $('#meterAdminResumeAt').value=operation.resumeAt?meterDateInput(operation.resumeAt):'';
    const badge=$('#meterAdminOperationBadge');
    badge.textContent=METER_MODE_LABELS[mode]||METER_MODE_LABELS.CLOSED;
    badge.classList.toggle('is-off',mode==='CLOSED');
    const channel=String(operation.channel||selectedMeterChannel()).toLowerCase()==='staging'?'staging':'stable';
    const channelSelect=$('#meterAdminChannel'); if(channelSelect)channelSelect.value=channel;
    const channelBadge=$('#meterAdminChannelBadge'); if(channelBadge)channelBadge.textContent=channel==='staging'?'Staging':'Stable';
    setStatus('#meterAdminChannelStatus',(channel==='staging'?'Staging 테스트':'Stable 사용자')+' 채널을 관리하고 있습니다.','ok');
    const launchEnabled=operation.launchEnabled===true;
    const launchMode=$('#meterAdminLaunchMode'); if(launchMode)launchMode.value=launchEnabled?'ON':'OFF';
    const launchMessage=$('#meterAdminLaunchMessage'); if(launchMessage)launchMessage.value=String(operation.launchMessage||'키노조 미터 실행이 일시 중지되어 있습니다. 잠시 후 다시 시도해 주세요.');
    const launchBadge=$('#meterAdminLaunchBadge');
    if(launchBadge){launchBadge.textContent=launchEnabled?'실행 허용':'실행 차단';launchBadge.classList.toggle('is-off',!launchEnabled);}
    const statistics=data?.statisticsOperation||{};
    const overview=data?.combatOverview||{};
    const statisticsEnabled=statistics.publicEnabled===true;
    const statisticsMode=ensureMeterStatisticsModeControl();
    if(statisticsMode)statisticsMode.value=statisticsEnabled?'ON':'OFF';
    const statisticsLegacy=$('#meterAdminStatisticsEnabled');
    if(statisticsLegacy)statisticsLegacy.checked=statisticsEnabled;
    $('#meterAdminStatisticsMessage').value=String(statistics.publicMessage||'전투 통계 준비 중입니다.');
    const statisticsBadge=$('#meterAdminStatisticsBadge');
    statisticsBadge.textContent=statisticsEnabled?'통계 공개':'통계 비공개';
    statisticsBadge.classList.toggle('is-off',!statisticsEnabled);
    const count=(id,value)=>{$(id).textContent=Number(value||0).toLocaleString('ko-KR');};
    count('#meterAdminCombatTotal',overview.totalRecords);
    count('#meterAdminCombatCurrent',overview.currentPipelineRecords);
    count('#meterAdminCombatValidated',overview.validatedRecords);
    count('#meterAdminCombatObserved',overview.observedRecords);
    count('#meterAdminCombatReview',overview.reviewRequiredRecords);
    count('#meterAdminCombatInvalid',overview.invalidRecords);
    count('#meterAdminCombatEligible',overview.statisticsEligibleRecords);
    count('#meterAdminCombatParticipants',overview.participantRows);
    count('#meterAdminCombatTargetLedger',overview.targetLedgerRecords);
    const distribution=data?.distribution||{};
    const launcher=distribution.launcher||null;
    const core=distribution.core||null;
    $('#meterAdminLauncherVersion').textContent=launcher?.version||'-';
    $('#meterAdminLauncherFile').textContent=launcher?.fileName||'-';
    $('#meterAdminLauncherSize').textContent=meterFileSize(launcher?.fileSize);
    $('#meterAdminCoreVersion').textContent=core?.version||'-';
    $('#meterAdminCombinedSize').textContent=meterFileSize(distribution.combinedFileSize);
    $('#meterAdminReleaseState').textContent=distribution.releaseAvailable!==true?'Launcher/Core 배포 준비 중':mode==='CLOSED'?'배포 준비 완료 · 다운로드 닫힘':mode==='RANK_ALLOWLIST'?'선택 등급 다운로드':'전체 등급 다운로드';
    renderMeterNotices();
  }

  async function loadMeterAdminConsole(){
    if(!isMaster())return;
    setStatus('#meterAdminOperationStatus','키노조 미터 운영 정보를 불러오는 중...','');
    try{
      const data=await adminMeter('console',{channel:selectedMeterChannel()});
      if(!data||data.ok===false)throw new Error(data?.message||'키노조 미터 운영 정보 조회 실패');
      renderMeterAdminConsole(data);
      if(!$('#meterAdminNoticeId').value)resetMeterNoticeEditor(null);
      setStatus('#meterAdminOperationStatus','Server 운영 정보를 불러왔습니다.','ok');
    }catch(err){setStatus('#meterAdminOperationStatus',meterAdminErrorMessage(err,'키노조 미터 운영 정보를 불러오지 못했습니다.'),'error');}
  }

  async function saveMeterOperation(){
    if(!isMaster())return;
    const mode=String($('#meterAdminDownloadMode').value||'CLOSED').toUpperCase();
    const allowedLevels=selectedMeterLevels();
    if(mode==='RANK_ALLOWLIST'&&!allowedLevels.length){setStatus('#meterAdminOperationStatus','허용할 등급을 하나 이상 선택하세요.','error');return;}
    const enabled=mode!=='CLOSED';
    const disabledMessage=$('#meterAdminDisabledMessage').value.trim();
    if(!disabledMessage){setStatus('#meterAdminOperationStatus','비활성화 안내 문구를 입력하세요.','error');return;}
    const prompt=mode==='CLOSED'?'다운로드를 즉시 닫고 Server 승인을 차단할까요?':mode==='ALL'?'모든 등급에 다운로드를 허용할까요?':'선택한 등급에만 다운로드를 허용할까요?';
    if(!confirm(prompt))return;
    const button=$('#meterAdminOperationSaveBtn');button.disabled=true;
    setStatus('#meterAdminOperationStatus','운영 상태를 저장하는 중...','');
    try{
      const data=await adminMeter('saveOperation',{
        channel:selectedMeterChannel(),
        downloadEnabled:enabled,
        downloadMode:mode,
        allowedLevels:mode==='RANK_ALLOWLIST'?allowedLevels:[],
        disabledMessage,
        resumeAt:mode==='CLOSED'?meterIsoFromInput($('#meterAdminResumeAt').value):null
      });
      if(!data||data.ok===false)throw new Error(data?.message||'운영 상태 저장 실패');
      renderMeterAdminConsole(data);
      setStatus('#meterAdminOperationStatus',data.message||'운영 상태를 저장했습니다.','ok');
      toast(data.message||'키노조 미터 운영 상태 저장 완료');
      addLog('METER',METER_MODE_LABELS[mode]||mode);
    }catch(err){setStatus('#meterAdminOperationStatus',meterAdminErrorMessage(err,'다운로드 운영 상태를 저장하지 못했습니다.'),'error');}
    finally{button.disabled=false;}
  }

  async function saveMeterLaunch(){
    if(!isMaster())return;
    const launchEnabled=$('#meterAdminLaunchMode')?.value==='ON';
    const launchMessage=$('#meterAdminLaunchMessage')?.value.trim()||'';
    if(!launchMessage){setStatus('#meterAdminLaunchStatus','실행 상태 안내 문구를 입력하세요.','error');return;}
    const channel=selectedMeterChannel();
    const channelLabel=channel==='staging'?'Staging':'Stable';
    if(!confirm(launchEnabled?channelLabel+' 미터기 실행을 허용할까요?':channelLabel+' 런처의 실제 미터기 실행만 차단할까요?'))return;
    const button=$('#meterAdminLaunchSaveBtn'); if(button)button.disabled=true;
    setStatus('#meterAdminLaunchStatus','미터기 실행 상태를 저장하는 중...','');
    try{
      const data=await adminMeter('saveLaunch',{channel,launchEnabled,launchMessage});
      if(!data||data.ok===false)throw new Error(data?.message||'미터기 실행 상태 저장 실패');
      renderMeterAdminConsole(data);
      setStatus('#meterAdminLaunchStatus',data.message||'미터기 실행 상태를 저장했습니다.','ok');
      toast(data.message||'미터기 실행 상태 저장 완료');
      addLog('METER',channelLabel+' '+(launchEnabled?'미터기 실행 허용':'미터기 실행 차단'));
    }catch(err){setStatus('#meterAdminLaunchStatus',meterAdminErrorMessage(err,'미터기 실행 상태를 저장하지 못했습니다.'),'error');}
    finally{if(button)button.disabled=false;}
  }

  async function saveMeterStatistics(){
    if(!isMaster())return;
    const statisticsMode=ensureMeterStatisticsModeControl();
    const publicEnabled=statisticsMode?statisticsMode.value==='ON':$('#meterAdminStatisticsEnabled')?.checked===true;
    const publicMessage=$('#meterAdminStatisticsMessage').value.trim();
    if(!publicMessage){setStatus('#meterAdminStatisticsStatus','통계 안내 문구를 입력하세요.','error');return;}
    if(!confirm(publicEnabled?'검증·통계 적격 전투를 사용자에게 공개할까요?':'전투 통계를 사용자에게 비공개로 전환할까요?'))return;
    const button=$('#meterAdminStatisticsSaveBtn');button.disabled=true;
    setStatus('#meterAdminStatisticsStatus','통계 노출 상태를 저장하는 중...','');
    try{
      const data=await adminMeter('saveStatistics',{channel:selectedMeterChannel(),publicEnabled,publicMessage});
      if(!data||data.ok===false)throw new Error(data?.message||'통계 노출 상태 저장 실패');
      renderMeterAdminConsole(data);
      setStatus('#meterAdminStatisticsStatus',data.message||'통계 노출 상태를 저장했습니다.','ok');
      toast(data.message||'전투 통계 노출 상태 저장 완료');
      addLog('METER',publicEnabled?'전투 통계 공개':'전투 통계 비공개');
    }catch(err){setStatus('#meterAdminStatisticsStatus',meterAdminErrorMessage(err,'통계 노출 상태를 저장하지 못했습니다.'),'error');}
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

  Object.assign(A,{METER_NOTICE_LABELS,METER_MODE_LABELS,METER_STATISTICS_MODE_LABELS,meterDateInput,meterIsoFromInput,meterFileSize,selectedMeterLevels,selectedMeterChannel,setMeterModeControls,ensureMeterStatisticsModeControl,meterAdminErrorMessage,normalizeMeterNotice,meterNoticeById,resetMeterNoticeEditor,renderMeterNotices,renderMeterAdminConsole,loadMeterAdminConsole,saveMeterOperation,saveMeterLaunch,saveMeterStatistics,saveMeterNotice,deleteMeterNotice,refreshServerStatus,renderServerBox,refreshSystemSettings,visitorDate,visitorNumber,renderVisitorTrend,renderVisitorPages,loadVisitorDashboard,loadVisitorHistory});
})(window.KinojoAdmin);
