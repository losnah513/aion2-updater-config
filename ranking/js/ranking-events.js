/*
 * KINOJO Ranking Events
 * 역할: 레기온 전체 순위 페이지 이벤트 바인딩만 담당합니다.
 * 규칙: 순위 계산은 하지 않으며 카드 클릭은 공통 캐릭터 상세 모달만 호출합니다.
 */
(function(){
  'use strict';
  const Ranking = window.KinojoRanking = window.KinojoRanking || {};
  const U = Ranking.utils;
  const D = Ranking.data;

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

  async function loadRanking(options){
    if(D.state.loading) return;
    const append = !!options?.append;
    const scrollY = window.scrollY;
    D.state.loading = true;
    if(append) Ranking.render.setLoadMoreLoading(true);
    else Ranking.render.renderLoading();
    try{
      D.state.data = await D.fetchRanking({ append });
      Ranking.render.render();
      bindDynamicEvents();
      if(append){
        requestAnimationFrame(() => window.scrollTo({ top:scrollY, left:0, behavior:'auto' }));
      }
    }catch(err){
      if(append){
        D.retreatPage();
        Ranking.render.setLoadMoreLoading(false);
        Ranking.render.updateLoadMore();
        const status = U.$('rankingStatus');
        if(status) status.textContent = '추가 순위를 불러오지 못했습니다 · ' + (err.message || err);
      }else{
        Ranking.render.renderError(err);
      }
    }finally{
      D.state.loading = false;
      Ranking.render.setLoadMoreLoading(false);
      Ranking.render.updateLoadMore();
    }
  }

  function bindDynamicEvents(){
    const tabs = U.$('rankingClassTabs');
    if(tabs){
      tabs.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => {
          D.setClass(btn.dataset.class || '전체');
          loadRanking();
        };
      });
    }

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
  }

  function bindStaticEvents(){
    const search = U.$('rankingSearch');
    const include = U.$('rankingIncludeSubs');
    const includeAllLegions = U.$('rankingIncludeAllLegions');
    const searchBtn = U.$('rankingSearchBtn');
    const resetBtn = U.$('rankingResetBtn');
    const loadMore = U.$('rankingLoadMoreBtn');
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
    if(loadMore){
      loadMore.addEventListener('click', () => {
        if(D.advancePage()) loadRanking({ append:true });
      });
    }
    document.querySelectorAll('[data-mobile-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        D.state.mobileMode = btn.dataset.mobileMode === 'PVP' ? 'PVP' : 'PVE';
        document.querySelectorAll('[data-mobile-mode]').forEach(item => item.classList.toggle('is-active', item === btn));
        const board = U.$('rankingBoard');
        if(board) board.dataset.mobileMode = D.state.mobileMode;
        Ranking.render.updateLoadMore();
      });
    });
  }

  Ranking.events = { bindStaticEvents, bindDynamicEvents, loadRanking };
})();
