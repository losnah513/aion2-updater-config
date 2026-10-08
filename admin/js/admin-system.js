/* KINOJO Admin server status, environment, and visitors v2026081003 */
(function(A){
  'use strict';
  if(!A) throw new Error('KINOJO Admin shared module is required.');
  const $=A.$;
  const $$=A.$$;
  const state=A.state;
  const action=(...args)=>A.action(...args);
  const addLog=(...args)=>A.addLog(...args);
  const adminVisitor=(...args)=>A.adminVisitor(...args);
  const esc=(...args)=>A.esc(...args);
  const formatServerTime=(...args)=>A.formatServerTime(...args);
  const isMaster=(...args)=>A.isMaster(...args);
  const setStatus=(...args)=>A.setStatus(...args);
  const toast=(...args)=>A.toast(...args);
  let routineRequest=null;

  function renderServerRoutines(data){
    const root=$('#serverRoutineList');
    if(!root)return;
    const rows=Array.isArray(data?.routines)?data.routines:[];
    const statusLabel={succeeded:'성공',failed:'실패',running:'실행 중',starting:'시작 중',connecting:'연결 중',sending:'실행 요청 중'};
    const time=value=>{
      if(!value)return '기록 없음';
      const date=new Date(value);
      return Number.isNaN(date.getTime())?'시간 확인 필요':date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
    };
    const summary=$('#serverRoutineCharacterPolicy');
    if(summary)summary.textContent=data.characterScheduleSummary||'자동 조회 규칙을 확인하지 못했습니다.';
    const scheduled=[],repeated=[];
    rows.forEach(row=>{
      const entries=Array.isArray(row.scheduleEntries)?row.scheduleEntries:[];
      if(['DAILY','WEEKLY'].includes(row.frequency)&&entries.length){
        entries.forEach(entry=>scheduled.push({...row,...entry}));
      }else repeated.push(row);
    });
    scheduled.sort((a,b)=>a.minuteOfDay-b.minuteOfDay||(a.weekdayKst??-1)-(b.weekdayKst??-1)||a.id-b.id);
    const table=(items,fixed)=>'<div class="admin-routine-table-wrap"><table class="admin-routine-table"><thead><tr>'
      +'<th scope="col">'+(fixed?'시각 · 한국 시간':'실행 간격')+'</th><th scope="col">주기</th><th scope="col">작업</th><th scope="col">상태</th><th scope="col">다음 예약</th><th scope="col">작업의 최근 실행</th></tr></thead><tbody>'
      +items.map(row=>'<tr class="admin-routine-row">'
        +'<td data-label="'+(fixed?'시각 · 한국 시간':'실행 간격')+'"><strong class="admin-routine-time">'+esc(fixed?row.timeKst:row.scheduleKst)+'</strong></td>'
        +'<td data-label="주기"><span class="admin-routine-badge '+(row.frequency==='DAILY'?'is-daily':row.frequency==='WEEKLY'?'is-weekly':'is-repeat')+'">'+(row.frequency==='DAILY'?'매일':row.frequency==='WEEKLY'?'매주':row.frequency==='REPEAT'?'반복':'확인 필요')+'</span>'+(row.weekdayLabel?'<span class="admin-routine-weekday">'+esc(row.weekdayLabel)+'</span>':'')+'</td>'
        +'<th scope="row" data-label="작업"><strong>'+esc(row.name)+'</strong>'+(row.description?'<p>'+esc(row.description)+'</p>':'')+'</th>'
        +'<td data-label="상태"><strong class="'+(row.active?'admin-routine-on':'')+'">'+(row.active?'ON':'OFF')+'</strong></td>'
        +'<td data-label="다음 예약">'+esc(row.active?time(row.nextRunAt):'중지됨')+'</td>'
        +'<td data-label="작업의 최근 실행">'+esc(statusLabel[row.lastStatus]||(row.lastStatus?'확인 필요':'기록 없음'))+(row.lastStartedAt?'<p>'+esc(time(row.lastStartedAt))+'</p>':'')+'</td></tr>').join('')+'</tbody></table></div>';
    root.innerHTML=rows.length?
      (scheduled.length?'<section class="admin-routine-section"><h3>예약 시간표</h3><p>00:00부터 시각 순서입니다. 매주 작업은 해당 요일에 실행합니다.</p>'+table(scheduled,true)+'</section>':'')
      +(repeated.length?'<section class="admin-routine-section"><h3>반복 작업</h3><p>하루 동안 일정한 간격으로 실행하는 작업입니다.</p>'+table(repeated,false)+'</section>':'')
      :'<div class="admin-empty">등록된 서버 루틴이 없습니다.</div>';
    const note=$('#serverRoutineHistoryNote');
    if(note)note.textContent=data.historyNote||'최근 서버 예약 실행 기록 기준입니다.';
    setStatus('#serverRoutineStatus','한국 시간 기준 · 확인 '+time(data.generatedAt),'ok');
  }

  function refreshServerRoutines(){
    if(routineRequest)return routineRequest;
    const button=$('#serverRoutineReloadBtn');
    if(button)button.disabled=true;
    setStatus('#serverRoutineStatus','서버 루틴을 불러오는 중입니다.');
    routineRequest=(async()=>{
      try{
        const data=await A.adminAutomation('routines');
        if(!data||data.ok!==true)throw new Error(data?.message||'서버 루틴을 확인하지 못했습니다.');
        renderServerRoutines(data);
      }catch(error){
        const root=$('#serverRoutineList');
        if(root)root.innerHTML='<div class="admin-empty">서버 루틴을 불러오지 못했습니다. 새로고침으로 다시 확인해 주세요.</div>';
        const summary=$('#serverRoutineCharacterPolicy');
        if(summary)summary.textContent='자동 조회 규칙 확인 필요';
        setStatus('#serverRoutineStatus',error.message||String(error),'error');
      }finally{routineRequest=null;if(button)button.disabled=false;}
    })();
    return routineRequest;
  }

  async function refreshServerStatus(){
    try{
      const runtime=await action('runtimeStatus',{});
      renderServerBox(runtime); addLog('SERVER','서버 상태 새로고침');
    }catch(err){ addLog('ERROR',err.message||err); }
  }

  function renderServerBox(data){
    const roots=$$('[data-server-status-box]').filter(root=>root.id!=='serverStatusOverview'); if(!roots.length)return;
    const dbOk=data?.ok!==false,rpcOk=data?.ok!==false;
    const row=(label,value,state)=>'<div class="admin-system-item is-'+state+'"><span><i class="admin-dot"></i>'+label+'</span><strong>'+esc(value)+'</strong></div>';
    const html='<div class="admin-system-list">'
      +row('Supabase DB',dbOk?'정상':'확인 필요',dbOk?'ok':'error')
      +row('RPC / Edge Functions',rpcOk?'정상':'확인 필요',rpcOk?'ok':'error')
      +row('Updater Runtime',rpcOk?'실행 중':'확인 필요',rpcOk?'ok':'error')
      +row('성역 팀 데이터','Server DB','ok')
      +row('성역 Sheet 동기화','종료','ok')
      +row('공통 Apps Script Bridge','Secret 연결','ok')
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
      setStatus('#visitorAggregateStatus','한국 시간 기준입니다. 검수·자동화 기록은 통계에서 제외합니다.','success');
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
      if(root)root.innerHTML=rows.length?rows.map(row=>'<article class="admin-visitor-history-row"><div><strong>'+esc(row.memberName||(row.trafficClasses?.some(value=>value!=='PUBLIC')?'검수·자동화':'익명 방문자'))+'</strong><span>'+(row.isLoggedIn?esc(row.memberRole||'회원'):'비로그인')+'</span></div><div><span>로그인 '+visitorDate(row.loginAt)+'</span><span>최초 '+visitorDate(row.firstVisitAt)+'</span><span>마지막 '+visitorDate(row.lastVisitAt)+'</span></div><div><strong>'+visitorNumber(row.pageViews)+'회</strong><span>'+esc((row.pages||[]).join(', ')||'-')+'</span></div></article>').join(''):'<div class="admin-empty">조건에 맞는 방문 이력이 없습니다.</div>';
      $('#visitorPageInfo').textContent=state.visitorPage+' / '+state.visitorTotalPages;
      $('#visitorPrevBtn').disabled=state.visitorPage<=1; $('#visitorNextBtn').disabled=state.visitorPage>=state.visitorTotalPages;
      setStatus('#visitorHistoryStatus','총 '+visitorNumber(data.total)+'건','success');
    }catch(err){setStatus('#visitorHistoryStatus',err.message||String(err),'error');}
  }

  Object.assign(A,{refreshServerRoutines,renderServerRoutines,refreshServerStatus,renderServerBox,refreshSystemSettings,visitorDate,visitorNumber,renderVisitorTrend,renderVisitorPages,loadVisitorDashboard,loadVisitorHistory});
})(window.KinojoAdmin);
