/*
 * KINOJO Hall of Fame reaction road
 * 역할: 캐릭터 반응 팝오버, 로컬 제한, 서버 저장을 관리합니다.
 */
function positionReactionPopover(anchor,pop){
  const rect=anchor.getBoundingClientRect();
  const w=Math.min(320,Math.max(260,window.innerWidth-24));
  let left=Math.min(window.innerWidth-w-12,Math.max(12,rect.left));
  let top=rect.bottom+8;
  const h=Math.min(270,pop.offsetHeight||250);
  if(top+h>window.innerHeight-12) top=Math.max(12,rect.top-h-8);
  pop.style.position="fixed";
  pop.style.width=w+"px";
  pop.style.left=left+"px";
  pop.style.top=top+"px";
  pop.dataset.fixedLeft=String(left);
  pop.dataset.fixedTop=String(top);
}
function closeReactionModal(){const pop=document.getElementById("reactionPopover");if(pop){pop.style.display="none";pop.setAttribute("aria-hidden","true")}currentReactionItem=null}
function getVisitorId(){let id=localStorage.getItem("kinojoVisitorId");if(!id){id="v_"+Date.now()+"_"+Math.random().toString(36).slice(2);localStorage.setItem("kinojoVisitorId",id)}return id}
function todayKey(){return new Date().toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"})}
function checkLocalReactionLimit(name,type){const day=todayKey();const sameKey="kinojo_react_"+day+"_"+name+"_"+type;const countKey="kinojo_react_count_"+day+"_"+type;if(localStorage.getItem(sameKey)==="1")return "같은 캐릭터에게 같은 반응은 하루 1번만 남길 수 있습니다.";const count=Number(localStorage.getItem(countKey)||"0");if(count>=3)return (type==="like"?"좋아요":"싫어요")+"는 하루 3번까지만 남길 수 있습니다.";return ""}
function markLocalReaction(name,type){const day=todayKey();const sameKey="kinojo_react_"+day+"_"+name+"_"+type;const countKey="kinojo_react_count_"+day+"_"+type;localStorage.setItem(sameKey,"1");localStorage.setItem(countKey,String(Number(localStorage.getItem(countKey)||"0")+1))}
async function bindCharacterButtons(){document.querySelectorAll("[data-character]").forEach(btn=>{btn.onclick=ev=>{ev.stopPropagation();const name=btn.dataset.character;const all=[...(hallData?.overallAll||[]),...(hallData?.overallMain||[])];const found=all.find(x=>x.name===name)||{name};openReactionModal(found,btn)}});document.querySelectorAll("[data-reaction-card]").forEach(card=>{card.onclick=()=>{reactionCarouselPausedUntil=Date.now()+10000}})}


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
  reactionSubmitting=false;
  currentReactionItem=item;
  currentReactionType="like";
  const title=document.getElementById("reactionModalTitle");
  const input=document.getElementById("reactionComment");
  if(title)title.textContent=(item?.name||"캐릭터")+"님께 한마디";
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
    reactionSubmitting=true;
    updateReactionSubmitState_();
    if(status)status.textContent="전송 중...";
    const res=await fetch(WEB_APP_URL,{method:"POST",body:JSON.stringify({action:"hallReaction",characterName:currentReactionItem.name,owner:currentReactionItem.owner||"",className:currentReactionItem.className||"",reaction:currentReactionType,comment:comment,clientKey:getVisitorId()})});
    const data=await res.json();
    if(!data.ok){
      if(status)status.textContent=data.message||"저장 실패";else alert(data.message||"저장 실패");
      return;
    }
    markLocalReaction(currentReactionItem.name,currentReactionType);
    if(data.summary&&hallData)hallData.reactionSummary=data.summary;
    if(status)status.textContent="한마디가 전달되었어요.";
    setTimeout(()=>{closeReactionModal();render()},380);
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
