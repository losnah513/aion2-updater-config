(function(){
  'use strict';

  const query = new URLSearchParams(location.search);
  const state = {
    view: query.get('view') === 'week' ? 'week' : 'month',
    anchor: String(query.get('anchor') || query.get('date') || '').trim(),
    selectedDate: String(query.get('date') || '').trim(),
    selectedScheduleId: Number(query.get('schedule') || 0) || null,
    calendar: null,
    day: null,
    responseStatus: 'unknown',
    requestSeq: 0,
    daySeq: 0,
    saving: false,
    navigating: false
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  function esc(value){
    return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
      .replaceAll('"','&quot;').replaceAll("'",'&#39;');
  }
  function statusClass(value){
    const key = String(value || 'survey').toLowerCase();
    return ['survey','coordinating','confirmed','canceled','completed'].includes(key) ? key : 'survey';
  }
  function currentPassKey(){
    const session = window.KinojoAuth?.getSession?.();
    return String(session?.passKey || session?.passCode || '').trim();
  }
  function isLoggedIn(){ return !!window.KinojoAuth?.getSession?.(); }
  function ensureAuthGate(){
    let gate = document.getElementById('scheduleAuthGate');
    if(gate) return gate;
    gate = document.createElement('section');
    gate.id = 'scheduleAuthGate';
    gate.className = 'schedule-auth-gate';
    gate.innerHTML = '<span aria-hidden="true">🔒</span><strong>로그인 후 성역 스케줄을 확인할 수 있습니다.</strong><p>PASS KEY 로그인 시 본인 팀 일정과 투표 기능이 활성화됩니다.</p><button type="button" id="scheduleAuthLoginBtn">로그인</button>';
    document.querySelector('.schedule-wrap')?.insertBefore(gate, document.querySelector('.schedule-toolbar'));
    gate.querySelector('#scheduleAuthLoginBtn')?.addEventListener('click', ()=>window.KinojoAuth?.openLoginModal?.('성역 스케줄은 PASS KEY 로그인이 필요합니다.', {context:'sanctuary-schedule'}));
    return gate;
  }
  function syncScheduleAuthGate(){
    const loggedIn = isLoggedIn();
    document.body.classList.toggle('schedule-auth-locked', !loggedIn);
    const gate = ensureAuthGate();
    gate.hidden = loggedIn;
    if(!loggedIn){
      state.requestSeq += 1;
      state.daySeq += 1;
      state.calendar = null;
      state.day = null;
      setSync('로그인 후 이용 가능');
      return false;
    }
    return true;
  }

  function toast(message, type){
    if(type === 'error' && window.KinojoToast?.error) return window.KinojoToast.error(message);
    if(type === 'success' && window.KinojoToast?.success) return window.KinojoToast.success(message);
    return window.KinojoToast?.show?.(message);
  }
  function setSync(message, error){
    const el = $('#scheduleSyncState');
    if(!el) return;
    el.textContent = message;
    el.classList.toggle('is-error', !!error);
  }
  function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
  function setNavigationBusy(busy){
    state.navigating=!!busy;
    ['#schedulePrevBtn','#scheduleNextBtn'].forEach(selector=>{const button=$(selector);if(button)button.disabled=!!busy;});
  }
  function clearNavigationClasses(root){
    if(!root)return;
    root.classList.remove('is-navigating-prev','is-navigating-next','is-entering-prev','is-entering-next');
  }
  function updateUrl(){
    const next = new URL(location.href);
    next.searchParams.set('view', state.view);
    state.anchor ? next.searchParams.set('anchor', state.anchor) : next.searchParams.delete('anchor');
    state.selectedDate ? next.searchParams.set('date', state.selectedDate) : next.searchParams.delete('date');
    state.selectedScheduleId ? next.searchParams.set('schedule', String(state.selectedScheduleId)) : next.searchParams.delete('schedule');
    next.searchParams.delete('id');
    next.searchParams.delete('sanctuary');
    history.replaceState(null, '', next);
  }
  function currentPanel(){
    const panels = Array.isArray(state.calendar?.panels) ? state.calendar.panels : [];
    return panels[Number(state.calendar?.currentPanelIndex ?? 1)] || panels[1] || panels[0] || null;
  }
  function selectedSchedule(){
    const rows = Array.isArray(state.day?.schedules) ? state.day.schedules : [];
    return rows.find(item => Number(item.id) === Number(state.selectedScheduleId)) || rows[0] || null;
  }
  function selectedTeamName(item){
    const team = Array.isArray(item?.teams) ? item.teams[0] : null;
    return String(team?.teamName || (team?.teamNo ? team.teamNo+'팀' : '')).trim();
  }
  function pickInitialDate(){
    const panel = currentPanel();
    const days = Array.isArray(panel?.days) ? panel.days : [];
    let day = state.selectedDate ? days.find(row => String(row.date) === state.selectedDate) : null;
    if(!day){
      const today = String(state.calendar?.today || '');
      day = days.find(row => String(row.date) === today)
        || days.find(row => state.view === 'week' || row.isInAnchorMonth)
        || days[0];
      state.selectedDate = String(day?.date || today || '');
    }
    const ids = (Array.isArray(day?.items) ? day.items : []).map(item => Number(item.id));
    if(!state.selectedScheduleId || !ids.includes(Number(state.selectedScheduleId))){
      state.selectedScheduleId = ids[0] || null;
    }
  }
  function renderToolbar(){
    $$('[data-schedule-view]').forEach(button => button.classList.toggle('is-active', button.dataset.scheduleView === state.view));
    const link = $('#scheduleSanctuaryLink');
    if(link) link.href = /(^|\/)m(\/|$)/.test(location.pathname) ? '/m/sanctuary/' : '/sanctuary/';
  }
  function renderWeekHead(){
    const order = Array.isArray(state.calendar?.dayOrder) ? state.calendar.dayOrder : [];
    const root = $('#scheduleWeekHead');
    if(root) root.innerHTML = order.map((day,index) => '<span class="day-'+index+(day==='일'?' is-sunday':day==='토'?' is-saturday':'')+'">'+esc(day)+'</span>').join('');
  }
  function dayChip(item){
    const status = statusClass(item.effectiveStatus || item.status);
    const sanctuary = String(item.sanctuaryShortName || item.sanctuaryName || item.sanctuaryCode || '성역');
    const team = selectedTeamName(item);
    const time = String(item.startTime || '시간 미정');
    const mode = item.requiresResponse ? '투표' : (item.statusLabel || '확정');
    const label = [sanctuary, team, time].filter(Boolean).join(' · ');
    return '<span class="schedule-day-chip status-'+status+'" title="'+esc(label)+'"><b>'+esc(sanctuary)+'</b><em>'+esc(time)+'</em><i>'+esc(mode)+'</i></span>';
  }
  function dayHtml(day, interactive){
    const items = Array.isArray(day.items) ? day.items : [];
    const classes = ['schedule-day'];
    if(state.view === 'month' && !day.isInAnchorMonth) classes.push('is-outside');
    if(items.length) classes.push('is-has-schedule');
    const today = String(state.calendar?.today || '');
    if(today && String(day.date || '') < today) classes.push('is-past');
    if(day.isToday) classes.push('is-today');
    if(day.dayName === '일') classes.push('is-sunday');
    if(day.dayName === '토') classes.push('is-saturday');
    if(String(day.date) === state.selectedDate) classes.push('is-selected');
    const visibleCount = state.view === 'week' ? 5 : 3;
    const content = '<span class="schedule-day-number"><span>'+esc(day.dayNo)+'</span>'+(day.isToday?'<i>오늘</i>':'')+'</span>'
      + '<span class="schedule-day-items">'+items.slice(0,visibleCount).map(dayChip).join('')+(items.length>visibleCount?'<span class="schedule-day-more">+'+(items.length-visibleCount)+'개</span>':'')+'</span>'
      + (!items.length?'<span class="schedule-day-empty">일정 없음</span>':'');
    return interactive
      ? '<button type="button" class="'+classes.join(' ')+'" data-schedule-date="'+esc(day.date)+'">'+content+'</button>'
      : '<div class="'+classes.join(' ')+'">'+content+'</div>';
  }
  function panelHtml(panel, index, currentIndex){
    const side = index !== currentIndex;
    const days = Array.isArray(panel?.days) ? panel.days : [];
    return '<section class="schedule-period-panel '+(side?'is-side':'is-current')+'" data-panel-index="'+index+'">'
      + '<header class="schedule-period-head"><strong>'+esc(panel?.label || '')+'</strong><span>'+esc(panel?.calendarStart || '')+' ~ '+esc(panel?.calendarEnd || '')+'</span></header>'
      + '<div class="schedule-period-grid">'+days.map(day => dayHtml(day,!side)).join('')+'</div></section>';
  }
  function renderCalendar(){
    const root = $('#scheduleCalendarViewport');
    if(!root) return;
    const panels = Array.isArray(state.calendar?.panels) ? state.calendar.panels : [];
    const currentIndex = Number(state.calendar?.currentPanelIndex ?? 1);
    root.classList.toggle('is-week', state.view === 'week');
    root.classList.toggle('is-month', state.view === 'month');
    root.innerHTML = '<div class="schedule-period-deck">'+panels.map((panel,index)=>panelHtml(panel,index,currentIndex)).join('')+'</div>';
    root.querySelectorAll('[data-schedule-date]').forEach(button => button.addEventListener('click', () => {
      state.selectedDate = String(button.dataset.scheduleDate || '');
      const panel = currentPanel();
      const day = (panel?.days || []).find(row => String(row.date) === state.selectedDate);
      state.selectedScheduleId = Number(day?.items?.[0]?.id || 0) || null;
      renderCalendar();
      updateUrl();
      loadDay();
    }));
    root.querySelectorAll('.schedule-period-panel.is-side').forEach(panel => panel.addEventListener('click', () => {
      navigatePanel(Number(panel.dataset.panelIndex) < currentIndex ? 'prev' : 'next');
    }));
  }
  function scheduleItemHtml(item){
    const active = Number(item.id) === Number(state.selectedScheduleId);
    const status = statusClass(item.effectiveStatus || item.status);
    const sanctuary = String(item.sanctuaryShortName || item.sanctuaryName || item.sanctuaryCode || '성역');
    const team = selectedTeamName(item);
    const mode = item.requiresResponse ? '투표 필요' : '일정 확정';
    const info = [item.startTime || '시간 미정', team, item.location].filter(Boolean).join(' · ');
    return '<button type="button" class="schedule-item'+(active?' is-active':'')+'" data-schedule-id="'+esc(item.id)+'">'
      + '<div class="schedule-item-head"><strong>'+esc(sanctuary)+(team?' · '+esc(team):'')+'</strong><span class="schedule-status status-'+status+'">'+esc(mode)+'</span></div>'
      + '<p>'+esc(info)+'</p></button>';
  }
  function summaryHtml(summary){
    if(!summary || typeof summary !== 'object') return '';
    const recommended = summary.recommendedTime || summary.recommendedWindow || '';
    const members = Array.isArray(summary.members) ? summary.members : [];
    return '<div class="schedule-team-metrics">'
      + '<div class="schedule-team-metric"><strong>'+esc(summary.availableCount ?? 0)+'</strong><span>가능</span></div>'
      + '<div class="schedule-team-metric"><strong>'+esc(summary.negotiableCount ?? 0)+'</strong><span>협의</span></div>'
      + '<div class="schedule-team-metric"><strong>'+esc(summary.unavailableCount ?? 0)+'</strong><span>불가</span></div>'
      + '<div class="schedule-team-metric"><strong>'+esc(summary.pendingCount ?? summary.noResponseCount ?? 0)+'</strong><span>미응답</span></div></div>'
      + '<div class="schedule-team-rate"><span>응답률 '+esc(summary.responseRate ?? 0)+'%</span><span>참여율 '+esc(summary.participationRate ?? 0)+'%</span>'+(recommended?'<span class="is-recommended">추천 '+esc(recommended)+'</span>':'')+'</div>'
      + (members.length?'<div class="schedule-member-list">'+members.map(member => '<div class="schedule-member member-'+esc(member.status || 'pending')+'"><strong>'+esc(member.characterName || member.name || '')+'</strong><span>'+esc(member.statusLabel || '미응답')+(member.timeText?' · '+esc(member.timeText):'')+'</span></div>').join('')+'</div>':'');
  }
  function responseFormHtml(day, item){
    const user = day?.user || {};
    if(!item?.requiresResponse) return '<div class="schedule-fixed-note"><strong>확정된 일정입니다.</strong><span>별도 참여 응답 없이 일정 정보만 안내됩니다.</span></div>';
    if(!user.authenticated) return '<div class="schedule-empty">PASS KEY 로그인 후 해당 팀 일정에 응답할 수 있습니다.</div><button type="button" class="schedule-login-btn" id="scheduleLoginBtn">PASS KEY 로그인</button>';
    if(!user.canRespond) return '<div class="schedule-empty">선택 일정의 대상 팀 구성원만 응답할 수 있습니다.</div>';
    const response = user.response || {};
    state.responseStatus = String(response.status || 'unknown');
    const options = Array.isArray(day.responseOptions) ? day.responseOptions : [];
    return '<div class="schedule-response-state"><span>응답 대상</span><strong>'+esc(user.teamName || (user.teamNo ? user.teamNo+'팀' : '내 팀'))+'</strong></div>'
      + '<div class="schedule-response-options">'+options.map(option => '<button type="button" class="schedule-response-option'+(option.value===state.responseStatus?' is-active':'')+'" data-response-status="'+esc(option.value)+'">'+esc(option.label)+'</button>').join('')+'</div>'
      + '<div class="schedule-input-grid"><label>가능 시간<input id="scheduleTimeText" type="text" maxlength="40" value="'+esc(response.timeText || '')+'" placeholder="21:00 이후"></label>'
      + '<div class="schedule-time-examples">예: 21:00 이후 · 20:00~23:00 · 종일</div>'
      + '<label>메모<textarea id="scheduleResponseNote" rows="3" maxlength="200" placeholder="일정 조율에 필요한 내용을 남겨주세요.">'+esc(response.note || '')+'</textarea></label></div>'
      + '<button type="button" class="schedule-save-btn" id="scheduleSaveBtn">투표 응답 저장</button>';
  }
  function applyResponseStatusUi(){
    const disabled = ['unavailable','unknown'].includes(String(state.responseStatus || 'unknown'));
    const time = $('#scheduleTimeText');
    if(time) time.disabled = disabled;
  }
  function renderDay(){
    const root = $('#scheduleDetail');
    if(!root) return;
    const day = state.day;
    if(!day || day.ok === false){
      root.innerHTML = '<div class="schedule-error">'+esc(day?.message || '날짜 상세를 불러오지 못했습니다.')+'</div>';
      return;
    }
    const rows = Array.isArray(day.schedules) ? day.schedules : [];
    const item = selectedSchedule();
    if(item && Number(item.id) !== Number(state.selectedScheduleId)) state.selectedScheduleId = Number(item.id) || null;
    const team = selectedTeamName(item);
    const detailMeta = item ? [item.sanctuaryName || item.sanctuaryShortName, team, item.startTime, item.location].filter(Boolean).join(' · ') : '';
    root.innerHTML = '<header class="schedule-detail-head"><div><span class="schedule-detail-kicker">전체 성역 통합 일정</span><h2>'+esc(day.dateLabel || day.targetDate)+'</h2><p>'+esc(detailMeta || '등록된 일정을 선택해 주세요.')+'</p></div><span class="schedule-detail-badge">'+rows.length+'개 일정</span></header>'
      + '<section class="schedule-section"><div class="schedule-section-title"><h3>등록 일정</h3><span>성역·팀별</span></div><div class="schedule-list">'+(rows.length?rows.map(scheduleItemHtml).join(''):'<div class="schedule-empty">이 날짜에는 등록된 성역 일정이 없습니다.</div>')+'</div></section>'
      + (item ? '<section class="schedule-section schedule-info-card"><div class="schedule-section-title"><h3>일정 안내</h3><span>'+esc(item.scheduleModeLabel || (item.requiresResponse?'투표 필요':'일정 확정'))+'</span></div>'
        + '<dl class="schedule-info-list"><div><dt>성역</dt><dd>'+esc(item.sanctuaryName || item.sanctuaryShortName || '')+'</dd></div><div><dt>팀</dt><dd>'+esc(team || '팀 미확인')+'</dd></div><div><dt>시작</dt><dd>'+esc(item.dateLabel || item.targetDate)+' '+esc(item.startTime || '시간 미정')+'</dd></div>'+(item.location?'<div><dt>장소</dt><dd>'+esc(item.location)+'</dd></div>':'')+(item.description?'<div><dt>안내</dt><dd>'+esc(item.description)+'</dd></div>':'')+'</dl></section>' : '')
      + (item ? '<section class="schedule-section"><div class="schedule-section-title"><h3>'+(item.requiresResponse?'투표 참여':'일정 상태')+'</h3><span>'+esc(day.user?.mainCharacterName || '')+'</span></div>'+responseFormHtml(day,item)+'</section>' : '')
      + (item?.requiresResponse && day.user?.summary && day.user.summary !== null ? '<section class="schedule-section"><div class="schedule-section-title"><h3>내 팀 현황</h3><span>Server Engine 계산</span></div>'+summaryHtml(day.user.summary)+'</section>' : '');

    root.querySelectorAll('[data-schedule-id]').forEach(button => button.addEventListener('click', () => {
      state.selectedScheduleId = Number(button.dataset.scheduleId) || null;
      updateUrl();
      loadDay();
    }));
    root.querySelectorAll('[data-response-status]').forEach(button => button.addEventListener('click', () => {
      state.responseStatus = String(button.dataset.responseStatus || 'unknown');
      root.querySelectorAll('[data-response-status]').forEach(row => row.classList.toggle('is-active', row === button));
      applyResponseStatusUi();
    }));
    $('#scheduleLoginBtn')?.addEventListener('click', () => window.KinojoAuth?.openLoginModal?.('성역 스케줄 투표는 PASS KEY 로그인이 필요합니다.', {context:'sanctuary-schedule'}));
    $('#scheduleSaveBtn')?.addEventListener('click', saveAvailability);
    applyResponseStatusUi();
  }
  async function loadDay(){
    if(!state.selectedDate) return;
    const seq = ++state.daySeq;
    const root = $('#scheduleDetail');
    if(root) root.innerHTML = '<div class="schedule-detail-loading"><span class="kinojo-spinner" aria-hidden="true"></span><strong>날짜 상세를 불러오는 중...</strong></div>';
    try{
      const data = await window.KinojoApi.getAction('sanctuaryScheduleDay', {
        targetDate:state.selectedDate,
        scheduleId:state.selectedScheduleId,
        passKey:currentPassKey()
      });
      if(seq !== state.daySeq) return;
      if(!data || data.ok === false) throw new Error(data?.message || '날짜 상세 조회 실패');
      state.day = data;
      if(!state.selectedScheduleId) state.selectedScheduleId = Number(data.selectedScheduleId || data.schedules?.[0]?.id || 0) || null;
      renderDay();
      updateUrl();
    }catch(error){
      if(seq !== state.daySeq) return;
      state.day = {ok:false,message:error?.message || String(error)};
      renderDay();
    }
  }
  async function saveAvailability(){
    if(state.saving) return;
    const item = selectedSchedule();
    if(!item?.requiresResponse) return;
    const button = $('#scheduleSaveBtn');
    state.saving = true;
    if(button) button.disabled = true;
    try{
      const data = await window.KinojoApi.getAction('sanctuaryAvailabilitySave', {
        id:item.sanctuaryCode,
        targetDate:state.selectedDate,
        scheduleId:item.id,
        passKey:currentPassKey(),
        status:state.responseStatus,
        timeText:$('#scheduleTimeText')?.value || '',
        note:$('#scheduleResponseNote')?.value || ''
      });
      if(!data || data.ok === false) throw new Error(data?.message || '응답 저장 실패');
      toast('투표 응답이 저장되었습니다.','success');
      await loadDay();
    }catch(error){
      toast(error?.message || String(error),'error');
    }finally{
      state.saving = false;
      if(button) button.disabled = false;
    }
  }
  async function loadCalendar(options={}){
    const seq = ++state.requestSeq;
    const silent=options.silent===true;
    const direction=options.navigationDirection==='prev'?'prev':options.navigationDirection==='next'?'next':'';
    const root = $('#scheduleCalendarViewport');
    const started=Date.now();
    if(!silent){
      setSync('Server Engine 연결 중');
      if(root) root.innerHTML = '<div class="schedule-calendar-loading"><span class="kinojo-spinner" aria-hidden="true"></span><strong>통합 일정을 불러오는 중...</strong></div>';
    }else setSync(direction==='prev'?'이전 기간으로 이동 중':'다음 기간으로 이동 중');
    try{
      if(!window.KinojoApi) throw new Error('KinojoApi 연결을 확인해 주세요.');
      const data = await window.KinojoApi.getAction('sanctuaryScheduleCalendar', {
        view:state.view,
        anchor:state.anchor,
        passKey:currentPassKey()
      });
      if(direction){const remain=260-(Date.now()-started);if(remain>0)await sleep(remain);}
      if(seq !== state.requestSeq) return;
      if(!data || data.ok === false) throw new Error(data?.message || '성역 달력 조회 실패');
      state.calendar = data;
      state.anchor = String(data.anchor || state.anchor || '');
      pickInitialDate();
      renderToolbar();
      renderWeekHead();
      clearNavigationClasses(root);
      renderCalendar();
      if(direction&&root){
        root.classList.add('is-entering-'+direction);
        void root.offsetWidth;
        requestAnimationFrame(()=>root.classList.remove('is-entering-'+direction));
      }
      updateUrl();
      setSync('Server Engine 업데이트 '+new Date(data.generatedAt || Date.now()).toLocaleString('ko-KR'));
      await loadDay();
    }catch(error){
      if(seq !== state.requestSeq) return;
      clearNavigationClasses(root);
      setSync(error?.message || '일정 조회 실패', true);
      if(!silent&&root) root.innerHTML = '<div class="schedule-error">'+esc(error?.message || String(error))+'</div>';
      else toast(error?.message || String(error),'error');
    }finally{
      if(direction){clearNavigationClasses(root);setNavigationBusy(false);}
    }
  }
  function navigatePanel(direction){
    if(state.navigating)return;
    const panel = currentPanel();
    const next = direction === 'prev' ? panel?.previousAnchor : panel?.nextAnchor;
    if(!next) return;
    const root=$('#scheduleCalendarViewport');
    setNavigationBusy(true);
    clearNavigationClasses(root);
    root?.classList.add('is-navigating-'+direction);
    state.anchor = String(next);
    state.selectedDate = '';
    state.selectedScheduleId = null;
    loadCalendar({silent:true,navigationDirection:direction});
  }
  function bind(){
    $$('[data-schedule-view]').forEach(button => button.addEventListener('click', () => {
      const view = button.dataset.scheduleView === 'week' ? 'week' : 'month';
      if(view === state.view) return;
      state.view = view;
      state.anchor = state.selectedDate || state.anchor;
      state.selectedDate = '';
      state.selectedScheduleId = null;
      loadCalendar();
    }));
    $('#scheduleTodayBtn')?.addEventListener('click', () => {
      state.anchor = '';
      state.selectedDate = '';
      state.selectedScheduleId = null;
      loadCalendar();
    });
    $('#schedulePrevBtn')?.addEventListener('click', () => navigatePanel('prev'));
    $('#scheduleNextBtn')?.addEventListener('click', () => navigatePanel('next'));
    window.addEventListener('kinojo:auth-changed', () => {
      if(syncScheduleAuthGate()) loadCalendar({preserveSelection:true});
    });
    renderToolbar();
    if(syncScheduleAuthGate()) loadCalendar();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
