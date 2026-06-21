/*
 * KINOJO Hall of Fame event road
 * 역할: 정적/동적 이벤트 연결, 검색 포커스 보존, 전체 클릭/ESC 처리를 담당합니다.
 * 주의: 데이터 통신/HTML 렌더링/서버 저장 로직은 각 전용 파일로 위임합니다.
 */
function renderPreserveSearchFocus(){
  const input=document.getElementById("rankSearchInput");
  const value=String(input?.value??keyword);
  const selectionStart=input?.selectionStart??value.length;
  const selectionEnd=input?.selectionEnd??value.length;
  renderOverallOnly();
  requestAnimationFrame(()=>{
    const next=document.getElementById("rankSearchInput");
    if(!next)return;
    next.focus();
    try{next.setSelectionRange(selectionStart,selectionEnd)}catch(e){}
  });
}

function bindHallDynamicEvents(){
  document.querySelectorAll("[data-rank-page]").forEach(btn=>btn.onclick=()=>{
    const total=Math.max(1,Math.ceil(currentRankList().length/PAGE_SIZE));
    page=Math.max(1,Math.min(total,Number(btn.dataset.rankPage||1)));
    renderOverallOnly();
  });

  document.querySelectorAll("[data-rank-class]").forEach(btn=>btn.onclick=()=>{
    activeRankClass=btn.dataset.rankClass;
    page=1;
    renderOverallOnly();
  });

  const search=document.getElementById("rankSearchInput");
  if(search){
    search.oncompositionstart=()=>{searchComposing=true;clearTimeout(searchDebounceTimer)};
    search.oncompositionend=()=>{searchComposing=false};
    search.oninput=()=>{};
    search.onkeydown=e=>{
      if(e.key==="Enter"&&!searchComposing){
        keyword=search.value.trim();
        page=1;
        renderPreserveSearchFocus();
      }
    };
  }

  const refresh=document.getElementById("rankRefreshBtn");
  if(refresh)refresh.onclick=()=>{
    const input=document.getElementById("rankSearchInput");
    keyword=String(input?.value||"").trim();
    page=1;
    renderPreserveSearchFocus();
  };

  const clear=document.getElementById("rankClearBtn");
  if(clear)clear.onclick=()=>{
    keyword="";
    page=1;
    renderOverallOnly();
  };

  const sub=document.getElementById("subToggle");
  if(sub)sub.onclick=()=>{
    const savedY=window.scrollY;
    includeSubs=!includeSubs;
    page=1;
    sub.classList.toggle("on",includeSubs);
    const t=sub.querySelector(".toggle-text");
    if(t)t.textContent=includeSubs?"부캐 ON":"부캐 OFF";
    setTimeout(()=>{renderOverallOnly();requestAnimationFrame(()=>window.scrollTo(0,savedY))},260);
  };
}

function applyOverflowMarquee(){
  document.querySelectorAll(".flow-candidate").forEach(el=>{
    el.classList.remove("marquee");
    el.style.removeProperty("--marquee-shift");
    const parent=el.parentElement;
    if(!parent)return;
    const overflow=el.scrollWidth-parent.clientWidth;
    if(overflow>2){
      el.style.setProperty("--marquee-shift","-"+(overflow+12)+"px");
      el.classList.add("marquee");
    }
  });
}

function bindHallVisitAdminToggles(){
  document.querySelectorAll("[data-visit-target]").forEach(btn=>btn.onclick=()=>{
    document.querySelectorAll("[data-visit-target]").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
  });

  document.querySelectorAll("[data-visit-sign]").forEach(btn=>btn.onclick=()=>{
    document.querySelectorAll("[data-visit-sign]").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
  });
}

