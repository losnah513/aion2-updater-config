function setAdminButtonLoading_(id,text){
  const btn=document.getElementById(id);
  if(!btn)return;
  btn.dataset.oldText=btn.textContent;
  btn.disabled=true;
  btn.textContent=text||"처리 중...";
}
function clearAdminButtonLoading_(id,text){
  const btn=document.getElementById(id);
  if(!btn)return;
  btn.disabled=false;
  btn.textContent=text||btn.dataset.oldText||btn.textContent;
}
function showAdminResult_(title,html){
  let box=document.getElementById("adminResultBox");
  const panel=document.getElementById("adminControlPanel");
  if(!box&&panel){
    box=document.createElement("div");
    box.id="adminResultBox";
    box.className="admin-result-box";
    panel.appendChild(box);
  }
  if(box){
    box.innerHTML='<div class="admin-result-head"><strong>'+escapeHtml(title||"결과")+'</strong><button type="button" aria-label="닫기">×</button></div><div class="admin-result-body">'+html+'</div>';
    box.querySelector("button").onclick=()=>box.remove();
  }else{
    alert((title||"결과")+"\n"+String(html||"").replace(/<[^>]+>/g," "));
  }
}

function openAdminDropdown(){const box=document.getElementById("adminDropdown");const btn=document.getElementById("adminMenuBtn");if(!box)return;const willOpen=!box.classList.contains("open");box.classList.toggle("open",willOpen);box.setAttribute("aria-hidden",willOpen?"false":"true");if(btn)btn.setAttribute("aria-expanded",willOpen?"true":"false")}
function closeAdminMenu(){const box=document.getElementById("adminDropdown");const btn=document.getElementById("adminMenuBtn");if(box){box.classList.remove("open");box.setAttribute("aria-hidden","true")}if(btn)btn.setAttribute("aria-expanded","false")}
function adminLogin(){const input=document.getElementById("adminPasswordInput");const status=document.getElementById("adminStatus");if(String(input?.value||"")!=="zlshwhghkdlxld"){if(status)status.textContent="암호가 올바르지 않습니다.";return}adminAuthed=true;const login=document.getElementById("adminLoginPanel");const panel=document.getElementById("adminControlPanel");if(login)login.style.display="none";if(panel)panel.style.display="grid";if(status)status.textContent=""}
async function adminVisitAdjust(){
  const target=document.querySelector('[data-visit-target].active')?.dataset.visitTarget||"daily";
  const sign=document.querySelector('[data-visit-sign].active')?.dataset.visitSign||"plus";
  const amount=Math.max(1,Math.min(9999,Number(document.getElementById("adminVisitAmount")?.value||0)));
  const status=document.getElementById("adminVisitStatus");
  const mode=target==="total"?(sign==="minus"?"totalMinus":"totalPlus"):(sign==="minus"?"dailyMinus":"dailyPlus");
  try{
    setAdminButtonLoading_("adminVisitApplyBtn","반영중...");
    if(status){status.className="admin-status";status.textContent="반영 중...";}
    await fetchVisitStats(mode,amount);
    if(status){status.className="admin-status success";status.textContent="방문자수 반영 완료되었습니다.";}
  }catch(e){
    if(status){status.className="admin-status error";status.textContent="방문자수 반영 실패: "+(e.message||e);}
  }finally{
    clearAdminButtonLoading_("adminVisitApplyBtn","반영");
  }
}
async function adminSnapshot(){
  try{
    setAdminButtonLoading_("adminSnapshotBtn","생성 중...");
    const code=document.getElementById("adminPasswordInput")?.value||"zlshwhghkdlxld";
    const url=WEB_APP_URL+(WEB_APP_URL.includes("?")?"&":"?")+"action=weeklySnapshot&password="+encodeURIComponent(code)+"&t="+Date.now();
    const res=await fetch(url,{cache:"no-store"});
    const data=await res.json();
    if(!data.ok)return showAdminResult_("성장왕 스냅샷 생성",escapeHtml(data.message||"스냅샷 저장 실패"));
    showAdminResult_("성장왕 스냅샷 생성","저장 완료: "+Number(data.result?.count||0)+"명");
  }catch(e){
    showAdminResult_("성장왕 스냅샷 생성","저장 오류: "+escapeHtml(e.message||e));
  }finally{
    clearAdminButtonLoading_("adminSnapshotBtn","성장왕 스냅샷 생성");
  }
}

