/*
 * KINOJO Hall of Fame event road
 * 역할: 명예의 전당 정적/동적 이벤트와 오버플로 텍스트 마키, 반응 카드 자동 순환을 관리합니다.
 * 주의: 레거시 공사중 팝업(openConstructionNotice)은 제거되었으므로 이 파일에서 되살리지 않습니다.
 */
function bindHallStaticEvents(){
  if(window.__KINOJO_HALL_STATIC_EVENTS_BOUND__)return;
  window.__KINOJO_HALL_STATIC_EVENTS_BOUND__=true;

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

  document.addEventListener('keydown',function(e){
    if(e.key==='Escape')closeReactionModal();
  });

  bindInlineSuggestionPanel();
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

function startHallReactionCarouselTimer(){
  if(window.__KINOJO_HALL_REACTION_TIMER__)return;
  window.__KINOJO_HALL_REACTION_TIMER__=window.setInterval(function(){
    if(Date.now()<reactionCarouselPausedUntil)return;
    reactionCarouselIndex+=1;
    renderReactionOnly();
  },6000);
}
