/*
 * KINOJO Hall of Fame suggestion road
 * 역할: 하단/사이드 제안 패널과 기존 인라인 제안 박스를 관리합니다.
 * 주의: 같은 hallSuggestion action 호출은 이 파일에서만 수행합니다.
 */
function openSuggestionPanel(){
  const panel=document.getElementById("drawerPagePanel");
  const title=document.getElementById("drawerPageTitle");
  const body=document.getElementById("drawerPageBody");
  if(title)title.textContent="아이디어 제안 및 건의";
  if(body){
    body.innerHTML='<div class="side-suggest-form">'
      + '<label>항목 이름<input class="search" id="sideSuggestTitle" placeholder="항목 이름"></label>'
      + '<label>제안자<input class="search" id="sideSuggestProposer" placeholder="제안자"></label>'
      + '<label>기준 설명<textarea class="search" id="sideSuggestMemo" rows="4" placeholder="기준 설명"></textarea></label>'
      + '<button class="btn side-suggest-submit" id="sideSubmitSuggestBtn" type="button">제안 보내기</button>'
      + '<div class="side-suggest-status" id="sideSuggestStatus"></div>'
      + '</div>';
    const submit=document.getElementById("sideSubmitSuggestBtn");
    if(submit)submit.onclick=submitSideSuggestion_;
  }
  if(panel){
    panel.classList.add("open");
    panel.setAttribute("aria-hidden","false");
  }
}

async function submitSideSuggestion_(){
  const title=document.getElementById("sideSuggestTitle")?.value.trim()||"";
  const proposer=document.getElementById("sideSuggestProposer")?.value.trim()||"";
  const memo=document.getElementById("sideSuggestMemo")?.value.trim()||"";
  const status=document.getElementById("sideSuggestStatus");
  const submit=document.getElementById("sideSubmitSuggestBtn");
  if(!title){
    if(status)status.textContent="항목 이름을 입력해 주세요.";
    return;
  }
  const old=submit?submit.textContent:"";
  try{
    if(submit){submit.disabled=true;submit.textContent="전송 중...";}
    if(status)status.textContent="";
    const res=await fetch(WEB_APP_URL,{method:"POST",body:JSON.stringify({action:"hallSuggestion",title,proposer,memo})});
    const data=await res.json();
    if(!data.ok)throw new Error(data.message||"전송 실패");
    if(status)status.textContent="제안이 접수되었습니다.";
    setTimeout(()=>{closeDrawerPagePanel();load()},520);
  }catch(e){
    if(status)status.textContent="전송 실패: "+(e.message||e);
  }finally{
    if(submit){submit.disabled=false;submit.textContent=old||"제안 보내기";}
  }
}


function bindInlineSuggestionPanel(){
  const cancelSuggestBtn=document.getElementById("cancelSuggestBtn");
  if(cancelSuggestBtn)cancelSuggestBtn.onclick=closeInlineSuggestionPanel;

  const submitSuggestBtn=document.getElementById("submitSuggestBtn");
  if(submitSuggestBtn)submitSuggestBtn.onclick=submitInlineSuggestion_;
}

function closeInlineSuggestionPanel(){
  const box=document.getElementById("suggestionBox");
  const title=document.getElementById("suggestTitle");
  const proposer=document.getElementById("suggestProposer");
  const memo=document.getElementById("suggestMemo");
  if(box)box.style.display="none";
  if(title)title.value="";
  if(proposer)proposer.value="";
  if(memo)memo.value="";
}

async function submitInlineSuggestion_(){
  const title=document.getElementById("suggestTitle")?.value.trim()||"";
  const proposer=document.getElementById("suggestProposer")?.value.trim()||"";
  const memo=document.getElementById("suggestMemo")?.value.trim()||"";
  if(!title)return alert("항목 이름을 입력해 주세요.");
  const res=await fetch(WEB_APP_URL,{method:"POST",body:JSON.stringify({action:"hallSuggestion",title,proposer,memo})});
  const data=await res.json();
  if(!data.ok)return alert(data.message||"전송 실패");
  alert("제안이 접수되었습니다.");
  closeInlineSuggestionPanel();
  load();
}
