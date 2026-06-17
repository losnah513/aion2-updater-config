/*
 * KINOJO Hall of Fame bootstrap
 * 역할: 페이지 진입 후 전용 도로를 연결하고 최초 데이터를 로드합니다.
 * 규칙: 실제 업무는 hall-*.js 전용 파일에서 관리하고, 이 파일은 시작/조립만 담당합니다.
 */
(function initHallOfFamePage(){
  bindHallStaticEvents();
  startHallReactionCarouselTimer();
  recordDailyVisitOnce();
  load();
})();
