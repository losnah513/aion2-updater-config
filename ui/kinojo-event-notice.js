/* ===========================================================
KINOJO Event Notice Popup
기능 : 사용자 페이지 진입 이벤트 공지 팝업 공통 로더
정리일 : 2026-07-04
규칙 : 공지 묶음별 오늘 하루 그만보기 분리
STEP : 3-4 실제 적용/시각 확인 보강
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

  function typeMeta(type){
    const t = normalizeType(type);
    return ({
      abyss_low:{ label:'어비스 하층', icon:'◆', tone:'gold' },
      abyss_middle:{ label:'어비스 중층', icon:'◆', tone:'gold' },
      rift:{ label:'시공', icon:'◎', tone:'gold' },
      abyss_boss:{ label:'어비스 보스', icon:'♛', tone:'gold' },
      event:{ label:'이벤트', icon:'◆', tone:'gold' },
      custom:{ label:'공지', icon:'◆', tone:'gold' }
    })[t] || { label:'공지', icon:'INFO', tone:'slate' };
  }

  function typeLabel(type){
    return typeMeta(type).label;
  }

  function labelOf(item){
    return item?.noticeTypeLabel || item?.notice_type_label || typeLabel(item?.noticeType || item?.notice_type);
  }

  function iconOf(item){
    return item?.noticeTypeIcon || item?.notice_type_icon || typeMeta(item?.noticeType || item?.notice_type).icon;
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
    const label = labelOf(item);
    return '<article class="kinojo-event-notice-card type-'+esc(type)+'" data-event-notice-theme="'+esc(type)+'">'
      + '<span class="kinojo-event-notice-glow" aria-hidden="true"></span>'
      + '<span class="kinojo-event-notice-icon" aria-hidden="true">'+esc(iconOf(item))+'</span>'
      + '<div class="kinojo-event-notice-copy">'
      + '<span class="kinojo-event-notice-label">'+esc(label)+'</span>'
      + '<strong class="kinojo-event-notice-title">'+esc(item?.title || label)+'</strong>'
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
      root.classList.add('is-hiding');
      root.classList.remove('is-visible');
      window.setTimeout(() => root.remove(), 220);
    }
  }


  function hasPreviewFlag(){
    try{
      const params = new URLSearchParams(window.location.search || '');
      return params.has('noticeTest') || params.has('eventNoticeTest') || params.has('eventNoticePreview');
    }catch(_err){
      return false;
    }
  }

  function buildPreviewGroups(){
    const now = new Date();
    const base = new Date(now.getTime() + 20 * 60000);
    const yyyy = new Intl.DateTimeFormat('sv-SE', { timeZone: KST_TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(base);
    const time = new Intl.DateTimeFormat('ko-KR', { timeZone: KST_TZ, hour:'2-digit', minute:'2-digit', hour12:false }).format(base).replace(/\./g,'').trim();
    const items = [
      { noticeType:'abyss_low', eventDate:yyyy, eventTime:time, title:'어비스 하층', description:'하층 전투가 곧 시작됩니다. 포스 준비를 확인하세요.' },
      { noticeType:'abyss_middle', eventDate:yyyy, eventTime:time, title:'어비스 중층', description:'중층 이동 경로와 파티 구성을 확인하세요.' },
      { noticeType:'abyss_boss', eventDate:yyyy, eventTime:time, title:'어비스 보스', description:'보스 등장 전 집결 위치를 확인하세요.' },
      { noticeType:'rift', eventDate:yyyy, eventTime:time, title:'시공', description:'시공 진입 시간이 가까워졌습니다.' }
    ];
    return [{ groupId:'preview', popupVersion:'preview', groupTitle:'이벤트 공지 미리보기', items }];
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
      groups = hasPreviewFlag() ? buildPreviewGroups() : await loadGroups();
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
      root.classList.add('is-hiding');
      root.classList.remove('is-visible');
      window.setTimeout(() => root.remove(), 220);
      document.removeEventListener('keydown', onKey);
    };
    document.addEventListener('keydown', onKey);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
  window.KinojoEventNotice = { init, buildPreviewGroups };
})();
