/*
 * KINOJO Ranking App Bootstrap
 * 역할: 레기온 전체 순위 페이지 조립/시작만 담당합니다.
 */
(function(){
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    const Ranking = window.KinojoRanking || {};
    if(!Ranking.utils || !Ranking.data || !Ranking.card || !Ranking.render || !Ranking.events){
      const board = document.getElementById('rankingBoard');
      if(board) board.innerHTML = '<div class="ranking-empty error">레기온 순위 스크립트 연결 오류</div>';
      return;
    }
    Ranking.events.bindStaticEvents();
    Ranking.render.renderClassTabs();
    Ranking.events.loadRanking();
  });
})();
