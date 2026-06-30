/*
 * KINOJO Ranking Render
 * 역할: 상태와 서버 응답을 화면에 렌더링합니다.
 */
(function(){
  'use strict';
  const Ranking = window.KinojoRanking = window.KinojoRanking || {};
  const U = Ranking.utils;
  const D = Ranking.data;

  function panelHtml(mode, rows, total){
    const items = rows || [];
    return '<section class="ranking-panel '+mode.toLowerCase()+'" data-panel="'+mode+'">'
      + '<div class="ranking-panel-head"><div><h2>'+mode+' 전투력 순위</h2><p>서버 계산 기준 · '+Number(total || 0).toLocaleString('ko-KR')+'명</p></div><span class="ranking-panel-chip '+mode.toLowerCase()+'">'+mode+'</span></div>'
      + '<div class="ranking-card-list">'+(items.length ? items.map(row => Ranking.card.cardHtml(row, mode)).join('') : '<div class="ranking-empty">조건에 맞는 캐릭터가 없습니다.</div>')+'</div>'
      + '</section>';
  }
  function renderClassTabs(){
    const el = U.$('rankingClassTabs');
    if(!el) return;
    const counts = D.state.data?.classCounts || {};
    el.innerHTML = U.CLASS_ORDER.map(cls => {
      const count = cls === '전체' ? '' : (counts[cls] !== undefined ? ' ' + counts[cls] : '');
      return '<button type="button" class="ranking-class-tab '+(D.state.className === cls ? 'is-active' : '')+'" data-class="'+U.escapeHtml(cls)+'">'+U.escapeHtml(cls)+U.escapeHtml(count)+'</button>';
    }).join('');
  }
  function render(){
    const board = U.$('rankingBoard');
    if(!board) return;
    const d = D.state.data || {};
    board.innerHTML = panelHtml('PVE', d.pveItems || [], d.pveTotalCount || 0) + panelHtml('PVP', d.pvpItems || [], d.pvpTotalCount || 0);
    if(U.isMobileRanking()) board.dataset.mobileMode = D.state.mobileMode;

    const pageInfo = U.$('rankingPageInfo');
    if(pageInfo) pageInfo.textContent = D.state.page + ' / ' + D.totalPages();

    const status = U.$('rankingStatus');
    if(status){
      const parts = ['직업 ' + D.state.className];
      if(D.state.search) parts.push('검색 ' + D.state.search);
      parts.push(D.state.includeSubs ? '부캐 포함' : '본캐 기준');
      status.textContent = parts.join(' · ');
    }
    renderClassTabs();

    const prev = U.$('rankingPrevBtn');
    const next = U.$('rankingNextBtn');
    if(prev) prev.disabled = D.state.page <= 1;
    if(next) next.disabled = D.state.page >= D.totalPages();
  }
  function renderLoading(){
    const board = U.$('rankingBoard');
    if(board) board.innerHTML = '<div class="ranking-loading"><span class="kinojo-spinner"><span></span></span><span>레기온 전체 순위를 불러오는 중...</span></div>';
    const status = U.$('rankingStatus');
    if(status) status.textContent = '서버 순위 계산 결과를 요청하는 중...';
  }
  function renderError(err){
    const board = U.$('rankingBoard');
    if(board) board.innerHTML = '<div class="ranking-empty error">레기온 전체 순위를 불러오지 못했습니다.<br>'+U.escapeHtml(err.message || err)+'</div>';
    const status = U.$('rankingStatus');
    if(status) status.textContent = '순위 로딩 실패';
  }

  Ranking.render = { render, renderLoading, renderError, renderClassTabs };
})();
