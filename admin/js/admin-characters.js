/* KINOJO Admin Character lookup, queue progress, records, and identity review v2026080101 */
(function(A){
  'use strict';
  if(!A) throw new Error('KINOJO Admin shared module is required.');
  const $=A.$;
  const $$=A.$$;
  const state=A.state;
  const adminCharacter=(...args)=>A.adminCharacter(...args);
  const adminLookup=(...args)=>A.adminLookup(...args);
  const adminAutomation=(...args)=>A.adminAutomation(...args);
  const esc=(...args)=>A.esc(...args);
  const formatServerTime=(...args)=>A.formatServerTime(...args);
  const roleLevel=(...args)=>A.roleLevel(...args);
  const setStatus=(...args)=>A.setStatus(...args);
  const toast=(...args)=>A.toast(...args);

  function lookupSplit(value){return String(value||'').split(',').map(item=>item.trim()).filter(Boolean);}

  function lookupSessionStorageKey(){return 'kinojo_admin_lookup_session_v268';}

  function lookupTokenStorageKey(){return 'kinojo_admin_lookup_token_v268';}

  function characterAutomationBlocked(){
    return !state.characterAutomation||state.characterAutomation.manualBlocked===true||state.characterAutomation.running===true;
  }

  function renderCharacterAutomation(status){
    state.characterAutomation=status&&status.ok!==false?status:null;
    const current=state.characterAutomation;
    const toggle=$('#characterAutomationToggle');
    const schedule=$('#characterAutomationSchedule');
    const notice=$('#characterAutomationNotice');
    if(schedule){
      const times=Array.isArray(current?.scheduleKst)?current.scheduleKst.join(' · '):'01:00 · 07:00 · 13:00 · 19:00';
      const next=current?.nextRunAt?' · 다음 '+formatServerTime(current.nextRunAt):'';
      schedule.textContent=(current?.enabled===true?'ON':'OFF')+' · KST '+times+next;
    }
    if(toggle){
      toggle.checked=current?.enabled===true;
      toggle.disabled=!current||current.running===true||state.characterAutomationSaving===true||state.characterAutomationCanManage!==true;
      toggle.title=current?.running===true?'자동 최신화 진행 중에는 ON/OFF를 변경할 수 없습니다.':state.characterAutomationCanManage!==true?'MASTER만 변경할 수 있습니다.':'';
    }
    if(notice){
      const text=current?.message||(current?'자동 실행 상태를 확인했습니다.':'자동 실행 상태를 불러오지 못해 수동 조회를 잠시 제한합니다.');
      setStatus('#characterAutomationNotice',text,current?.running===true?'error':current?.manualBlocked===true?'':current?'ok':'error');
    }
    const button=$('#characterLookupServerQueueBtn');
    if(button)button.disabled=state.lookupStarting||state.lookupQueueRunning||state.lookupRetrying||state.lookupConsole?.active===true||roleLevel()<4||characterAutomationBlocked();
  }

  async function refreshCharacterAutomation(silent=true){
    try{
      const data=await adminAutomation('status');
      if(!data||data.ok===false)throw new Error(data?.message||'자동 최신화 상태 확인 실패');
      state.characterAutomationCanManage=data.canManage===true;
      renderCharacterAutomation(data.characterRefresh||null);
      return state.characterAutomation;
    }catch(error){
      state.characterAutomationCanManage=false;
      renderCharacterAutomation(null);
      if(!silent)setStatus('#characterLookupStatus',error.message||String(error),'error');
      return null;
    }
  }

  async function saveCharacterAutomation(enabled){
    if(state.characterAutomationSaving||state.characterAutomation?.running===true)return;
    state.characterAutomationSaving=true;renderCharacterAutomation(state.characterAutomation);
    try{
      const data=await adminAutomation('save',{jobType:'character_refresh',enabled:enabled===true});
      if(!data||data.ok===false)throw new Error(data?.message||'자동 최신화 설정 저장 실패');
      state.characterAutomationCanManage=data.status?.canManage===true;
      renderCharacterAutomation(data.status?.characterRefresh||state.characterAutomation);
      toast(data.message||'캐릭터 자동 최신화 설정을 저장했습니다.');
    }catch(error){
      setStatus('#characterAutomationNotice',error.message||String(error),'error');
      await refreshCharacterAutomation(true);
    }finally{state.characterAutomationSaving=false;renderCharacterAutomation(state.characterAutomation);}
  }

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

  function lookupCount(value){
    const number=Number(value);
    return Number.isFinite(number)&&number>=0?number.toLocaleString('ko-KR'):'-';
  }

  function lookupErrorPresentation(error){
    const raw=String(error?.rawMessage||error?.message||error||'').trim();
    const code=String(error?.code||error?.errorCode||'').trim().toUpperCase();
    const probe=(code+' '+raw).toLowerCase();
    if(/failed to fetch|networkerror|cors|options/.test(probe))return{title:'조회 서버 연결에 실패했습니다.',message:'조회 대상은 보존되어 있습니다. 잠시 후 다시 시도해 주세요.',raw,code,retryable:true};
    if(/statement timeout|canceling statement|cancelling statement/.test(probe))return{title:'서버 처리 시간이 초과되었습니다.',message:'상태 정보를 불러오는 과정이 지연되었습니다. 잠시 후 상태를 다시 확인해 주세요.',raw,code,retryable:true};
    if(/429|rate.?limit|plaync_rate/.test(probe))return{title:'공식 사이트 요청 제한으로 잠시 대기 중입니다.',message:'서버가 제한 해제 후 자동으로 다시 시도합니다.',raw,code,retryable:true};
    if(/http[_ ]?5\d\d|edge_function_error|server_queue_worker_failed/.test(probe))return{title:'공식 조회 서버에 일시적인 문제가 있습니다.',message:'조회 대상은 보존되어 있으며 자동 재시도 또는 다시 시작할 수 있습니다.',raw,code,retryable:true};
    if(/timeout/.test(probe))return{title:'응답 대기 시간이 초과되었습니다.',message:'현재 상태를 다시 확인해 주세요.',raw,code,retryable:true};
    return{title:'예상하지 못한 오류가 발생했습니다.',message:'잠시 후 다시 시도해 주세요. 문제가 계속되면 기술 정보를 관리자에게 전달해 주세요.',raw,code,retryable:error?.retryable!==false};
  }

  function lookupStateLabel(value){
    const key=String(value||'').trim().toLowerCase();
    return({queued:'조회 대기',claimed:'조회 준비 중',processing:'캐릭터 정보 조회 중',running:'진행 중',retryable:'잠시 후 자동 재시도',final_failed:'자동 조회 실패 · 확인 필요',lookup_done:'공식 조회 완료',postprocess:'Server Master 반영 중',master_sync:'Server Master 반영 중',list_sync:'Google 명단 반영 중',synced:'Google 명단 반영 완료',completed:'완료',failed:'실패',cancelled:'중단',paused:'일시정지'})[key]||String(value||'-');
  }

  function setLookupError(error){
    const el=$('#characterLookupStatus');if(!el)return;
    const info=lookupErrorPresentation(error);
    const tech=[info.code?('오류 코드: '+info.code):'',info.raw?('원문: '+info.raw):'',state.lookupSessionId?('세션: '+state.lookupSessionId):''].filter(Boolean).join('\n');
    el.className='admin-statusline error';
    el.innerHTML='<strong>'+esc(info.title)+'</strong><span> '+esc(info.message)+'</span>'+(tech?'<details><summary>기술 정보 보기</summary><pre>'+esc(tech)+'</pre></details>':'');
  }

  function redactDiagnostic(value,depth=0){
    if(depth>8)return '[DEPTH_LIMIT]';
    if(Array.isArray(value))return value.slice(0,200).map(item=>redactDiagnostic(item,depth+1));
    if(!value||typeof value!=='object')return value;
    return Object.fromEntries(Object.entries(value).map(([key,item])=>[
      key,
      /pass.?key|pass.?code|session.?token|authorization|cookie|secret|apikey/i.test(key)?'[REDACTED]':redactDiagnostic(item,depth+1)
    ]));
  }

  async function copyText(text){
    const value=String(text||'');
    try{await navigator.clipboard.writeText(value);}
    catch(_error){
      const area=document.createElement('textarea');area.value=value;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();
      const ok=document.execCommand('copy');area.remove();if(!ok)throw new Error('클립보드 복사 권한을 확인해 주세요.');
    }
    toast('클립보드에 복사되었습니다.');
  }

  function diagnosticPayload(data=state.lookupConsole){
    const progressBox=data?.progress||{};
    return redactDiagnostic({
      schemaVersion:'kinojo-admin-lookup-diagnostic-v1',
      webVersion:'2026072805',
      copiedAt:new Date().toISOString(),
      sessionId:data?.sessionId||null,
      source:data?.session?.raw_payload?.requestedSurface||data?.queueMeta?.source||null,
      status:lookupStatusLabel(data),
      message:data?.message||data?.session?.message||data?.job?.message||'',
      queueMeta:data?.queueMeta||{},
      progress:progressBox.progress||progressBox,
      handoff:data?.handoff||{},
      playncRateGate:data?.playncRateGate||{},
      postprocess:data?.postprocess||{},
      performanceProfile:data?.performanceProfile||{},
      failures:data?.failurePreview||[],
      events:data?.events||[]
    });
  }

  async function copyLookupDiagnostics(){
    await copyText(JSON.stringify(diagnosticPayload(),null,2));
  }

  async function copyLookupFailure(index){
    const rows=Array.isArray(state.lookupConsole?.failurePreview)?state.lookupConsole.failurePreview:[];
    const row=rows[index];if(!row)return;
    await copyText(JSON.stringify(redactDiagnostic({
      schemaVersion:'kinojo-admin-lookup-failure-v1',
      webVersion:'2026072805',
      sessionId:state.lookupConsole?.sessionId||null,
      copiedAt:new Date().toISOString(),
      failure:row
    }),null,2));
  }

  function historySessionId(item){return String(item?.sessionId||item?.session_id||item?.id||'');}

  function historySummary(item){
    const summary=item?.summary||item?.result||item?.progress||{};
    const counts=item?.counts||summary?.counts||{};
    const total=Number(counts.total||summary.total||item?.total||0);
    const success=Number(counts.lookupDone||counts.success||summary.successCount||summary.success||item?.successCount||item?.success||0);
    const failed=Number(counts.failed||summary.finalFailedCount||summary.failedCount||item?.finalFailedCount||item?.failedCount||0);
    const skipped=Number(counts.adminExcluded||counts.skipped||summary.adminExcludedCount||summary.skippedCount||item?.skippedCount||0);
    return{total,success,failed,skipped};
  }

  function renderLookupHistory(){
    const root=$('#characterLookupHistoryList');if(!root)return;
    const rows=Array.isArray(state.lookupHistory)?state.lookupHistory:[];
    if(!rows.length){root.innerHTML='<div class="admin-empty">저장된 조회 기록이 없습니다.</div>';return;}
    root.innerHTML=rows.map(item=>{
      const sessionId=historySessionId(item);const summary=historySummary(item);
      const status=String(item.status||item.runStatus||item.resultStatus||'완료');
      const statusKey=status.toLowerCase();
      const canRetry=roleLevel()>=4&&summary.failed>0&&!['running','queued','active','processing'].includes(statusKey);
      const title=String(item.displayLabel||item.title||item.lookupFilterSummary||item.startedAt||item.started_at||'조회 기록');
      const time=item.completedAt||item.finishedAt||item.startedAt||item.started_at||'';
      const detail=state.lookupHistoryDetails[sessionId];
      return '<article class="admin-lookup-history-item"><div class="admin-lookup-history-main"><strong>'+esc(title)+'</strong><span>'+esc(status)+' · 대상 '+lookupCount(summary.total)+' · 성공 '+lookupCount(summary.success)+' · 실패 '+lookupCount(summary.failed)+' · 조회 제외 '+lookupCount(summary.skipped)+'</span><time>'+esc(formatServerTime(time))+'</time></div><div class="admin-lookup-history-actions"><button class="admin-btn" type="button" data-lookup-history-detail="'+esc(sessionId)+'">상세</button><button class="admin-btn" type="button" data-lookup-history-copy="'+esc(sessionId)+'">로그 복사</button>'+(canRetry?'<button class="admin-btn primary" type="button" data-lookup-history-retry="'+esc(sessionId)+'" data-lookup-failed-count="'+summary.failed+'">실패 '+lookupCount(summary.failed)+'명 재조회</button>':'')+'</div>'+(detail?'<pre class="admin-lookup-history-detail">'+esc(JSON.stringify(redactDiagnostic(detail),null,2))+'</pre>':'')+'</article>';
    }).join('');
  }

  async function loadLookupHistory(){
    const root=$('#characterLookupHistoryList');if(root)root.innerHTML='<div class="admin-empty">Server 조회 기록을 불러오는 중입니다.</div>';
    try{
      const data=await adminLookup('history',{limit:40});
      if(!data||data.ok===false)throw new Error(data?.message||'조회 기록을 불러오지 못했습니다.');
      state.lookupHistory=Array.isArray(data.items)?data.items:Array.isArray(data.reports)?data.reports:[];
      renderLookupHistory();
    }catch(error){if(root)root.innerHTML='<div class="admin-empty error">'+esc(error.message||String(error))+'</div>';}
  }

  async function loadLookupHistoryDetail(sessionId){
    if(!sessionId)return null;
    const data=await adminLookup('historydetail',{sessionId});
    if(!data||data.ok===false)throw new Error(data?.message||'조회 상세 기록을 불러오지 못했습니다.');
    const detail=data.report||data;
    state.lookupHistoryDetails[sessionId]=detail;
    renderLookupHistory();
    return detail;
  }

  async function handleLookupHistoryClick(button){
    const detailId=button.dataset.lookupHistoryDetail;
    const copyId=button.dataset.lookupHistoryCopy;
    const retryId=button.dataset.lookupHistoryRetry;
    const sessionId=detailId||copyId||retryId;if(!sessionId)return;
    if(retryId){
      await retryFailedCharacterLookup(retryId,Number(button.dataset.lookupFailedCount||0));
      return;
    }
    button.disabled=true;
    try{
      const detail=state.lookupHistoryDetails[sessionId]||await loadLookupHistoryDetail(sessionId);
      if(copyId)await copyText(JSON.stringify(redactDiagnostic({schemaVersion:'kinojo-lookup-history-v1',webVersion:'2026072805',copiedAt:new Date().toISOString(),sessionId,report:detail}),null,2));
    }catch(error){setStatus('#characterLookupStatus',error.message||String(error),'error');}
    finally{button.disabled=false;}
  }

  function lookupStatusLabel(data){
    if(!data)return '대기';
    if(data?.playncRateGate?.rateLimited===true)return '요청 제한 대기';
    if(data.controlState==='paused')return '일시정지';
    if(data.controlState==='cancelled')return '중단';
    if(data.waitingExtension)return 'Extension 연결 대기';
    const postprocess=data.postprocess||{};
    if(data.postprocessComplete===true&&data.partialSuccess===true)return '부분 완료';
    if(data.postprocessComplete===true)return '후처리 완료';
    if(String(postprocess.status||'').toLowerCase()==='failed')return data.postprocessRetryable===true?'후처리 재시도':'후처리 실패';
    const progressBox=data.progress||{};const progress=progressBox.progress||progressBox;
    if(data.active&&data.serverQueue===true&&String(progress.step2Status||'').toLowerCase()==='done')return 'Server 후처리';
    if(data.active&&data.serverQueue===true)return 'Server Queue 진행';
    if(data.active&&data.extensionClaimed)return '조회 진행';
    const status=String(data.session?.status||data.job?.status||'').toLowerCase();
    if(status==='completed'&&data.lookupOnlyPhase===true)return '조회 수집 완료';
    if(status==='completed')return '완료';
    if(status==='failed')return '실패';
    if(status==='cancelled')return '중단';
    return data.active?'실행 중':'대기';
  }

  function lookupStepClass(value){const key=String(value||'pending');return ['done','active','error'].includes(key)?key:'pending';}

  function lookupDuration(seconds){
    const value=Math.max(0,Math.round(Number(seconds||0)));
    if(!value)return '0초';
    const hours=Math.floor(value/3600);
    const minutes=Math.floor((value%3600)/60);
    const secs=value%60;
    return [hours?hours+'시간':'',minutes?minutes+'분':'',(!hours&&secs)?secs+'초':''].filter(Boolean).join(' ');
  }

  function lookupExitSafety(data){
    const handoff=data?.handoff||{};
    const serverQueue=data?.serverQueue===true;
    const active=data?.active===true;
    const sessionStatus=String(data?.session?.status||data?.job?.status||'').toLowerCase();
    if(handoff.safety==='complete'||sessionStatus==='completed'||data?.postprocessComplete===true)return{state:'complete',title:'조회 완료',message:'캐릭터 조회와 Master·성장 리뷰·랭킹·Google list 반영을 완료했습니다.'};
    if(serverQueue&&handoff.safety==='safe')return{state:'safe',title:'서버 실행 인계 완료',message:'이제 이 페이지나 브라우저를 닫아도 조회와 후처리가 정상적으로 계속됩니다.'};
    if(serverQueue&&handoff.safety==='attention')return{state:'attention',title:'서버 상태 확인 필요',message:String(handoff.message||'서버 Heartbeat가 지연되고 있습니다. 페이지를 유지하고 상태를 확인해 주세요.')};
    if(active)return{state:'unsafe',title:'현재 페이지를 닫지 마세요',message:serverQueue?'서버 실행을 준비하고 있습니다. 지금 페이지나 브라우저를 종료하면 조회가 중단될 수 있습니다.':'Extension 조회가 끝나기 전에는 페이지와 정보실 창을 닫지 마세요.'};
    return{state:'idle',title:'조회 대기',message:'조회 작업을 시작하면 브라우저 종료 안전 상태를 여기에서 확인할 수 있습니다.'};
  }

  function renderLookupExitSafety(data){
    const safety=lookupExitSafety(data);
    state.lookupExitSafety=safety.state;
    const box=$('#characterLookupExitSafety');
    if(!box)return;
    box.className='admin-lookup-exit-safety '+safety.state;
    const title=box.querySelector('[data-exit-safety-title]');if(title)title.textContent=safety.title;
    const message=box.querySelector('[data-exit-safety-message]');if(message)message.textContent=safety.message;
  }

  function lookupPhaseStep(phase){
    const no=Number(phase?.no||0);
    if(no<=1)return 1;
    if(no<=3)return 2;
    return 3;
  }

  function lookupPhaseHasUncertainEta(phase){
    const label=String(phase?.label||phase?.id||'');
    return Number(phase?.no||0)===3||/(누락|검산|재조회)/.test(label);
  }

  function lookupTargetName(row){return String(row?.character_name||row?.characterName||row?.name||'').trim();}

  function lookupFilterList(value){return Array.isArray(value)?value.map(v=>String(v)):String(value||'').split(',').map(v=>v.trim()).filter(Boolean);}

  function lookupTargetRoster(data,progress){
    const sources=[data?.targets,data?.targetPreview,data?.queueTargets,progress?.targets,progress?.targetRows,data?.session?.raw_payload?.targets];
    let rows=sources.find(Array.isArray);
    const filter=data?.lookupFilter||{};
    if(!rows||!rows.length)rows=[];
    const classSet=new Set(lookupFilterList(filter.classes||filter.classNames));
    const serverSet=new Set(lookupFilterList(filter.servers||filter.serverNames));
    const raceSet=new Set(lookupFilterList(filter.races||filter.raceNames));
    rows=(rows||[]).filter(row=>{
      const name=lookupTargetName(row);if(!name)return false;
      if(filter.characterName&&name!==String(filter.characterName))return false;
      const cls=String(row.class_name||row.className||'');const server=String(row.server_name||row.serverName||row.server_id||row.serverId||'');const race=String(row.race||row.race_name||row.raceName||'');
      return (!classSet.size||classSet.has(cls))&&(!serverSet.size||serverSet.has(server))&&(!raceSet.size||raceSet.has(race));
    });
    const unique=new Map();rows.forEach(row=>{const name=lookupTargetName(row);if(name&&!unique.has(name))unique.set(name,row);});
    return Array.from(unique.values()).sort((a,b)=>lookupTargetName(a).localeCompare(lookupTargetName(b),'ko'));
  }

  function saveLookupTargetStates(sessionId){
    if(!sessionId)return;
    try{localStorage.setItem('kinojoAdminLookupTargets:'+sessionId,JSON.stringify(state.lookupTargetStates));}catch(_err){}
  }

  function prepareLookupTargetStates(data,currentCharacter,failures,step2Status){
    const sessionId=String(data?.sessionId||'');
    if(sessionId!==state.lookupTargetSession){
      state.lookupTargetSession=sessionId;state.lookupLastCurrent='';state.lookupTargetStates={};
      try{state.lookupTargetStates=JSON.parse(localStorage.getItem('kinojoAdminLookupTargets:'+sessionId)||'{}')||{};}catch(_err){state.lookupTargetStates={};}
    }
    if(state.lookupLastCurrent&&state.lookupLastCurrent!==currentCharacter&&state.lookupTargetStates[state.lookupLastCurrent]!=='error')state.lookupTargetStates[state.lookupLastCurrent]='done';
    failures.forEach(row=>{const name=lookupTargetName(row);if(name)state.lookupTargetStates[name]='error';});
    if(currentCharacter)state.lookupTargetStates[currentCharacter]='active';
    state.lookupLastCurrent=currentCharacter||state.lookupLastCurrent;
    if(lookupStepClass(step2Status)==='done'){
      lookupTargetRoster(data,data?.progress?.progress||data?.progress||{}).forEach(row=>{const name=lookupTargetName(row);if(name&&state.lookupTargetStates[name]!=='error')state.lookupTargetStates[name]='done';});
    }
    saveLookupTargetStates(sessionId);
  }

  function renderLookupTargets(data,progress,currentCharacter,failures){
    const panel=$('#characterLookupTargetPanel'),root=$('#characterLookupTargetList');if(!panel||!root)return;
    const step2=lookupStepClass(progress.step2Status);const enabled=step2!=='pending';
    panel.classList.toggle('is-disabled',!enabled);
    const roster=lookupTargetRoster(data,progress);
    const rowMap=new Map(roster.map(row=>[lookupTargetName(row),row]));
    failures.forEach(row=>{const name=lookupTargetName(row);if(name&&!rowMap.has(name))rowMap.set(name,row);});
    if(currentCharacter&&!rowMap.has(currentCharacter))rowMap.set(currentCharacter,{characterName:currentCharacter});
    const rows=Array.from(rowMap.values()).sort((a,b)=>lookupTargetName(a).localeCompare(lookupTargetName(b),'ko'));
    const failNames=new Set(failures.map(lookupTargetName));
    const statusLabel={done:'조회 완료',active:'조회 중',error:'오류',standby:'다음 작업',pending:'대기'};
    let doneCount=0,errorCount=0;
    const rendered=rows.map(row=>{
      const name=lookupTargetName(row);
      let status=failNames.has(name)?'error':state.lookupTargetStates[name]||(enabled?'standby':'pending');
      if(name===currentCharacter)status='active';
      if(status==='done')doneCount++;if(status==='error')errorCount++;
      return '<article class="admin-lookup-target-row '+status+'"><strong title="'+esc(name)+'">'+esc(name)+'</strong><span>'+statusLabel[status]+'</span></article>';
    });
    root.innerHTML=rendered.length?rendered.join(''):'<div class="admin-empty">'+(enabled?'현재 Server 응답에서 확인 가능한 대상이 없습니다.':'STEP 2가 시작되면 대상별 상태가 표시됩니다.')+'</div>';
    const total=Number(progress.total||data?.queueMeta?.queueCount||rows.length||0);
    if($('#characterLookupTargetBadge'))$('#characterLookupTargetBadge').textContent=total.toLocaleString('ko-KR')+'명';
    if($('#characterLookupTargetSummary'))$('#characterLookupTargetSummary').textContent=!enabled?'STEP 2 시작 전':errorCount?'조회 '+doneCount.toLocaleString('ko-KR')+' · 오류 '+errorCount.toLocaleString('ko-KR'):'조회 완료 '+Number(progress.completedCount||doneCount).toLocaleString('ko-KR')+' / '+total.toLocaleString('ko-KR');
  }

  function renderLookupPhase(phase){
    const cls=lookupStepClass(phase.status);const phaseEta=Number(phase.etaSeconds||0);const uncertain=lookupPhaseHasUncertainEta(phase);const usesEta=String(phase.id||'')==='character_lookup';
    const timing=cls==='done'?'완료':uncertain?(cls==='active'?'누락 여부 확인 중':'대기'):usesEta&&phaseEta>0?'남은 시간 '+lookupDuration(phaseEta):cls==='active'?'실행 중':'대기';
    return '<article class="admin-lookup-phase '+cls+'">'
      +'<div class="admin-lookup-phase-head"><span>'+Number(phase.no||0)+'</span><strong>'+esc(phase.label||phase.id||'-')+'</strong><b>'+Number(phase.percent||0).toFixed(1)+'%</b></div>'
      +'<div class="admin-lookup-phase-progress"><i style="width:'+Math.max(0,Math.min(100,Number(phase.percent||0)))+'%"></i></div>'
      +'<div class="admin-lookup-phase-meta"><span>'+Number(phase.current||0).toLocaleString('ko-KR')+' / '+Number(phase.total||0).toLocaleString('ko-KR')+'건</span><span>'+timing+'</span></div>'
      +'<p>'+esc(phase.message||'')+'</p></article>';
  }


  function lookupMetricDuration(value){
    const ms=Math.max(0,Number(value||0));
    if(!ms)return '-';
    if(ms<1000)return Math.round(ms)+'ms';
    if(ms<60000)return (ms/1000).toFixed(ms<10000?1:0)+'초';
    const minutes=Math.floor(ms/60000),seconds=Math.round((ms%60000)/1000);
    return minutes+'분 '+String(seconds).padStart(2,'0')+'초';
  }

  function lookupMetricStageRows(profile){
    const fine=Array.isArray(profile?.fineStages)?profile.fineStages:[];
    if(fine.length)return fine.slice(0,8).map(row=>({label:row.label||row.key||'-',durationMs:Number(row.totalMs||0),meta:'평균 '+lookupMetricDuration(row.avgMs)+' · 최대 '+lookupMetricDuration(row.maxMs)+' · '+lookupCount(row.count)+'건',source:row.source||profile?.measurementSource||''}));
    const phases=Array.isArray(profile?.phases)?profile.phases:[];
    return phases.filter(row=>Number(row.durationMs||0)>0).sort((a,b)=>Number(b.durationMs||0)-Number(a.durationMs||0)).slice(0,8).map(row=>({label:row.label||row.key||'-',durationMs:Number(row.durationMs||0),meta:profile?.coarseOnly===true?'기존 STEP 기록 기준':'Server 실측'}));
  }

  function renderLookupPerformance(profile){
    const panel=$('#characterLookupPerformancePanel');if(!panel)return;
    const available=profile?.ok===true&&profile?.available!==false;
    const stateEl=$('#characterLookupPerformanceState');
    if(!available){
      panel.className='admin-lookup-history admin-lookup-profile is-disabled';
      if(stateEl)stateEl.textContent='조회 세션을 시작하면 단계별 시간이 표시됩니다.';
      ['Total','Bottleneck','Official','Cache','Retry','Sheet','Integrity'].forEach(key=>{const el=$('#characterLookupPerformance'+key);if(el)el.textContent='-';});
      const stages=$('#characterLookupPerformanceStages');if(stages)stages.innerHTML='<div class="admin-empty">성능·정확도 계측 대기</div>';
      return;
    }
    panel.className='admin-lookup-history admin-lookup-profile';
    const measurementSource=String(profile.measurementSource||'');
    if(stateEl)stateEl.textContent=measurementSource==='worker_batch_telemetry'?'Worker Batch 정밀 계측 · Contract 321':measurementSource==='runtime_events_inferred'?'기존 Server Runtime Event 재사용 · 추가 처리량 0':profile.coarseOnly===true?'기존 STEP 기록 기준':'Server 성능 계측 · Contract 321';
    const bottleneck=profile.bottleneck||{},official=profile.official||{},targets=profile.targets||{},sheet=profile.sheet||{},integrity=profile.integrity||{};
    const set=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
    set('#characterLookupPerformanceTotal',lookupMetricDuration(profile.totalDurationMs));
    set('#characterLookupPerformanceBottleneck',(bottleneck.label||'-')+(Number(bottleneck.durationMs||0)>0?' · '+lookupMetricDuration(bottleneck.durationMs):''));
    set('#characterLookupPerformanceOfficial',lookupMetricDuration(official.targetAvgMs)+' / '+lookupMetricDuration(official.targetMaxMs));
    set('#characterLookupPerformanceCache',lookupCount(official.cacheReuseCount)+' / '+lookupCount(targets.total));
    set('#characterLookupPerformanceRetry',lookupCount(targets.retryTargets)+'명 · '+lookupCount(targets.retryAttempts)+'회');
    set('#characterLookupPerformanceSheet',lookupMetricDuration(sheet.durationMs)+' · '+lookupCount(sheet.readbackVerifiedCount)+'/'+lookupCount(sheet.expectedCount));
    const integrityOk=integrity.ok===true;
    set('#characterLookupPerformanceIntegrity',integrityOk?'연결·readback 정상':'확인 필요 '+lookupCount(Number(integrity.targetLinkFailureCount||0)+Number(integrity.snapshotLinkFailureCount||0)+Number(integrity.sheetFailedCount||0)+Number(integrity.sheetPendingCount||0))+'건');
    const stages=$('#characterLookupPerformanceStages');
    if(stages){const rows=lookupMetricStageRows(profile);stages.innerHTML=rows.length?rows.map((row,index)=>{const sourceLabel=row.source==='runtime_events_inferred'?'Runtime Event':row.source==='worker_batch_telemetry'?'Worker 실측':profile.coarseOnly===true?'STEP 기록':'Server 계측';return '<article class="admin-lookup-phase '+(index===0?'active':'done')+'"><div class="admin-lookup-phase-head"><span>'+(index+1)+'</span><strong>'+esc(row.label)+'</strong><b>'+esc(lookupMetricDuration(row.durationMs))+'</b></div><div class="admin-lookup-phase-meta"><span>'+esc(row.meta)+'</span><span>'+esc(sourceLabel)+'</span></div></article>';}).join(''):'<div class="admin-empty">세부 계측 자료를 기다리는 중입니다.</div>';}
  }

  function renderCharacterLookupConsole(data){
    state.lookupConsole=data||null;
    const empty=!data||!data.sessionId;
    const active=data?.active===true;
    const progressBox=data?.progress||{};
    const progress=progressBox.progress||progressBox;
    const current=Number(progress.completedCount||progressBox.progressCurrent||0);
    const total=Number(progress.total||progressBox.progressTotal||data?.queueMeta?.queueCount||0);
    const percent=Math.max(0,Math.min(100,Number(progress.overallProgressPercent||0)));
    const statusLabel=lookupStatusLabel(data);
    const currentCharacter=String(progress.currentCharacter||data?.job?.current_character||data?.job?.currentCharacter||'');
    const message=String(data?.message||data?.session?.message||data?.job?.message||'조회 작업을 시작하면 이 영역에서 진행 상태를 확인할 수 있습니다.');
    renderLookupPerformance(data?.performanceProfile||null);
    const statusEl=$('#characterLookupState');if(statusEl){statusEl.textContent=statusLabel;statusEl.className='admin-pill '+(['완료','후처리 완료'].includes(statusLabel)?'ok':['실패','중단','후처리 실패'].includes(statusLabel)?'error':['일시정지','부분 완료','후처리 재시도','요청 제한 대기'].includes(statusLabel)?'warn':'active');}
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
    const eta=Number(progress.etaSeconds||data?.etaSeconds||0);
    if($('#characterLookupEta'))$('#characterLookupEta').textContent=eta>0?'예상 '+lookupDuration(eta):active?'계산 중':'-';
    if($('#characterLookupPhaseLabel'))$('#characterLookupPhaseLabel').textContent=String(progress.currentPhaseLabel||'대기');
    const queueMeta=data?.queueMeta||data?.session?.raw_payload?.queueMeta||{};const sourceSummary=data?.sourceSummary||{};
    if($('#characterLookupListCount'))$('#characterLookupListCount').textContent=lookupCount(sourceSummary.listCount??queueMeta.rawListCount);
    if($('#characterLookupMasterCount'))$('#characterLookupMasterCount').textContent=lookupCount(sourceSummary.serverMasterTotal??queueMeta.masterTotalCount??queueMeta.existingMasterCount);
    if($('#characterLookupMatchedCount'))$('#characterLookupMatchedCount').textContent=lookupCount(sourceSummary.matchedCount??queueMeta.matchedMasterCount??queueMeta.existingMasterCount);
    if($('#characterLookupNewCount'))$('#characterLookupNewCount').textContent=lookupCount(sourceSummary.newCharacterCount??queueMeta.newCharacterCount);
    if($('#characterLookupTargetCount'))$('#characterLookupTargetCount').textContent=lookupCount(sourceSummary.targetCount??queueMeta.queueCount??total);
    const steps=[
      {id:'characterLookupStep1',status:progress.step1Status,percent:progress.step1Percent,label:'원본 대조'},
      {id:'characterLookupStep2',status:progress.step2Status,percent:progress.step2Percent,label:'PLAYNC 공식 조회'},
      {id:'characterLookupStep3',status:progress.step3Status,percent:progress.step3Percent,label:'Server Master·list 반영'}
    ];
    steps.forEach(step=>{const el=$('#'+step.id);if(!el)return;const cls=lookupStepClass(step.status);el.className='admin-lookup-step-card '+cls;const title=el.querySelector('header strong');const value=el.querySelector('header>span');if(title)title.textContent=step.label;if(value)value.textContent=Number(step.percent||0).toFixed(1)+'%';});
    const phases=Array.isArray(progress.phases)?progress.phases:(Array.isArray(data?.phases)?data.phases:[]);
    [1,2,3].forEach(stepNo=>{const root=$('#characterLookupPhaseListStep'+stepNo);if(!root)return;const items=phases.filter(phase=>lookupPhaseStep(phase)===stepNo);root.innerHTML=items.length?items.map(renderLookupPhase).join(''):'<div class="admin-empty">'+(stepNo===1?'원본 대조':stepNo===2?'공식 조회':'서버·시트 반영')+' 대기</div>';});
    const failures=$('#characterLookupFailures');const failureRows=Array.isArray(data?.failurePreview)?data.failurePreview:[];
    prepareLookupTargetStates(data,currentCharacter,failureRows,progress.step2Status);renderLookupTargets(data,progress,currentCharacter,failureRows);
    const events=$('#characterLookupEvents');if(events){const rows=Array.isArray(data?.events)?data.events:[];events.innerHTML=rows.length?rows.map(row=>'<article><time>'+esc(formatServerTime(row.created_at||row.createdAt))+'</time><strong>'+esc(row.stage||row.event_type||row.eventType||'EVENT')+'</strong><span>'+esc(row.message||'')+'</span></article>').join(''):'<div class="admin-empty">아직 조회 이벤트가 없습니다.</div>';}
    if(failures){
      const failedCount=Math.max(failureRows.length,Number(progress.finalFailedCount||0));const canRetry=roleLevel()>=4&&!active&&!characterAutomationBlocked()&&failedCount>0&&Boolean(data?.sessionId);
      failures.hidden=failedCount<=0;
      failures.innerHTML=failedCount>0?'<div class="admin-lookup-failure-head"><div><strong>확인 필요 캐릭터 '+failedCount.toLocaleString('ko-KR')+'명</strong><span>최종 실패 대상만 새 공통 Queue로 다시 조회하거나 오류 정보를 복사할 수 있습니다.</span></div>'+(canRetry?'<button class="admin-btn primary" type="button" data-lookup-failed-retry="'+esc(data.sessionId)+'" data-lookup-failed-count="'+failedCount+'" '+(state.lookupRetrying?'disabled':'')+'>'+(state.lookupRetrying?'재조회 준비 중...':'실패 '+failedCount.toLocaleString('ko-KR')+'명만 재조회')+'</button>':'')+'</div>'+failureRows.map((row,index)=>'<article><div><span>'+esc(row.character_name||row.characterName||'-')+' · '+esc(lookupStateLabel(row.target_status||row.targetStatus||'-'))+' · '+Number(row.attempt_count||row.attemptCount||0)+'/'+Number(row.max_attempts||row.maxAttempts||3)+'</span><em>'+esc(row.last_error||row.lastError||row.last_failure_code||row.lastFailureCode||'')+'</em></div><button class="admin-btn" type="button" data-lookup-failure-copy="'+index+'">오류 정보 복사</button></article>').join(''):'';
    }
    const canControl=data?.canControl===true;const paused=data?.controlState==='paused';const singleScope=String($('#characterLookupScope')?.value||'all')==='single';
    if($('#characterLookupServerQueueBtn')){const button=$('#characterLookupServerQueueBtn');button.disabled=state.lookupStarting||state.lookupQueueRunning||state.lookupRetrying||active||roleLevel()<4||characterAutomationBlocked();button.textContent=state.lookupQueueRunning?'조회 준비 중...':singleScope?'선택 캐릭터 조회 시작':'전체 조회 시작';}
    if($('#characterLookupPauseBtn'))$('#characterLookupPauseBtn').disabled=!canControl||!active||paused;
    if($('#characterLookupResumeBtn'))$('#characterLookupResumeBtn').disabled=!canControl||!active||!paused;
    if($('#characterLookupStopBtn'))$('#characterLookupStopBtn').disabled=!canControl||!active;
    renderLookupExitSafety(data);
  }

  async function refreshCharacterLookupStatus(options={}){
    loadStoredLookupSession();
    const automationPromise=refreshCharacterAutomation(true);
    try{
      let data=await adminLookup('status',{sessionId:null});
      if((!data||data.ok===false||!data.sessionId)&&state.lookupSessionId)data=await adminLookup('status',{sessionId:state.lookupSessionId});
      if(!data||data.ok===false)throw new Error(data?.message||'조회 상태 확인 실패');
      if(data.sessionId&&data.sessionId!==state.lookupSessionId)storeLookupSession(data.sessionId,'');
      renderCharacterLookupConsole(data);
      if(data.active===true&&data.waitingExtension===true&&state.lookupSessionToken&&Date.now()-state.lookupHeartbeatAt>20000){
        state.lookupHeartbeatAt=Date.now();
        const p=data.progress?.progress||data.progress||{};
        adminLookup('heartbeat',{sessionId:data.sessionId,sessionToken:state.lookupSessionToken,current:Number(p.completedCount||0),total:Number(p.total||data.queueMeta?.queueCount||0)}).catch(()=>{});
      }
      if(options.statusLine!==false)setStatus('#characterLookupStatus',data.message||'조회 상태를 갱신했습니다.',data.active?'ok':'');
      await automationPromise;
      return data;
    }catch(err){await automationPromise;setLookupError(err);if(!state.lookupConsole)renderCharacterLookupConsole(null);return null;}
  }

  function startCharacterLookupPolling(){
    if(state.lookupPollTimer)return;
    state.lookupPollTimer=setInterval(()=>{if(state.tab==='characters'&&state.subtab==='lookup')refreshCharacterLookupStatus({statusLine:false});},3000);
  }

  async function loadCharacterLookupConsole(force){
    loadStoredLookupSession();
    if(roleLevel()<4){setStatus('#characterLookupStatus','Manager는 진행 상태만 확인할 수 있고 조회 시작·제어는 MASTER·SUB MASTER만 가능합니다.','');}
    await refreshCharacterLookupStatus({statusLine:force===true});
    renderCharacterLookupConsole(state.lookupConsole||null);
    await loadLookupHistory();
    startCharacterLookupPolling();
  }

  async function startCharacterServerQueue(){
    if(state.lookupStarting||state.lookupQueueRunning)return;
    if(roleLevel()<4){setStatus('#characterLookupStatus','Server Queue 시작 권한은 MASTER·SUB MASTER에게만 있습니다.','error');return;}
    if(characterAutomationBlocked()){setStatus('#characterLookupStatus',state.characterAutomation?.message||'자동 실행 상태 확인 후 수동 조회를 이용해 주세요.','error');return;}
    let lookupFilter;
    try{lookupFilter=readLookupFilter();}catch(err){setStatus('#characterLookupStatus',err.message||String(err),'error');return;}
    state.lookupStarting=true;state.lookupQueueRunning=true;renderCharacterLookupConsole(state.lookupConsole||null);setStatus('#characterLookupStatus','Google list와 Server Master를 대조해 Server Target Queue를 준비하는 중입니다...','');
    try{
      const data=await adminLookup('startserverqueue',{lookupFilter});
      if(!data||data.ok===false)throw new Error(data?.message||'Server Queue 시작 실패');
      storeLookupSession(data.sessionId||'',data.sessionToken||'');
      if(data.noTargets===true){setStatus('#characterLookupStatus',data.lookupFilter?.lookupMode==='missing_only'?'신규 캐릭터가 없어 조회 없이 완료했습니다.':'조회 대상이 없습니다.','ok');}
      else{
        setStatus('#characterLookupStatus','Server Queue 준비 완료 · 서버 자동 실행을 인계하는 중입니다...','');
        await refreshCharacterLookupStatus({statusLine:false});
        const handed=await adminLookup('startautonomous',{sessionId:data.sessionId,sessionToken:data.sessionToken});
        if(!handed||handed.ok===false||handed.accepted!==true)throw new Error(handed?.message||'서버 자동 실행 인계 실패');
        setStatus('#characterLookupStatus',handed.message||'서버 실행 인계를 완료했습니다.','ok');
        toast('서버 실행 인계 완료 · 브라우저 종료 가능');
        await refreshCharacterLookupStatus({statusLine:false});
      }
    }catch(err){setLookupError(err);}
    finally{state.lookupStarting=false;state.lookupQueueRunning=false;renderCharacterLookupConsole(state.lookupConsole||null);}
  }

  async function retryFailedCharacterLookup(sourceSessionId,knownFailedCount=0){
    const sourceId=String(sourceSessionId||'').trim();
    if(state.lookupStarting||state.lookupQueueRunning||state.lookupRetrying)return;
    if(roleLevel()<4){setStatus('#characterLookupStatus','실패 대상 재조회 권한은 MASTER·SUB MASTER에게만 있습니다.','error');return;}
    if(!sourceId){setStatus('#characterLookupStatus','재조회할 이전 세션 ID가 없습니다.','error');return;}
    const currentFailed=sourceId===String(state.lookupConsole?.sessionId||'')?Number(state.lookupConsole?.progress?.progress?.finalFailedCount||state.lookupConsole?.progress?.finalFailedCount||0):0;
    const failedCount=Math.max(0,Number(knownFailedCount||currentFailed||0));
    const targetLabel=failedCount>0?'최종 실패 '+failedCount.toLocaleString('ko-KR')+'명':'이 세션의 최종 실패 대상';
    if(!confirm(targetLabel+'만 새 조회 세션으로 다시 조회할까요? 기존 세션 기록은 그대로 보존됩니다.'))return;
    state.lookupRetrying=true;
    renderCharacterLookupConsole(state.lookupConsole||null);
    renderLookupHistory();
    setStatus('#characterLookupStatus',targetLabel+'의 새 Server Queue를 준비하는 중입니다...','');
    try{
      const data=await adminLookup('retryfailed',{sourceSessionId:sourceId});
      if(!data||data.ok===false)throw new Error(data?.message||'실패 대상 재조회 Queue 준비 실패');
      storeLookupSession(data.sessionId||'',data.sessionToken||'');
      if(data.noTargets===true){
        setStatus('#characterLookupStatus','이전 세션에 다시 조회할 최종 실패 대상이 없습니다.','ok');
        await Promise.all([refreshCharacterLookupStatus({statusLine:false}),loadLookupHistory()]);
        return;
      }
      setStatus('#characterLookupStatus','실패 대상 '+Number(data.queueMeta?.queueCount||0).toLocaleString('ko-KR')+'명 Queue 준비 완료 · 서버 실행을 인계하는 중입니다...','');
      await refreshCharacterLookupStatus({statusLine:false});
      const handed=await adminLookup('startautonomous',{sessionId:data.sessionId,sessionToken:data.sessionToken});
      if(!handed||handed.ok===false||handed.accepted!==true)throw new Error(handed?.message||'실패 대상 서버 자동 실행 인계 실패');
      setStatus('#characterLookupStatus',handed.message||'실패 대상 재조회 실행을 서버에 인계했습니다.','ok');
      toast('실패 대상 재조회 인계 완료 · 브라우저 종료 가능');
      await Promise.all([refreshCharacterLookupStatus({statusLine:false}),loadLookupHistory()]);
    }catch(err){
      setStatus('#characterLookupStatus',err.message||String(err),'error');
    }finally{
      state.lookupRetrying=false;
      renderCharacterLookupConsole(state.lookupConsole||null);
      renderLookupHistory();
    }
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
      const status=await refreshCharacterLookupStatus({statusLine:false});
      if(command==='resume'&&status?.serverQueue===true&&state.lookupSessionToken){
        state.lookupQueueRunning=true;renderCharacterLookupConsole(status);
        try{
          const handed=await adminLookup('startautonomous',{sessionId,sessionToken:state.lookupSessionToken});
          if(!handed||handed.ok===false||handed.accepted!==true)throw new Error(handed?.message||'서버 자동 실행 재인계 실패');
          setStatus('#characterLookupStatus',handed.message||'서버 자동 실행을 재개했습니다.','ok');
          await refreshCharacterLookupStatus({statusLine:false});
        }finally{state.lookupQueueRunning=false;renderCharacterLookupConsole(state.lookupConsole||null);}
      }
    }catch(err){setStatus('#characterLookupStatus',err.message||String(err),'error');}
  }

  async function searchCharacters(){
    const search=$('#characterSearch')?.value||''; const include=$('#characterIncludeInactive')?.checked!==false;
    setStatus('#characterStatus','캐릭터 검색 중...','');
    try{const data=await adminCharacter('search',{search,includeInactive:include,limit:300});state.characters=data.characters||[];state.characterSummary=data.summary||{};renderCharacterSummary();renderCharacters();setStatus('#characterStatus','Server 상태 '+state.characters.length+'건을 불러왔습니다.','ok');}
    catch(err){setStatus('#characterStatus',err.message||String(err),'error');}
  }

  function renderCharacterSummary(){
    const summary=state.characterSummary||{};
    const values={
      characterStateReviewCount:Number(summary.reviewCount||0),
      characterStateLookupExcludedCount:Number(summary.lookupExcludedCount||0),
      characterStateVisibilityExcludedCount:Number(summary.visibilityExcludedCount||0),
      characterStateTotalCount:Number(summary.totalCount||state.characters.length||0)
    };
    Object.entries(values).forEach(([id,value])=>{const el=$('#'+id);if(el)el.textContent=value.toLocaleString('ko-KR');});
  }

  function characterMode(c){
    if(c.lookupExcluded&&c.visibilityExcluded)return 'both';
    if(c.lookupExcluded)return 'lookup';
    if(c.visibilityExcluded)return 'visibility';
    return 'normal';
  }

  function filteredCharacters(){
    const filter=$('#characterStateFilter')?.value||'attention';
    if(filter==='review')return state.characters.filter(c=>c.exclusionReviewRequired);
    if(filter==='lookup')return state.characters.filter(c=>c.lookupExcluded);
    if(filter==='visibility')return state.characters.filter(c=>c.visibilityExcluded);
    if(filter==='normal')return state.characters.filter(c=>!c.lookupExcluded&&!c.visibilityExcluded&&!c.exclusionReviewRequired);
    if(filter==='attention')return state.characters.filter(c=>c.exclusionReviewRequired||c.lookupExcluded||c.visibilityExcluded);
    return state.characters;
  }

  function option(value,label,current){
    return '<option value="'+value+'" '+(value===current?'selected':'')+'>'+label+'</option>';
  }

  function renderCharacters(){
    const root=$('#characterList');if(!root)return;
    const list=filteredCharacters();
    root.innerHTML=list.length?list.map(c=>{
      const name=esc(c.characterName),server=esc(c.serverName||c.serverId||''),cls=esc(c.className||'');
      const mode=characterMode(c),reason=c.exclusionReason||c.inactiveReason||'기타';
      const review=c.exclusionReviewRequired===true;
      const failureStreak=Number(c.lookupFailureStreak||0),failureTotal=Number(c.lookupFailureTotal||0);
      const lastFailure=c.lastLookupFailedAt?formatServerTime(c.lastLookupFailedAt):'기록 없음';
      const lastSuccess=c.lastLookupSuccessAt?formatServerTime(c.lastLookupSuccessAt):'기록 없음';
      const statusPills=[
        c.identityReview?'<span class="admin-pill warn">신원 확인 대기</span>':'',
        review?'<span class="admin-pill warn">제외 검토</span>':'',
        c.lookupExcluded?'<span class="admin-pill error">조회 제외</span>':'<span class="admin-pill ok">조회 대상</span>',
        c.visibilityExcluded?'<span class="admin-pill error">노출 제외</span>':'<span class="admin-pill ok">사이트 노출</span>'
      ].join('');
      const identityBadge=c.identityBadge
        ?'<span class="admin-character-identity-badge" title="'+esc(c.identityBadge.detail||c.identityBadge.label||'')+'">'+esc(c.identityBadge.label||'이전 신원')+'</span>'
        :'';
      const identityReview=c.identityReview;
      const identityReviewHtml=identityReview?(()=>{
        const current=identityReview.current||{},candidate=identityReview.candidate||{},evidence=identityReview.evidence||{};
        const equipmentOverlap=Number(evidence.equipmentOverlapCount||evidence.equipment_overlap_count||0);
        return '<section class="admin-character-identity-review"><div><strong>신원 변경 후보 확인</strong><span>'+esc([current.serverName,current.characterName].filter(Boolean).join(' '))+' → '+esc([candidate.serverName,candidate.characterName].filter(Boolean).join(' '))+'</span><small>기존 '+esc(current.charKeyMasked||'-')+' · 후보 '+esc(candidate.charKeyMasked||'-')+(equipmentOverlap?' · 장비 일치 '+equipmentOverlap+'부위':'')+'</small></div><div class="admin-character-identity-actions"><button class="admin-btn" type="button" data-identity-review-reject data-review-id="'+Number(identityReview.reviewId||0)+'">거절</button><button class="admin-btn primary" type="button" data-identity-review-approve data-review-id="'+Number(identityReview.reviewId||0)+'">동일 캐릭터 승인</button></div></section>';
      })():'';
      const identityProbeHtml=c.hasPersistentKey&&!identityReview
        ?'<section class="admin-character-identity-probe"><div><strong>서버 이전·이름 변경 탐색</strong><span>공식 전체 서버에서 저장된 고유키와 일치하는 캐릭터를 찾습니다.</span></div><button class="admin-btn" type="button" data-identity-probe>변경 탐색</button></section>'
        :'';
      return '<article class="admin-character-status-row '+(review?'needs-review':'')+'" data-character="'+name+'" data-character-id="'+Number(c.characterId||0)+'" data-server-id="'+esc(c.serverId||'')+'">'
        +'<div class="admin-character-status-head"><div><strong>'+name+'</strong>'+identityBadge+'<span>'+server+' · '+cls+' · PVE '+Number(c.pvePower||0).toLocaleString('ko-KR')+' · PVP '+Number(c.pvpPower||0).toLocaleString('ko-KR')+'</span></div><div class="admin-character-pills">'+statusPills+'</div></div>'
        +identityReviewHtml
        +identityProbeHtml
        +(review?'<div class="admin-character-review-callout"><strong>공식 정보 미확인 '+failureStreak+'회 연속</strong><span>자동 제외하지 않았습니다. 삭제·서버 이전·이름 변경 여부를 확인한 뒤 상태를 선택하세요.</span></div>':'')
        +'<div class="admin-character-failure-meta"><span>연속 실패 <strong>'+failureStreak+'회</strong></span><span>누적 공식 미확인 <strong>'+failureTotal+'회</strong></span><span>최근 오류 <strong>'+esc(c.lastLookupFailureCode||'-')+'</strong></span><span>최근 실패 <strong>'+esc(lastFailure)+'</strong></span><span>최근 성공 <strong>'+esc(lastSuccess)+'</strong></span></div>'
        +'<details class="admin-character-status-editor" '+(review?'open':'')+'><summary>조회·노출 상태 관리</summary><div class="admin-character-status-fields">'
        +'<label>관리 상태<select class="admin-select" data-char-mode>'+option('normal','정상 조회·노출',mode)+option('lookup','조회만 제외',mode)+option('visibility','사이트 노출만 제외',mode)+option('both','조회·노출 모두 제외',mode)+'</select></label>'
        +'<label>제외 사유<select class="admin-select" data-char-reason>'+option('캐릭터 삭제','캐릭터 삭제',reason)+option('서버 이전','서버 이전',reason)+option('이름 변경','이름 변경',reason)+option('기타','기타',reason)+'</select></label>'
        +'<label class="wide">관리 메모<input class="admin-input" data-char-memo value="'+esc(c.exclusionMemo||c.inactiveMemo||'')+'" placeholder="확인 내용이나 새 서버·이름을 기록"/></label>'
        +'</div><div class="admin-character-status-actions"><small>상태를 바꿔도 기존 프로필·Snapshot·조회 이력은 삭제되지 않습니다.</small><button class="admin-btn primary" type="button" data-char-status-save>상태 저장</button></div></details>'
        +'</article>';
    }).join(''):'<div class="admin-empty">선택한 상태 조건에 맞는 캐릭터가 없습니다.</div>';
  }

  async function saveCharacterStatus(btn){
    const row=btn.closest('[data-character]');const characterId=Number(row?.dataset.characterId||0);
    const mode=row?.querySelector('[data-char-mode]')?.value||'normal';
    const reason=row?.querySelector('[data-char-reason]')?.value||'기타';
    const memo=row?.querySelector('[data-char-memo]')?.value||'';
    const lookupExcluded=mode==='lookup'||mode==='both';
    const visibilityExcluded=mode==='visibility'||mode==='both';
    if(mode!=='normal'&&!confirm('이 캐릭터의 관리 상태를 변경할까요? 기존 기록은 보존됩니다.'))return;
    btn.disabled=true;
    try{const res=await adminCharacter('updateExclusion',{characterId,lookupExcluded,visibilityExcluded,reason:mode==='normal'?'':reason,memo});if(res.ok===false)throw new Error(res.message||'처리 실패');toast(res.message||'상태 저장 완료');await searchCharacters();}
    catch(err){ setStatus('#characterStatus',err.message||String(err),'error'); btn.disabled=false; }
  }

  async function decideIdentityReview(btn,approve){
    const reviewId=Number(btn?.dataset.reviewId||0);
    if(!reviewId)return;
    const promptText=approve?'이 후보를 동일 캐릭터로 확정하고 Master와 list 시트를 변경할까요?':'이 신원 후보를 거절하고 기존 정보를 유지할까요?';
    if(!confirm(promptText))return;
    btn.disabled=true;
    try{
      const res=await adminCharacter(approve?'identityReviewApprove':'identityReviewReject',{reviewId});
      if(!res||res.ok===false)throw new Error(res?.message||'신원 검토 처리 실패');
      if(approve&&res.listSyncOk!==true)throw new Error(res?.message||'Master 반영 후 list 시트 readback 확인이 필요합니다.');
      toast(res.message||'신원 검토 처리 완료');
      await Promise.all([searchCharacters(),loadLookupHistory()]);
    }catch(err){setStatus('#characterStatus',err.message||String(err),'error');btn.disabled=false;}
  }

  async function probeCharacterIdentity(btn){
    const row=btn.closest('[data-character]');const characterId=Number(row?.dataset.characterId||0);
    if(!characterId)return;
    btn.disabled=true;btn.textContent='공식 조회 중...';
    try{
      const probe=await adminCharacter('identityProbe',{characterId});
      if(!probe||probe.ok===false)throw new Error(probe?.message||'신원 변경 탐색에 실패했습니다.');
      if(!probe.found){
        toast(probe.message||'동일 고유키 후보를 찾지 못했습니다.');
        await searchCharacters();
        return;
      }
      const current=probe.current||{},candidate=probe.candidate||{};
      const before=[current.serverName,current.characterName].filter(Boolean).join(' ')||'현재 캐릭터';
      const after=[candidate.serverName,candidate.characterName].filter(Boolean).join(' ')||'새 캐릭터';
      if(!confirm(before+' → '+after+'\n\n동일 고유키가 확인됐습니다. Master와 list 시트를 변경할까요?'))return;
      btn.textContent='Master·list 반영 중...';
      const applied=await adminCharacter('identityApply',{characterId});
      if(!applied||applied.ok===false)throw new Error(applied?.message||'신원 변경 적용에 실패했습니다.');
      if(applied.listSyncOk!==true)throw new Error(applied?.message||'Master 반영 후 list 시트 readback 확인이 필요합니다.');
      toast(applied.message||'캐릭터 정보와 list 시트를 반영했습니다.');
      await Promise.all([searchCharacters(),loadLookupHistory()]);
    }catch(err){
      setStatus('#characterStatus',err.message||String(err),'error');
    }finally{
      btn.disabled=false;btn.textContent='변경 탐색';
    }
  }

  document.addEventListener('change',event=>{if(event.target?.id==='characterAutomationToggle')saveCharacterAutomation(event.target.checked);});

  Object.assign(A,{lookupSplit,lookupSessionStorageKey,lookupTokenStorageKey,characterAutomationBlocked,renderCharacterAutomation,refreshCharacterAutomation,saveCharacterAutomation,loadStoredLookupSession,storeLookupSession,readLookupFilter,lookupCount,lookupErrorPresentation,lookupStateLabel,setLookupError,redactDiagnostic,copyText,diagnosticPayload,copyLookupDiagnostics,copyLookupFailure,historySessionId,historySummary,renderLookupHistory,loadLookupHistory,loadLookupHistoryDetail,handleLookupHistoryClick,lookupStatusLabel,lookupStepClass,lookupDuration,lookupExitSafety,renderLookupExitSafety,lookupPhaseStep,lookupPhaseHasUncertainEta,lookupTargetName,lookupFilterList,lookupTargetRoster,saveLookupTargetStates,prepareLookupTargetStates,renderLookupTargets,renderLookupPhase,lookupMetricDuration,lookupMetricStageRows,renderLookupPerformance,renderCharacterLookupConsole,refreshCharacterLookupStatus,startCharacterLookupPolling,loadCharacterLookupConsole,startCharacterServerQueue,retryFailedCharacterLookup,controlCharacterLookup,searchCharacters,renderCharacterSummary,characterMode,filteredCharacters,option,renderCharacters,saveCharacterStatus,decideIdentityReview,probeCharacterIdentity});
})(window.KinojoAdmin);
