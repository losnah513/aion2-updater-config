/*
 * KINOJO Runtime UI Bridge
 * Role: Server Engine Runtime Lock/Progress 상태를 웹 공통 UI로 표시합니다.
 * 원칙: 업데이터는 START 버튼 + 진행 UI만 담당하고, 판단/연산은 Server Engine이 담당합니다.
 */
(function(){
  'use strict';

  const DEFAULT_INTERVAL = 15000;
  const FAST_INTERVAL = 5000;
  let timer = null;
  let mounted = false;
  let lastStatus = null;

  function qs(sel, root){ return (root || document).querySelector(sel); }
  function ce(tag, cls){ const el = document.createElement(tag); if(cls) el.className = cls; return el; }
  function fmtDate(value){
    if(!value) return '-';
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return String(value).slice(0, 19).replace('T',' ');
    return d.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  }
  function fmtEta(seconds){
    const n = Number(seconds || 0);
    if(!n || n < 0) return '-';
    const m = Math.floor(n / 60);
    const s = Math.floor(n % 60);
    return m ? `${m}분 ${s}초` : `${s}초`;
  }
  function normalize(raw){
    if(!raw) return { ok:false, isLocked:false, status:'unknown', message:'상태 없음' };
    const status = raw.status && typeof raw.status === 'object' && !Array.isArray(raw.status) ? raw.status : raw;
    return Object.assign({ ok:raw.ok !== false }, status);
  }
  async function getStatus(){
    if(!window.KinojoSupabase || !window.KinojoSupabase.runtimeGetStatus) throw new Error('KinojoSupabase runtime API가 없습니다.');
    return normalize(await window.KinojoSupabase.runtimeGetStatus());
  }
  function statusText(status){
    if(!status || status.ok === false) return '서버 상태 확인 실패';
    if(status.isLocked) return '조회 중';
    if(status.status === 'cancelled') return '강제 해제됨';
    if(status.status === 'completed') return '완료';
    return '대기 중';
  }
  function renderStatus(root, status){
    const s = normalize(status);
    root.classList.toggle('is-running', !!s.isLocked);
    root.classList.toggle('is-stale', !!s.heartbeatStale || !!s.shouldExpire);
    const percent = Math.max(0, Math.min(100, Number(s.progressPercent || 0)));
    qs('[data-runtime-label]', root).textContent = statusText(s);
    qs('[data-runtime-message]', root).textContent = s.message || (s.isLocked ? '서버 조회가 진행 중입니다.' : '현재 실행 중인 조회가 없습니다.');
    qs('[data-runtime-owner]', root).textContent = s.lockedBy || '-';
    qs('[data-runtime-stage]', root).textContent = s.stage || s.status || '-';
    qs('[data-runtime-current]', root).textContent = s.currentCharacter || '-';
    qs('[data-runtime-progress-text]', root).textContent = `${Number(s.progressCurrent || 0)} / ${Number(s.progressTotal || 0)} · ${percent.toFixed(1)}%`;
    qs('[data-runtime-bar]', root).style.width = percent + '%';
    qs('[data-runtime-started]', root).textContent = fmtDate(s.startedAt);
    qs('[data-runtime-heartbeat]', root).textContent = fmtDate(s.lastHeartbeatAt);
    qs('[data-runtime-eta]', root).textContent = fmtEta(s.etaSeconds);
    const events = Array.isArray(s.recentEvents) ? s.recentEvents.slice(0, 5) : [];
    const list = qs('[data-runtime-events]', root);
    list.innerHTML = '';
    if(events.length){
      events.forEach(ev => {
        const li = ce('li');
        li.textContent = `[${fmtDate(ev.created_at)}] ${ev.stage || ev.event_type || 'EVENT'} · ${ev.message || ev.character_name || ''}`;
        list.appendChild(li);
      });
    }else{
      const li = ce('li');
      li.textContent = '최근 이벤트 없음';
      list.appendChild(li);
    }
  }
  function createWidget(){
    const box = ce('section', 'kinojo-runtime-widget');
    box.setAttribute('data-kinojo-runtime-status', '');
    box.innerHTML = `
      <div class="kinojo-runtime-head">
        <div>
          <strong>조회 런타임</strong>
          <span data-runtime-label>확인 중</span>
        </div>
        <a class="kinojo-runtime-link" href="/updater/">Updater Web</a>
      </div>
      <p class="kinojo-runtime-message" data-runtime-message>서버 상태 확인 중...</p>
      <div class="kinojo-runtime-progress"><span data-runtime-bar></span></div>
      <div class="kinojo-runtime-grid">
        <span>실행자</span><b data-runtime-owner>-</b>
        <span>단계</span><b data-runtime-stage>-</b>
        <span>현재</span><b data-runtime-current>-</b>
        <span>진행</span><b data-runtime-progress-text>-</b>
        <span>시작</span><b data-runtime-started>-</b>
        <span>신호</span><b data-runtime-heartbeat>-</b>
        <span>남은 시간</span><b data-runtime-eta>-</b>
      </div>
      <details class="kinojo-runtime-events"><summary>최근 이벤트</summary><ul data-runtime-events></ul></details>
    `;
    return box;
  }
  function mount(target){
    if(mounted) return qs('[data-kinojo-runtime-status]');
    let root = target || qs('[data-kinojo-runtime-status]');
    if(!root){
      root = createWidget();
      document.body.appendChild(root);
    }else if(!root.innerHTML.trim()){
      root.replaceWith(createWidget());
      root = qs('[data-kinojo-runtime-status]');
    }
    mounted = true;
    return root;
  }
  async function refresh(){
    const root = mount();
    try{
      const status = await getStatus();
      lastStatus = status;
      renderStatus(root, status);
      schedule(status.isLocked ? FAST_INTERVAL : DEFAULT_INTERVAL);
      window.dispatchEvent(new CustomEvent('kinojo:runtime-status', { detail:status }));
      return status;
    }catch(err){
      renderStatus(root, { ok:false, isLocked:false, status:'error', message:err && err.message || '상태 확인 실패' });
      schedule(DEFAULT_INTERVAL);
      return null;
    }
  }
  function schedule(ms){
    if(timer) clearTimeout(timer);
    timer = setTimeout(refresh, ms || DEFAULT_INTERVAL);
  }
  function start(){ mount(); refresh(); }

  window.KinojoRuntime = { mount, refresh, start, get lastStatus(){ return lastStatus; } };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
