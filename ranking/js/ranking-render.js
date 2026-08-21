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
      + '<button class="ranking-my-rank-jump" data-my-rank="'+mode+'" type="button"><span>내 캐릭터 순위 보기</span><small aria-live="polite">로그인 캐릭터로 이동</small><i aria-hidden="true">↓</i></button>'
      + '<div class="ranking-scroll-shell" data-scroll-shell="'+mode+'">'
      + '<div class="ranking-card-list" data-scroll-list="'+mode+'" tabindex="0" aria-label="'+mode+' 전투력 순위 목록">'
      + (items.length ? items.map(row => Ranking.card.cardHtml(row, mode)).join('') : '<div class="ranking-empty is-list-empty">조건에 맞는 캐릭터가 없습니다.</div>')
      + '</div></div>'
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
    board.dataset.mobileMode = D.state.mobileMode;
    board.setAttribute('aria-busy','false');
    window.KinojoStagedLoading?.ready?.('#rankingBoard');
    renderClassTabs();
  }
  function renderLoading(){
    const board = U.$('rankingBoard');
    if(board){
      board.setAttribute('aria-busy','true');
      board.innerHTML = '<div class="ranking-loading"><span class="kinojo-spinner"><span></span></span><span>레기온 전체 순위를 불러오는 중...</span></div>';
    }
    window.KinojoStagedLoading?.region?.('#rankingBoard','레기온 순위');
  }
  function renderError(err){
    const board = U.$('rankingBoard');
    if(board){
      board.setAttribute('aria-busy','false');
      board.innerHTML = '<div class="ranking-empty error">레기온 전체 순위를 불러오지 못했습니다.<br>'+U.escapeHtml(err.message || err)+'</div>';
    }
    window.KinojoStagedLoading?.failed?.('#rankingBoard');
  }

  Ranking.render = { render, renderLoading, renderError, renderClassTabs };
})();
