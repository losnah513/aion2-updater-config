/*
 * KINOJO Ranking Events
 * 역할: 레기온 전체 순위 페이지 이벤트 바인딩만 담당합니다.
 * 규칙: 순위 계산과 캐릭터 반응 저장 로직을 포함하지 않습니다.
 */
(function(){
  'use strict';
  const Ranking = window.KinojoRanking = window.KinojoRanking || {};
  const U = Ranking.utils;
  const D = Ranking.data;

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
    if(!tabs) return;
    tabs.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        D.setClass(btn.dataset.class || '전체');
        loadRanking();
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
      search.addEventListener('keydown', e => {
        if(e.key === 'Enter'){
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
        document.querySelectorAll('[data-mobile-mode]').forEach(b => b.classList.toggle('is-active', b === btn));
        const board = U.$('rankingBoard');
        if(board) board.dataset.mobileMode = D.state.mobileMode;
        Ranking.render.updateLoadMore();
      });
    });
  }

  Ranking.events = { bindStaticEvents, bindDynamicEvents, loadRanking };
})();
