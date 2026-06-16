/*
 * KINOJO Hall of Fame bootstrap
 * 역할: 페이지 진입 후 전용 이벤트를 연결하고 최초 데이터를 로드합니다.
 * 규칙: 렌더링/관리자/반응/제안/공사중 로직은 각 전용 파일에서 관리합니다.
 */
(function initHallOfFamePage(){
  window.addEventListener("resize",()=>requestAnimationFrame(applyOverflowMarquee));

  const cancelSuggestBtn=document.getElementById("cancelSuggestBtn");
  if(cancelSuggestBtn){
    cancelSuggestBtn.onclick=()=>{
      const box=document.getElementById("suggestionBox");
      const title=document.getElementById("suggestTitle");
      const proposer=document.getElementById("suggestProposer");
      const memo=document.getElementById("suggestMemo");
      if(box)box.style.display="none";
      if(title)title.value="";
      if(proposer)proposer.value="";
      if(memo)memo.value="";
    };
  }

  const submitSuggestBtn=document.getElementById("submitSuggestBtn");
  if(submitSuggestBtn){
    submitSuggestBtn.onclick=async()=>{
      const title=document.getElementById("suggestTitle")?.value.trim()||"";
      const proposer=document.getElementById("suggestProposer")?.value.trim()||"";
      const memo=document.getElementById("suggestMemo")?.value.trim()||"";
      if(!title)return alert("항목 이름을 입력해 주세요.");
      const res=await fetch(WEB_APP_URL,{method:"POST",body:JSON.stringify({action:"hallSuggestion",title,proposer,memo})});
      const data=await res.json();
      if(!data.ok)return alert(data.message||"전송 실패");
      alert("제안이 접수되었습니다.");
      const box=document.getElementById("suggestionBox");
      if(box)box.style.display="none";
      load();
    };
  }

  bindConstructionNotice_();

  const footerSuggestBtn=document.getElementById("footerSuggestBtn");
  if(footerSuggestBtn)footerSuggestBtn.onclick=openSuggestionPanel;

  const adminMenuBtn=document.getElementById("adminMenuBtn");
  if(adminMenuBtn)adminMenuBtn.onclick=openAdminDropdown;

  const adminDropdownClose=document.getElementById("adminDropdownClose");
  if(adminDropdownClose)adminDropdownClose.onclick=closeAdminMenu;

  const adminLoginBtn=document.getElementById("adminLoginBtn");
  if(adminLoginBtn)adminLoginBtn.onclick=adminLogin;

  const adminPasswordInput=document.getElementById("adminPasswordInput");
  if(adminPasswordInput){
    adminPasswordInput.onkeydown=e=>{if(e.key==="Enter")adminLogin()};
  }

  const adminMvpBtn=document.getElementById("adminMvpBtn");
  if(adminMvpBtn)adminMvpBtn.onclick=adminMvp;

  document.querySelectorAll("[data-visit-target]").forEach(btn=>btn.onclick=()=>{
    document.querySelectorAll("[data-visit-target]").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
  });

  document.querySelectorAll("[data-visit-sign]").forEach(btn=>btn.onclick=()=>{
    document.querySelectorAll("[data-visit-sign]").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
  });

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
    };
  }

  const reactionDislikeBtn=document.getElementById("reactionDislikeBtn");
  if(reactionDislikeBtn){
    reactionDislikeBtn.onclick=()=>{
      currentReactionType="dislike";
      reactionDislikeBtn.classList.add("active","dislike-active");
      document.getElementById("reactionLikeBtn")?.classList.remove("active","like-active");
    };
  }

  const reactionCloseBtn=document.getElementById("reactionCloseBtn");
  if(reactionCloseBtn)reactionCloseBtn.onclick=closeReactionModal;

  const reactionCommentInput=document.getElementById("reactionComment");
  if(reactionCommentInput)reactionCommentInput.addEventListener("input",updateReactionSubmitState_);

  const reactionSubmitBtn=document.getElementById("reactionSubmitBtn");
  if(reactionSubmitBtn)reactionSubmitBtn.onclick=submitReaction;
  updateReactionSubmitState_();

  document.addEventListener("click",e=>{
    const pop=document.getElementById("reactionPopover");
    if(pop&&pop.style.display==="block"&&!pop.contains(e.target)&&!e.target.closest("[data-character]"))closeReactionModal();

    const menu=document.getElementById("adminDropdown");
    if(menu&&menu.classList.contains("open")&&!menu.contains(e.target)&&!e.target.closest("#adminMenuBtn"))closeAdminMenu();

    const notice=document.getElementById("constructionNotice");
    if(notice&&notice.classList.contains("open")&&e.target===notice)closeConstructionNotice();
  });

  document.addEventListener("keydown",e=>{
    if(e.key!=="Escape")return;
    const notice=document.getElementById("constructionNotice");
    const reaction=document.getElementById("reactionPopover");
    const admin=document.getElementById("adminDropdown");

    if(notice&&notice.classList.contains("open"))return closeConstructionNotice();
    if(reaction&&reaction.getAttribute("aria-hidden")==="false")return closeReactionModal();
    if(admin&&admin.classList.contains("open"))return closeAdminMenu();
  });

  setInterval(()=>{
    if(Date.now()<reactionCarouselPausedUntil)return;
    if(document.activeElement&&document.activeElement.id==="rankSearchInput")return;
    reactionCarouselIndex++;
    if(hallData)render();
  },60000);

  recordDailyVisitOnce();
  load();
})();
