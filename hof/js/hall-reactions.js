/*
 * KINOJO Hall of Fame reaction road
 * 역할: 캐릭터 반응 팝오버, 로컬 제한, 서버 저장을 관리합니다.
 */
function positionReactionPopover(anchor,pop){
  if(!pop)return;
  pop.style.position="fixed";
  pop.style.left="50%";
  pop.style.top="50%";
  pop.style.width="";
  pop.dataset.fixedLeft="center";
  pop.dataset.fixedTop="center";
}
function closeReactionModal(){hideCharacterPreview_();const pop=document.getElementById("reactionPopover");if(pop){pop.style.display="none";pop.setAttribute("aria-hidden","true")}document.body.classList.remove("reaction-popover-open");currentReactionItem=null}
function getVisitorId(){let id=localStorage.getItem("kinojoVisitorId");if(!id){id="v_"+Date.now()+"_"+Math.random().toString(36).slice(2);localStorage.setItem("kinojoVisitorId",id)}return id}
function todayKey(){return new Date().toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"})}
function checkLocalReactionLimit(name,type){const day=todayKey();const sameKey="kinojo_react_"+day+"_"+name+"_"+type;const countKey="kinojo_react_count_"+day+"_"+type;if(localStorage.getItem(sameKey)==="1")return "같은 캐릭터에게 같은 반응은 하루 1번만 남길 수 있습니다.";const count=Number(localStorage.getItem(countKey)||"0");if(count>=3)return (type==="like"?"좋아요":"싫어요")+"는 하루 3번까지만 남길 수 있습니다.";return ""}
function markLocalReaction(name,type){const day=todayKey();const sameKey="kinojo_react_"+day+"_"+name+"_"+type;const countKey="kinojo_react_count_"+day+"_"+type;localStorage.setItem(sameKey,"1");localStorage.setItem(countKey,String(Number(localStorage.getItem(countKey)||"0")+1))}
function findHallCharacterByName(name){
  const target=String(name||"").trim();
  if(!target)return {name:""};
  const groups=[
    hallData?.overallAll,
    hallData?.overallMain,
    hallData?.demonFamilyAll,
    hallData?.demonFamily,
    hallData?.partyFriendAll,
    hallData?.partyFriend,
    hallData?.newChicks,
    hallData?.growthTop,
    hallData?.bulkTop,
    hallData?.pveTop,
    hallData?.pvpTop,
    hallData?.mvpCandidatesTop3,
    hallData?.mvp?[hallData.mvp]:[]
  ];
  for(const group of groups){
    const found=(group||[]).find(item=>String(item?.name||"").trim()===target);
    if(found)return found;
  }
  return {name:target};
}
function getCharacterPreviewTooltip_(){
  let tooltip=document.getElementById("characterPreviewTooltip");
  if(tooltip)return tooltip;
  tooltip=document.createElement("div");
  tooltip.id="characterPreviewTooltip";
  tooltip.className="character-preview-tooltip";
  tooltip.setAttribute("aria-hidden","true");
  tooltip.innerHTML='<div class="character-preview-avatar"></div><div class="character-preview-name"></div>';
  document.body.appendChild(tooltip);
  return tooltip;
}
function hideCharacterPreview_(){
  const tooltip=document.getElementById("characterPreviewTooltip");
  if(!tooltip)return;
  tooltip.classList.remove("is-visible");
  tooltip.setAttribute("aria-hidden","true");
}
function showCharacterPreview_(item,anchor){
  const imageUrl=String(item?.profileImageUrl||"").trim();
  if(!imageUrl||!anchor)return;
  const tooltip=getCharacterPreviewTooltip_();
  const avatar=tooltip.querySelector(".character-preview-avatar");
  const name=tooltip.querySelector(".character-preview-name");
  if(avatar)avatar.innerHTML='<img src="'+imageUrl.replace(/"/g,"%22")+'" alt="">';
  if(name)name.textContent=item?.name||"캐릭터";
  const rect=anchor.getBoundingClientRect();
  const size=116;
  let left=rect.left+(rect.width/2)-(size/2);
  left=Math.max(12,Math.min(window.innerWidth-size-12,left));
  let top=rect.top-size-12;
  if(top<12)top=rect.bottom+12;
  tooltip.style.left=left+"px";
  tooltip.style.top=top+"px";
  tooltip.classList.add("is-visible");
  tooltip.setAttribute("aria-hidden","false");
}
async function bindCharacterButtons(){document.querySelectorAll("[data-character]").forEach(btn=>{btn.onclick=ev=>{ev.stopPropagation();const name=btn.dataset.character;const found=findHallCharacterByName(name);openReactionModal(found,btn)};btn.onmouseenter=()=>showCharacterPreview_(findHallCharacterByName(btn.dataset.character),btn);btn.onmouseleave=hideCharacterPreview_;btn.onfocus=()=>showCharacterPreview_(findHallCharacterByName(btn.dataset.character),btn);btn.onblur=hideCharacterPreview_;});document.querySelectorAll("[data-reaction-card]").forEach(card=>{card.onclick=()=>{reactionCarouselPausedUntil=Date.now()+10000}})}


/* knj-infoweb(v_260603_01) reaction submit guard patch */
function updateReactionSubmitState_(){
  const input=document.getElementById("reactionComment");
  const submitBtn=document.getElementById("reactionSubmitBtn");
  if(!input||!submitBtn)return;
  const hasComment=input.value.trim().length>0;
  submitBtn.disabled=reactionSubmitting||!hasComment;
  submitBtn.classList.toggle("is-sending",!!reactionSubmitting);
}
function openReactionModal(item,anchor){
  hideCharacterPreview_();
  reactionSubmitting=false;
  currentReactionItem=item;
  currentReactionType="like";
  if(window.KinojoCharacterReaction){
    window.KinojoCharacterReaction.open({
      source:"hall",
      context:"hall",
      limitPrefix:"kinojo_react",
      target:{
        name:item?.name||"캐릭터",
        owner:item?.owner||"",
        className:item?.className||item?.class_name||"",
        server:item?.serverName||item?.server_name||item?.meta||"",
        serverId:item?.serverId||item?.server_id||"",
        charKey:item?.charKey||item?.char_key||"",
        pvePower:item?.pvePower||item?.pve_power||item?.latest_pve_combat_power||"",
        pvpPower:item?.pvpPower||item?.pvp_power||item?.latest_pvp_combat_power||"",
        profileImageUrl:item?.profileImageUrl||item?.profile_image_url||"",
        classIconUrl:item?.classIconUrl||item?.class_icon_url||"",
        detailUrl:item?.detailUrl||item?.detail_url||""
      },
      onSubmit:async function(payload){
        const data=await window.KinojoApi.postAction("hallReaction",{
          characterName:payload.target.name,
          owner:payload.target.owner||"",
          className:payload.target.className||"",
          reaction:payload.reaction,
          comment:payload.comment,
          clientKey:payload.clientKey,
          sessionToken:payload.sessionToken
        });
        return data;
      },
      onSuccess:function(data){
        if(data.summary&&hallData)hallData.reactionSummary=data.summary;
        setTimeout(function(){renderReactionOnly();renderOverallOnly()},430);
      }
    });
    return;
  }

  if(window.KinojoAuth && !window.KinojoAuth.requireLogin('로그인 후 좋아요·싫어요를 남길 수 있습니다.', {context:'hall'})){
    return;
  }
  reactionSubmitting=false;
  currentReactionItem=item;
  currentReactionType="like";
  const title=document.getElementById("reactionModalTitle");
  const input=document.getElementById("reactionComment");
  const profileImage=document.getElementById("reactionProfileImage");
  const profileName=document.getElementById("reactionProfileName");
  const profileSub=document.getElementById("reactionProfileSub");
  const detailLink=document.getElementById("reactionDetailLink");
  const imageUrl=String(item?.profileImageUrl||"").trim();
  const detailUrl=String(item?.detailUrl||"").trim();
  if(title)title.textContent=(item?.name||"캐릭터")+"님께 한마디";
  if(profileName)profileName.textContent=item?.name||"캐릭터";
  if(profileSub)profileSub.textContent=[item?.className||"",item?.meta||item?.serverName||""].filter(Boolean).join(" · ")||"좋아요·싫어요를 남겨보세요";
  if(detailLink){
    if(detailUrl){
      detailLink.href=detailUrl;
      detailLink.style.display="inline-flex";
      detailLink.setAttribute("aria-label",(item?.name||"캐릭터")+" 아이온2 캐릭터 정보실 열기");
    }else{
      detailLink.removeAttribute("href");
      detailLink.style.display="none";
    }
  }
  if(profileImage){
    if(imageUrl){
      profileImage.classList.remove("is-empty");
      profileImage.innerHTML='<img src="'+imageUrl.replace(/"/g,"%22")+'" alt="">';
    }else{
      profileImage.classList.add("is-empty");
      profileImage.textContent="PROFILE";
    }
  }
  if(input){
    input.value="";
    input.oninput=updateReactionSubmitState_;
  }
  const status=document.getElementById("reactionStatus");
  if(status)status.textContent="";
  const likeBtn=document.getElementById("reactionLikeBtn");
  const dislikeBtn=document.getElementById("reactionDislikeBtn");
  if(likeBtn)likeBtn.classList.add("active","like-active");
  if(dislikeBtn)dislikeBtn.classList.remove("active","dislike-active");
  updateReactionSubmitState_();
  setReactionLimitLoading_();
  const pop=document.getElementById("reactionPopover");
  document.body.classList.add("reaction-popover-open");
  pop.style.display="block";
  pop.setAttribute("aria-hidden","false");
  positionReactionPopover(anchor||document.body,pop);
  setTimeout(updateReactionSubmitState_,0);
}
async function submitReaction(){
  if(!currentReactionItem||reactionSubmitting)return;
  const submitBtn=document.getElementById("reactionSubmitBtn");
  const status=document.getElementById("reactionStatus");
  const input=document.getElementById("reactionComment");
  const comment=(input?.value||"").trim().slice(0,20);
  if(!comment){
    if(status)status.textContent="전하고 싶은 말을 입력해 주세요.";
    updateReactionSubmitState_();
    return;
  }
  const limitMessage=checkLocalReactionLimit(currentReactionItem.name,currentReactionType);
  if(limitMessage){
    if(status)status.textContent=limitMessage;else alert(limitMessage);
    updateReactionSubmitState_();
    return;
  }
  try{
    if(window.KinojoAuth && !window.KinojoAuth.requireLogin('로그인 후 좋아요·싫어요를 남길 수 있습니다.', {context:'hall'})){
      updateReactionSubmitState_();
      return;
    }
    reactionSubmitting=true;
    updateReactionSubmitState_();
    if(status)status.textContent="전송 중...";
    const sessionToken=window.KinojoAuth?window.KinojoAuth.getToken():"";
    const data=await window.KinojoApi.postAction("hallReaction",{characterName:currentReactionItem.name,owner:currentReactionItem.owner||"",className:currentReactionItem.className||"",reaction:currentReactionType,comment:comment,clientKey:getVisitorId(),sessionToken:sessionToken});
    if(!data.ok){
      if(data.authRequired&&window.KinojoAuth)window.KinojoAuth.openLoginModal(data.message||"로그인 후 이용할 수 있습니다.", {context:"hall"});
      if(status)status.textContent=data.message||"저장 실패";else alert(data.message||"저장 실패");
      return;
    }
    markLocalReaction(currentReactionItem.name,currentReactionType);
    if(data.summary&&hallData)hallData.reactionSummary=data.summary;
    if(status)status.textContent="한마디가 전달되었어요.";
    setTimeout(()=>{closeReactionModal();renderReactionOnly();renderOverallOnly()},380);
  }catch(e){
    if(status)status.textContent="반응 저장 실패: "+(e.message||e);else alert("반응 저장 실패: "+(e.message||e));
  }finally{
    reactionSubmitting=false;
    updateReactionSubmitState_();
  }
}


function setReactionLimitLoading_(){
  const comment=document.getElementById("reactionComment");
  if(comment){
    comment.value="";
    comment.placeholder="남은 좋아요/싫어요 횟수 계산 중...";
  }
  ["reactionLikeBtn","reactionDislikeBtn"].forEach(id=>{
    const btn=document.getElementById(id);
    if(btn)btn.classList.add("checking");
  });
  setTimeout(()=>{
    const likeBtn=document.getElementById("reactionLikeBtn");
    const dislikeBtn=document.getElementById("reactionDislikeBtn");
    if(likeBtn)likeBtn.classList.remove("checking");
    if(dislikeBtn)dislikeBtn.classList.remove("checking");
    const c=document.getElementById("reactionComment");
    if(c)c.placeholder="전하고 싶은 말을 남겨주세요";
  },450);
}
