/*
 * KINOJO Character Reaction Modal
 * 역할: 명예의 전당·랭킹·성역이 함께 쓰는 저장 캐릭터 상세·비교·반응 모달.
 * 규칙: 상세 병합·능력치 합산·소유 캐릭터 비교는 Server 응답만 사용한다.
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
    compare: null,
    compareLoading: false,
    statTab: 'basic',
    skillTab: 'active',
    equipmentCategory: 'weaponArmor',
    selectedEquipmentKey: '',
    selectedArcanaKey: '',
    liveStatusTimer: null
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

  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[ch]));
  }

  function safeUrl(value){
    return String(value || '').replace(/"/g, '%22');
  }

  function powerNumber(value){
    const number = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(number) ? number : 0;
  }

  function shortPower(value){
    const number = powerNumber(value);
    return number > 0 ? (number / 1000).toFixed(1) + 'K' : '-';
  }

  function fullPower(value){
    const number = powerNumber(value);
    return number > 0 ? Math.round(number).toLocaleString('ko-KR') : '-';
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
      updateCompareVisibility();
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
        '<div class="kinojo-character-live-status" id="kinojoCharacterLiveStatus" role="status" aria-live="polite"></div>' +
        '<header class="kinojo-character-reaction-profile">' +
          '<div class="kinojo-character-reaction-visual" aria-hidden="true"><div class="kinojo-character-reaction-avatar is-empty" id="kinojoCharacterReactionAvatar"></div><div class="kinojo-character-reaction-class" id="kinojoCharacterReactionClass"></div></div>' +
          '<div class="kinojo-character-reaction-info">' +
            '<div class="kinojo-character-reaction-kicker">CHARACTER SNAPSHOT</div>' +
            '<h2 class="kinojo-character-reaction-title" id="kinojoCharacterReactionTitle">캐릭터</h2>' +
            '<div class="kinojo-character-reaction-identity" aria-label="캐릭터 기본 정보">' +
              '<span><b>클래스</b><strong id="kinojoCharacterReactionClassName">-</strong></span>' +
              '<span><b>서버</b><strong id="kinojoCharacterReactionServerName">-</strong></span>' +
              '<span><b>레벨</b><strong id="kinojoCharacterReactionLevel">-</strong></span>' +
              '<span><b>레기온</b><strong id="kinojoCharacterReactionLegion">-</strong></span>' +
              '<span class="is-title"><b>칭호</b><strong id="kinojoCharacterReactionTitleName">-</strong></span>' +
            '</div>' +
            '<div class="kinojo-character-reaction-powers" aria-label="캐릭터 핵심 정보">' +
              '<span class="kinojo-character-reaction-power is-pve"><b>전투력</b><strong id="kinojoCharacterReactionPvePower">-</strong></span>' +
              '<span class="kinojo-character-reaction-power is-pvp"><b>아이템 레벨</b><strong id="kinojoCharacterReactionPvpPower">-</strong></span>' +
            '</div>' +
            '<div class="kinojo-character-live-meta"><span id="kinojoCharacterLiveTime">저장 정보 확인 중</span><a class="kinojo-character-reaction-detail" id="kinojoCharacterReactionDetail" href="#" target="_blank" rel="noopener noreferrer">PLAYNC 정보실 ↗</a></div>' +
          '</div>' +
          '<aside class="kinojo-character-reaction-refresh-slot" id="kinojoCharacterDetailRefreshSlot" aria-label="전체 상세 정보"></aside>' +
        '</header>' +
        '<nav class="kinojo-character-live-tabs" aria-label="캐릭터 상세 탭">' +
          '<button class="active" type="button" data-kinojo-character-tab="overview">능력치</button>' +
          '<button type="button" data-kinojo-character-tab="equipment">장비</button>' +
          '<button type="button" data-kinojo-character-tab="arcana">아르카나</button>' +
          '<button type="button" data-kinojo-character-tab="daevanion">데바니온</button>' +
          '<button type="button" data-kinojo-character-tab="compare" data-kinojo-compare-tab hidden>내 캐릭터 비교</button>' +
          '<button type="button" data-kinojo-character-tab="reaction">평가·코멘트</button>' +
        '</nav>' +
        '<div class="kinojo-character-live-panels">' +
          '<section class="kinojo-character-live-panel active" data-kinojo-character-panel="overview"><div class="kinojo-character-live-loading">저장 프로필과 능력치·스킬을 불러오는 중입니다.</div></section>' +
          '<section class="kinojo-character-live-panel" data-kinojo-character-panel="equipment"></section>' +
          '<section class="kinojo-character-live-panel" data-kinojo-character-panel="arcana"></section>' +
          '<section class="kinojo-character-live-panel" data-kinojo-character-panel="daevanion"></section>' +
          '<section class="kinojo-character-live-panel" data-kinojo-character-panel="compare"></section>' +
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
      if(category) setEquipmentCategory(category.dataset.equipmentCategory || 'weaponArmor');
      const item = event.target.closest('[data-live-equipment-item]');
      if(item){
        selectEquipmentButton(item);
        if(!event.defaultPrevented) loadEquipmentDetail(item);
      }
      const board = event.target.closest('[data-live-daevanion-board]');
      if(board && !event.defaultPrevented) loadDaevanionDetail(board);
      const compareCharacter = event.target.closest('[data-compare-character-id]');
      if(compareCharacter) loadComparison(Number(compareCharacter.dataset.compareCharacterId || 0));
      const statTab = event.target.closest('[data-kinojo-stat-tab]');
      if(statTab) setOverviewStatTab(statTab.dataset.kinojoStatTab || 'basic');
      const skillTab = event.target.closest('[data-kinojo-skill-tab]');
      if(skillTab) setOverviewSkillTab(skillTab.dataset.kinojoSkillTab || 'active');
      const closeDetail = event.target.closest('[data-live-detail-close]');
      if(closeDetail && closeDetail.parentElement) closeDetail.parentElement.hidden = true;
    });
    modal.querySelector('#kinojoCharacterReactionSubmitBtn')?.addEventListener('click', submit);
    modal.querySelector('#kinojoCharacterReactionComment')?.addEventListener('input', updateSubmitState);
    document.addEventListener('keydown', event => {
      if(event.key === 'Escape') close();
    });
    return modal;
  }

  function setStatus(message){
    const status = document.getElementById('kinojoCharacterReactionStatus');
    if(status) status.textContent = message || '';
  }

  function setLiveStatus(message, kind){
    const status = document.getElementById('kinojoCharacterLiveStatus');
    if(!status) return;
    if(state.liveStatusTimer){
      clearTimeout(state.liveStatusTimer);
      state.liveStatusTimer = null;
    }
    status.textContent = message || '';
    status.className = 'kinojo-character-live-status ' + (kind || '') + (message ? ' is-visible' : '');
    if(message && kind === 'ok'){
      state.liveStatusTimer = setTimeout(() => {
        status.classList.remove('is-visible');
        state.liveStatusTimer = null;
      },2600);
    }
  }

  function setTab(tab){
    const allowed = ['overview','equipment','arcana','daevanion','compare','reaction'];
    state.tab = allowed.includes(tab) ? tab : 'overview';
    document.querySelectorAll('#kinojoCharacterReactionModal [data-kinojo-character-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.kinojoCharacterTab === state.tab);
    });
    document.querySelectorAll('#kinojoCharacterReactionModal [data-kinojo-character-panel]').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.kinojoCharacterPanel === state.tab);
    });
    if(state.tab === 'compare' && !state.compare && !state.compareLoading) loadComparison();
    if(state.tab === 'equipment') scheduleDefaultEquipment('equipment',state.selectedEquipmentKey);
    if(state.tab === 'arcana') scheduleDefaultEquipment('arcana',state.selectedArcanaKey);
  }

  function setOverviewStatTab(tab){
    const allowed = ['basic','combat','base'];
    state.statTab = allowed.includes(tab) ? tab : 'basic';
    const panel = livePanel('overview');
    if(!panel) return;
    panel.querySelectorAll('[data-kinojo-stat-tab]').forEach(button => {
      const active = button.dataset.kinojoStatTab === state.statTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    panel.querySelectorAll('[data-kinojo-stat-panel]').forEach(section => {
      section.hidden = section.dataset.kinojoStatPanel !== state.statTab;
    });
  }

  function setOverviewSkillTab(tab){
    const allowed = ['active','passive','stigma'];
    state.skillTab = allowed.includes(tab) ? tab : 'active';
    const panel = livePanel('overview');
    if(!panel) return;
    panel.querySelectorAll('[data-kinojo-skill-tab]').forEach(button => {
      const active = button.dataset.kinojoSkillTab === state.skillTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    panel.querySelectorAll('[data-kinojo-skill-panel]').forEach(section => {
      section.hidden = section.dataset.kinojoSkillPanel !== state.skillTab;
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

  async function mergeServerSkills(data){
    const rpc=window.KinojoSupabaseRpcCore;
    const identity=liveIdentity(state.target);
    if(!rpc || typeof rpc.rpc!=='function' || !identity.serverId || !identity.characterName) return data;
    try{
      const result=await rpc.rpc('kinojo_character_skill_overview_v304',{
        p_server_id:Number(identity.serverId||0),
        p_character_name:String(identity.characterName||'')
      });
      if(result && result.ok===true && Array.isArray(result.skills)){
        return Object.assign({},data,{
          skills:result.skills,
          skillSource:result.source||'KINOJO_SERVER_SKILL_NORMALIZED',
          skillRefreshedAt:result.refreshedAt||null
        });
      }
    }catch(_error){
      // 저장된 공식 스킬 원본이 없는 캐릭터는 기존 overview 범위를 유지한다.
    }
    return data;
  }

  function livePanel(name){
    return document.querySelector('#kinojoCharacterReactionModal [data-kinojo-character-panel="' + name + '"]');
  }

  function compareAccount(){
    const auth = window.KinojoAuth;
    if(!auth || typeof auth.isLoggedIn !== 'function' || !auth.isLoggedIn()) return null;
    const account = typeof auth.getAccount === 'function' ? auth.getAccount() : null;
    return account && (account.passKey || account.passCode) ? account : null;
  }

  function normalizedCharacterName(value){
    return stripServerSuffix(value).replace(/[\s\u200B-\u200D\uFEFF]+/g, '').toLowerCase();
  }

  function isOwnCharacterTarget(account){
    if(!account || !state.target) return false;
    const accountNames = [account.mainCharacter,account.mainCharacterName,account.characterName]
      .map(normalizedCharacterName).filter(Boolean);
    const targetNames = [state.target.name,state.target.owner]
      .map(normalizedCharacterName).filter(Boolean);
    if(accountNames.some(name => targetNames.includes(name))) return true;

    const accountIds = [account.characterId,account.character_id,account.charKey,account.char_key]
      .map(value => String(value || '').trim()).filter(Boolean);
    const targetIds = [state.target.characterId,state.target.charKey]
      .map(value => String(value || '').trim()).filter(Boolean);
    return accountIds.some(id => targetIds.includes(id));
  }

  function updateCompareVisibility(){
    const button = document.querySelector('#kinojoCharacterReactionModal [data-kinojo-compare-tab]');
    const account = compareAccount();
    const visible = !!account && !isOwnCharacterTarget(account);
    if(button) button.hidden = !visible;
    if(!visible && state.tab === 'compare') setTab('overview');
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

  function baseStatValue(row){
    const value = row?.value;
    if(value === undefined || value === null || String(value).trim() === '') return '—';
    return String(value);
  }

  function renderBaseStatCard(row){
    const effects = Array.isArray(row?.effects) ? row.effects.filter(Boolean) : [];
    return '<article class="available kinojo-character-base-card">' +
      '<div class="kinojo-character-stat-card-head"><span>' + esc(row?.name || row?.type || '-') + '</span><em>기본</em></div>' +
      '<strong>' + esc(baseStatValue(row)) + '</strong>' +
      '<small>' + esc(effects.join(' · ') || '공식 최종값') + '</small>' +
    '</article>';
  }

  function skillCategoryKey(value){
    const raw = String(value || '').trim().toLowerCase();
    if(raw === 'passive') return 'passive';
    if(raw === 'dp' || raw === 'stigma') return 'stigma';
    return 'active';
  }

  function skillCategoryLabel(value){
    return ({ active:'액티브', passive:'패시브', stigma:'스티그마' })[skillCategoryKey(value)] || '액티브';
  }

  function skillLevelClass(level){
    if(level >= 30) return 'is-level-30';
    if(level >= 25) return 'is-level-25';
    if(level >= 20) return 'is-level-20';
    return '';
  }

  function renderSkillCard(skill){
    const icon = normalizedImageUrl(skill?.icon);
    const level = Math.max(0, Number(skill?.level || 0));
    return '<article class="kinojo-character-skill-card ' + skillLevelClass(level) + '">' +
      '<div class="kinojo-character-skill-icon ' + (icon ? '' : 'is-empty') + '">' + (icon ? '<img src="' + safeUrl(icon) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '') + '<strong class="kinojo-character-skill-level">Lv.' + level + '</strong></div>' +
      '<span><b>' + esc(skill?.name || '-') + '</b><small>' + esc(skillCategoryLabel(skill?.category)) + (skill?.equip ? ' · 장착' : '') + '</small></span>' +
    '</article>';
  }

  function renderLiveOverview(data){
    const panel = livePanel('overview');
    if(!panel) return;
    const stats = Array.isArray(data.coreStats) ? data.coreStats : [];
    const base = (Array.isArray(data.baseStats) ? data.baseStats : []).filter(row => String(row?.type || '').toLowerCase() !== 'itemlevel');
    const skills = (Array.isArray(data.skills) ? data.skills : []).filter(skill => skill?.acquired === true || Number(skill?.acquired || 0) === 1);
    const primaryTypes = new Set(['STR','DEX','AGI','WIS','INT','CON']);
    const primary = base.filter(row => primaryTypes.has(String(row.type || '')));
    const secondary = base.filter(row => !primaryTypes.has(String(row.type || '')));
    const groups = [
      { key:'basic', label:'기본 공격', description:'공격력 · 치명타 · 명중 · 전투속도' },
      { key:'amplify', label:'피해 증폭', description:'피해 유형별 증폭값을 서로 분리' },
      { key:'combat', label:'전투 효과', description:'완벽 · 강타 · 다단 히트 · 재사용시간' }
    ];
    const skillGroups = ['active','passive','stigma'].map(key => ({
      key,
      label:skillCategoryLabel(key),
      rows:skills.filter(skill => skillCategoryKey(skill.category) === key)
    }));
    const renderStatGroup = group =>
      '<section class="kinojo-character-stat-group is-' + group.key + '">' +
        '<header><div><strong>' + esc(group.label) + '</strong><span>' + esc(group.description) + '</span></div><em>' + stats.filter(stat => stat.group === group.key && stat.available).length + ' / ' + stats.filter(stat => stat.group === group.key).length + '</em></header>' +
        '<div class="kinojo-character-core-stats">' + stats.filter(stat => stat.group === group.key).map(renderCoreStatCard).join('') + '</div>' +
      '</section>';
    const tabButton = (kind,key,label,count) => '<button type="button" class="' + (state[kind + 'Tab'] === key ? 'active' : '') + '" role="tab" aria-selected="' + String(state[kind + 'Tab'] === key) + '" data-kinojo-' + kind + '-tab="' + key + '"><span>' + esc(label) + '</span><em>' + count + '</em></button>';

    panel.innerHTML =
      '<div class="kinojo-character-overview-layout">' +
        '<section class="kinojo-character-overview-column is-stats">' +
          '<div class="kinojo-character-live-section-head"><div><strong>능력치 종합</strong><span>핵심 능력치와 공식 기본 스탯</span></div><em>KINOJO 저장값</em></div>' +
          '<div class="kinojo-character-overview-subtabs is-stat" role="tablist" aria-label="능력치 분류">' +
            tabButton('stat','basic','기본',stats.filter(stat => stat.group === 'basic').length) +
            tabButton('stat','combat','전투효과',stats.filter(stat => stat.group === 'amplify' || stat.group === 'combat').length) +
            tabButton('stat','base','기본스탯',base.length) +
          '</div>' +
          '<div class="kinojo-character-stat-method"><span><b>합산</b> 같은 능력치·단위</span><span><b>분리</b> 고정 수치와 %</span><span><b>제외</b> 미검증 추정 공식</span></div>' +
          '<div class="kinojo-character-overview-tab-panel" data-kinojo-stat-panel="basic" ' + (state.statTab === 'basic' ? '' : 'hidden') + '><div class="kinojo-character-stat-groups">' + groups.filter(group => group.key === 'basic').map(renderStatGroup).join('') + '</div></div>' +
          '<div class="kinojo-character-overview-tab-panel" data-kinojo-stat-panel="combat" ' + (state.statTab === 'combat' ? '' : 'hidden') + '><div class="kinojo-character-stat-groups">' + groups.filter(group => group.key === 'amplify' || group.key === 'combat').map(renderStatGroup).join('') + '</div></div>' +
          '<div class="kinojo-character-overview-tab-panel" data-kinojo-stat-panel="base" ' + (state.statTab === 'base' ? '' : 'hidden') + '>' +
            '<section class="kinojo-character-stat-group is-base"><header><div><strong>기본 스탯</strong><span>공식 정보실 최종 능력 축</span></div><em>' + base.length + '개</em></header><div class="kinojo-character-core-stats kinojo-character-base-stats-grid">' + primary.concat(secondary).map(renderBaseStatCard).join('') + '</div></section>' +
          '</div>' +
        '</section>' +
        '<section class="kinojo-character-overview-column kinojo-character-skill-section">' +
          '<div class="kinojo-character-live-section-head"><div><strong>스킬</strong><span>공식 아이콘과 현재 습득·장착 레벨</span></div><em>' + skills.length + '개</em></div>' +
          '<div class="kinojo-character-overview-subtabs is-skill" role="tablist" aria-label="스킬 분류">' + skillGroups.map(group => tabButton('skill',group.key,group.label,group.rows.length)).join('') + '</div>' +
          '<div class="kinojo-character-skill-groups">' + skillGroups.map(group =>
            '<section data-kinojo-skill-panel="' + group.key + '" ' + (state.skillTab === group.key ? '' : 'hidden') + '><header><strong>' + esc(group.label) + '</strong><em>' + group.rows.length + '개</em></header>' + (group.rows.length ? '<div class="kinojo-character-skill-list">' + group.rows.map(renderSkillCard).join('') + '</div>' : '<p class="kinojo-character-overview-empty">표시할 ' + esc(group.label) + ' 스킬이 없습니다.</p>') + '</section>'
          ).join('') + '</div>' +
        '</section>' +
      '</div>' +
      '<p class="kinojo-character-live-note">' + esc(data.note || '저장된 공식 상세정보가 없습니다.') + '</p>';
    setOverviewStatTab(state.statTab);
    setOverviewSkillTab(state.skillTab);
  }

  const EQUIPMENT_CATEGORIES = [
    { key:'weaponArmor', label:'무기·방어구' },
    { key:'accessory', label:'장신구' }
  ];

  function equipmentKey(item){
    return [Number(item?.slotPos||0),Number(item?.id||0)].join(':');
  }

  function sortedEquipment(rows){
    return (Array.isArray(rows)?rows:[]).slice().sort((a,b)=>
      Number(a?.slotOrder||a?.slotPos||9999)-Number(b?.slotOrder||b?.slotPos||9999)
    );
  }

  function equipmentGroups(data){
    const equipment=Array.isArray(data?.equipment)?data.equipment:[];
    const legacyArcana=equipment.filter(item=>item?.category==='arcana');
    const arcana=Array.isArray(data?.arcana)&&data.arcana.length?data.arcana:legacyArcana;
    const normal=equipment.filter(item=>item?.category!=='arcana');
    return {
      weaponArmor:sortedEquipment(normal.filter(item=>item?.group==='weaponArmor'||item?.category==='weapon'||item?.category==='armor')),
      accessory:sortedEquipment(normal.filter(item=>item?.group==='accessory'||item?.category==='accessory')),
      arcana:sortedEquipment(arcana)
    };
  }

  function setEquipmentCategory(category){
    if(!EQUIPMENT_CATEGORIES.some(item=>item.key===category)) return;
    state.equipmentCategory=category;
    state.selectedEquipmentKey='';
    if(state.live) renderLiveEquipment(state.live);
  }

  function selectEquipmentButton(button){
    if(!button) return;
    const panel=button.closest('[data-kinojo-character-panel]');
    panel?.querySelectorAll('[data-live-equipment-item]').forEach(row=>{
      const selected=row===button;
      row.classList.toggle('is-selected',selected);
      row.setAttribute('aria-selected',selected?'true':'false');
    });
    const key=String(button.dataset.equipmentKey||'');
    if(panel?.dataset.kinojoCharacterPanel==='arcana') state.selectedArcanaKey=key;
    else state.selectedEquipmentKey=key;
  }

  function gradeClass(grade){
    return 'grade-'+String(grade||'normal').toLowerCase().replace(/[^a-z0-9_-]/g,'');
  }

  function equipmentRow(item,detailRoot,selectedKey){
    const key=equipmentKey(item),selected=key===selectedKey;
    const icon=safeUrl(item.icon),skinIcon=safeUrl(item.skinIcon);
    const enchant=Number(item.enchantLevel||0),exceed=Number(item.exceedLevel||0);
    return '<button type="button" class="kinojo-character-equipment-row '+gradeClass(item.grade)+(selected?' is-selected':'')+'" '+
      'data-live-equipment-item data-equipment-key="'+esc(key)+'" data-item-id="'+Number(item.id||0)+'" data-slot-pos="'+Number(item.slotPos||0)+'" '+
      'data-detail-root="'+esc(detailRoot)+'" aria-selected="'+(selected?'true':'false')+'" title="'+esc(item.slotLabel||item.slotPosName||'')+'">'+
      '<span class="kinojo-character-equipment-main-icon">'+(icon?'<img src="'+icon+'" alt="">':'')+'</span>'+
      (exceed?'<span class="kinojo-character-equipment-exceed" aria-label="초월 '+exceed+'"><i>'+exceed+'</i></span>':'<span class="kinojo-character-equipment-exceed is-empty" aria-hidden="true"></span>')+
      '<span class="kinojo-character-equipment-name"><b>'+(enchant?'<em>+'+enchant+'</em> ':'')+esc(item.name||'-')+'</b><small>'+esc(item.slotLabel||item.slotPosName||'')+'</small></span>'+
      '<span class="kinojo-character-equipment-skin '+(skinIcon?'':'is-empty')+'" title="'+esc(item.skinName||'적용 외형 없음')+'">'+(skinIcon?'<img src="'+skinIcon+'" alt="">':'')+'</span>'+
    '</button>';
  }

  function scheduleDefaultEquipment(panelName,preferredKey){
    requestAnimationFrame(()=>{
      if(!state.open||state.tab!==panelName) return;
      const panel=livePanel(panelName);
      if(!panel) return;
      const buttons=[...panel.querySelectorAll('[data-live-equipment-item]')];
      const target=buttons.find(button=>button.dataset.equipmentKey===preferredKey)||buttons[0];
      if(target){
        const root=document.getElementById(String(target.dataset.detailRoot||''));
        if(target.classList.contains('is-selected')&&root?.dataset.loadedEquipmentKey===String(target.dataset.equipmentKey||'')) return;
        selectEquipmentButton(target);target.click();
      }
    });
  }

  function renderLiveEquipment(data){
    const panel=livePanel('equipment');
    if(!panel) return;
    const groups=equipmentGroups(data);
    const activeCategory=EQUIPMENT_CATEGORIES.find(category=>category.key===state.equipmentCategory)||EQUIPMENT_CATEGORIES[0];
    const currentItems=groups[activeCategory.key]||[];
    const selected=currentItems.some(item=>equipmentKey(item)===state.selectedEquipmentKey)?state.selectedEquipmentKey:'';
    state.selectedEquipmentKey=selected;
    const total=groups.weaponArmor.length+groups.accessory.length;
    panel.innerHTML=
      '<div class="kinojo-character-live-section-head"><div><strong>장착 장비</strong><span>공식 슬롯 순서 · 목록에서 장비를 선택하면 오른쪽에 상세정보가 표시됩니다.</span></div><em>총 '+total+'개</em></div>'+
      '<nav class="kinojo-character-equipment-subtabs" aria-label="장비 구분">'+
        EQUIPMENT_CATEGORIES.map(category=>'<button type="button" class="'+(category.key===activeCategory.key?'active':'')+'" data-equipment-category="'+category.key+'"><span>'+esc(category.label)+'</span><strong>'+(groups[category.key]||[]).length+'</strong></button>').join('')+
      '</nav>'+
      '<section class="kinojo-character-equipment-layout">'+
        '<aside class="kinojo-character-equipment-list-pane"><header><strong>'+esc(activeCategory.label)+'</strong><span>'+currentItems.length+'개</span></header>'+
          '<div class="kinojo-character-equipment-list">'+(currentItems.length?currentItems.map(item=>equipmentRow(item,'kinojoLiveEquipmentDetail',selected)).join(''):'<div class="kinojo-character-equipment-empty">장착된 '+esc(activeCategory.label)+'가 없습니다.</div>')+'</div></aside>'+
        '<div class="kinojo-character-live-detail kinojo-character-equipment-detail-pane is-persistent" id="kinojoLiveEquipmentDetail" data-persistent-detail><div class="kinojo-character-equipment-detail-empty"><strong>장비를 선택해 주세요.</strong><span>아이템 정보·옵션·영혼 각인·마석·신석을 표시합니다.</span></div></div>'+
      '</section>';
    if(currentItems.length) scheduleDefaultEquipment('equipment',selected);
  }

  function renderLiveArcana(data){
    const panel=livePanel('arcana');
    if(!panel) return;
    const rows=equipmentGroups(data).arcana;
    const selected=rows.some(item=>equipmentKey(item)===state.selectedArcanaKey)?state.selectedArcanaKey:'';
    const setEffects=Array.isArray(data?.arcanaSetEffects)?data.arcanaSetEffects:[];
    state.selectedArcanaKey=selected;
    panel.innerHTML=
      '<div class="kinojo-character-live-section-head"><div><strong>아르카나</strong><span>일반 장착 장비와 분리된 아르카나 8개 슬롯입니다.</span></div><em>'+rows.length+'개</em></div>'+
      (setEffects.length?'<section class="kinojo-character-arcana-sets" aria-label="장착 아르카나 세트 효과">'+setEffects.map(set=>
        '<article><header><div><span>장착 세트</span><strong>'+esc(set.name||'-')+'</strong></div><em>'+Number(set.equippedCount||0)+'세트</em></header><div>'+
          (Array.isArray(set.bonuses)?set.bonuses:[]).map(bonus=>'<section class="'+(bonus.active?'is-active':'is-inactive')+'"><b>'+Number(bonus.degree||0)+'세트 효과</b><p>'+((Array.isArray(bonus.descriptions)?bonus.descriptions:[]).map(text=>esc(text)).join('<br>')||'-')+'</p><i>'+(bonus.active?'적용 중':'미적용')+'</i></section>').join('')+
        '</div></article>').join('')+'</section>':'')+
      '<section class="kinojo-character-arcana-layout">'+
        '<div class="kinojo-character-arcana-list">'+(rows.length?rows.map(item=>equipmentRow(item,'kinojoLiveArcanaDetail',selected)).join(''):'<div class="kinojo-character-equipment-empty">저장된 아르카나 정보가 없습니다.</div>')+'</div>'+
        '<div class="kinojo-character-live-detail kinojo-character-equipment-detail-pane is-persistent" id="kinojoLiveArcanaDetail" data-persistent-detail><div class="kinojo-character-equipment-detail-empty"><strong>아르카나를 선택해 주세요.</strong><span>선택한 아르카나의 저장 상세정보를 표시합니다.</span></div></div>'+
      '</section>';
    if(rows.length) scheduleDefaultEquipment('arcana',selected);
  }

  function renderLiveDaevanion(data){
    const panel = livePanel('daevanion');
    if(!panel) return;
    const boards = Array.isArray(data.daevanion) ? data.daevanion : [];
    panel.innerHTML =
      '<div class="kinojo-character-live-section-head"><div><strong>데바니온 보드</strong><span>보드를 누를 때만 해당 노드 정보를 1회 추가 조회합니다.</span></div><em>' + boards.length + '개</em></div>' +
      '<div class="kinojo-character-daevanion-grid">' +
        boards.map(board => {
          const icon = normalizedImageUrl(board?.icon);
          return '<button type="button" data-live-daevanion-board data-board-id="' + Number(board.id || 0) + '">' +
            (icon ? '<img class="kinojo-daevanion-board-visual" src="' + safeUrl(icon) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '') +
            '<span><b>' + esc(board.name || '-') + '</b></span>' +
            '<strong><span>' + Number(board.openNodeCount || 0) + ' / ' + Number(board.totalNodeCount || 0) + '</span><small>' + Number(board.openPercent || 0) + '%</small></strong>' +
          '</button>';
        }).join('') +
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
      pvpPower:profile.itemLevel || state.target?.pvpPower,
      level:profile.level || state.target?.level,
      legionName:profile.regionName || state.target?.legionName,
      titleName:profile.titleName || state.target?.titleName
    }));
    renderTarget();
    renderLiveOverview(data);
    renderLiveEquipment(data);
    renderLiveArcana(data);
    renderLiveDaevanion(data);
    updateCompareVisibility();
    const time = document.getElementById('kinojoCharacterLiveTime');
    if(time) time.textContent = 'PLAYNC 실시간 · ' + new Date(data.fetchedAt || Date.now()).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
    setLiveStatus('저장 프로필 조회 완료','ok');
  }

  async function loadLiveOverview(){
    if(state.liveLoading) return;
    const identity = liveIdentityKey(state.target);
    if(!state.target?.name || !state.target?.serverId){
      setLiveStatus('캐릭터 서버 정보를 확인한 뒤 실시간 조회합니다.','');
      return;
    }
    state.liveLoading = true;
    setLiveStatus('Server에 저장된 프로필·장비·아르카나 정보를 불러오고 있습니다.','loading');
    try{
      let data = await liveRequest('overview');
      data = await mergeServerSkills(data);
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

  function compareValue(value, unit){
    if(value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    const number = Number(value);
    const text = Number.isInteger(number) ? number.toLocaleString('ko-KR') : number.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return unit === 'percent' ? text + '%' : text;
  }

  function compareDelta(value, unit){
    if(value === null || value === undefined || !Number.isFinite(Number(value))) return { text:'비교 불가', kind:'same' };
    const number = Number(value);
    return {
      text:(number > 0 ? '+' : '') + compareValue(number,unit),
      kind:number > 0 ? 'up' : number < 0 ? 'down' : 'same'
    };
  }

  function renderComparison(data){
    const panel = livePanel('compare');
    if(!panel) return;
    const owned = Array.isArray(data?.ownedCharacters) ? data.ownedCharacters : [];
    const comparison = data?.comparison || {};
    const rows = Array.isArray(comparison.stats) ? comparison.stats : [];
    const headline = [
      { label:'전투력', value:comparison.combatPower, unit:'fixed' },
      { label:'아이템 레벨', value:comparison.itemLevel, unit:'fixed' }
    ];
    panel.innerHTML =
      '<div class="kinojo-character-live-section-head"><div><strong>내 캐릭터와 비교</strong><span>PASS KEY 계정에 연결된 캐릭터만 Server가 검증해 비교합니다.</span></div><em>' + esc(data?.own?.name || '-') + '</em></div>' +
      '<div class="kinojo-character-compare-selector" role="group" aria-label="내 캐릭터 선택">' +
        owned.map(row => '<button type="button" class="' + (Number(row.id) === Number(data?.own?.id) ? 'active' : '') + '" data-compare-character-id="' + Number(row.id || 0) + '">' +
          '<strong>' + esc(row.name || '-') + '</strong><span>' + esc([row.className,row.serverName,row.isMain ? '대표' : ''].filter(Boolean).join(' · ')) + '</span></button>').join('') +
      '</div>' +
      '<div class="kinojo-character-compare-headline">' +
        headline.map(row => {
          const delta = compareDelta(row.value?.delta,row.unit);
          return '<article><span>' + esc(row.label) + '</span><div><small>상대 ' + esc(compareValue(row.value?.target,row.unit)) + '</small><strong>내 캐릭터 ' + esc(compareValue(row.value?.own,row.unit)) + '</strong><em class="is-' + delta.kind + '">' + esc(delta.text) + '</em></div></article>';
        }).join('') +
      '</div>' +
      '<div class="kinojo-character-compare-table">' +
        rows.map(row => {
          const delta = compareDelta(row.delta,row.unit);
          return '<article><span>' + esc(row.label || row.key || '-') + '</span><small>' + esc(compareValue(row.targetValue,row.unit)) + '</small><strong>' + esc(compareValue(row.ownValue,row.unit)) + '</strong><em class="is-' + delta.kind + '">' + esc(delta.text) + '</em></article>';
        }).join('') +
      '</div>';
  }

  async function loadComparison(ownCharacterId){
    const panel = livePanel('compare');
    const account = compareAccount();
    if(!panel) return;
    if(!account){
      panel.innerHTML = '<div class="kinojo-character-live-error"><strong>PASS KEY 로그인이 필요합니다.</strong><span>로그인하면 계정에 연결된 캐릭터와 비교할 수 있습니다.</span></div>';
      return;
    }
    if(state.compareLoading) return;
    state.compareLoading = true;
    panel.innerHTML = '<div class="kinojo-character-live-loading">내 캐릭터 연결을 확인하고 Server에서 비교 중입니다.</div>';
    try{
      const data = await liveRequest('comparison',{
        passKey:account.passKey || account.passCode,
        ownCharacterId:ownCharacterId || undefined
      },String(ownCharacterId || 'default'));
      state.compare = data;
      renderComparison(data);
    }catch(error){
      panel.innerHTML = '<div class="kinojo-character-live-error"><strong>캐릭터 비교 실패</strong><span>' + esc(error.message || error) + '</span></div>';
    }finally{
      state.compareLoading = false;
    }
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
    const level = firstValue(t.level,t.characterLevel,t.character_level);
    const legionName = firstValue(t.legionName,t.regionName,t.legion,t.guildName,t.guild_name);
    const titleName = firstValue(t.titleName,t.title,t.characterTitle,t.character_title);
    return { name, className, server, serverId, charKey, characterId, owner, profileImageUrl, detailUrl, classIconUrl, pvePower, pvpPower, level, legionName, titleName };
  }

  function renderTarget(){
    const target = state.target || {};
    const avatar = document.getElementById('kinojoCharacterReactionAvatar');
    const classIcon = document.getElementById('kinojoCharacterReactionClass');
    const title = document.getElementById('kinojoCharacterReactionTitle');
    const className = document.getElementById('kinojoCharacterReactionClassName');
    const serverName = document.getElementById('kinojoCharacterReactionServerName');
    const level = document.getElementById('kinojoCharacterReactionLevel');
    const legion = document.getElementById('kinojoCharacterReactionLegion');
    const titleName = document.getElementById('kinojoCharacterReactionTitleName');
    const detail = document.getElementById('kinojoCharacterReactionDetail');
    const pvePower = document.getElementById('kinojoCharacterReactionPvePower');
    const pvpPower = document.getElementById('kinojoCharacterReactionPvpPower');

    if(title) title.textContent = target.name || '캐릭터';
    if(className) className.textContent = target.className || '-';
    if(serverName) serverName.textContent = target.server || '-';
    if(level) level.textContent = target.level ? 'Lv.' + target.level : '-';
    if(legion) legion.textContent = target.legionName || '-';
    if(titleName) titleName.textContent = target.titleName || '-';
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
    state.compare = null;
    state.compareLoading = false;
    state.statTab = 'basic';
    state.skillTab = 'active';
    state.tab = 'overview';
    state.equipmentCategory = 'weaponArmor';
    state.selectedEquipmentKey = '';
    state.selectedArcanaKey = '';
    if(state.liveStatusTimer){clearTimeout(state.liveStatusTimer);state.liveStatusTimer=null;}
    state.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const modal = ensureModal();
    const input = document.getElementById('kinojoCharacterReactionComment');
    if(input) input.value = '';
    setStatus('');
    renderTarget();
    setType('like');
    setTab('overview');
    updateCompareVisibility();
    updateSubmitState();

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('kinojo-character-reaction-open');
    state.open = true;
    enrichTargetFromMaster();
    loadLiveOverview();

    const dialog = modal.querySelector('.kinojo-character-reaction-dialog');
    if(dialog) dialog.scrollTop = 0;
    const scrollViewport = modal.querySelector('.kinojo-character-reaction-scroll');
    if(scrollViewport) scrollViewport.scrollTop = 0;
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
    state.compareLoading = false;
    state.compare = null;
    state.selectedEquipmentKey = '';
    state.selectedArcanaKey = '';
    state.live = null;
    state.target = null;
    state.options = null;
    if(state.liveStatusTimer){clearTimeout(state.liveStatusTimer);state.liveStatusTimer=null;}
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
          serverId: target.serverId || '',
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

      setStatus(data.message || '한마디가 전달되었어요.');
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
  window.KinojoPowerFormat = { short: shortPower, full: fullPower, number: powerNumber };
  window.KinojoCharacterReaction = { open, close, setType };
  window.addEventListener('kinojo:auth-changed', () => {
    liveCache.clear();
    state.compare = null;
    if(state.open){
      updateCompareVisibility();
      if(state.tab === 'compare') loadComparison();
    }
  });
})();
