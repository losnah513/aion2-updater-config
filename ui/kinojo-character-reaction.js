/*
 * KINOJO Character Reaction Modal
 * 역할: 명예의 전당·랭킹·성역이 함께 쓰는 실시간 캐릭터 상세·반응 모달.
 * 규칙: PLAYNC 정보는 실시간 표시만 하며 DB에 저장하지 않는다.
 */
(function(){
  'use strict';

  const state = {
    open: false,
    submitting: false,
    type: 'like',
    target: null,
    options: null,
    returnFocus: null,
    tab: 'overview',
    live: null,
    liveLoading: false,
    detailLoading: false,
    equipmentCategory: 'weapon',
    equipmentPage: { weapon:0, armor:0, accessory:0 },
    equipmentTouchStart: null
  };
  const LIVE_CACHE_TTL = 120000;
  const liveCache = new Map();
  const liveInflight = new Map();

  function visitorId(){
    let id = localStorage.getItem('kinojoVisitorId');
    if(!id){
      id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      localStorage.setItem('kinojoVisitorId', id);
    }
    return id;
  }

  function todayKey(){
    return new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
  }

  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[ch]));
  }

  function safeUrl(value){
    return String(value || '').replace(/"/g, '%22');
  }

  const CLASS_ICON_MAP = {
    '수호성':'templar','검성':'gladiator','살성':'assassin','궁성':'ranger',
    '마도성':'sorcerer','정령성':'elementalist','치유성':'cleric','호법성':'chanter','권성':'fighter'
  };

  function normalizeClassName(className){
    return String(className || '')
      .replace(/[\s\u200B-\u200D\uFEFF]+/g, '')
      .replace(/[\[(（].*?[\])）]\s*$/g, '')
      .trim();
  }

  function classIconFor(className){
    const key = CLASS_ICON_MAP[normalizeClassName(className)];
    if(!key) return '';
    return '/assets/images/classes/class_icon_' + key + '.png';
  }


  function normalizedImageUrl(value){
    const raw = String(value || '').trim();
    if(!raw) return '';
    if(raw.startsWith('//')) return 'https:' + raw;
    if(raw.startsWith('/') || /^https?:\/\//i.test(raw) || /^data:image\//i.test(raw)) return raw;
    return '';
  }

  function characterImageCandidates(target){
    const item = target || {};
    const serverId = String(item.serverId || item.server_id || '').trim();
    const charKey = String(item.charKey || item.char_key || '').trim();
    const derivedProfile = /^\d+$/.test(serverId) && /^\d{10,}$/.test(charKey)
      ? 'https://profileimg.plaync.com/game_profile_images/aion2/images?gameServerKey=' + encodeURIComponent(serverId) + '&charKey=' + encodeURIComponent(charKey)
      : '';
    const profile = normalizedImageUrl(item.profileImageUrl || item.profileImage || item.profile || item.imageUrl || derivedProfile);
    const classIcon = normalizedImageUrl(item.classIconUrl || item.classIcon || item.iconUrl || classIconFor(item.className || item.class || ''));
    return [
      profile ? { url: profile, kind: 'profile' } : null,
      classIcon ? { url: classIcon, kind: 'class' } : null
    ].filter((candidate, index, list) => candidate && list.findIndex(other => other.url === candidate.url) === index);
  }

  function mountCharacterImage(container, target, options){
    if(!container) return;
    const opts = options || {};
    const item = target || {};
    const candidates = characterImageCandidates(item);
    const fallbackEnabled = opts.fallbackText !== false;
    const fallbackText = fallbackEnabled ? (String(opts.fallbackText || item.name || '?').trim().slice(0, 1) || '?') : '';
    let index = 0;

    container.classList.remove('is-empty', 'is-class-fallback');
    container.replaceChildren();

    const renderNext = () => {
      if(index >= candidates.length){
        container.classList.add('is-empty');
        container.textContent = fallbackText;
        container.dataset.imageState = 'empty';
        return;
      }

      const candidate = candidates[index++];
      const image = document.createElement('img');
      image.src = candidate.url;
      image.alt = opts.alt || ((item.name || '캐릭터') + ' 프로필');
      image.loading = opts.loading === 'eager' ? 'eager' : 'lazy';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.style.objectFit = candidate.kind === 'class' ? 'contain' : 'cover';
      image.style.padding = candidate.kind === 'class' ? (opts.classIconPadding || '20%') : '0';
      image.addEventListener('load', () => {
        container.classList.toggle('is-class-fallback', candidate.kind === 'class');
        container.classList.remove('is-empty');
        container.dataset.imageState = candidate.kind;
      }, { once:true });
      image.addEventListener('error', renderNext, { once:true });
      container.replaceChildren(image);
    };

    renderNext();
  }

  function numText(value){
    const raw = String(value == null ? '' : value).replace(/[^0-9]/g, '');
    const n = Number(raw || 0);
    return Number.isFinite(n) && n > 0 ? n.toLocaleString('ko-KR') : '';
  }

  function firstValue(){
    for(let i=0;i<arguments.length;i++){
      const v = arguments[i];
      if(v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return '';
  }

  function stripServerSuffix(value){
    return String(value || '').replace(/\[[^\]]+\]\s*$/, '').trim();
  }

  function characterMasterQueryName(name){
    return encodeURIComponent(stripServerSuffix(name));
  }

  function mergeMasterRow(target, row){
    if(!row) return target;
    const pve = firstValue(row.latest_pve_combat_power, row.pve_power_total, row.pvePowerTotal, target.pvePower);
    const pvp = firstValue(row.latest_pvp_combat_power, row.pvp_power_total, row.pvpPowerTotal, target.pvpPower);
    const className = firstValue(row.class_name, row.className, target.className);
    const server = firstValue(row.server_name, row.serverName, target.server);
    const serverId = firstValue(row.server_id, row.serverId, target.serverId);
    const detailUrl = firstValue(row.detail_url, row.detailUrl, target.detailUrl);
    const profileImageUrl = firstValue(row.profile_image_url, row.profileImageUrl, target.profileImageUrl);
    const owner = firstValue(row.main_character_name, row.mainCharacterName, target.owner);
    return normalizeTarget(Object.assign({}, target, {
      className, server, serverId, owner, profileImageUrl, detailUrl,
      pvePower: numText(pve) || '',
      pvpPower: numText(pvp) || '',
      classIconUrl: firstValue(target.classIconUrl, classIconFor(className))
    }));
  }

  async function fetchCharacterMaster(target){
    const item = target || {};
    const name = characterMasterQueryName(item.name);
    if(!name || !window.KinojoSupabase || typeof window.KinojoSupabase.request !== 'function') return null;

    const select = 'select=character_name,main_character_name,server_id,server_name,class_name,profile_image_url,detail_url,latest_pve_combat_power,latest_pvp_combat_power';
    let query = select + '&character_name=eq.' + name;
    const serverId = String(item.serverId || '').trim();
    const serverName = String(item.server || '').trim();
    if(/^\d+$/.test(serverId)){
      query += '&server_id=eq.' + encodeURIComponent(serverId);
    }else if(serverName && !serverName.includes('·')){
      query += '&server_name=eq.' + encodeURIComponent(serverName);
    }else{
      return null;
    }
    query += '&limit=1';
    const rows = await window.KinojoSupabase.request('character_master', { query });
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function enrichTargetFromMaster(){
    const current = state.target;
    if(!current || !current.name) return;
    const identity = [current.name, current.serverId || current.server || ''].join('|');
    try{
      const row = await fetchCharacterMaster(current);
      const active = state.target;
      const activeIdentity = active ? [active.name, active.serverId || active.server || ''].join('|') : '';
      if(!row || !state.open || identity !== activeIdentity) return;
      state.target = mergeMasterRow(active, row);
      renderTarget();
      if(!state.live && !state.liveLoading) loadLiveOverview();
    }catch(_err){
      // 서버 상세 조회 실패 시 페이지 카드 데이터로 표시한다.
    }
  }

  function ensureModal(){
    let modal = document.getElementById('kinojoCharacterReactionModal');
    if(modal) return modal;

    modal = document.createElement('section');
    modal.id = 'kinojoCharacterReactionModal';
    modal.className = 'kinojo-character-reaction-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML =
      '<div class="kinojo-character-reaction-backdrop" data-kinojo-character-reaction-close></div>' +
      '<div class="kinojo-character-reaction-dialog" role="dialog" aria-modal="true" aria-labelledby="kinojoCharacterReactionTitle" tabindex="-1">' +
        '<button class="kinojo-character-reaction-close" type="button" aria-label="닫기" data-kinojo-character-reaction-close>×</button>' +
        '<header class="kinojo-character-reaction-profile">' +
          '<div class="kinojo-character-reaction-visual" aria-hidden="true"><div class="kinojo-character-reaction-avatar is-empty" id="kinojoCharacterReactionAvatar"></div><div class="kinojo-character-reaction-class" id="kinojoCharacterReactionClass"></div></div>' +
          '<div class="kinojo-character-reaction-info">' +
            '<div class="kinojo-character-reaction-kicker">LIVE CHARACTER</div>' +
            '<h2 class="kinojo-character-reaction-title" id="kinojoCharacterReactionTitle">캐릭터</h2>' +
            '<p class="kinojo-character-reaction-sub" id="kinojoCharacterReactionSub">PLAYNC 실시간 정보를 불러오는 중입니다.</p>' +
            '<div class="kinojo-character-reaction-powers" aria-label="캐릭터 핵심 정보">' +
              '<span class="kinojo-character-reaction-power is-pve"><b>전투력</b><strong id="kinojoCharacterReactionPvePower">-</strong></span>' +
              '<span class="kinojo-character-reaction-power is-pvp"><b>아이템 레벨</b><strong id="kinojoCharacterReactionPvpPower">-</strong></span>' +
            '</div>' +
            '<div class="kinojo-character-live-meta"><span id="kinojoCharacterLiveTime">실시간 조회 준비</span><a class="kinojo-character-reaction-detail" id="kinojoCharacterReactionDetail" href="#" target="_blank" rel="noopener noreferrer">PLAYNC 정보실 ↗</a></div>' +
          '</div>' +
        '</header>' +
        '<nav class="kinojo-character-live-tabs" aria-label="캐릭터 상세 탭">' +
          '<button class="active" type="button" data-kinojo-character-tab="overview">능력치</button>' +
          '<button type="button" data-kinojo-character-tab="equipment">장비</button>' +
          '<button type="button" data-kinojo-character-tab="stats">기본 스탯·스킬</button>' +
          '<button type="button" data-kinojo-character-tab="daevanion">데바니온</button>' +
          '<button type="button" data-kinojo-character-tab="reaction">평가·코멘트</button>' +
        '</nav>' +
        '<div class="kinojo-character-live-status" id="kinojoCharacterLiveStatus">PLAYNC에서 최신 정보를 불러오고 있습니다.</div>' +
        '<div class="kinojo-character-live-panels">' +
          '<section class="kinojo-character-live-panel active" data-kinojo-character-panel="overview"><div class="kinojo-character-live-loading">실시간 프로필과 핵심 능력치를 불러오는 중입니다.</div></section>' +
          '<section class="kinojo-character-live-panel" data-kinojo-character-panel="equipment"></section>' +
          '<section class="kinojo-character-live-panel" data-kinojo-character-panel="stats"></section>' +
          '<section class="kinojo-character-live-panel" data-kinojo-character-panel="daevanion"></section>' +
          '<section class="kinojo-character-live-panel" data-kinojo-character-panel="reaction">' +
            '<div class="kinojo-character-reaction-actions"><button class="kinojo-character-reaction-type active" id="kinojoCharacterReactionLikeBtn" type="button" data-kinojo-reaction-type="like">👍 좋아요</button><button class="kinojo-character-reaction-type" id="kinojoCharacterReactionDislikeBtn" type="button" data-kinojo-reaction-type="dislike">👎 싫어요</button></div>' +
            '<div class="kinojo-character-reaction-input"><label for="kinojoCharacterReactionComment">코멘트 · 20자 이내로 한마디</label><textarea id="kinojoCharacterReactionComment" class="kinojo-character-reaction-comment" maxlength="20" rows="3" placeholder="전하고 싶은 말을 남겨주세요"></textarea></div>' +
            '<div class="kinojo-character-reaction-foot"><span class="kinojo-character-reaction-status" id="kinojoCharacterReactionStatus"></span><button class="kinojo-character-reaction-submit" id="kinojoCharacterReactionSubmitBtn" type="button">전송</button></div>' +
          '</section>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    modal.addEventListener('click', event => {
      if(event.target && event.target.hasAttribute('data-kinojo-character-reaction-close')) close();
    });
    modal.querySelectorAll('[data-kinojo-reaction-type]').forEach(btn => {
      btn.addEventListener('click', () => setType(btn.dataset.kinojoReactionType || 'like'));
    });
    modal.querySelectorAll('[data-kinojo-character-tab]').forEach(btn => {
      btn.addEventListener('click', () => setTab(btn.dataset.kinojoCharacterTab || 'overview'));
    });
    modal.addEventListener('click', event => {
      const category = event.target.closest('[data-equipment-category]');
      if(category) setEquipmentCategory(category.dataset.equipmentCategory || 'weapon');
      const pageMove = event.target.closest('[data-equipment-page-move]');
      if(pageMove) moveEquipmentPage(Number(pageMove.dataset.equipmentPageMove || 0));
      const item = event.target.closest('[data-live-equipment-item]');
      if(item) loadEquipmentDetail(item);
      const board = event.target.closest('[data-live-daevanion-board]');
      if(board) loadDaevanionDetail(board);
      const closeDetail = event.target.closest('[data-live-detail-close]');
      if(closeDetail && closeDetail.parentElement) closeDetail.parentElement.hidden = true;
    });
    modal.addEventListener('touchstart', event => {
      const surface = event.target.closest('[data-equipment-page-surface]');
      const touch = surface && event.touches ? event.touches[0] : null;
      state.equipmentTouchStart = touch ? { x:touch.clientX, y:touch.clientY } : null;
    }, { passive:true });
    modal.addEventListener('touchend', event => {
      const surface = event.target.closest('[data-equipment-page-surface]');
      const start = state.equipmentTouchStart;
      const touch = surface && event.changedTouches ? event.changedTouches[0] : null;
      state.equipmentTouchStart = null;
      if(!start || !touch) return;
      const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
      if(Math.abs(dx) >= 44 && Math.abs(dx) > Math.abs(dy) * 1.25) moveEquipmentPage(dx < 0 ? 1 : -1);
    }, { passive:true });
    modal.querySelector('#kinojoCharacterReactionSubmitBtn')?.addEventListener('click', submit);
    modal.querySelector('#kinojoCharacterReactionComment')?.addEventListener('input', updateSubmitState);
    document.addEventListener('keydown', event => {
      if(event.key === 'Escape') close();
    });
    return modal;
  }

  function limitKeyPrefix(){
    return (state.options && state.options.limitPrefix) || ('kinojo_' + ((state.options && state.options.source) || 'common') + '_react');
  }

  function checkLimit(name, type){
    const day = todayKey();
    const prefix = limitKeyPrefix();
    const sameKey = prefix + '_' + day + '_' + name + '_' + type;
    const countKey = prefix + '_count_' + day + '_' + type;
    if(localStorage.getItem(sameKey) === '1') return '같은 캐릭터에게 같은 반응은 하루 1번만 남길 수 있습니다.';
    const count = Number(localStorage.getItem(countKey) || '0');
    if(count >= 3) return (type === 'like' ? '좋아요' : '싫어요') + '는 하루 3번까지만 남길 수 있습니다.';
    return '';
  }

  function markLimit(name, type){
    const day = todayKey();
    const prefix = limitKeyPrefix();
    localStorage.setItem(prefix + '_' + day + '_' + name + '_' + type, '1');
    const countKey = prefix + '_count_' + day + '_' + type;
    localStorage.setItem(countKey, String(Number(localStorage.getItem(countKey) || '0') + 1));
  }

  function setStatus(message){
    const status = document.getElementById('kinojoCharacterReactionStatus');
    if(status) status.textContent = message || '';
  }

  function setLiveStatus(message, kind){
    const status = document.getElementById('kinojoCharacterLiveStatus');
    if(!status) return;
    status.textContent = message || '';
    status.className = 'kinojo-character-live-status ' + (kind || '');
  }

  function setTab(tab){
    const allowed = ['overview','equipment','stats','daevanion','reaction'];
    state.tab = allowed.includes(tab) ? tab : 'overview';
    document.querySelectorAll('#kinojoCharacterReactionModal [data-kinojo-character-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.kinojoCharacterTab === state.tab);
    });
    document.querySelectorAll('#kinojoCharacterReactionModal [data-kinojo-character-panel]').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.kinojoCharacterPanel === state.tab);
    });
  }

  function liveIdentity(target){
    const item = target || {};
    return {
      characterName:item.name || '',
      serverId:item.serverId || '',
      charKey:item.charKey || '',
      detailUrl:item.detailUrl || '',
      characterId:item.characterId || ''
    };
  }

  function liveIdentityKey(target){
    const item = liveIdentity(target);
    return [item.serverId,item.charKey || item.characterId || item.characterName].join('|');
  }

  async function liveRequest(action, payload, cacheSuffix){
    if(!window.KinojoSupabase || typeof window.KinojoSupabase.getLiveCharacterProfile !== 'function'){
      throw new Error('실시간 캐릭터 조회 모듈을 불러오지 못했습니다.');
    }
    const key = [action,liveIdentityKey(state.target),cacheSuffix || ''].join('|');
    const cached = liveCache.get(key);
    if(cached && Date.now() - cached.savedAt < LIVE_CACHE_TTL) return cached.data;
    if(liveInflight.has(key)) return liveInflight.get(key);
    const promise = window.KinojoSupabase.getLiveCharacterProfile(action, Object.assign({}, liveIdentity(state.target), payload || {}))
      .then(data => {
        if(!data || data.ok === false) throw new Error(data?.message || '실시간 캐릭터 조회 실패');
        liveCache.set(key, { savedAt:Date.now(), data });
        return data;
      })
      .finally(() => liveInflight.delete(key));
    liveInflight.set(key, promise);
    return promise;
  }

  function livePanel(name){
    return document.querySelector('#kinojoCharacterReactionModal [data-kinojo-character-panel="' + name + '"]');
  }

  function formattedStatValue(stat){
    const totals = Array.isArray(stat?.totals) ? stat.totals : [];
    if(!totals.length) return '—';
    return totals.map(total => {
      const value = Number(total.value || 0);
      const text = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
      return total.unit === 'percent' ? text + '%' : (value > 0 ? '+' : '') + text;
    }).join(' · ');
  }

  function statSourceText(stat){
    const rows = Array.isArray(stat?.contributions) ? stat.contributions : [];
    return rows.length ? rows.map(row => row.source).filter(Boolean).join(' + ') : '최종값 제공 안 됨';
  }

  function renderCoreStatCard(stat){
    const available = stat && stat.available;
    return '<article class="' + (available ? 'available' : 'unavailable') + '">' +
      '<div class="kinojo-character-stat-card-head"><span>' + esc(stat?.label || '-') + '</span><em>' + esc(available ? '확인 합계' : '미제공') + '</em></div>' +
      '<strong>' + esc(formattedStatValue(stat)) + '</strong>' +
      '<small>' + esc(statSourceText(stat)) + '</small>' +
    '</article>';
  }

  function renderLiveOverview(data){
    const panel = livePanel('overview');
    if(!panel) return;
    const profile = data.profile || {};
    const stats = Array.isArray(data.coreStats) ? data.coreStats : [];
    const groups = [
      { key:'basic', label:'기본 공격', description:'공격력 · 치명타 · 명중 · 전투속도' },
      { key:'amplify', label:'피해 증폭', description:'피해 유형별 증폭값을 서로 분리' },
      { key:'combat', label:'전투 효과', description:'완벽 · 강타 · 다단 히트 · 재사용시간' }
    ];
    panel.innerHTML =
      '<div class="kinojo-character-live-section-head"><div><strong>핵심 능력치</strong><span>같은 능력치와 같은 단위만 하나로 합산합니다.</span></div><em>PLAYNC 실시간</em></div>' +
      '<div class="kinojo-character-stat-method">' +
        '<span><b>합산</b> 같은 능력치·같은 단위</span>' +
        '<span><b>분리</b> 고정 수치와 %</span>' +
        '<span><b>제외</b> 검증되지 않은 추정 공식</span>' +
      '</div>' +
      '<div class="kinojo-character-stat-groups">' +
        groups.map(group =>
          '<section class="kinojo-character-stat-group is-' + group.key + '">' +
            '<header><div><strong>' + esc(group.label) + '</strong><span>' + esc(group.description) + '</span></div><em>' + stats.filter(stat => stat.group === group.key && stat.available).length + ' / ' + stats.filter(stat => stat.group === group.key).length + '</em></header>' +
            '<div class="kinojo-character-core-stats">' + stats.filter(stat => stat.group === group.key).map(renderCoreStatCard).join('') + '</div>' +
          '</section>'
        ).join('') +
      '</div>' +
      '<div class="kinojo-character-live-facts">' +
        [
          ['레벨',profile.level || '-'],['종족',profile.raceName || '-'],['성별',profile.genderName || '-'],
          ['레기온',profile.regionName || '-'],['칭호',profile.titleName || '-'],['클래스',profile.className || '-']
        ].map(row => '<article><span>' + esc(row[0]) + '</span><strong>' + esc(row[1]) + '</strong></article>').join('') +
      '</div>' +
      '<p class="kinojo-character-live-note">' + esc(data.note || '실시간 정보는 KINOJO DB에 저장하지 않습니다.') + '</p>';
  }

  const EQUIPMENT_CATEGORIES = [
    { key:'weapon', label:'무기' },
    { key:'armor', label:'방어구' },
    { key:'accessory', label:'장신구' }
  ];

  function equipmentPageSize(){
    return window.matchMedia && window.matchMedia('(max-width: 640px)').matches ? 4 : 8;
  }

  function equipmentGroups(items){
    return EQUIPMENT_CATEGORIES.reduce((groups, category) => {
      groups[category.key] = items.filter(item => item.category === category.key);
      return groups;
    }, {});
  }

  function setEquipmentCategory(category){
    if(!EQUIPMENT_CATEGORIES.some(item => item.key === category)) return;
    state.equipmentCategory = category;
    if(state.live) renderLiveEquipment(state.live);
  }

  function moveEquipmentPage(delta){
    if(!state.live || !delta) return;
    const items = Array.isArray(state.live.equipment) ? state.live.equipment : [];
    const currentItems = equipmentGroups(items)[state.equipmentCategory] || [];
    const pageCount = Math.max(1, Math.ceil(currentItems.length / equipmentPageSize()));
    const current = Math.min(Number(state.equipmentPage[state.equipmentCategory] || 0), pageCount - 1);
    state.equipmentPage[state.equipmentCategory] = Math.max(0, Math.min(pageCount - 1, current + delta));
    renderLiveEquipment(state.live);
  }

  function renderLiveEquipment(data){
    const panel = livePanel('equipment');
    if(!panel) return;
    const items = Array.isArray(data.equipment) ? data.equipment : [];
    const groups = equipmentGroups(items);
    const activeCategory = EQUIPMENT_CATEGORIES.find(category => category.key === state.equipmentCategory) || EQUIPMENT_CATEGORIES[0];
    const currentItems = groups[activeCategory.key] || [];
    const pageSize = equipmentPageSize();
    const pageCount = Math.max(1, Math.ceil(currentItems.length / pageSize));
    const page = Math.max(0, Math.min(Number(state.equipmentPage[activeCategory.key] || 0), pageCount - 1));
    state.equipmentPage[activeCategory.key] = page;
    const visibleItems = currentItems.slice(page * pageSize, page * pageSize + pageSize);
    panel.innerHTML =
      '<div class="kinojo-character-live-section-head"><div><strong>장착 장비</strong><span>분류와 페이지를 바꿔도 모달 위치는 유지됩니다.</span></div><em>총 ' + items.length + '개</em></div>' +
      '<nav class="kinojo-character-equipment-categories" aria-label="장비 분류">' +
        EQUIPMENT_CATEGORIES.map(category =>
          '<button type="button" class="' + (category.key === activeCategory.key ? 'active' : '') + '" data-equipment-category="' + category.key + '">' +
            '<span>' + esc(category.label) + '</span><strong>' + (groups[category.key] || []).length + '</strong>' +
          '</button>'
        ).join('') +
      '</nav>' +
      '<section class="kinojo-character-equipment-browser">' +
        '<header class="kinojo-character-equipment-toolbar"><div><strong>' + esc(activeCategory.label) + '</strong><span>' + currentItems.length + '개 장착</span></div>' +
          '<div class="kinojo-character-equipment-pager" aria-label="장비 페이지">' +
            '<button type="button" data-equipment-page-move="-1" aria-label="이전 페이지" ' + (page <= 0 ? 'disabled' : '') + '>‹</button>' +
            '<span><b>' + (page + 1) + '</b> / ' + pageCount + '</span>' +
            '<button type="button" data-equipment-page-move="1" aria-label="다음 페이지" ' + (page >= pageCount - 1 ? 'disabled' : '') + '>›</button>' +
          '</div>' +
        '</header>' +
        '<div class="kinojo-character-equipment-page" data-equipment-page-surface>' +
          (visibleItems.length ?
            '<div class="kinojo-character-equipment-grid">' +
              visibleItems.map(item => '<button type="button" data-live-equipment-item data-item-id="' + Number(item.id || 0) + '" data-slot-pos="' + Number(item.slotPos || 0) + '"><img src="' + safeUrl(item.icon) + '" alt=""><span><small class="kinojo-character-equipment-slot">' + esc(item.slotLabel || item.slotPosName || '') + '</small><b>' + esc(item.name || '-') + '</b><small>' + esc(item.grade || '') + (Number(item.enchantLevel || 0) ? ' · +' + Number(item.enchantLevel) : '') + (Number(item.exceedLevel || 0) ? ' · 돌파 ' + Number(item.exceedLevel) : '') + '</small></span></button>').join('') +
            '</div>' :
            '<div class="kinojo-character-equipment-empty">장착된 ' + esc(activeCategory.label) + '가 없습니다.</div>') +
        '</div>' +
        '<p class="kinojo-character-equipment-hint">장비를 선택하면 이 화면 아래에서 강화·옵션·마석 상세를 확인합니다.<span>모바일은 좌우로 넘길 수 있습니다.</span></p>' +
      '</section>' +
      '<div class="kinojo-character-live-detail" id="kinojoLiveEquipmentDetail" hidden></div>';
  }

  function renderLiveStats(data){
    const panel = livePanel('stats');
    if(!panel) return;
    const base = Array.isArray(data.baseStats) ? data.baseStats : [];
    const skills = Array.isArray(data.skills) ? data.skills : [];
    panel.innerHTML =
      '<div class="kinojo-character-live-split">' +
        '<section><div class="kinojo-character-live-section-head"><div><strong>기본 능력치</strong><span>공식 정보실 원본</span></div><em>' + base.length + '개</em></div><div class="kinojo-character-base-stat-list">' +
          base.map(row => '<article><span>' + esc(row.name || row.type || '-') + '</span><strong>' + esc(row.value ?? '-') + '</strong><small>' + esc((row.effects || []).join(' · ')) + '</small></article>').join('') +
        '</div></section>' +
        '<section><div class="kinojo-character-live-section-head"><div><strong>스킬</strong><span>현재 습득·장착 정보</span></div><em>' + skills.length + '개</em></div><div class="kinojo-character-skill-list">' +
          skills.map(skill => '<article><span>' + esc(skill.name || '-') + '</span><small>' + esc(skill.category || '') + ' · Lv.' + Number(skill.level || 0) + (skill.equip ? ' · 장착' : '') + '</small></article>').join('') +
        '</div></section>' +
      '</div>';
  }

  function renderLiveDaevanion(data){
    const panel = livePanel('daevanion');
    if(!panel) return;
    const boards = Array.isArray(data.daevanion) ? data.daevanion : [];
    panel.innerHTML =
      '<div class="kinojo-character-live-section-head"><div><strong>데바니온 보드</strong><span>보드를 누를 때만 해당 노드 정보를 1회 추가 조회합니다.</span></div><em>' + boards.length + '개</em></div>' +
      '<div class="kinojo-character-daevanion-grid">' +
        boards.map(board => '<button type="button" data-live-daevanion-board data-board-id="' + Number(board.id || 0) + '"><span><b>' + esc(board.name || '-') + '</b><small>' + Number(board.openNodeCount || 0) + ' / ' + Number(board.totalNodeCount || 0) + '</small></span><strong>' + Number(board.openPercent || 0) + '%</strong></button>').join('') +
      '</div><div class="kinojo-character-live-detail" id="kinojoLiveDaevanionDetail" hidden></div>';
  }

  function applyLiveProfile(data){
    state.live = data;
    const profile = data.profile || {};
    state.target = normalizeTarget(Object.assign({}, state.target, {
      name:profile.characterName || state.target?.name,
      className:profile.className || state.target?.className,
      server:profile.serverName || state.target?.server,
      serverId:profile.serverId || state.target?.serverId,
      charKey:data.identity?.charKey || state.target?.charKey,
      characterId:data.identity?.characterId || state.target?.characterId,
      profileImageUrl:profile.profileImageUrl || state.target?.profileImageUrl,
      pvePower:profile.combatPower || state.target?.pvePower,
      pvpPower:profile.itemLevel || state.target?.pvpPower
    }));
    state.target.sub = [profile.className,profile.serverName,profile.level ? 'Lv.' + profile.level : '',profile.regionName].filter(Boolean).join(' · ');
    renderTarget();
    renderLiveOverview(data);
    renderLiveEquipment(data);
    renderLiveStats(data);
    renderLiveDaevanion(data);
    const time = document.getElementById('kinojoCharacterLiveTime');
    if(time) time.textContent = 'PLAYNC 실시간 · ' + new Date(data.fetchedAt || Date.now()).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
    setLiveStatus('실시간 조회 ' + Number(data.requestCount || 2) + '회 완료 · 장비와 데바니온 상세는 선택한 항목만 추가 조회합니다.','ok');
  }

  async function loadLiveOverview(){
    if(state.liveLoading) return;
    const identity = liveIdentityKey(state.target);
    if(!state.target?.name || !state.target?.serverId){
      setLiveStatus('캐릭터 서버 정보를 확인한 뒤 실시간 조회합니다.','');
      return;
    }
    state.liveLoading = true;
    setLiveStatus('PLAYNC에서 프로필과 장비 목록을 실시간으로 불러오고 있습니다.','loading');
    try{
      const data = await liveRequest('overview');
      if(!state.open || identity !== liveIdentityKey(state.target)) return;
      applyLiveProfile(data);
    }catch(error){
      setLiveStatus((error.message || String(error)) + ' · 잠시 뒤 다시 열어 주세요.','error');
      const panel = livePanel('overview');
      if(panel) panel.innerHTML = '<div class="kinojo-character-live-error"><strong>실시간 정보를 불러오지 못했습니다.</strong><span>' + esc(error.message || error) + '</span></div>';
    }finally{
      state.liveLoading = false;
    }
  }

  function detailArrays(value, keys, depth){
    if(depth > 5 || !value || typeof value !== 'object') return [];
    for(const key of keys) if(Array.isArray(value[key])) return value[key];
    for(const child of Object.values(value)){
      const found = detailArrays(child, keys, depth + 1);
      if(found.length) return found;
    }
    return [];
  }

  async function loadEquipmentDetail(button){
    if(state.detailLoading) return;
    const itemId = Number(button.dataset.itemId || 0), slotPos = Number(button.dataset.slotPos || 0);
    const root = document.getElementById('kinojoLiveEquipmentDetail');
    if(!itemId || !slotPos || !root) return;
    state.detailLoading = true;
    root.hidden = false;
    root.innerHTML = '<div class="kinojo-character-live-loading">선택한 장비 상세를 불러오는 중입니다.</div>';
    try{
      const data = await liveRequest('equipmentItem',{ itemId, slotPos },itemId + ':' + slotPos);
      const main = detailArrays(data.item,['mainStats'],0), sub = detailArrays(data.item,['subStats'],0), magic = detailArrays(data.item,['magicStoneStat'],0);
      root.innerHTML = '<button type="button" class="kinojo-character-live-detail-close" data-live-detail-close>닫기</button><strong>' + esc(button.querySelector('b')?.textContent || '선택 장비') + '</strong>' +
        '<div class="kinojo-character-live-detail-stats">' +
          [...main,...sub,...magic].map(row => '<span><b>' + esc(row.name || row.id || '-') + '</b><em>' + esc(row.value ?? row.extra ?? '-') + '</em></span>').join('') +
        '</div>';
    }catch(error){
      root.innerHTML = '<strong>장비 상세 조회 실패</strong><span>' + esc(error.message || error) + '</span>';
    }finally{ state.detailLoading = false; }
  }

  async function loadDaevanionDetail(button){
    if(state.detailLoading) return;
    const boardId = Number(button.dataset.boardId || 0);
    const root = document.getElementById('kinojoLiveDaevanionDetail');
    if(!boardId || !root) return;
    state.detailLoading = true;
    root.hidden = false;
    root.innerHTML = '<div class="kinojo-character-live-loading">선택한 보드 노드를 불러오는 중입니다.</div>';
    try{
      const data = await liveRequest('daevanionDetail',{ boardId },String(boardId));
      const nodes = detailArrays(data.board,['nodeList'],0).filter(row => Number(row.open || 0) === 1);
      const effects = nodes.flatMap(row => Array.isArray(row.effectList) ? row.effectList : []).map(row => row.desc).filter(Boolean);
      root.innerHTML = '<button type="button" class="kinojo-character-live-detail-close" data-live-detail-close>닫기</button><strong>활성 노드 효과</strong><div class="kinojo-character-live-detail-stats">' +
        effects.slice(0,80).map(value => '<span><b>' + esc(value) + '</b></span>').join('') + '</div>';
    }catch(error){
      root.innerHTML = '<strong>데바니온 상세 조회 실패</strong><span>' + esc(error.message || error) + '</span>';
    }finally{ state.detailLoading = false; }
  }

  function setType(type){
    state.type = type === 'dislike' ? 'dislike' : 'like';
    const like = document.getElementById('kinojoCharacterReactionLikeBtn');
    const dislike = document.getElementById('kinojoCharacterReactionDislikeBtn');
    if(like) like.classList.toggle('active', state.type === 'like');
    if(dislike) dislike.classList.toggle('active', state.type === 'dislike');
  }

  function updateSubmitState(){
    const input = document.getElementById('kinojoCharacterReactionComment');
    const btn = document.getElementById('kinojoCharacterReactionSubmitBtn');
    if(btn) btn.disabled = state.submitting || !(input && input.value.trim());
  }

  function normalizeTarget(target){
    const t = target || {};
    const name = t.name || t.characterName || t.charName || '';
    const className = t.className || t.class || '';
    const server = t.server || t.serverName || '';
    const serverId = String(t.serverId || t.server_id || '').trim();
    const charKey = String(t.charKey || t.char_key || '').trim();
    const characterId = String(t.characterId || t.character_id || '').trim();
    const owner = t.owner || t.mainCharacterName || '';
    const profileImageUrl = t.profileImageUrl || t.profileImage || t.profile || t.imageUrl || '';
    const detailUrl = t.detailUrl || t.url || '';
    const classIconUrl = t.classIconUrl || t.classIcon || t.iconUrl || classIconFor(className);
    const pvePower = numText(firstValue(t.pvePower, t.pve_power, t.pvePowerTotal, t.latestPveCombatPower, t.latest_pve_combat_power));
    const pvpPower = numText(firstValue(t.pvpPower, t.pvp_power, t.pvpPowerTotal, t.latestPvpCombatPower, t.latest_pvp_combat_power));
    const sub = [className, server].filter(Boolean).join(' · ');
    return { name, className, server, serverId, charKey, characterId, owner, profileImageUrl, detailUrl, classIconUrl, pvePower, pvpPower, sub };
  }

  function renderTarget(){
    const target = state.target || {};
    const avatar = document.getElementById('kinojoCharacterReactionAvatar');
    const classIcon = document.getElementById('kinojoCharacterReactionClass');
    const title = document.getElementById('kinojoCharacterReactionTitle');
    const sub = document.getElementById('kinojoCharacterReactionSub');
    const detail = document.getElementById('kinojoCharacterReactionDetail');
    const pvePower = document.getElementById('kinojoCharacterReactionPvePower');
    const pvpPower = document.getElementById('kinojoCharacterReactionPvpPower');

    if(title) title.textContent = target.name || '캐릭터';
    if(sub) sub.textContent = target.sub || '좋아요·싫어요와 코멘트를 남겨보세요.';
    if(pvePower) pvePower.textContent = target.pvePower || '-';
    if(pvpPower) pvpPower.textContent = target.pvpPower || '-';
    if(classIcon){
      const icon = String(target.classIconUrl || classIconFor(target.className) || '').trim();
      if(icon){
        classIcon.classList.remove('is-empty');
        classIcon.innerHTML = '<img src="' + safeUrl(icon) + '" alt="">';
      }else{
        classIcon.classList.add('is-empty');
        classIcon.innerHTML = '';
      }
    }

    if(avatar){
      mountCharacterImage(avatar, target, {
        loading:'eager',
        fallbackText:false,
        alt:(target.name || '캐릭터') + ' 프로필',
        classIconPadding:'24%'
      });
    }

    if(detail){
      if(target.detailUrl){
        detail.href = target.detailUrl;
        detail.classList.add('is-visible');
      }else{
        detail.removeAttribute('href');
        detail.classList.remove('is-visible');
      }
    }
  }

  function open(options){
    const opts = options || {};

    state.options = opts;
    state.target = normalizeTarget(opts.target || {});
    state.type = 'like';
    state.submitting = false;
    state.live = null;
    state.liveLoading = false;
    state.detailLoading = false;
    state.tab = 'overview';
    state.equipmentCategory = 'weapon';
    state.equipmentPage = { weapon:0, armor:0, accessory:0 };
    state.equipmentTouchStart = null;
    state.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const modal = ensureModal();
    const input = document.getElementById('kinojoCharacterReactionComment');
    if(input) input.value = '';
    setStatus('');
    renderTarget();
    setType('like');
    setTab('overview');
    updateSubmitState();

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('kinojo-character-reaction-open');
    state.open = true;
    enrichTargetFromMaster();
    loadLiveOverview();

    const dialog = modal.querySelector('.kinojo-character-reaction-dialog');
    requestAnimationFrame(() => {
      try{ dialog?.focus({ preventScroll:true }); }catch(_err){ dialog?.focus(); }
    });
    return true;
  }

  function close(){
    const modal = document.getElementById('kinojoCharacterReactionModal');
    if(modal){
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('kinojo-character-reaction-open');
    state.open = false;
    state.submitting = false;
    state.liveLoading = false;
    state.detailLoading = false;
    state.equipmentTouchStart = null;
    state.live = null;
    state.target = null;
    state.options = null;
    const returnFocus = state.returnFocus;
    state.returnFocus = null;
    if(returnFocus && document.contains(returnFocus)){
      try{ returnFocus.focus({ preventScroll:true }); }catch(_err){ returnFocus.focus(); }
    }
  }

  async function submit(){
    const input = document.getElementById('kinojoCharacterReactionComment');
    const comment = (input?.value || '').trim().slice(0, 20);
    const target = state.target;
    const opts = state.options || {};
    if(!target || state.submitting) return;

    if(!comment){
      setStatus('전하고 싶은 말을 입력해 주세요.');
      updateSubmitState();
      return;
    }

    const limit = checkLimit(target.name, state.type);
    if(limit){
      setStatus(limit);
      updateSubmitState();
      return;
    }

    try{
      const context = opts.context || opts.source || 'character';
      if(window.KinojoAuth && opts.requireLogin !== false && !window.KinojoAuth.requireLogin('로그인 후 좋아요·싫어요를 남길 수 있습니다.', { context })){
        return;
      }

      state.submitting = true;
      updateSubmitState();
      setStatus('전송 중...');

      const sessionToken = window.KinojoAuth ? window.KinojoAuth.getToken() : '';
      let data;
      if(typeof opts.onSubmit === 'function'){
        data = await opts.onSubmit({ target, reaction: state.type, comment, sessionToken, clientKey: visitorId() });
      }else{
        data = await window.KinojoApi.postAction('hallReaction', {
          characterName: target.name,
          owner: target.owner || '',
          className: target.className || '',
          reaction: state.type,
          comment,
          clientKey: visitorId(),
          sessionToken,
          source: opts.source || context
        });
      }

      if(!data || !data.ok){
        if(data && data.authRequired && window.KinojoAuth){
          window.KinojoAuth.openLoginModal(data.message || '로그인 후 이용할 수 있습니다.', { context });
        }
        setStatus((data && data.message) || '저장 실패');
        return;
      }

      markLimit(target.name, state.type);
      setStatus('한마디가 전달되었어요.');
      if(typeof opts.onSuccess === 'function') opts.onSuccess(data, { target, reaction: state.type, comment });
      setTimeout(close, opts.closeDelay || 420);
    }catch(error){
      setStatus('반응 저장 실패: ' + (error.message || error));
    }finally{
      state.submitting = false;
      updateSubmitState();
    }
  }

  window.KinojoCharacterProfileImage = {
    mount: mountCharacterImage,
    classIconFor,
    candidates: characterImageCandidates
  };
  window.KinojoCharacterReaction = { open, close, setType };
})();
