/* KINOJO Admin Sanctuary diagnostics, sheet sync, and schedule management v2026080101 */
(function(A){
  'use strict';
  if(!A) throw new Error('KINOJO Admin shared module is required.');
  const $=A.$;
  const $$=A.$$;
  const state=A.state;
  const action=(...args)=>A.action(...args);
  const adminAutomation=(...args)=>A.adminAutomation(...args);
  const addLog=(...args)=>A.addLog(...args);
  const esc=(...args)=>A.esc(...args);
  const refreshDashboard=(...args)=>A.refreshDashboard(...args);
  const refreshServerStatus=(...args)=>A.refreshServerStatus(...args);
  const roleLevel=(...args)=>A.roleLevel(...args);
  const setStatus=(...args)=>A.setStatus(...args);
  const toast=(...args)=>A.toast(...args);
  const todayDateInputValue=(...args)=>A.todayDateInputValue(...args);

  function sanctuaryAutomationBlocked(){
    return !state.sanctuaryAutomation||state.sanctuaryAutomation.manualBlocked===true||state.sanctuaryAutomation.running===true;
  }

  function renderSanctuaryAutomation(status){
    state.sanctuaryAutomation=status&&status.ok!==false?status:null;
    const current=state.sanctuaryAutomation;
    const toggle=$('#sanctuaryAutomationToggle');
    const schedule=$('#sanctuaryAutomationSchedule');
    if(schedule){
      const times=Array.isArray(current?.scheduleKst)?current.scheduleKst.join(' · '):'02:00 · 14:00';
      const next=current?.nextRunAt?' · 다음 '+formatServerTime(current.nextRunAt):'';
      schedule.textContent=(current?.enabled===true?'ON':'OFF')+' · KST '+times+next;
    }
    if(toggle){
      toggle.checked=current?.enabled===true;
      toggle.disabled=!current||current.running===true||state.sanctuaryAutomationSaving===true||state.sanctuaryAutomationCanManage!==true;
      toggle.title=current?.running===true?'자동 동기화 진행 중에는 ON/OFF를 변경할 수 없습니다.':state.sanctuaryAutomationCanManage!==true?'MASTER만 변경할 수 있습니다.':'';
    }
    setStatus('#sanctuaryAutomationNotice',current?.message||(current?'자동 실행 상태를 확인했습니다.':'자동 실행 상태를 불러오지 못해 수동 동기화를 잠시 제한합니다.'),current?.running===true?'error':current?.manualBlocked===true?'':current?'ok':'error');
    const disabled=state.sanctuarySyncBusy===true||sanctuaryAutomationBlocked();
    if($('#sanctuaryPreviewBtn'))$('#sanctuaryPreviewBtn').disabled=disabled;
    if($('#sanctuarySyncBtn'))$('#sanctuarySyncBtn').disabled=disabled;
  }

  async function refreshSanctuaryAutomation(silent=true){
    try{
      const data=await adminAutomation('status');
      if(!data||data.ok===false)throw new Error(data?.message||'자동 동기화 상태 확인 실패');
      state.sanctuaryAutomationCanManage=data.canManage===true;
      renderSanctuaryAutomation(data.sanctuarySync||null);
      return state.sanctuaryAutomation;
    }catch(error){
      state.sanctuaryAutomationCanManage=false;
      renderSanctuaryAutomation(null);
      if(!silent)setStatus('#sanctuarySyncStatus',error.message||String(error),'error');
      return null;
    }
  }

  async function saveSanctuaryAutomation(enabled){
    if(state.sanctuaryAutomationSaving||state.sanctuaryAutomation?.running===true)return;
    state.sanctuaryAutomationSaving=true;renderSanctuaryAutomation(state.sanctuaryAutomation);
    try{
      const data=await adminAutomation('save',{jobType:'sanctuary_sync',enabled:enabled===true});
      if(!data||data.ok===false)throw new Error(data?.message||'자동 동기화 설정 저장 실패');
      state.sanctuaryAutomationCanManage=data.status?.canManage===true;
      renderSanctuaryAutomation(data.status?.sanctuarySync||state.sanctuaryAutomation);
      toast(data.message||'성역 시트 자동 동기화 설정을 저장했습니다.');
    }catch(error){
      setStatus('#sanctuaryAutomationNotice',error.message||String(error),'error');
      await refreshSanctuaryAutomation(true);
    }finally{state.sanctuaryAutomationSaving=false;renderSanctuaryAutomation(state.sanctuaryAutomation);}
  }

  function startSanctuaryAutomationPolling(){
    if(state.sanctuaryAutomationPollTimer)return;
    state.sanctuaryAutomationPollTimer=setInterval(()=>{const toggle=$('#sanctuaryAutomationToggle');if(toggle&&toggle.offsetParent!==null)refreshSanctuaryAutomation(true);},10000);
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
        requestProfileDiagnostic('all').catch(error=>profileDiagnosticFailure(error,'all')),
        refreshSanctuaryAutomation(true)
      ]);
      if(data?.ok===false)throw new Error(data.message||'동기화 상태 조회 실패');
      data.profileDiagnostic=profileDiagnostic;
      renderSanctuarySyncStatus(data);
      setStatus('#sanctuarySyncStatus','Server Engine 상태를 불러왔습니다.','ok');
      startSanctuaryAutomationPolling();
    }catch(err){setStatus('#sanctuarySyncStatus',err.message||String(err),'error');}
  }

  async function runSanctuaryPreview(){
    if(sanctuaryAutomationBlocked()){setStatus('#sanctuarySyncStatus',state.sanctuaryAutomation?.message||'자동 실행 상태 확인 후 수동 미리보기를 이용해 주세요.','error');return;}
    const id=$('#sanctuarySyncId')?.value||'all'; const btn=$('#sanctuaryPreviewBtn'); state.sanctuarySyncBusy=true;renderSanctuaryAutomation(state.sanctuaryAutomation);setSyncStep(1); setStatus('#sanctuarySyncStatus','Apps Script에서 원본 시트를 읽는 중...','');
    try{
      const data=await action('adminSanctuarySheetSync',{mode:'preview',sanctuaryId:id});
      if(data?.ok===false)throw new Error(data.message||'성역 변경 미리보기 실패');
      setSyncStep(2); setStatus('#sanctuarySyncStatus','Server Engine 변경 미리보기 완료','ok');
      state.lastSanctuaryId=id; state.lastSanctuarySyncData=data; $('#sanctuarySyncResult').innerHTML=renderSyncReport(data); addLog('SANCTUARY','성역 변경 미리보기 완료');
    }catch(err){setStatus('#sanctuarySyncStatus',err.message||String(err),'error');addLog('ERROR',err.message||err);}
    finally{state.sanctuarySyncBusy=false;renderSanctuaryAutomation(state.sanctuaryAutomation);}
  }

  async function runSanctuarySync(){
    if(sanctuaryAutomationBlocked()){setStatus('#sanctuarySyncStatus',state.sanctuaryAutomation?.message||'자동 실행 상태 확인 후 수동 동기화를 이용해 주세요.','error');return;}
    const id=$('#sanctuarySyncId')?.value||'all'; const btn=$('#sanctuarySyncBtn'); state.sanctuarySyncBusy=true;renderSanctuaryAutomation(state.sanctuaryAutomation);setSyncStep(1); setStatus('#sanctuarySyncStatus','성역 시트를 읽는 중...','');
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
    finally{state.sanctuarySyncBusy=false;renderSanctuaryAutomation(state.sanctuaryAutomation);}
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

  function sanctuaryRequestStatusLabel(value){return {PENDING:'처리 대기',PROCESSING:'처리 중',APPROVED:'승인 완료',REJECTED:'거절',STALE:'자리 변경',CANCELLED:'취소'}[String(value||'').toUpperCase()]||String(value||'미확인')}
  function sanctuaryRequestRowHtml(item){
    const pending=item.status==='PENDING'||item.status==='STALE';
    return '<article class="admin-sanctuary-request-row" data-sanctuary-request-id="'+esc(item.id)+'"><header><div><span class="admin-pill">'+esc(sanctuaryRequestStatusLabel(item.status))+'</span><strong>'+esc(item.characterName||'캐릭터')+'</strong><small>'+esc(item.className||'직업 미확인')+' · 아이템레벨 '+Number(item.itemLevel||0).toLocaleString('ko-KR')+' · 전투력 '+Number(item.combatPower||0).toLocaleString('ko-KR')+'</small></div><time>'+esc(A.formatDateTime?.(item.createdAt)||String(item.createdAt||''))+'</time></header><div class="admin-sanctuary-request-target"><strong>'+esc(item.sanctuaryName||item.sanctuaryCode)+'</strong><span>'+esc(item.teamGroupName||item.teamGroupNo+'팀')+' · '+esc(item.forceName||item.forceNo+'포스')+' · '+esc(item.partyNo)+'파티 '+esc(item.slotNo)+'번</span><small>신청자 '+esc(item.requesterName||'-')+'</small></div>'+(item.lastErrorMessage?'<p class="admin-sanctuary-request-error">'+esc(item.lastErrorMessage)+'</p>':'')+(pending?'<footer><button class="admin-btn primary" type="button" data-sanctuary-request-approve>승인·편성</button><button class="admin-btn danger" type="button" data-sanctuary-request-reject>거절</button></footer>':'')+'</article>';
  }
  function setSanctuaryRequestBadges(count){
    ['#adminSanctuaryRequestBadge','#adminSanctuarySubBadge'].forEach(selector=>{const target=$(selector);if(target)target.textContent=String(Number(count||0));});
  }
  async function loadSanctuarySupportRequests(force=false){
    const root=$('#sanctuaryRequestList');if(!root)return;
    const filter=$('#sanctuaryRequestStatusFilter')?.value||'PENDING';
    setStatus('#sanctuaryRequestStatus','포스 지원 요청을 불러오는 중...','');
    try{
      const [data,summary]=await Promise.all([action('sanctuaryRequestConsole',{status:filter,limit:100}),action('notificationSummary',{})]);
      if(!data||data.ok===false)throw new Error(data?.message||'지원 요청을 불러오지 못했습니다.');
      state.sanctuarySupportRequests=Array.isArray(data.requests)?data.requests:[];
      root.innerHTML=state.sanctuarySupportRequests.length?state.sanctuarySupportRequests.map(sanctuaryRequestRowHtml).join(''):'<div class="admin-empty">해당 상태의 포스 지원 요청이 없습니다.</div>';
      setSanctuaryRequestBadges(summary?.supportRequestCount||0);
      setStatus('#sanctuaryRequestStatus','지원 요청 '+state.sanctuarySupportRequests.length+'건 · 담당 권한 범위','ok');
    }catch(error){setStatus('#sanctuaryRequestStatus',error.message||String(error),'error');root.innerHTML='<div class="admin-empty">지원 요청을 불러오지 못했습니다.</div>';}
  }
  async function handleSanctuarySupportRequest(button){
    const row=button.closest('[data-sanctuary-request-id]');const requestId=Number(row?.dataset.sanctuaryRequestId||0);const item=state.sanctuarySupportRequests.find(value=>Number(value.id)===requestId);if(!item)return;
    const approve=button.hasAttribute('data-sanctuary-request-approve');
    const question=approve?'['+item.characterName+'] 캐릭터를 '+item.teamGroupName+' '+item.forceName+' '+item.partyNo+'파티 '+item.slotNo+'번에 편성하시겠습니까?':'['+item.characterName+'] 캐릭터의 포스 지원을 거절하시겠습니까?';
    if(!window.confirm(question))return;
    row.querySelectorAll('button').forEach(control=>control.disabled=true);
    try{
      const result=approve?await window.KinojoApi.postAction('sanctuaryRoster',{command:'SUPPORT_APPROVE',requestId}):await action('sanctuaryRequestReject',{requestId,reason:'관리자 거절'});
      if(!result||result.ok===false)throw new Error(result?.message||'요청 처리에 실패했습니다.');
      A.toast(result.message||'포스 지원 요청을 처리했습니다.');await loadSanctuarySupportRequests(true);
    }catch(error){setStatus('#sanctuaryRequestStatus',error.message||String(error),'error');row.querySelectorAll('button').forEach(control=>control.disabled=false);}
  }

  document.addEventListener('change',event=>{if(event.target?.id==='sanctuaryAutomationToggle')saveSanctuaryAutomation(event.target.checked);});

  Object.assign(A,{sanctuaryAutomationBlocked,renderSanctuaryAutomation,refreshSanctuaryAutomation,saveSanctuaryAutomation,startSanctuaryAutomationPolling,countArray,summarizeSanctuary,profileCharacterKey,profileDiagnosticStats,profileDiagnosticFailure,requestProfileDiagnostic,renderProfileDiagnostic,renderSyncReport,retryProfileDiagnostic,testWebAppConnection,setSyncStep,formatServerTime,renderSanctuarySyncStatus,loadSanctuarySyncConsole,runSanctuaryPreview,runSanctuarySync,dateTimeLocalValue,selectedSanctuaryMaster,selectedScheduleMode,fillSanctuaryScheduleSelects,renderSanctuaryTeamSelect,applySanctuaryScheduleMode,updateSanctuaryScheduleSaveState,resetSanctuaryScheduleEditor,sanctuaryScheduleRowHtml,renderSanctuaryScheduleList,loadSanctuaryScheduleConsole,sanctuaryScheduleById,collectSanctuarySchedulePayload,saveSanctuarySchedule,changeSanctuaryScheduleStatus,sanctuaryRequestStatusLabel,sanctuaryRequestRowHtml,loadSanctuarySupportRequests,handleSanctuarySupportRequest});
})(window.KinojoAdmin);
