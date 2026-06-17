/*
 * KINOJO Hall of Fame data road
 * 역할: Apps Script 통신, 방문자 집계, 로딩 상태를 관리합니다.
 * 주의: 화면 렌더링 HTML은 hall-render.js에서만 조립합니다.
 * 260617 교통정리 4차 재진행: 방문자 집계 요청 중복 방지 가드를 추가합니다.
 */
function hallBuildUrl(action,params={}){
  const joiner=WEB_APP_URL.includes("?")?"&":"?";
  const q=new URLSearchParams({action,...params,t:String(Date.now())});
  return WEB_APP_URL+joiner+q.toString();
}

function renderVisits(stats){
  const today=Number(stats?.todayVisits||0).toLocaleString("ko-KR");
  const total=Number(stats?.totalVisits||0).toLocaleString("ko-KR");
  const el=document.getElementById("visitCard");
  if(!el)return;
  el.innerHTML='<span class="visit-line visit-line-today">👀 오늘 '+today+'명의 모험가님이 다녀가셨어요.</span><span class="visit-line visit-line-total">🏛 누적 '+total+'회의 발걸음이 키노조에 남았습니다.</span>';
  window.__KINOJO_HALL_VISIT_RENDERED__=true;
}

async function fetchVisitStats(mode="stats",boost=0){
  if(window.__KINOJO_HALL_VISIT_REQUEST_ACTIVE__){
    return window.__KINOJO_HALL_VISIT_REQUEST_ACTIVE__;
  }

  window.__KINOJO_HALL_VISIT_REQUEST_ACTIVE__=(async()=>{
    try{
      const res=await fetch(hallBuildUrl("hallVisit",{mode,boost:String(boost)}),{cache:"no-store"});
      const data=await res.json();
      if(data?.ok&&data.stats)renderVisits(data.stats);
      return data;
    }catch(e){
      return null;
    }finally{
      window.__KINOJO_HALL_VISIT_REQUEST_ACTIVE__=null;
    }
  })();

  return window.__KINOJO_HALL_VISIT_REQUEST_ACTIVE__;
}

function recordDailyVisitOnce(){
  const key="kinojo_hof_visit_"+new Date().toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"});
  if(localStorage.getItem(key)==="1"){
    fetchVisitStats();
    return;
  }
  localStorage.setItem(key,"1");
  fetchVisitStats("visit",1);
}

function startLoadingText(){
  stopLoadingText();
  const messages=["명예의 전당 데이터를 불러오는 중","엠블럼을 준비하는 중","레기온 기록을 확인하는 중","순위표를 정리하는 중"];
  loadingStep=0;
  const target=()=>{
    const el=document.getElementById("loaderText");
    if(!el)return;
    const msg=messages[Math.floor(loadingStep/4)%messages.length];
    const dots=".".repeat(loadingStep%4);
    el.textContent=msg+dots;
    loadingStep++;
  };
  target();
  loadingTimer=setInterval(target,360);
}

function stopLoadingText(){
  if(loadingTimer){
    clearInterval(loadingTimer);
    loadingTimer=null;
  }
}

function preloadImages(paths){
  return Promise.all(paths.map(src=>new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>resolve(true);
    img.onerror=()=>resolve(false);
    img.src=src+"?v=1c101e";
  })));
}

async function load(){
  app.className="loading";
  app.innerHTML='<div><div class="loader-ring"></div><div class="loader-text" id="loaderText">명예의 전당 데이터를 불러오는 중</div></div>';
  startLoadingText();
  try{
    await preloadImages(Object.values(RANK_EMBLEMS).concat(Object.values(CLASS_ICONS)));
    const res=await fetch(hallBuildUrl("hallOfFame"),{cache:"no-store"});
    const text=await res.text();
    if(!res.ok)throw new Error("HTTP "+res.status+": "+text.slice(0,180));
    try{
      hallData=JSON.parse(text);
    }catch(parseErr){
      throw new Error("Apps Script 응답이 JSON이 아닙니다: "+text.slice(0,180));
    }
    if(!hallData || hallData.ok===false)throw new Error(hallData?.message||hallData?.error||"명예의 전당 응답이 실패했습니다.");
    if(hallData.visitStats){
      renderVisits(hallData.visitStats);
    }else if(!window.__KINOJO_HALL_VISIT_RENDERED__&&!window.__KINOJO_HALL_VISIT_REQUEST_ACTIVE__){
      fetchVisitStats();
    }

    const topbarUpdate=document.getElementById("topbarUpdateTime");
    if(topbarUpdate)topbarUpdate.textContent=hallData?.updatedAt?"업데이트 "+hallData.updatedAt:"업데이트 완료";
    stopLoadingText();
    render();
  }catch(err){
    stopLoadingText();
    app.className="";
    app.innerHTML='<div class="empty">명예의 전당 데이터를 불러오지 못했습니다.<br>'+escapeHtml(err.message||err)+'</div>';
  }
}