async function adminMvp(){
  try{
    setAdminButtonLoading_("adminMvpBtn","확인 중...");
    const code=document.getElementById("adminPasswordInput")?.value||"zlshwhghkdlxld";
    const url=WEB_APP_URL+(WEB_APP_URL.includes("?")?"&":"?")+"action=mvpAdmin&password="+encodeURIComponent(code)+"&t="+Date.now();
    const res=await fetch(url,{cache:"no-store"});
    const data=await res.json();
    if(!data.ok)return showAdminResult_("MVP 후보 확인",escapeHtml(data.message||"후보 확인 실패"));
    const season=data.season||{};
    const rows=(data.candidates||[]).slice(0,5).map((item,i)=>
      '<div class="admin-result-row"><strong>'+(i+1)+'위 '+escapeHtml(item.name||'-')+'</strong>'
      + '<span>시즌 '+Number(item.seasonScore||0)+' · 반응 '+Number(item.reactionScore||0)+' · 예상 '+Number(item.finalScorePreview||0)+'</span>'
      + '<span>좋아요 '+Number(item.like||0)+' / 싫어요 '+Number(item.dislike||0)+' · '+escapeHtml(item.excludeReason||'')+'</span></div>'
    ).join('')||'<div class="empty">아직 집계 데이터가 없습니다.</div>';
    showAdminResult_("MVP 후보 확인",'<div class="admin-result-meta">'+escapeHtml(season.seasonName||'')+' '+escapeHtml(season.startDate||'')+' ~ '+escapeHtml(season.endDate||'')+'</div><div class="admin-result-list">'+rows+'</div><div class="admin-result-meta">전투력 보정 20%는 MVP 선정 시점에만 반영됩니다.</div>');
  }catch(e){
    showAdminResult_("MVP 후보 확인","확인 오류: "+escapeHtml(e.message||e));
  }finally{
    clearAdminButtonLoading_("adminMvpBtn","MVP 후보 확인");
  }
}

async function showMvpAdminPrompt(){
  return adminMvp();
}
async function adminSnapshotTriggerInstall(){
  try{
    setAdminButtonLoading_("adminSnapshotTriggerBtn","설치 중...");
    const code=document.getElementById("adminPasswordInput")?.value||"zlshwhghkdlxld";
    const url=WEB_APP_URL+(WEB_APP_URL.includes("?")?"&":"?")+"action=weeklySnapshotTriggers&password="+encodeURIComponent(code)+"&t="+Date.now();
    const res=await fetch(url,{cache:"no-store"});
    const data=await res.json();
    if(!data.ok){
      const msg=data.needAuth
        ? "자동 트리거 설치 권한 승인이 필요합니다. Apps Script 편집기에서 installWeeklyGrowthSnapshotTriggers_ 함수를 한 번 직접 실행해 권한 승인 후 다시 시도해 주세요."
        : (data.message||"자동 트리거 설치 실패");
      return showAdminResult_("자동 스냅샷 트리거 설치",msg);
    }
    showAdminResult_("자동 스냅샷 트리거 설치","설치 완료<br>수요일 00:00 START / 화요일 00:00 END");
  }catch(e){
    showAdminResult_("자동 스냅샷 트리거 설치","설치 오류: "+(e.message||e));
  }finally{
    clearAdminButtonLoading_("adminSnapshotTriggerBtn","자동 스냅샷 트리거 설치");
  }
}