function bindHallStaticEvents(){
  if(window.__KINOJO_HALL_STATIC_EVENTS_BOUND__)return;
  window.__KINOJO_HALL_STATIC_EVENTS_BOUND__=true;

  window.addEventListener("resize",()=>requestAnimationFrame(applyOverflowMarquee));

  bindInlineSuggestionPanel();
  bindConstructionNotice_();
  bindHallVisitAdminToggles();

  const footerSuggestBtn=document.getElementById("footerSuggestBtn");
  if(footerSuggestBtn)footerSuggestBtn.onclick=openSuggestionPanel;

  // 관리 패널 열기/닫기는 공통 UI(kinojo-common-ui.js)에서만 담당한다.
  // Hall 전용 onclick을 다시 걸면 공통 toggle과 충돌해 버튼이 즉시 닫히는 문제가 생긴다.

  const adminLoginBtn=document.getElementById("adminLoginBtn");
  if(adminLoginBtn)adminLoginBtn.onclick=adminLogin;

  const adminPasswordInput=document.getElementById("adminPasswordInput");
  if(adminPasswordInput){
    adminPasswordInput.onkeydown=e=>{if(e.key==="Enter")adminLogin()};
  }

  const adminMvpBtn=document.getElementById("adminMvpBtn");
  if(adminMvpBtn)adminMvpBtn.onclick=adminMvp;

  const adminVisitCancelBtn=document.getElementById("adminVisitCancelBtn");
  if(adminVisitCancelBtn){
    adminVisitCancelBtn.onclick=()=>{
      const st=document.getElementById("adminVisitStatus");
      const amount=document.getElementById("adminVisitAmount");
      if(st){st.className="admin-status";st.textContent="";}
      if(amount)amount.value="1";
    };
  }

  const adminVisitApplyBtn=document.getElementById("adminVisitApplyBtn");
  if(adminVisitApplyBtn)adminVisitApplyBtn.onclick=adminVisitAdjust;

  const adminSnapshotBtn=document.getElementById("adminSnapshotBtn");
  if(adminSnapshotBtn)adminSnapshotBtn.onclick=adminSnapshot;

  const adminSnapshotTrigger=document.getElementById("adminSnapshotTriggerBtn");
  if(adminSnapshotTrigger)adminSnapshotTrigger.onclick=adminSnapshotTriggerInstall;

  const reactionLikeBtn=document.getElementById("reactionLikeBtn");
  if(reactionLikeBtn){
    reactionLikeBtn.onclick=()=>{
      currentReactionType="like";
      reactionLikeBtn.classList.add("active","like-active");
      document.getElementById("reactionDislikeBtn")?.classList.remove("active","dislike-active");
      updateReactionSubmitState_();
    };
  }

  const reactionDislikeBtn=document.getElementById("reactionDislikeBtn");
  if(reactionDislikeBtn){
    reactionDislikeBtn.onclick=()=>{
      currentReactionType="dislike";
      reactionDislikeBtn.classList.add("active","dislike-active");
      document.getElementById("reactionLikeBtn")?.classList.remove("active","like-active");
      updateReactionSubmitState_();
    };
  }

  const reactionCloseBtn=document.getElementById("reactionCloseBtn");
  if(reactionCloseBtn)reactionCloseBtn.onclick=closeReactionModal;

  const reactionCommentInput=document.getElementById("reactionComment");
  if(reactionCommentInput)reactionCommentInput.oninput=updateReactionSubmitState_;

  const reactionSubmitBtn=document.getElementById("reactionSubmitBtn");
  if(reactionSubmitBtn)reactionSubmitBtn.onclick=submitReaction;
  updateReactionSubmitState_();

  document.addEventListener("click",handleHallDocumentClick);
  document.addEventListener("keydown",handleHallKeydown);
}

function handleHallDocumentClick(e){
  const pop=document.getElementById("reactionPopover");
  if(pop&&pop.style.display==="block"&&!pop.contains(e.target)&&!e.target.closest("[data-character]"))closeReactionModal();

  const menu=document.getElementById("adminDropdown");
  if(menu&&menu.classList.contains("open")&&!menu.contains(e.target)&&!e.target.closest("#adminMenuBtn"))closeAdminMenu();

  const notice=document.getElementById("constructionNotice");
  if(notice&&notice.classList.contains("open")&&e.target===notice)closeConstructionNotice();
}

function handleHallKeydown(e){
  if(e.key!=="Escape")return;
  const notice=document.getElementById("constructionNotice");
  const reaction=document.getElementById("reactionPopover");
  const admin=document.getElementById("adminDropdown");

  if(notice&&notice.classList.contains("open"))return closeConstructionNotice();
  if(reaction&&reaction.getAttribute("aria-hidden")==="false")return closeReactionModal();
  if(admin&&admin.classList.contains("open"))return closeAdminMenu();
}

function startHallReactionCarouselTimer(){
  if(window.__KINOJO_HALL_REACTION_TIMER__)return;
  window.__KINOJO_HALL_REACTION_TIMER__=setInterval(()=>{
    if(Date.now()<reactionCarouselPausedUntil)return;
    if(document.activeElement&&document.activeElement.id==="rankSearchInput")return;
    reactionCarouselIndex++;
    if(hallData)renderReactionOnly();
  },60000);
}
