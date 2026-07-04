/* ===========================================================
KINOJO Event Notice Popup
기능 : 사용자 페이지 진입 이벤트 공지 팝업 공통 로더
정리일 : 2026-07-04
규칙 : 공지 묶음별 오늘 하루 그만보기 분리
STEP : 2-5 운영 전 안정화
=========================================================== */
(function(){
  'use strict';

  const STORAGE_PREFIX = 'kinojo_event_notice_dismissed_';
  const SESSION_PREFIX = 'kinojo_event_notice_closed_';
  const DEFAULT_LIMIT = 10;
  const KST_TZ = 'Asia/Seoul';

  function kstParts(date){
    const parts = new Intl.DateTimeFormat('ko-KR', {
      timeZone: KST_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(date || new Date()).reduce((acc, part) => {
      if(part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});
    return parts;
  }

  function todayKey(){
    const p = kstParts(new Date());
    return String(p.year || '') + String(p.month || '') + String(p.day || '');
  }

  function esc(value){
    return String(value ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
  }

  function normalizeType(type){
    return String(type || 'event').toLowerCase().replace(/[^a-z0-9_]/g,'') || 'event';
  }

  function groupId(group){ return String(group?.groupId || group?.group_id || group?.id || '0'); }
  function groupVersion(group){ return String(group?.popupVersion || group?.popup_version || 1); }
  function dismissKey(group){ return STORAGE_PREFIX + groupId(group) + '_' + groupVersion(group) + '_' + todayKey(); }
  function closeKey(group){ return SESSION_PREFIX + groupId(group) + '_' + groupVersion(group); }

  function safeGet(storage, key){ try{ return storage.getItem(key); }catch(_err){ return null; } }
  function safeSet(storage, key, value){ try{ storage.setItem(key, value); }catch(_err){} }

  function isDismissed(group){
    if(safeGet(localStorage, dismissKey(group)) === '1') return true;
    if(safeGet(sessionStorage, closeKey(group)) === '1') return true;
    return false;
  }
  function markDismissed(group){ safeSet(localStorage, dismissKey(group), '1'); }
  function markClosed(group){ safeSet(sessionStorage, closeKey(group), '1'); }

  function typeLabel(type){
    const t = normalizeType(type);
    return ({
      abyss_low:'어비스 하층',
      abyss_middle:'어비스 중층',
      rift:'시공',
      abyss_boss:'어비스 보스',
      event:'이벤트',
      custom:'공지'
    })[t] || '공지';
  }

  function labelOf(item){
    return item?.noticeTypeLabel || item?.notice_type_label || typeLabel(item?.noticeType || item?.notice_type);
  }

  function timeOf(item){
    return item?.eventTime || item?.event_time || ((String(item?.eventAt || item?.event_at || '').match(/T(\d{2}:\d{2})/) || [])[1]) || '--:--';
  }

  function dateOf(item){
    return item?.eventDate || item?.event_date || (item?.eventAt || item?.event_at ? String(item.eventAt || item.event_at).slice(0, 10) : '');
  }

  function getEventDate(item){
    const date = dateOf(item);
    const time = timeOf(item);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
    const parsed = new Date(date + 'T' + time + ':00+09:00');
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function relativeText(item){
    const eventDate = getEventDate(item);
    if(!eventDate) return '';
    const diffMs = eventDate.getTime() - Date.now();
    if(diffMs <= 0) return '진행 중';
    const minutes = Math.ceil(diffMs / 60000);
    if(minutes < 60) return minutes + '분 후';
    const hours = Math.floor(minutes / 60);
    const remain = minutes % 60;
    if(hours < 24) return remain ? hours + '시간 ' + remain + '분 후' : hours + '시간 후';
    return Math.ceil(hours / 24) + '일 후';
  }

  function renderItem(item){
    const type = normalizeType(item?.noticeType || item?.notice_type);
    const date = dateOf(item);
    const time = timeOf(item);
    const relative = relativeText(item);
    return '<article class="kinojo-event-notice-card type-'+esc(type)+'">'
      + '<div class="kinojo-event-notice-copy">'
      + '<span class="kinojo-event-notice-label">'+esc(labelOf(item))+'</span>'
      + '<strong class="kinojo-event-notice-title">'+esc(item?.title || labelOf(item))+'</strong>'
      + '<span class="kinojo-event-notice-desc">'+esc(item?.description || '')+'</span>'
      + '</div>'
      + '<div class="kinojo-event-notice-timebox"><time>'+esc(time)+'</time>'
      + (relative ? '<b>'+esc(relative)+'</b>' : '')
      + '<span class="kinojo-event-notice-date">'+esc(date)+'</span></div>'
      + '</article>';
  }

  function renderGroup(group){
    const items = Array.isArray(group?.items) ? group.items : [];
    const id = groupId(group);
    return '<section class="kinojo-event-notice-group" data-event-notice-group="'+esc(id)+'">'
      + '<header class="kinojo-event-notice-head"><div><span>EVENT NOTICE</span><strong>'+esc(group?.groupTitle || group?.title || '이벤트 공지')+'</strong></div><em class="kinojo-event-notice-count">'+items.length+'/4</em></header>'
      + '<div class="kinojo-event-notice-cards">'+items.map(renderItem).join('')+'</div>'
      + '<footer class="kinojo-event-notice-actions"><button type="button" data-event-notice-today="'+esc(id)+'">오늘 하루 그만보기</button><button class="close" type="button" data-event-notice-close="'+esc(id)+'">닫기</button></footer>'
      + '</section>';
  }

  function findGroup(groups, id){
    return groups.find(g => groupId(g) === String(id || '')) || null;
  }

  function removeGroup(root, group){
    const id = groupId(group);
    const selector = '[data-event-notice-group="'+(window.CSS && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"'))+'"]';
    const card = root.querySelector(selector);
    if(card) card.remove();
    if(!root.querySelector('[data-event-notice-group]')){
      root.classList.remove('is-visible');
      window.setTimeout(() => root.remove(), 220);
    }
  }

  async function loadGroups(){
    if(!window.KinojoSupabase || typeof window.KinojoSupabase.getWebEventNoticeGroups !== 'function') return [];
    const res = await window.KinojoSupabase.getWebEventNoticeGroups(DEFAULT_LIMIT);
    const groups = Array.isArray(res?.groups) ? res.groups : [];
    return groups
      .filter(g => Array.isArray(g.items) && g.items.length)
      .filter(g => !isDismissed(g));
  }

  async function init(){
    if(document.documentElement.dataset.kinojoEventNoticeLoaded === '1') return;
    document.documentElement.dataset.kinojoEventNoticeLoaded = '1';

    let groups = [];
    try{
      groups = await loadGroups();
    }catch(err){
      console.warn('KINOJO event notice load failed:', err);
      return;
    }
    if(!groups.length) return;

    const root = document.createElement('div');
    root.className = 'kinojo-event-notice-root';
    root.setAttribute('role','dialog');
    root.setAttribute('aria-modal','true');
    root.setAttribute('aria-label','KINOJO 이벤트 공지');
    root.innerHTML = '<div class="kinojo-event-notice-stack">'+groups.map(renderGroup).join('')+'</div>';
    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add('is-visible'));

    root.addEventListener('click', function(e){
      const todayBtn = e.target.closest('[data-event-notice-today]');
      const closeBtn = e.target.closest('[data-event-notice-close]');
      if(!todayBtn && !closeBtn) return;
      const id = String((todayBtn || closeBtn).getAttribute(todayBtn ? 'data-event-notice-today' : 'data-event-notice-close') || '');
      const group = findGroup(groups, id);
      if(!group) return;
      if(todayBtn) markDismissed(group); else markClosed(group);
      removeGroup(root, group);
    });

    const onKey = function(e){
      if(e.key !== 'Escape') return;
      groups.forEach(markClosed);
      root.classList.remove('is-visible');
      window.setTimeout(() => root.remove(), 220);
      document.removeEventListener('keydown', onKey);
    };
    document.addEventListener('keydown', onKey);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
  window.KinojoEventNotice = { init };
})();
