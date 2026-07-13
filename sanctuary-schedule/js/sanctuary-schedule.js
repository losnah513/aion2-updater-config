(function(){
  'use strict';

  const query = new URLSearchParams(location.search);
  const state = {
    view: query.get('view') === 'week' ? 'week' : 'month',
    anchor: String(query.get('anchor') || '').trim(),
    sanctuaryCode: String(query.get('id') || query.get('sanctuary') || '').trim().toLowerCase(),
    calendar: null,
    selectedDate: String(query.get('date') || '').trim(),
    selectedScheduleId: Number(query.get('schedule') || 0) || null,
    day: null,
    responseStatus: 'unknown',
    requestSeq: 0,
    daySeq: 0,
    saving: false
  };

  function esc(value){
    return String(value ?? '')
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
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

  function toast(message, type){
    if(type === 'error' && window.KinojoToast?.error) return window.KinojoToast.error(message);
    if(type === 'success' && window.KinojoToast?.success) return window.KinojoToast.success(message);
    if(window.KinojoToast?.show) return window.KinojoToast.show(message);
  }

  function setSync(message, error){
    const el = document.getElementById('scheduleSyncState');
    if(!el) return;
    el.textContent = message;
    el.classList.toggle('is-error', !!error);
  }

  function updateUrl(){
    const next = new URL(location.href);
    next.searchParams.set('view', state.view);
    if(state.anchor) next.searchParams.set('anchor', state.anchor); else next.searchParams.delete('anchor');
    if(state.sanctuaryCode) next.searchParams.set('id', state.sanctuaryCode); else next.searchParams.delete('id');
    if(state.selectedDate) next.searchParams.set('date', state.selectedDate); else next.searchParams.delete('date');
    if(state.selectedScheduleId) next.searchParams.set('schedule', String(state.selectedScheduleId)); else next.searchParams.delete('schedule');
    history.replaceState(null, '', next);
  }

  function currentPanel(){
    const panels = Array.isArray(state.calendar?.panels) ? state.calendar.panels : [];
    return panels[Number(state.calendar?.currentPanelIndex ?? 1)] || panels[1] || panels[0] || null;
  }

  function pickInitialDate(){
    const panel = currentPanel();
    const days = Array.isArray(panel?.days) ? panel.days : [];
    const selectedDay = state.selectedDate ? days.find(day => String(day.date) === state.selectedDate) : null;
    if(selectedDay){
      const scheduleIds = (Array.isArray(selectedDay.items) ? selectedDay.items : []).map(item => Number(item.id));
      if(state.selectedScheduleId && !scheduleIds.includes(Number(state.selectedScheduleId))) state.selectedScheduleId = null;
      return;
    }
    const today = String(state.calendar?.today || '');
    const todayDay = days.find(day => String(day.date) === today);
    const preferred = todayDay || days.find(day => state.view === 'week' || day.isInAnchorMonth) || days[0];
    state.selectedDate = String(preferred?.date || today || '');
    state.selectedScheduleId = Number(preferred?.items?.[0]?.id || 0) || null;
  }

  function renderToolbar(){
    document.querySelectorAll('[data-schedule-view]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.scheduleView === state.view);
    });

    const select = document.getElementById('scheduleSanctuarySelect');
    const items = Array.isArray(state.calendar?.sanctuaries) ? state.calendar.sanctuaries : [];
    if(select){
      const html = items.map(item => '<option value="'+esc(item.code)+'">'+esc(item.name)+'</option>').join('');
      if(select.innerHTML !== html) select.innerHTML = html;
      select.value = state.sanctuaryCode;
    }

    const mobile = /(^|\/)m(\/|$)/.test(location.pathname);
    const link = document.getElementById('scheduleSanctuaryLink');
    if(link) link.href = (mobile ? '/m/sanctuary/' : '/sanctuary/') + '?id=' + encodeURIComponent(state.sanctuaryCode);
  }

  function renderWeekHead(){
    const root = document.getElementById('scheduleWeekHead');
    const order = Array.isArray(state.calendar?.dayOrder) ? state.calendar.dayOrder : [];
    if(root) root.innerHTML = order.map(day => '<span>'+esc(day)+'</span>').join('');
  }

  function dayChip(item){
    const status = statusClass(item.effectiveStatus || item.status);
    const time = item.startTime ? ' '+item.startTime : '';
    return '<span class="schedule-day-chip status-'+status+'">'+esc(item.statusLabel || '조사중')+time+'</span>';
  }

  function dayHtml(day, interactive){
    const items = Array.isArray(day.items) ? day.items : [];
    const classes = ['schedule-day'];
    if(state.view === 'month' && !day.isInAnchorMonth) classes.push('is-outside');
    if(day.isToday) classes.push('is-today');
    if(String(day.date) === state.selectedDate) classes.push('is-selected');
    const content = '<span class="schedule-day-number"><span>'+esc(day.dayNo)+'</span>'+(day.isToday?'<i>오늘</i>':'')+'</span>'
      + '<span class="schedule-day-items">'+items.slice(0,3).map(dayChip).join('')+(items.length>3?'<span class="schedule-day-chip">+'+(items.length-3)+' 일정</span>':'')+'</span>'
      + (!items.length?'<span class="schedule-day-empty">일정 없음</span>':'');
    if(!interactive) return '<div class="'+classes.join(' ')+'" aria-hidden="true">'+content+'</div>';
    return '<button type="button" class="'+classes.join(' ')+'" data-schedule-date="'+esc(day.date)+'" data-first-schedule="'+esc(items[0]?.id || '')+'" aria-label="'+esc(day.dateLabel || day.date)+'">'+content+'</button>';
  }

  function panelHtml(panel, index, currentIndex){
    const side = index !== currentIndex;
    const days = Array.isArray(panel.days) ? panel.days : [];
    return '<article class="schedule-period-panel '+(side?'is-side':'is-current')+'" data-panel-index="'+index+'" data-panel-anchor="'+esc(panel.anchor)+'">'
      + '<header class="schedule-period-head"><strong>'+esc(panel.label)+'</strong><span>'+esc(panel.calendarStart)+' ~ '+esc(panel.calendarEnd)+'</span></header>'
      + '<div class="schedule-period-grid">'+days.map(day => dayHtml(day, !side)).join('')+'</div>'
      + '</article>';
  }

  function renderCalendar(){
    const root = document.getElementById('scheduleCalendarViewport');
    const panels = Array.isArray(state.calendar?.panels) ? state.calendar.panels : [];
    const currentIndex = Number(state.calendar?.currentPanelIndex ?? 1);
    if(!root) return;
    if(!panels.length){
      root.innerHTML = '<div class="schedule-error">달력 데이터를 불러오지 못했습니다.</div>';
      return;
    }
    root.innerHTML = '<div class="schedule-month-deck view-'+esc(state.view)+'" id="scheduleMonthDeck">'+panels.map((panel,index)=>panelHtml(panel,index,currentIndex)).join('')+'</div>';
    root.querySelectorAll('[data-schedule-date]').forEach(button => {
      button.addEventListener('click', () => {
        state.selectedDate = String(button.dataset.scheduleDate || '');
        state.selectedScheduleId = Number(button.dataset.firstSchedule || 0) || null;
        updateUrl();
        renderCalendar();
        loadDay();
      });
    });
    root.querySelectorAll('.schedule-period-panel.is-side').forEach(panel => {
      panel.addEventListener('click', () => navigatePanel(Number(panel.dataset.panelIndex) < currentIndex ? 'prev' : 'next'));
    });
  }

  function scheduleItemHtml(item){
    const status = statusClass(item.effectiveStatus || item.status);
    const active = Number(item.id) === Number(state.selectedScheduleId);
    const teams = Array.isArray(item.teams) ? item.teams : [];
    const targetTeam = teams.find(team => team.isUserTeam) || teams[0];
    const summary = targetTeam?.summary || {};
    const meta = [item.startTime ? item.startTime+(item.endTime?'~'+item.endTime:'') : '시간 조율 중', teams.length ? teams.length+'개 팀' : '', summary.responseRate !== undefined ? '응답률 '+summary.responseRate+'%' : ''].filter(Boolean).join(' · ');
    return '<button type="button" class="schedule-item'+(active?' is-active':'')+'" data-detail-schedule="'+esc(item.id)+'">'
      + '<span class="schedule-item-head"><strong>'+esc(item.title || item.sanctuaryName || '성역 일정')+'</strong><span class="schedule-status status-'+status+'">'+esc(item.statusLabel || '조사중')+'</span></span>'
      + '<p>'+esc(meta)+'</p></button>';
  }

  function responseFormHtml(day){
    const user = day.user || {};
    if(!user.authenticated){
      return '<div class="schedule-empty">PASS KEY 로그인 후 본인 팀의 가능 시간을 입력할 수 있습니다.</div><button type="button" class="schedule-login-btn" id="scheduleLoginBtn">PASS KEY 로그인</button>';
    }
    if(!user.canRespond){
      return '<div class="schedule-empty"><strong>'+esc(user.mainCharacterName || '로그인 사용자')+'</strong>님의 현재 성역 팀을 찾지 못했습니다.<br>성역 파티 편성을 먼저 확인해 주세요.</div>';
    }
    const response = user.response || {};
    state.responseStatus = String(response.status || 'unknown');
    const options = Array.isArray(day.responseOptions) ? day.responseOptions : [];
    const examples = Array.isArray(day.timeExamples) ? day.timeExamples.join(' · ') : '';
    return '<div class="schedule-response-state"><span>응답 대상</span><strong>'+(state.selectedScheduleId?'선택 일정':'날짜 전체')+' · '+esc(user.teamNo)+'팀</strong></div>'
      + '<div class="schedule-response-options">'+options.map(option => '<button type="button" class="schedule-response-option'+(option.value===state.responseStatus?' is-active':'')+'" data-response-status="'+esc(option.value)+'" data-value="'+esc(option.value)+'">'+esc(option.label)+'</button>').join('')+'</div>'
      + '<div class="schedule-input-grid">'
      + '<label>가능 시간<input id="scheduleTimeText" type="text" maxlength="40" value="'+esc(response.timeText || '')+'" placeholder="21:00 이후"></label>'
      + '<div class="schedule-time-examples">입력 예시 · '+esc(examples)+'</div>'
      + '<label>메모<textarea id="scheduleResponseNote" rows="3" maxlength="200" placeholder="일정 조율에 필요한 내용을 남겨주세요.">'+esc(response.note || '')+'</textarea></label>'
      + '</div><button type="button" class="schedule-save-btn" id="scheduleSaveBtn">가능 시간 저장</button>';
  }

  function summaryHtml(summary){
    if(!summary || summary.ok === false) return '<div class="schedule-empty">팀 참여 현황을 확인할 수 없습니다.</div>';
    const members = Array.isArray(summary.members) ? summary.members : [];
    const recommended = summary.recommendedTime?.label || '';
    return '<div class="schedule-team-metrics">'
      + '<div class="schedule-team-metric"><strong>'+esc(summary.availableCount ?? 0)+'</strong><span>가능</span></div>'
      + '<div class="schedule-team-metric"><strong>'+esc(summary.negotiableCount ?? 0)+'</strong><span>협의</span></div>'
      + '<div class="schedule-team-metric"><strong>'+esc(summary.unavailableCount ?? 0)+'</strong><span>불가</span></div>'
      + '<div class="schedule-team-metric"><strong>'+esc(summary.pendingCount ?? 0)+'</strong><span>미응답</span></div></div>'
      + '<div class="schedule-team-rate"><span>응답률 '+esc(summary.responseRate ?? 0)+'%</span><span>참여율 '+esc(summary.participationRate ?? 0)+'%</span>'+(recommended?'<span class="is-recommended">추천 '+esc(recommended)+'</span>':'')+'</div>'
      + '<div class="schedule-member-list">'+members.map(member => '<div class="schedule-member member-'+esc(member.status || 'pending')+'"><strong>'+esc(member.memberName || '-')+'</strong><span>'+esc(member.statusLabel || '미응답')+(member.timeText?' · '+esc(member.timeText):'')+'</span></div>').join('')+'</div>';
  }

  function applyResponseStatusUi(){
    const timeInput = document.getElementById('scheduleTimeText');
    const disabled = ['unavailable','unknown'].includes(String(state.responseStatus || 'unknown'));
    if(timeInput){
      timeInput.disabled = disabled;
      if(disabled) timeInput.value = '';
      timeInput.placeholder = disabled ? '시간 입력 없음' : '21:00 이후';
    }
  }

  function renderDay(){
    const root = document.getElementById('scheduleDetail');
    const day = state.day;
    if(!root) return;
    if(!day || day.ok === false){
      root.innerHTML = '<div class="schedule-error">'+esc(day?.message || '날짜 정보를 불러오지 못했습니다.')+'</div>';
      return;
    }
    const schedules = Array.isArray(day.schedules) ? day.schedules : [];
    const user = day.user || {};
    root.innerHTML = '<header class="schedule-detail-head"><div><div class="schedule-kicker">SELECTED DATE</div><h2>'+esc(day.dateLabel || day.targetDate)+'</h2><p>아이온 주간 '+esc(day.weekStart)+' ~ '+esc(day.weekEnd)+'</p></div><span class="schedule-detail-badge">'+esc(day.sanctuary?.shortName || day.sanctuary?.name || '')+'</span></header>'
      + '<section class="schedule-section"><div class="schedule-section-title"><h3>등록 일정</h3><span>'+schedules.length+'건</span></div>'
      + '<div class="schedule-list"><button type="button" class="schedule-item'+(!state.selectedScheduleId?' is-active':'')+'" data-detail-schedule=""><span class="schedule-item-head"><strong>날짜 전체 응답</strong><span class="schedule-status">공통</span></span><p>특정 일정과 관계없이 이 날짜의 가능 시간을 등록합니다.</p></button>'
      + schedules.map(scheduleItemHtml).join('')+'</div></section>'
      + '<section class="schedule-section"><div class="schedule-section-title"><h3>가능 시간 입력</h3><span>'+esc(user.mainCharacterName || '로그인 필요')+'</span></div>'+responseFormHtml(day)+'</section>'
      + '<section class="schedule-section"><div class="schedule-section-title"><h3>팀원 현황</h3><span>'+(user.teamNo?esc(user.teamNo)+'팀':'팀 확인 필요')+'</span></div>'+summaryHtml(user.summary)+'</section>';

    root.querySelectorAll('[data-detail-schedule]').forEach(button => {
      button.addEventListener('click', () => {
        state.selectedScheduleId = Number(button.dataset.detailSchedule || 0) || null;
        updateUrl();
        loadDay();
      });
    });
    root.querySelectorAll('[data-response-status]').forEach(button => {
      button.addEventListener('click', () => {
        state.responseStatus = String(button.dataset.responseStatus || 'unknown');
        root.querySelectorAll('[data-response-status]').forEach(item => item.classList.toggle('is-active', item === button));
        applyResponseStatusUi();
      });
    });
    document.getElementById('scheduleLoginBtn')?.addEventListener('click', () => window.KinojoAuth?.openLoginModal?.('성역 스케줄 응답은 PASS KEY 로그인이 필요합니다.', {context:'sanctuary-schedule'}));
    document.getElementById('scheduleSaveBtn')?.addEventListener('click', saveAvailability);
    applyResponseStatusUi();
  }

  async function loadDay(){
    if(!state.selectedDate || !state.sanctuaryCode) return;
    const seq = ++state.daySeq;
    const root = document.getElementById('scheduleDetail');
    if(root) root.innerHTML = '<div class="schedule-detail-loading"><span class="kinojo-spinner" aria-hidden="true"></span><strong>선택 날짜를 확인하는 중...</strong></div>';
    try{
      const data = await window.KinojoApi.getAction('sanctuaryScheduleDay', {
        sanctuaryCode: state.sanctuaryCode,
        targetDate: state.selectedDate,
        scheduleId: state.selectedScheduleId,
        passKey: currentPassKey()
      });
      if(seq !== state.daySeq) return;
      state.day = data;
      renderDay();
    }catch(error){
      if(seq !== state.daySeq) return;
      state.day = {ok:false,message:error?.message || String(error)};
      renderDay();
    }
  }

  async function saveAvailability(){
    if(state.saving) return;
    if(!window.KinojoAuth?.requireLogin?.('성역 스케줄 응답은 PASS KEY 로그인이 필요합니다.', {context:'sanctuary-schedule'})) return;
    const passKey = currentPassKey();
    if(!passKey){
      window.KinojoAuth?.openLoginModal?.('성역 스케줄 응답은 PASS KEY 로그인이 필요합니다.', {context:'sanctuary-schedule'});
      return;
    }
    const button = document.getElementById('scheduleSaveBtn');
    state.saving = true;
    if(button){ button.disabled = true; button.textContent = '저장 중...'; }
    try{
      const data = await window.KinojoApi.postAction('sanctuaryAvailabilitySave', {
        passKey,
        sanctuaryCode: state.sanctuaryCode,
        targetDate: state.selectedDate,
        scheduleId: state.selectedScheduleId,
        status: state.responseStatus,
        timeText: document.getElementById('scheduleTimeText')?.value || '',
        note: document.getElementById('scheduleResponseNote')?.value || ''
      });
      if(!data || data.ok === false) throw new Error(data?.message || '가능 시간 저장 실패');
      toast('가능 시간이 저장되었습니다.', 'success');
      await loadCalendar({preserveSelection:true});
    }catch(error){
      toast(error?.message || '가능 시간 저장에 실패했습니다.', 'error');
    }finally{
      state.saving = false;
      if(button){ button.disabled = false; button.textContent = '가능 시간 저장'; }
    }
  }

  async function loadCalendar(options={}){
    const seq = ++state.requestSeq;
    setSync('Server Engine 일정 계산 중');
    const root = document.getElementById('scheduleCalendarViewport');
    if(root && !options.preserveSelection) root.innerHTML = '<div class="schedule-calendar-loading"><span class="kinojo-spinner" aria-hidden="true"></span><strong>일정을 불러오는 중...</strong></div>';
    try{
      const data = await window.KinojoApi.getAction('sanctuaryScheduleCalendar', {
        view: state.view,
        anchor: state.anchor,
        sanctuaryCode: state.sanctuaryCode,
        passKey: currentPassKey()
      });
      if(seq !== state.requestSeq) return;
      if(!data || data.ok === false) throw new Error(data?.message || '스케줄 달력 조회 실패');
      state.calendar = data;
      state.anchor = String(data.anchor || state.anchor || '');
      state.sanctuaryCode = String(data.selectedSanctuaryCode || state.sanctuaryCode || '').toLowerCase();
      pickInitialDate();
      renderToolbar();
      renderWeekHead();
      renderCalendar();
      updateUrl();
      setSync('Server Engine 업데이트 '+String(data.generatedAt || '완료'));
      await loadDay();
    }catch(error){
      if(seq !== state.requestSeq) return;
      setSync('일정 연결 실패', true);
      if(root) root.innerHTML = '<div class="schedule-error">'+esc(error?.message || '성역 스케줄을 불러오지 못했습니다.')+'</div>';
    }
  }

  function navigatePanel(direction){
    const panel = currentPanel();
    const nextAnchor = direction === 'prev' ? panel?.previousAnchor : panel?.nextAnchor;
    if(!nextAnchor) return;
    const deck = document.getElementById('scheduleMonthDeck');
    if(deck) deck.classList.add(direction === 'prev' ? 'is-moving-prev' : 'is-moving-next');
    setTimeout(() => {
      state.anchor = String(nextAnchor);
      state.selectedDate = '';
      state.selectedScheduleId = null;
      loadCalendar();
    }, 230);
  }

  function bind(){
    document.getElementById('scheduleSanctuarySelect')?.addEventListener('change', event => {
      state.sanctuaryCode = String(event.target.value || '').toLowerCase();
      state.selectedDate = '';
      state.selectedScheduleId = null;
      loadCalendar();
    });
    document.querySelectorAll('[data-schedule-view]').forEach(button => {
      button.addEventListener('click', () => {
        const view = button.dataset.scheduleView === 'week' ? 'week' : 'month';
        if(view === state.view) return;
        state.view = view;
        state.selectedDate = '';
        state.selectedScheduleId = null;
        loadCalendar();
      });
    });
    document.getElementById('scheduleTodayBtn')?.addEventListener('click', () => {
      state.anchor = String(state.calendar?.today || '');
      state.selectedDate = String(state.calendar?.today || '');
      state.selectedScheduleId = null;
      loadCalendar({preserveSelection:true});
    });
    document.getElementById('schedulePrevBtn')?.addEventListener('click', () => navigatePanel('prev'));
    document.getElementById('scheduleNextBtn')?.addEventListener('click', () => navigatePanel('next'));
    window.addEventListener('kinojo:auth-changed', () => loadCalendar({preserveSelection:true}));
    loadCalendar();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
