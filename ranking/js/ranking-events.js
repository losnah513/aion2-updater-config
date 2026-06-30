/*
 * KINOJO Ranking Events
 * 역할: 레기온 전체 순위 페이지 이벤트 바인딩만 담당합니다.
 */
(function(){
  'use strict';
  const Ranking = window.KinojoRanking = window.KinojoRanking || {};
  const U = Ranking.utils;
  const D = Ranking.data;

  async function loadRanking(){
    if(D.state.loading) return;
    D.state.loading = true;
    Ranking.render.renderLoading();
    try{
      D.state.data = await D.fetchRanking();
      Ranking.render.render();
      bindDynamicEvents();
    }catch(err){
      Ranking.render.renderError(err);
    }finally{
      D.state.loading = false;
    }
  }
  function bindDynamicEvents(){
    const tabs = U.$('rankingClassTabs');
    if(tabs){
      tabs.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => { D.setClass(btn.dataset.class || '전체'); loadRanking(); };
      });
    }
  }
  function bindStaticEvents(){
    const search = U.$('rankingSearch');
    const include = U.$('rankingIncludeSubs');
    const searchBtn = U.$('rankingSearchBtn');
    const resetBtn = U.$('rankingResetBtn');
    const prev = U.$('rankingPrevBtn');
    const next = U.$('rankingNextBtn');
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
      include.addEventListener('change', () => { D.setIncludeSubs(include.checked); loadRanking(); });
    }
    if(searchBtn){
      searchBtn.addEventListener('click', () => { D.setSearch(search?.value.trim() || ''); loadRanking(); });
    }
    if(resetBtn){
      resetBtn.addEventListener('click', () => {
        D.reset();
        if(search) search.value = '';
        if(include) include.checked = false;
        loadRanking();
      });
    }
    if(prev){
      prev.addEventListener('click', () => { if(D.state.page > 1){ D.state.page--; loadRanking(); } });
    }
    if(next){
      next.addEventListener('click', () => { if(D.state.page < D.totalPages()){ D.state.page++; loadRanking(); } });
    }
    document.querySelectorAll('[data-mobile-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        D.state.mobileMode = btn.dataset.mobileMode === 'PVP' ? 'PVP' : 'PVE';
        document.querySelectorAll('[data-mobile-mode]').forEach(b => b.classList.toggle('is-active', b === btn));
        const board = U.$('rankingBoard');
        if(board){
          board.dataset.mobileMode = D.state.mobileMode;
          if(U.isMobileRanking()) board.scrollIntoView({ block:'start', behavior:'smooth' });
        }
      });
    });
  }

  Ranking.events = { bindStaticEvents, bindDynamicEvents, loadRanking };
})();
