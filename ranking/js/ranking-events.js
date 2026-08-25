/*
 * KINOJO Ranking Events
 * 역할: 레기온 전체 순위 페이지 이벤트, 독립 스크롤, 로그인 캐릭터 이동을 담당합니다.
 * 규칙: 순위 계산은 하지 않으며 Server 순서와 정확한 server_id + character_name 소유권만 사용합니다.
 */
(function(){
  'use strict';
  const Ranking = window.KinojoRanking = window.KinojoRanking || {};
  const U = Ranking.utils;
  const D = Ranking.data;
  const scrollPositions = { PVE:0, PVP:0 };
  const myCharactersState = { token:'', data:null, promise:null };

  function cardTarget(card){
    return {
      name: card.dataset.charName || card.dataset.character || '',
      owner: card.dataset.charOwner || '',
      className: card.dataset.charClass || '',
      server: card.dataset.charServer || '',
      serverId: card.dataset.serverId || '',
      charKey: card.dataset.charKey || '',
      profileImageUrl: card.dataset.profileImage || '',
      detailUrl: card.dataset.detailUrl || '',
      pvePower: card.dataset.pvePower || '',
      pvpPower: card.dataset.pvpPower || ''
    };
  }

  function safeDetailUrl(value){
    const raw = String(value || '').trim();
    if(!raw) return '';
    try{
      const url = new URL(raw, window.location.origin);
      return url.protocol === 'https:' ? url.href : '';
    }catch(_err){
      return '';
    }
  }

  function openCharacterDetail(card){
    const target = cardTarget(card);
    if(window.KinojoCharacterReaction && typeof window.KinojoCharacterReaction.open === 'function'){
      window.KinojoCharacterReaction.open({
        source:'ranking',
        context:'ranking',
        limitPrefix:'kinojo_ranking_react',
        target,
        onSubmit:async function(payload){
          return await window.KinojoApi.postAction('hallReaction',{
            characterName:payload.target.name,
            serverId:payload.target.serverId || '',
            reaction:payload.reaction,
            comment:payload.comment,
            clientKey:payload.clientKey,
            sessionToken:payload.sessionToken,
            source:'ranking'
          });
        }
      });
      return;
    }

    const detailUrl = safeDetailUrl(target.detailUrl);
    if(detailUrl) window.open(detailUrl, '_blank', 'noopener,noreferrer');
  }

  function normalizeIdentity(value){
    return String(value || '').normalize('NFKC').trim().toLowerCase();
  }
  function normalizeServerId(value){
    const raw = String(value ?? '').trim();
    if(!raw) return '';
    const number = Number(raw);
    return Number.isFinite(number) ? String(number) : raw;
  }
  function sameCharacter(card, character){
    return normalizeServerId(card?.dataset?.serverId) === normalizeServerId(character?.serverId)
      && normalizeIdentity(card?.dataset?.charName) === normalizeIdentity(character?.characterName);
  }
  function orderedOwnCharacters(characters){
    return (Array.isArray(characters) ? characters : [])
      .filter(row => normalizeServerId(row?.serverId) && normalizeIdentity(row?.characterName))
      .slice()
      .sort((a,b) => Number(b?.isMain === true) - Number(a?.isMain === true));
  }
  function currentSessionToken(){
    const token = String(window.KinojoAuth?.getSession?.()?.token || '').trim();
    return /^kws_[A-Za-z0-9_-]{40,80}$/.test(token) ? token : '';
  }
  async function loadOwnCharacters(){
    const token = currentSessionToken();
    if(!token){
      const error = new Error('로그인 후 이용할 수 있어요.');
      error.code = 'LOGIN_REQUIRED';
      throw error;
    }
    if(myCharactersState.token !== token){
      myCharactersState.token = token;
      myCharactersState.data = null;
      myCharactersState.promise = null;
    }
    if(myCharactersState.data) return myCharactersState.data;
    if(myCharactersState.promise) return myCharactersState.promise;
    const client = window.KinojoSupabaseClientCore;
    if(!client || typeof client.invokeEdgeFunction !== 'function') throw new Error('캐릭터 서버 연결을 준비하는 중입니다.');
    myCharactersState.promise = (async() => {
      const data = await client.invokeEdgeFunction('kinojo-member-profile',{action:'characters',sessionToken:token});
      if(currentSessionToken() !== token) throw new Error('로그인 세션이 변경되었습니다.');
      if(!data || data.ok !== true) throw new Error(data?.message || data?.code || '캐릭터 정보를 불러오지 못했습니다.');
      if(data.ownerResolved !== true) throw new Error('등록된 본캐 연결 정보를 확인할 수 없습니다.');
      const characters = orderedOwnCharacters(data.characters);
      myCharactersState.data = characters;
      return characters;
    })().finally(() => {
      if(myCharactersState.token === token) myCharactersState.promise = null;
    });
    return myCharactersState.promise;
  }

  function findOwnedCard(mode, characters){
    const cards = document.querySelectorAll('.ranking-panel[data-panel="'+mode+'"] .ranking-detail-card');
    for(const character of orderedOwnCharacters(characters)){
      for(const card of cards){
        if(sameCharacter(card, character)) return card;
      }
    }
    return null;
  }
  function markOwnedCards(){
    const characters = myCharactersState.data || [];
    document.querySelectorAll('.ranking-detail-card').forEach(card => {
      card.classList.toggle('is-my-character', characters.some(character => sameCharacter(card, character)));
    });
  }
  function setMyRankFeedback(mode, message, state){
    const button = document.querySelector('[data-my-rank="'+mode+'"]');
    const status = button?.querySelector('small');
    if(!button || !status) return;
    button.dataset.state = state || '';
    status.textContent = message || '로그인 캐릭터로 이동';
  }
  function scrollToCard(mode, card){
    const list = document.querySelector('[data-scroll-list="'+mode+'"]');
    if(!list || !card) return;
    const listRect = list.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const target = list.scrollTop + cardRect.top - listRect.top - Math.max(10,(list.clientHeight - card.offsetHeight) / 2);
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    card.classList.add('is-my-rank-target');
    try{ card.focus({preventScroll:true}); }catch(_err){ card.focus(); }
    list.scrollTo({top:Math.max(0,target),left:0,behavior});
    scrollPositions[mode] = Math.max(0,target);
    setTimeout(() => card.classList.remove('is-my-rank-target'), 2200);
  }

  function updateScrollAffordance(list, mode){
    if(!list) return;
    const shell = list.closest('.ranking-scroll-shell');
    if(!shell) return;
    const hasRenderedBelow = list.scrollHeight - list.scrollTop - list.clientHeight > 4;
    const hasServerBelow = D.loadedCount(mode) < D.total(D.state.data, mode);
    shell.classList.toggle('has-more-below', hasRenderedBelow || hasServerBelow);
  }
  function isVisibleScrollList(list){
    const panel = list?.closest('.ranking-panel');
    return !!panel && getComputedStyle(panel).display !== 'none';
  }
  function captureScrollPositions(){
    document.querySelectorAll('[data-scroll-list]').forEach(list => {
      if(!isVisibleScrollList(list)) return;
      const mode = list.dataset.scrollList === 'PVP' ? 'PVP' : 'PVE';
      scrollPositions[mode] = list.scrollTop;
    });
  }
  function restoreScrollPositions(){
    document.querySelectorAll('[data-scroll-list]').forEach(list => {
      if(!isVisibleScrollList(list)) return;
      const mode = list.dataset.scrollList === 'PVP' ? 'PVP' : 'PVE';
      list.scrollTop = scrollPositions[mode] || 0;
      updateScrollAffordance(list, mode);
    });
  }
  function refreshScrollAffordances(){
    document.querySelectorAll('[data-scroll-list]').forEach(list => {
      const mode = list.dataset.scrollList === 'PVP' ? 'PVP' : 'PVE';
      updateScrollAffordance(list, mode);
    });
  }
  function maybeLoadMore(mode, list){
    if(D.state.loading || !D.hasMore()) return;
    if(list.scrollHeight - list.scrollTop - list.clientHeight > 120) return;
    if(D.advancePage()) loadRanking({append:true,triggerMode:mode});
  }
  function bindPanelScrolls(){
    document.querySelectorAll('[data-scroll-list]').forEach(list => {
      const mode = list.dataset.scrollList === 'PVP' ? 'PVP' : 'PVE';
      if(isVisibleScrollList(list)) list.scrollTop = scrollPositions[mode] || 0;
      updateScrollAffordance(list, mode);
      list.addEventListener('scroll', () => {
        scrollPositions[mode] = list.scrollTop;
        updateScrollAffordance(list, mode);
        maybeLoadMore(mode, list);
      },{passive:true});
    });
    requestAnimationFrame(refreshScrollAffordances);
  }

  async function loadRanking(options){
    if(D.state.loading) return false;
    const append = !!options?.append;
    if(append) captureScrollPositions();
    else{
      scrollPositions.PVE = 0;
      scrollPositions.PVP = 0;
    }
    D.state.loading = true;
    const board = U.$('rankingBoard');
    if(append) board?.classList.add('is-appending');
    else Ranking.render.renderLoading();
    try{
      D.state.data = await D.fetchRanking({ append, force:!!options?.force });
      Ranking.render.render();
      bindDynamicEvents();
      requestAnimationFrame(restoreScrollPositions);
      return true;
    }catch(err){
      if(append){
        D.retreatPage();
        window.KinojoToast?.error?.('추가 순위를 불러오지 못했습니다.');
        refreshScrollAffordances();
      }else{
        Ranking.render.renderError(err);
      }
      return false;
    }finally{
      D.state.loading = false;
      board?.classList.remove('is-appending');
      requestAnimationFrame(refreshScrollAffordances);
    }
  }

  async function focusMyRank(mode){
    setMyRankFeedback(mode,'찾는 중…','loading');
    try{
      const characters = await loadOwnCharacters();
      if(!characters.length){
        setMyRankFeedback(mode,'연결된 캐릭터 없음','empty');
        return;
      }
      let card = findOwnedCard(mode, characters);
      while(!card && D.hasMore()){
        if(!D.advancePage()) break;
        const loaded = await loadRanking({append:true,triggerMode:mode});
        if(!loaded) break;
        card = findOwnedCard(mode, characters);
      }
      markOwnedCards();
      if(!card){
        setMyRankFeedback(mode,'현재 조건에 순위 없음','empty');
        return;
      }
      const rank = card.querySelector('.ranking-rank-current')?.textContent?.trim();
      setMyRankFeedback(mode,(rank && rank !== '-' ? rank+'위로 이동' : '내 캐릭터로 이동'),'found');
      scrollToCard(mode, card);
    }catch(error){
      const loginRequired = error?.code === 'LOGIN_REQUIRED';
      setMyRankFeedback(mode,loginRequired ? '로그인 필요' : '확인 실패','error');
      if(loginRequired) window.KinojoAuth?.openLoginModal?.();
      else window.KinojoToast?.error?.(error?.message || '내 캐릭터 순위를 확인하지 못했습니다.');
    }
  }

  function bindDynamicEvents(){
    const retry = document.querySelector('[data-ranking-retry]');
    if(retry) retry.onclick = () => loadRanking({force:true});
    const tabs = U.$('rankingClassTabs');
    if(tabs){
      tabs.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => {
          D.setClass(btn.dataset.class || '전체');
          loadRanking();
        };
      });
    }

    document.querySelectorAll('[data-my-rank]').forEach(button => {
      button.onclick = event => {
        event.stopPropagation();
        focusMyRank(button.dataset.myRank === 'PVP' ? 'PVP' : 'PVE');
      };
    });

    document.querySelectorAll('.ranking-detail-card').forEach(card => {
      card.onclick = event => {
        event.stopPropagation();
        openCharacterDetail(card);
      };
      card.onkeydown = event => {
        if(event.key === 'Enter' || event.key === ' '){
          event.preventDefault();
          openCharacterDetail(card);
        }
      };
    });
    markOwnedCards();
    bindPanelScrolls();
  }

  function bindStaticEvents(){
    const search = U.$('rankingSearch');
    const include = U.$('rankingIncludeSubs');
    const includeAllLegions = U.$('rankingIncludeAllLegions');
    const searchBtn = U.$('rankingSearchBtn');
    const resetBtn = U.$('rankingResetBtn');
    const filterToggle = U.$('rankingFilterToggleBtn');
    const toolbar = document.querySelector('.ranking-toolbar');

    if(filterToggle && toolbar){
      filterToggle.addEventListener('click', () => {
        const open = !toolbar.classList.contains('is-filter-open');
        toolbar.classList.toggle('is-filter-open', open);
        filterToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        filterToggle.textContent = open ? '닫기' : '필터';
      });
    }
    if(search){
      search.addEventListener('keydown', event => {
        if(event.key === 'Enter'){
          D.setSearch(search.value.trim());
          loadRanking();
        }
      });
    }
    if(include){
      include.addEventListener('change', () => {
        D.setIncludeSubs(include.checked);
        loadRanking();
      });
    }
    if(includeAllLegions){
      includeAllLegions.addEventListener('change', () => {
        D.setIncludeAllLegions(includeAllLegions.checked);
        loadRanking();
      });
    }
    if(searchBtn){
      searchBtn.addEventListener('click', () => {
        D.setSearch(search?.value.trim() || '');
        loadRanking();
      });
    }
    if(resetBtn){
      resetBtn.addEventListener('click', () => {
        D.reset();
        if(search) search.value = '';
        if(include) include.checked = false;
        if(includeAllLegions) includeAllLegions.checked = false;
        loadRanking();
      });
    }
    document.querySelectorAll('[data-mobile-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        captureScrollPositions();
        D.state.mobileMode = btn.dataset.mobileMode === 'PVP' ? 'PVP' : 'PVE';
        document.querySelectorAll('[data-mobile-mode]').forEach(item => item.classList.toggle('is-active', item === btn));
        const board = U.$('rankingBoard');
        if(board) board.dataset.mobileMode = D.state.mobileMode;
        requestAnimationFrame(restoreScrollPositions);
      });
    });
    window.addEventListener('resize', () => requestAnimationFrame(refreshScrollAffordances),{passive:true});
    window.addEventListener('kinojo:auth-changed', () => {
      myCharactersState.token = '';
      myCharactersState.data = null;
      myCharactersState.promise = null;
      document.querySelectorAll('[data-my-rank]').forEach(button => {
        button.dataset.state = '';
        const status = button.querySelector('small');
        if(status) status.textContent = '로그인 캐릭터로 이동';
      });
      markOwnedCards();
    });
  }

  Ranking.events = { bindStaticEvents, bindDynamicEvents, loadRanking, focusMyRank };
})();
