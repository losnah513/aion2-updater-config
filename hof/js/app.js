/*
 * KINOJO Hall of Fame bootstrap
 * 역할: 페이지 진입 후 전용 도로를 연결하고 최초 데이터를 로드합니다.
 * 규칙: 실제 업무는 hall-*.js 전용 파일에서 관리하고, 이 파일은 시작/조립만 담당합니다.
 * 260617 교통정리 4차 재진행: 필수 연결 함수 검증 범위를 보강합니다.
 */
(function initHallOfFamePage(){
  if(window.__KINOJO_HALL_INIT_DONE__){
    console.warn("KINOJO Hall init skipped: already initialized");
    return;
  }

  if(!document.getElementById("app")){
    console.error("KINOJO Hall init stopped: #app element is missing");
    return;
  }

  const requiredFunctions=[
    // state/helpers
    "escapeHtml",
    "match",

    // summary render road
    "render",
    "renderChicks",

    // data road
    "load",

    // event road
    "bindHallStaticEvents",
    "bindHallDynamicEvents",
    "applyOverflowMarquee",

    // reaction road
    "bindCharacterButtons",
    "closeReactionModal",
    "submitReaction",

    // admin/suggestion roads
    "openAdminDropdown",
    "closeAdminMenu",
    "openSuggestionPanel"
  ];

  const missing=requiredFunctions.filter(name=>typeof window[name]!=="function");
  if(missing.length){
    const appEl=document.getElementById("app");
    const message="명예의 전당 스크립트 연결 오류: "+missing.join(", ");
    console.error(message);
    if(appEl){
      appEl.className="";
      appEl.innerHTML='<div class="empty">'+message+'</div>';
    }
    return;
  }

  window.__KINOJO_HALL_INIT_DONE__=true;

  bindHallStaticEvents();
  window.addEventListener('kinojo:auth-changed',()=>window.reloadHallAfterAuthChange?.());
  load();
})();
