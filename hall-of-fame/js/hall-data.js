/*
 * KINOJO Hall of Fame data road
 * 역할: Server Engine 035 Web Read API 통신, 방문자 집계, 로딩 상태를 관리합니다.
 * 주의: 화면 렌더링 HTML은 hall-render.js에서만 조립합니다.
 * 260617 교통정리 4차 재진행: 방문자 집계 요청 중복 방지 가드를 추가합니다.
 */
function hallBuildUrl(action,params={}){
  // Legacy Apps Script URL 조립 금지. Server Engine은 KinojoApi/KinojoSupabase를 통해 호출한다.
  const base=window.KinojoApi?.getBaseUrl?.() || HALL_API_PARAM || '';
  if(!base)return '';
  const payload={action,...params,t:String(Date.now())};
  const q=new URLSearchParams(payload);
  return base+(base.includes('?')?'&':'?')+q.toString();
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
      const data=await window.KinojoApi.getAction("hallVisit",{mode,boost:String(boost),pageKey:"hall"});
      if(data?.ok&&data.stats)renderVisits(data.stats);
      if(data && data.ok===false) throw new Error(data.message || "방문자 통계 처리 실패");
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


function kinojoCardSpinner(label){
  return '<div class="kinojo-card-loading"><span class="kinojo-spinner" aria-hidden="true"><span></span></span><span>'+escapeHtml(label||'불러오는 중')+'</span></div>';
}
function renderHallLoadingLayout(){
  app.className='';
  app.innerHTML=''
    + '<section class="mvp-card hall-loading-shell">'+kinojoCardSpinner('시즌 MVP 준비 중')+'</section>'
    + '<section class="section hall-loading-shell">'+kinojoCardSpinner('반응 현황 불러오는 중')+'</section>'
    + '<section class="section hall-loading-shell">'+kinojoCardSpinner('성장왕/벌크업 진단 중')+'</section>'
    + '<div class="dashboard"><div><div class="top-grid">'
    + '<section class="section hall-loading-shell">'+kinojoCardSpinner('PVE TOP 5 불러오는 중')+'</section>'
    + '<section class="section hall-loading-shell">'+kinojoCardSpinner('PVP TOP 5 불러오는 중')+'</section>'
    + '</div></div><div class="side-stack"><section class="section relation-combined-card hall-loading-shell">'+kinojoCardSpinner('관계 카드 불러오는 중')+'</section></div></div>'
    + '<section class="overall hall-loading-shell">'+kinojoCardSpinner('전체 순위표 불러오는 중')+'</section>';
}

const HALL_PRELOADED_IMAGES=new Map();

function preloadImages(paths){
  const unique=[...new Set((paths||[]).filter(Boolean))];
  return Promise.all(unique.map(src=>{
    if(HALL_PRELOADED_IMAGES.has(src))return HALL_PRELOADED_IMAGES.get(src);
    const job=new Promise(resolve=>{
      const img=new Image();
      img.onload=()=>resolve(true);
      img.onerror=()=>resolve(false);
      img.src=src;
    });
    HALL_PRELOADED_IMAGES.set(src,job);
    return job;
  }));
}

const HALL_CACHE_KEY="kinojo_hall_cache_v26062011";
const HALL_CACHE_TTL_MS=5*60*1000;

function readHallCache(){
  try{
    const raw=sessionStorage.getItem(HALL_CACHE_KEY);
    if(!raw)return null;
    const cached=JSON.parse(raw);
    if(!cached || !cached.savedAt || !cached.data)return null;
    if(Date.now()-cached.savedAt>HALL_CACHE_TTL_MS)return null;
    return cached.data;
  }catch(e){return null}
}

function writeHallCache(data){
  try{
    if(data && data.ok!==false){
      sessionStorage.setItem(HALL_CACHE_KEY,JSON.stringify({savedAt:Date.now(),data}));
    }
  }catch(e){}
}

function hallDataSignature(data){
  try{
    const copy=JSON.parse(JSON.stringify(data||{}));
    delete copy.updatedAt;
    delete copy.visitStats;
    return JSON.stringify(copy);
  }catch(e){
    return String(Date.now());
  }
}

function applyHallData(data,{fromCache=false,initial=false,skipIfSame=false}={}){
  const previousSignature=hallDataSignature(hallData);
  const nextSignature=hallDataSignature(data);

  if(skipIfSame && previousSignature===nextSignature){
    const topbarUpdate=document.getElementById("topbarUpdateTime");
    if(topbarUpdate && hallData?.updatedAt){
      topbarUpdate.textContent="업데이트 "+hallData.updatedAt;
    }
    return false;
  }

  hallData=data;
  if(hallData.visitStats){
    renderVisits(hallData.visitStats);
  }else if(!fromCache&&!window.__KINOJO_HALL_VISIT_RENDERED__&&!window.__KINOJO_HALL_VISIT_REQUEST_ACTIVE__){
    fetchVisitStats();
  }
  const topbarUpdate=document.getElementById("topbarUpdateTime");
  if(topbarUpdate){
    const suffix=fromCache?" · 캐시":"";
    topbarUpdate.textContent=hallData?.updatedAt?"업데이트 "+hallData.updatedAt+suffix:"업데이트 완료"+suffix;
  }
  stopLoadingText();
  render({initial:initial,showSpinners:initial});
  return true;
}

async function fetchHallDataFresh(){
  let data;
  if(!window.KinojoApi) throw new Error("KinojoApi 연결을 확인해 주세요.");
  data=await window.KinojoApi.getAction("hallOfFame",{limit:300});
  if(!data || data.ok===false)throw new Error(data?.message||data?.error||"명예의 전당 응답이 실패했습니다.");
  writeHallCache(data);
  return data;
}

async function load(){
  renderHallLoadingLayout();
  startLoadingText();
  const cached=readHallCache();
  try{
    if(cached){
      applyHallData(cached,{fromCache:true,initial:true});
      fetchHallDataFresh().then(data=>applyHallData(data,{skipIfSame:true})).catch(()=>{});
      return;
    }
    const data=await fetchHallDataFresh();
    applyHallData(data,{initial:true});
  }catch(err){
    if(cached){
      applyHallData(cached,{fromCache:true,initial:true});
      return;
    }
    stopLoadingText();
    app.className="";
    app.innerHTML='<div class="empty">명예의 전당 데이터를 불러오지 못했습니다.<br>'+escapeHtml(err.message||err)+'</div>';
  }
}
