/* KINOJO Admin Meter administration, server status, environment, and visitors v2026081003 */
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
  const METER_CHANNELS=['stable','staging'];
  const METER_LEVELS=[1,2,3,4,5];

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

  function meterChannel(value){return String(value||'stable').toLowerCase()==='staging'?'staging':'stable';}

  function meterCard(channel,kind){return $('[data-meter-'+kind+'-card][data-meter-channel="'+meterChannel(channel)+'"]');}

  function selectedMeterLevels(root,selector){
    return $$(selector+':checked',root).map(input=>Number(input.value)).filter(level=>METER_LEVELS.includes(level));
  }

  function setMeterCardStatus(root,selector,message,kind){
    const target=$(selector,root);if(!target)return;
    target.textContent=message||'';
    target.className='admin-statusline '+(kind||'');
  }

  function setMeterBadge(root,selector,label,off){
    const badge=$(selector,root);if(!badge)return;
    badge.textContent=label;
    badge.classList.toggle('is-off',off===true);
  }

  function setMeterLevelsEnabled(root,fieldsetSelector,enabled){
    const fieldset=$(fieldsetSelector,root);if(fieldset)fieldset.disabled=!enabled;
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

  function renderMeterDownload(channel,data){
    const operation=data?.operation||{};
    const mode=String(operation.downloadMode||(operation.downloadEnabled===true?'ALL':'CLOSED')).toUpperCase();
    const enabled=mode!=='CLOSED';
    const root=meterCard(channel,'download');if(!root)return;
    const toggle=$('[data-meter-download-enabled]',root);if(toggle)toggle.checked=enabled;
    const rawLevels=Array.isArray(operation.allowedLevels)?operation.allowedLevels.map(Number):[];
    const levels=mode==='ALL'?METER_LEVELS:rawLevels;
    $$('[data-meter-download-level]',root).forEach(input=>{input.checked=levels.includes(Number(input.value));});
    setMeterLevelsEnabled(root,'[data-meter-download-levels]',enabled);
    const message=$('[data-meter-download-message]',root);if(message)message.value=String(operation.disabledMessage||'키노조 미터 다운로드를 점검하고 있습니다. 잠시 후 다시 시도해 주세요.');
    const resume=$('[data-meter-resume-at]',root);if(resume){resume.value=operation.resumeAt?meterDateInput(operation.resumeAt):'';resume.disabled=enabled;}
    setMeterBadge(root,'[data-meter-download-badge]',enabled?(mode==='ALL'?'ON · 전체 등급':'ON · 선택 등급'):'OFF · 다운로드 닫힘',!enabled);
  }

  function renderMeterLaunch(channel,data){
    const operation=data?.operation||{};
    const launchEnabled=operation.launchEnabled===true;
    const root=meterCard(channel,'launch');if(!root)return;
    const toggle=$('[data-meter-launch-enabled]',root);if(toggle)toggle.checked=launchEnabled;
    const fallback=Array.isArray(operation.allowedLevels)?operation.allowedLevels:[];
    const allowedLevels=Array.isArray(operation.launchAllowedLevels)?operation.launchAllowedLevels.map(Number):fallback.map(Number);
    $$('[data-meter-launch-level]',root).forEach(input=>{input.checked=allowedLevels.includes(Number(input.value));});
    setMeterLevelsEnabled(root,'[data-meter-launch-levels]',launchEnabled);
    const launchMessage=$('[data-meter-launch-message]',root);if(launchMessage)launchMessage.value=String(operation.launchMessage||'키노조 미터 실행이 일시 중지되어 있습니다. 잠시 후 다시 시도해 주세요.');
    setMeterBadge(root,'[data-meter-launch-badge]',launchEnabled?'ON · 선택 등급 실행':'OFF · 실행 차단',!launchEnabled);
  }

  function renderMeterStatistics(channel,data){
    const statistics=data?.statisticsOperation||{};
    const overview=data?.combatOverview||{};
    const statisticsEnabled=statistics.publicEnabled===true;
    const root=meterCard(channel,'statistics');if(!root)return;
    const toggle=$('[data-meter-statistics-enabled]',root);if(toggle)toggle.checked=statisticsEnabled;
    const message=$('[data-meter-statistics-message]',root);if(message)message.value=String(statistics.publicMessage||'전투 통계 준비 중입니다.');
    setMeterBadge(root,'[data-meter-statistics-badge]',statisticsEnabled?'ON · 통계 공개':'OFF · 통계 비공개',!statisticsEnabled);
    $$('[data-meter-metric]',root).forEach(target=>{target.textContent=Number(overview[target.dataset.meterMetric]||0).toLocaleString('ko-KR');});
  }

  function renderMeterRelease(channel,data){
    const operation=data?.operation||{};
    const distribution=data?.distribution||{};
    const launcher=distribution.launcher||null;
    const core=distribution.core||null;
    const root=$('[data-meter-release-card][data-meter-channel="'+meterChannel(channel)+'"]');if(!root)return;
    const values={launcherVersion:launcher?.version||'-',launcherFile:launcher?.fileName||'-',launcherSize:meterFileSize(launcher?.fileSize),coreVersion:core?.version||'-',combinedSize:meterFileSize(distribution.combinedFileSize)};
    $$('[data-meter-release]',root).forEach(target=>{target.textContent=values[target.dataset.meterRelease]||'-';});
    const stateLabel=distribution.releaseAvailable===true?(operation.launchEnabled===true?'배포 준비 · Core ON':'배포 준비 · Core OFF'):'Launcher/Core 준비 중';
    setMeterBadge(root,'[data-meter-release-state]',stateLabel,distribution.releaseAvailable!==true||operation.launchEnabled!==true);
  }

  function renderMeterAdminConsole(channel,data){
    const key=meterChannel(channel);
    state.meterConsoles=state.meterConsoles||{};
    const previous=state.meterConsoles[key]||{};
    const next=Object.assign({},previous,data||{},
      {statisticsOperation:data?.statisticsOperation||previous.statisticsOperation||{},combatOverview:data?.combatOverview||previous.combatOverview||{}});
    state.meterConsoles[key]=next;
    renderMeterDownload(key,next);
    renderMeterLaunch(key,next);
    renderMeterStatistics(key,next);
    renderMeterRelease(key,next);
    if(Array.isArray(next.notices)){
      state.meterNotices=next.notices.map(normalizeMeterNotice);
      renderMeterNotices();
    }
  }

  async function loadMeterAdminConsole(){
    if(!isMaster())return;
    $$('[data-meter-load-status]').forEach(target=>{target.textContent='Stable·Staging Server 운영 정보를 불러오는 중...';target.className='admin-statusline';});
    const results=await Promise.allSettled(METER_CHANNELS.map(channel=>adminMeter('console',{channel})));
    const failed=[];
    results.forEach((result,index)=>{
      const channel=METER_CHANNELS[index];
      if(result.status==='fulfilled'&&result.value&&result.value.ok!==false)renderMeterAdminConsole(channel,result.value);
      else failed.push(channel==='stable'?'Stable':'Staging');
    });
    if(!$('#meterAdminNoticeId')?.value)resetMeterNoticeEditor(null);
    const message=failed.length?failed.join('·')+' 정보를 불러오지 못했습니다.':'Stable·Staging Server 운영 정보를 불러왔습니다.';
    $$('[data-meter-load-status]').forEach(target=>{target.textContent=message;target.className='admin-statusline '+(failed.length?'error':'ok');});
  }

  function formatMeterLogTime(value){
    const date=value?new Date(value):null;
    if(!date||Number.isNaN(date.getTime()))return '-';
    return new Intl.DateTimeFormat('ko-KR',{
      timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
    }).format(date);
  }

  function renderMeterDungeonLogs(data){
    const rows=$('#meterDungeonLogRows');if(!rows)return;
    const items=Array.isArray(data?.items)?data.items:[];
    const total=Math.max(0,Number(data?.total||0));
    const limit=Math.max(1,Number(data?.limit||50));
    const offset=Math.max(0,Number(data?.offset||0));
    state.meterDungeonLogPage=Math.floor(offset/limit)+1;
    state.meterDungeonLogTotalPages=Math.max(1,Math.ceil(total/limit));
    if(!items.length){
      rows.innerHTML='<tr><td colspan="4">조건에 맞는 종료 로그가 없습니다.</td></tr>';
    }else{
      rows.innerHTML=items.map(item=>{
        const type=String(item?.dungeonType||'').trim();
        const classification=String(item?.classification||'').trim();
        const difficulty=String(item?.difficultyName||'').trim();
        const name=String(item?.dungeonName||'알 수 없는 던전').trim();
        const badges=[type,classification,difficulty].filter(Boolean).map(value=>'<span class="'+(value==='어려움'?'hard':'')+'">'+esc(value)+'</span>').join('');
        const result=String(item?.status||'').toUpperCase()==='COMPLETED'?'정상 종료':'비정상 종료';
        return '<tr><td>'+esc(item?.characterName||'-')+'</td><td><div class="admin-meter-log-dungeon">'+badges+'<b>'+esc(name)+'</b></div><small class="admin-meter-log-result">'+result+'</small></td><td>'+esc(formatMeterLogTime(item?.enteredAt))+'</td><td>'+esc(formatMeterLogTime(item?.exitedAt))+'</td></tr>';
      }).join('');
    }
    const info=$('#meterDungeonLogPageInfo');if(info)info.textContent=state.meterDungeonLogPage+' / '+state.meterDungeonLogTotalPages;
    const prev=$('#meterDungeonLogPrevBtn');if(prev)prev.disabled=state.meterDungeonLogPage<=1;
    const next=$('#meterDungeonLogNextBtn');if(next)next.disabled=state.meterDungeonLogPage>=state.meterDungeonLogTotalPages;
    const stale=Math.max(0,Number(data?.staleRunsClosed||0));
    setStatus('#meterDungeonLogStatus','총 '+total.toLocaleString('ko-KR')+'건'+(stale?' · 종료 신호가 끊긴 '+stale+'건을 마지막 확인 시각으로 정리했습니다.':''),'ok');
  }

  async function loadMeterDungeonLogs(page=1){
    if(!isMaster())return;
    const limit=50;
    const requested=Math.max(1,Number(page||1));
    const channel=$('#meterDungeonLogChannel')?.value||'stable';
    const query=$('#meterDungeonLogQuery')?.value.trim()||'';
    setStatus('#meterDungeonLogStatus','던전 이용 로그를 불러오는 중...','');
    try{
      const data=await adminMeter('logs',{channel,limit,offset:(requested-1)*limit,query});
      if(!data||data.ok===false)throw new Error(data?.message||'던전 이용 로그 조회 실패');
      renderMeterDungeonLogs(data);
    }catch(err){
      setStatus('#meterDungeonLogStatus',meterAdminErrorMessage(err,'던전 이용 로그를 불러오지 못했습니다.'),'error');
    }
  }

  async function saveMeterOperation(channel,intent,button){
    if(!isMaster())return;
    const key=meterChannel(channel),root=meterCard(key,'download');if(!root)return;
    const enabled=$('[data-meter-download-enabled]',root)?.checked===true;
    const allowedLevels=selectedMeterLevels(root,'[data-meter-download-level]');
    if(enabled&&!allowedLevels.length){setMeterCardStatus(root,'[data-meter-download-status]','허용할 KINOJO 등급을 하나 이상 선택하세요.','error');return;}
    const mode=enabled?(allowedLevels.length===METER_LEVELS.length?'ALL':'RANK_ALLOWLIST'):'CLOSED';
    const disabledMessage=$('[data-meter-download-message]',root)?.value.trim()||'';
    if(!disabledMessage){setMeterCardStatus(root,'[data-meter-download-status]','이용자 안내 문구를 입력하세요.','error');return;}
    const channelLabel=key==='staging'?'Staging':'Stable';
    if(intent!=='message'&&!confirm(channelLabel+' 다운로드를 '+(enabled?'선택한 등급에 허용':'OFF로 차단')+'할까요?'))return;
    if(button)button.disabled=true;
    setMeterCardStatus(root,'[data-meter-download-status]',intent==='message'?'안내 문구를 저장하는 중...':'다운로드 설정을 저장하는 중...','');
    try{
      const data=await adminMeter('saveOperation',{
        channel:key,
        downloadEnabled:enabled,
        downloadMode:mode,
        allowedLevels:enabled?allowedLevels:[],
        disabledMessage,
        resumeAt:enabled?null:meterIsoFromInput($('[data-meter-resume-at]',root)?.value)
      });
      if(!data||data.ok===false)throw new Error(data?.message||'운영 상태 저장 실패');
      renderMeterAdminConsole(key,data);
      const done=intent==='message'?'안내 문구를 저장했습니다.':'다운로드 설정을 저장했습니다.';
      setMeterCardStatus(root,'[data-meter-download-status]',done,'ok');toast(channelLabel+' '+done);addLog('METER',channelLabel+' 다운로드 '+mode);
    }catch(err){setMeterCardStatus(root,'[data-meter-download-status]',meterAdminErrorMessage(err,'다운로드 운영 상태를 저장하지 못했습니다.'),'error');}
    finally{if(button)button.disabled=false;}
  }

  async function saveMeterLaunch(channel,intent,button){
    if(!isMaster())return;
    const key=meterChannel(channel),root=meterCard(key,'launch');if(!root)return;
    const launchEnabled=$('[data-meter-launch-enabled]',root)?.checked===true;
    const allowedLevels=selectedMeterLevels(root,'[data-meter-launch-level]');
    if(launchEnabled&&!allowedLevels.length){setMeterCardStatus(root,'[data-meter-launch-status]','Core 실행을 허용할 KINOJO 등급을 하나 이상 선택하세요.','error');return;}
    const launchMessage=$('[data-meter-launch-message]',root)?.value.trim()||'';
    if(!launchMessage){setMeterCardStatus(root,'[data-meter-launch-status]','실행 상태 안내 문구를 입력하세요.','error');return;}
    const channelLabel=key==='staging'?'Staging':'Stable';
    if(intent!=='message'&&!confirm(channelLabel+' Core 실행을 '+(launchEnabled?'선택한 등급에 허용':'OFF로 차단')+'할까요?'))return;
    if(button)button.disabled=true;
    setMeterCardStatus(root,'[data-meter-launch-status]',intent==='message'?'안내 문구를 저장하는 중...':'Core 실행 설정을 저장하는 중...','');
    try{
      const data=await adminMeter('saveLaunch',{channel:key,launchEnabled,launchAllowedLevels:launchEnabled?allowedLevels:[],launchMessage});
      if(!data||data.ok===false)throw new Error(data?.message||'미터기 실행 상태 저장 실패');
      renderMeterAdminConsole(key,data);
      const done=intent==='message'?'안내 문구를 저장했습니다.':'Core 실행 설정을 저장했습니다.';
      setMeterCardStatus(root,'[data-meter-launch-status]',done,'ok');toast(channelLabel+' '+done);addLog('METER',channelLabel+' Core '+(launchEnabled?'ON':'OFF'));
    }catch(err){setMeterCardStatus(root,'[data-meter-launch-status]',meterAdminErrorMessage(err,'미터기 실행 상태를 저장하지 못했습니다.'),'error');}
    finally{if(button)button.disabled=false;}
  }

  async function saveMeterStatistics(channel,button){
    if(!isMaster())return;
    const key=meterChannel(channel),root=meterCard(key,'statistics');if(!root)return;
    const publicEnabled=$('[data-meter-statistics-enabled]',root)?.checked===true;
    const publicMessage=$('[data-meter-statistics-message]',root)?.value.trim()||'';
    if(!publicMessage){setMeterCardStatus(root,'[data-meter-statistics-status]','통계 안내 문구를 입력하세요.','error');return;}
    if(!confirm(publicEnabled?'검증·통계 적격 전투를 사용자에게 공개할까요?':'전투 통계를 사용자에게 비공개로 전환할까요?'))return;
    if(button)button.disabled=true;
    setMeterCardStatus(root,'[data-meter-statistics-status]','통계 공개 설정을 저장하는 중...','');
    try{
      const data=await adminMeter('saveStatistics',{channel:key,publicEnabled,publicMessage});
      if(!data||data.ok===false)throw new Error(data?.message||'통계 노출 상태 저장 실패');
      renderMeterAdminConsole(key,data);
      setMeterCardStatus(root,'[data-meter-statistics-status]','통계 공개 설정을 저장했습니다.','ok');toast((key==='staging'?'Staging':'Stable')+' 통계 공개 설정 저장 완료');addLog('METER',(key==='staging'?'Staging':'Stable')+' '+(publicEnabled?'통계 공개':'통계 비공개'));
    }catch(err){setMeterCardStatus(root,'[data-meter-statistics-status]',meterAdminErrorMessage(err,'통계 노출 상태를 저장하지 못했습니다.'),'error');}
    finally{if(button)button.disabled=false;}
  }

  function handleMeterAdminChange(event){
    if(event.target.matches('#meterDungeonLogChannel')){loadMeterDungeonLogs(1);return;}
    const download=event.target.closest('[data-meter-download-enabled]');
    if(download){const root=download.closest('[data-meter-download-card]');setMeterLevelsEnabled(root,'[data-meter-download-levels]',download.checked);const resume=$('[data-meter-resume-at]',root);if(resume)resume.disabled=download.checked;return;}
    const launch=event.target.closest('[data-meter-launch-enabled]');
    if(launch){setMeterLevelsEnabled(launch.closest('[data-meter-launch-card]'),'[data-meter-launch-levels]',launch.checked);}
  }

  function handleMeterAdminClick(event){
    const button=event.target.closest('[data-meter-reload],[data-meter-download-save],[data-meter-download-message-save],[data-meter-launch-save],[data-meter-launch-message-save],[data-meter-statistics-save],#meterDungeonLogReloadBtn,#meterDungeonLogSearchBtn,#meterDungeonLogPrevBtn,#meterDungeonLogNextBtn');
    if(!button)return;
    if(button.matches('#meterDungeonLogReloadBtn,#meterDungeonLogSearchBtn')){loadMeterDungeonLogs(1);return;}
    if(button.matches('#meterDungeonLogPrevBtn')){loadMeterDungeonLogs(state.meterDungeonLogPage-1);return;}
    if(button.matches('#meterDungeonLogNextBtn')){loadMeterDungeonLogs(state.meterDungeonLogPage+1);return;}
    if(button.matches('[data-meter-reload]')){loadMeterAdminConsole();return;}
    const root=button.closest('[data-meter-channel]');const channel=root?.dataset.meterChannel||'stable';
    if(button.matches('[data-meter-download-save]'))saveMeterOperation(channel,'state',button);
    if(button.matches('[data-meter-download-message-save]'))saveMeterOperation(channel,'message',button);
    if(button.matches('[data-meter-launch-save]'))saveMeterLaunch(channel,'state',button);
    if(button.matches('[data-meter-launch-message-save]'))saveMeterLaunch(channel,'message',button);
    if(button.matches('[data-meter-statistics-save]'))saveMeterStatistics(channel,button);
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
      renderMeterAdminConsole('stable',data);
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
      renderMeterAdminConsole('stable',data);
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
    const roots=$$('[data-server-status-box]').filter(root=>root.id!=='serverStatusOverview'); if(!roots.length)return;
    const queue=syncData.queue||{};
    const recent=syncData.recentSync||syncData.recent_sync||{};
    const queueTotal=Number(queue.updaterActive||queue.updater_active||0)+Number(queue.listPending||queue.list_pending||0)+Number(queue.sanctuaryPending||queue.sanctuary_pending||0);
    const dbOk=syncData?.ok!==false,rpcOk=data?.ok!==false,syncOk=String(recent.status||'').toLowerCase()!=='failed';
    const row=(label,value,state)=>'<div class="admin-system-item is-'+state+'"><span><i class="admin-dot"></i>'+label+'</span><strong>'+esc(value)+'</strong></div>';
    const html='<div class="admin-system-list">'
      +row('Supabase DB',dbOk?'정상':'확인 필요',dbOk?'ok':'error')
      +row('RPC / Edge Functions',rpcOk?'정상':'확인 필요',rpcOk?'ok':'error')
      +row('Updater Runtime',rpcOk?'실행 중':'확인 필요',rpcOk?'ok':'error')
      +row('Queue',queueTotal.toLocaleString('ko-KR')+'건',queueTotal?'warn':'ok')
      +row('Apps Script Bridge','Secret 연결','ok')
      +row('최근 성역 동기화',formatServerTime(recent.completedAt||recent.completed_at),syncOk?'ok':'error')
      +'</div>';
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

  Object.assign(A,{METER_NOTICE_LABELS,METER_CHANNELS,METER_LEVELS,meterDateInput,meterIsoFromInput,meterFileSize,meterChannel,meterCard,selectedMeterLevels,meterAdminErrorMessage,normalizeMeterNotice,meterNoticeById,resetMeterNoticeEditor,renderMeterNotices,renderMeterAdminConsole,loadMeterAdminConsole,formatMeterLogTime,renderMeterDungeonLogs,loadMeterDungeonLogs,saveMeterOperation,saveMeterLaunch,saveMeterStatistics,handleMeterAdminChange,handleMeterAdminClick,saveMeterNotice,deleteMeterNotice,refreshServerStatus,renderServerBox,refreshSystemSettings,visitorDate,visitorNumber,renderVisitorTrend,renderVisitorPages,loadVisitorDashboard,loadVisitorHistory});
})(window.KinojoAdmin);
