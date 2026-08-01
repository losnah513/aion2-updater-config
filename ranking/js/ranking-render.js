/*
 * KINOJO Ranking Render
 * 역할: 상태와 Server 응답을 화면에 표시합니다.
 * 규칙: 순위 계산 없이 Server가 반환한 행과 전체 건수만 출력합니다.
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
  function updateLoadMore(){
    const shell = U.$('rankingLoadMore');
    const button = U.$('rankingLoadMoreBtn');
    const info = U.$('rankingLoadMoreInfo');
    if(!shell || !button || !info) return;

    const pveLoaded = D.loadedCount('PVE');
    const pvpLoaded = D.loadedCount('PVP');
    const pveTotal = D.total(D.state.data, 'PVE');
    const pvpTotal = D.total(D.state.data, 'PVP');
    const hasRows = pveTotal > 0 || pvpTotal > 0;
    const narrow = U.isMobileRanking();
    const mode = D.state.mobileMode === 'PVP' ? 'PVP' : 'PVE';
    const modeLoaded = mode === 'PVP' ? pvpLoaded : pveLoaded;
    const modeTotal = mode === 'PVP' ? pvpTotal : pveTotal;
    const displayHasMore = narrow ? modeLoaded < modeTotal : D.hasMore();

    shell.hidden = !hasRows;
    button.hidden = !displayHasMore;
    button.disabled = !!D.state.loading;
    if(!D.state.loading) button.textContent = '20명 더보기';

    if(narrow){
      info.textContent = Math.min(modeLoaded, modeTotal).toLocaleString('ko-KR')+' / '+modeTotal.toLocaleString('ko-KR')+'명';
    }else{
      info.textContent = 'PVE '+Math.min(pveLoaded,pveTotal).toLocaleString('ko-KR')+' / '+pveTotal.toLocaleString('ko-KR')+' · PVP '+Math.min(pvpLoaded,pvpTotal).toLocaleString('ko-KR')+' / '+pvpTotal.toLocaleString('ko-KR');
    }
    shell.classList.toggle('is-complete', !displayHasMore);
  }
  function setLoadMoreLoading(loading){
    const button = U.$('rankingLoadMoreBtn');
    if(!button) return;
    button.disabled = !!loading;
    button.textContent = loading ? '불러오는 중...' : '20명 더보기';
  }
  function render(){
    const board = U.$('rankingBoard');
    if(!board) return;
    const d = D.state.data || {};
    board.innerHTML = panelHtml('PVE', d.pveItems || [], d.pveTotalCount || 0) + panelHtml('PVP', d.pvpItems || [], d.pvpTotalCount || 0);
    board.dataset.mobileMode = D.state.mobileMode;

    const status = U.$('rankingStatus');
    if(status){
      const parts = ['직업 ' + D.state.className];
      if(D.state.search) parts.push('검색 ' + D.state.search);
      parts.push(D.state.includeSubs ? '부캐 포함' : '본캐만');
      parts.push(D.state.includeAllLegions ? '전체 레기온' : '기본 레기온');
      status.textContent = parts.join(' · ');
    }
    renderClassTabs();
    updateLoadMore();
  }
  function renderLoading(){
    const board = U.$('rankingBoard');
    if(board) board.innerHTML = '<div class="ranking-loading"><span class="kinojo-spinner"><span></span></span><span>레기온 전체 순위를 불러오는 중...</span></div>';
    const status = U.$('rankingStatus');
    if(status) status.textContent = '서버 순위 계산 결과를 요청하는 중...';
    const shell = U.$('rankingLoadMore');
    if(shell) shell.hidden = true;
  }
  function renderError(err){
    const board = U.$('rankingBoard');
    if(board) board.innerHTML = '<div class="ranking-empty error">레기온 전체 순위를 불러오지 못했습니다.<br>'+U.escapeHtml(err.message || err)+'</div>';
    const status = U.$('rankingStatus');
    if(status) status.textContent = '순위 로딩 실패';
    const shell = U.$('rankingLoadMore');
    if(shell) shell.hidden = true;
  }

  Ranking.render = { render, renderLoading, renderError, renderClassTabs, updateLoadMore, setLoadMoreLoading };
})();
