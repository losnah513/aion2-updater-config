/*
 * KINOJO Hall of Fame event road
 * 역할: 명예의 전당 정적/동적 이벤트와 오버플로 텍스트 마키, 반응 카드 자동 순환을 관리합니다.
 * 주의: 레거시 공사중 팝업(openConstructionNotice)은 제거되었으므로 이 파일에서 되살리지 않습니다.
 */
function bindHallStaticEvents(){
  if(window.__KINOJO_HALL_STATIC_EVENTS_BOUND__)return;
  window.__KINOJO_HALL_STATIC_EVENTS_BOUND__=true;

  const includeSubsToggle=document.getElementById('hofIncludeSubs');
  const includeAllLegionsToggle=document.getElementById('hofIncludeAllLegions');
  const filterStatus=document.getElementById('hofFilterStatus');
  const syncFilterStatus=()=>{
    if(filterStatus)filterStatus.textContent=(includeAllLegions?'전체 레기온':'기본 레기온')+' · '+(includeSubs?'부캐 포함':'본캐만');
  };
  if(includeSubsToggle){
    includeSubsToggle.checked=includeSubs;
    includeSubsToggle.addEventListener('change',()=>{includeSubs=includeSubsToggle.checked;syncFilterStatus();load();});
  }
  if(includeAllLegionsToggle){
    includeAllLegionsToggle.checked=includeAllLegions;
    includeAllLegionsToggle.addEventListener('change',()=>{includeAllLegions=includeAllLegionsToggle.checked;syncFilterStatus();load();});
  }
  syncFilterStatus();

  const footerSuggestBtn=document.getElementById('footerSuggestBtn');
  if(footerSuggestBtn)footerSuggestBtn.addEventListener('click',function(e){
    e.preventDefault();
    openSuggestionPanel();
  });

  const closeBtn=document.getElementById('reactionCloseBtn');
  if(closeBtn)closeBtn.addEventListener('click',function(e){
    e.preventDefault();
    closeReactionModal();
  });

  const likeBtn=document.getElementById('reactionLikeBtn');
  const dislikeBtn=document.getElementById('reactionDislikeBtn');
  if(likeBtn)likeBtn.addEventListener('click',function(){
    currentReactionType='like';
    likeBtn.classList.add('active','like-active');
    if(dislikeBtn)dislikeBtn.classList.remove('active','dislike-active');
    updateReactionSubmitState_();
  });
  if(dislikeBtn)dislikeBtn.addEventListener('click',function(){
    currentReactionType='dislike';
    dislikeBtn.classList.add('active','dislike-active');
    if(likeBtn)likeBtn.classList.remove('active','like-active');
    updateReactionSubmitState_();
  });

  const submitBtn=document.getElementById('reactionSubmitBtn');
  if(submitBtn)submitBtn.addEventListener('click',function(e){
    e.preventDefault();
    submitReaction();
  });

  document.addEventListener('click',function(e){
    const toggle=e.target.closest('[data-hof-period-toggle]');
    if(toggle){
      e.preventDefault();
      const popover=document.getElementById('hofPeriodPopover');
      if(!popover)return;
      const willOpen=popover.hidden;
      closeHallPeriodPopover();
      if(willOpen){
        popover.hidden=false;
        popover.setAttribute('aria-hidden','false');
        toggle.setAttribute('aria-expanded','true');
      }
      return;
    }
    if(!e.target.closest('[data-hof-period]'))closeHallPeriodPopover();
    if(e.target.closest('#hofMyRankingLoginBtn'))window.KinojoAuth?.openLoginModal?.();
  });

  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'){
      closeReactionModal();
      closeHallPeriodPopover();
    }
  });

  bindInlineSuggestionPanel();
}

function closeHallPeriodPopover(){
  const popover=document.getElementById('hofPeriodPopover');
  const toggle=document.querySelector('[data-hof-period-toggle]');
  if(popover){popover.hidden=true;popover.setAttribute('aria-hidden','true');}
  if(toggle)toggle.setAttribute('aria-expanded','false');
}

function bindHallDynamicEvents(){
  // STEP 2-1: /hof는 요약 쇼케이스 전용이다.
  // 전체 랭킹 검색/필터/페이지네이션 이벤트는 STEP 3 /ranking 전용으로 분리한다.
  bindCharacterButtons();
}

function applyOverflowMarquee(){
  document.querySelectorAll('.flow-candidate').forEach(function(el){
    const overflow=el.scrollWidth>el.clientWidth+2;
    el.classList.toggle('marquee',overflow);
    if(overflow){
      const shift=Math.min(160,Math.max(32,el.scrollWidth-el.clientWidth+24));
      el.style.setProperty('--marquee-shift','-'+shift+'px');
    }else{
      el.style.removeProperty('--marquee-shift');
    }
  });
}
