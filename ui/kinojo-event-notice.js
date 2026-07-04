/* ===========================================================
KINOJO Event Notice Popup
기능 : 사용자 페이지 진입 이벤트 공지 팝업 공통 로더
정리일 : 2026-07-04
규칙 : 공지 묶음별 오늘 하루 그만보기 분리
=========================================================== */
(function(){
  'use strict';
  const STORAGE_PREFIX = 'kinojo_event_notice_dismissed_';
  const SESSION_PREFIX = 'kinojo_event_notice_closed_';
  const DEFAULT_LIMIT = 10;

  function todayKey(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return y + m + day;
  }
  function esc(value){
    return String(value ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
  }
  function normalizeType(type){ return String(type || 'event').toLowerCase().replace(/[^a-z0-9_]/g,'') || 'event'; }
  function dismissKey(group){ return STORAGE_PREFIX + (group.groupId || group.id || '0') + '_' + (group.popupVersion || group.popup_version || 1) + '_' + todayKey(); }
  function closeKey(group){ return SESSION_PREFIX + (group.groupId || group.id || '0') + '_' + (group.popupVersion || group.popup_version || 1); }
  function isDismissed(group){
    try{ if(localStorage.getItem(dismissKey(group)) === '1') return true; }catch(_err){}
    try{ if(sessionStorage.getItem(closeKey(group)) === '1') return true; }catch(_err){}
    return false;
  }
  function markDismissed(group){ try{ localStorage.setItem(dismissKey(group),'1'); }catch(_err){} }
  function markClosed(group){ try{ sessionStorage.setItem(closeKey(group),'1'); }catch(_err){} }
  function labelOf(item){ return item.noticeTypeLabel || item.notice_type_label || typeLabel(item.noticeType || item.notice_type); }
  function typeLabel(type){
    const t = normalizeType(type);
    return ({ abyss_low:'어비스 하층', abyss_middle:'어비스 중층', rift:'시공', abyss_boss:'어비스 보스', event:'이벤트', custom:'공지' })[t] || '공지';
  }
  function renderItem(item){
    const type = normalizeType(item.noticeType || item.notice_type);
    const date = item.eventDate || item.event_date || (item.eventAt ? String(item.eventAt).slice(0,10) : '');
    const time = item.eventTime || item.event_time || ((String(item.eventAt || '').match(/T(\d{2}:\d{2})/)||[])[1]) || '--:--';
    return '<article class="kinojo-event-notice-card type-'+esc(type)+'">'
      + '<div class="kinojo-event-notice-copy">'
      + '<span class="kinojo-event-notice-label">'+esc(labelOf(item))+'</span>'
      + '<strong class="kinojo-event-notice-title">'+esc(item.title || labelOf(item))+'</strong>'
      + '<span class="kinojo-event-notice-desc">'+esc(item.description || '')+'</span>'
      + '</div>'
      + '<div class="kinojo-event-notice-timebox"><time>'+esc(time)+'</time><span class="kinojo-event-notice-date">'+esc(date)+'</span></div>'
      + '</article>';
  }
  function renderGroup(group){
    const items = Array.isArray(group.items) ? group.items : [];
    return '<section class="kinojo-event-notice-group" data-event-notice-group="'+esc(group.groupId || group.id)+'">'
      + '<header class="kinojo-event-notice-head"><div><span>EVENT NOTICE</span><strong>'+esc(group.groupTitle || group.title || '이벤트 공지')+'</strong></div><em class="kinojo-event-notice-count">'+items.length+'/4</em></header>'
      + '<div class="kinojo-event-notice-cards">'+items.map(renderItem).join('')+'</div>'
      + '<footer class="kinojo-event-notice-actions"><button type="button" data-event-notice-today="'+esc(group.groupId || group.id)+'">오늘 하루 그만보기</button><button class="close" type="button" data-event-notice-close="'+esc(group.groupId || group.id)+'">닫기</button></footer>'
      + '</section>';
  }
  function removeGroup(root, group){
    const id = String(group.groupId || group.id || '');
    const card = root.querySelector('[data-event-notice-group="'+CSS.escape(id)+'"]');
    if(card) card.remove();
    if(!root.querySelector('[data-event-notice-group]')) root.classList.remove('is-visible');
  }
  async function loadGroups(){
    if(!window.KinojoSupabase || typeof window.KinojoSupabase.getWebEventNoticeGroups !== 'function') return [];
    const res = await window.KinojoSupabase.getWebEventNoticeGroups(DEFAULT_LIMIT);
    const groups = Array.isArray(res?.groups) ? res.groups : [];
    return groups.filter(g => Array.isArray(g.items) && g.items.length && !isDismissed(g));
  }
  async function init(){
    if(document.documentElement.dataset.kinojoEventNoticeLoaded === '1') return;
    document.documentElement.dataset.kinojoEventNoticeLoaded = '1';
    let groups=[];
    try{ groups = await loadGroups(); }catch(err){ console.warn('KINOJO event notice load failed:', err); return; }
    if(!groups.length) return;
    const root = document.createElement('div');
    root.className = 'kinojo-event-notice-root';
    root.setAttribute('role','dialog');
    root.setAttribute('aria-modal','true');
    root.setAttribute('aria-label','KINOJO 이벤트 공지');
    root.innerHTML = '<div class="kinojo-event-notice-stack">'+groups.map(renderGroup).join('')+'</div>';
    document.body.appendChild(root);
    requestAnimationFrame(()=>root.classList.add('is-visible'));
    root.addEventListener('click', function(e){
      const todayBtn = e.target.closest('[data-event-notice-today]');
      const closeBtn = e.target.closest('[data-event-notice-close]');
      if(!todayBtn && !closeBtn) return;
      const id = String((todayBtn || closeBtn).getAttribute(todayBtn ? 'data-event-notice-today' : 'data-event-notice-close') || '');
      const group = groups.find(g => String(g.groupId || g.id) === id);
      if(!group) return;
      if(todayBtn) markDismissed(group); else markClosed(group);
      removeGroup(root, group);
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
  window.KinojoEventNotice = { init };
})();
