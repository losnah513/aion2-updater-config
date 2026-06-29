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
  const search=document.getElementById('rankSearchInput');
  if(search&&!search.dataset.hallBound){
    search.dataset.hallBound='1';
    search.addEventListener('compositionstart',function(){searchComposing=true;});
    search.addEventListener('compositionend',function(){searchComposing=false;applyRankSearch_(search.value);});
    search.addEventListener('input',function(){
      if(searchComposing)return;
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer=setTimeout(function(){applyRankSearch_(search.value);},180);
    });
    search.addEventListener('keydown',function(e){
      if(e.key==='Enter'){
        e.preventDefault();
        applyRankSearch_(search.value);
      }
    });
  }

  ['rankRefreshBtn','rankHeadRefreshBtn'].forEach(function(id){
    const refresh=document.getElementById(id);
    if(refresh&&!refresh.dataset.hallBound){
      refresh.dataset.hallBound='1';
      refresh.addEventListener('click',function(){load();});
    }
  });

  const clear=document.getElementById('rankClearBtn');
  if(clear&&!clear.dataset.hallBound){
    clear.dataset.hallBound='1';
    clear.addEventListener('click',function(){
      keyword='';
      page=1;
      const input=document.getElementById('rankSearchInput');
      if(input)input.value='';
      reloadHallRankingView();
    });
  }

  document.querySelectorAll('[data-rank-mode]').forEach(function(btn){
    if(btn.dataset.hallBound)return;
    btn.dataset.hallBound='1';
    btn.addEventListener('click',function(){
      const next=String(btn.dataset.rankMode||'PVE').toUpperCase();
      if(next!==activeRankMode){
        activeRankMode=next==='PVP'?'PVP':'PVE';
        page=1;
        reloadHallRankingView();
      }
    });
  });

  const sub=document.getElementById('subToggle');
  if(sub&&!sub.dataset.hallBound){
    sub.dataset.hallBound='1';
    sub.addEventListener('click',function(){
      includeSubs=!includeSubs;
      page=1;
      reloadHallRankingView();
    });
  }

  document.querySelectorAll('[data-rank-class]').forEach(function(btn){
    if(btn.dataset.hallBound)return;
    btn.dataset.hallBound='1';
    btn.addEventListener('click',function(){
      activeRankClass=btn.dataset.rankClass||'전체';
      page=1;
      reloadHallRankingView();
    });
  });

  document.querySelectorAll('[data-rank-page]').forEach(function(btn){
    if(btn.dataset.hallBound)return;
    btn.dataset.hallBound='1';
    btn.addEventListener('click',function(){
      const next=Number(btn.dataset.rankPage||1);
      if(Number.isFinite(next)&&next>0){
        page=next;
        reloadHallRankingView();
        document.getElementById('hallSlotOverall')?.scrollIntoView({behavior:'smooth',block:'start'});
      }
    });
  });
}

function applyRankSearch_(value){
  keyword=String(value||'').trim();
  page=1;
  reloadHallRankingView();
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
