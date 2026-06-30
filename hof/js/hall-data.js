/*
 * KINOJO Hall of Fame data road
 * 역할: Server Engine 049 HOF Summary API 통신과 로딩 상태를 관리합니다.
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
    + '<section class="section hall-loading-shell">'+kinojoCardSpinner('명예 타이틀 집계 중')+'</section>'
    + '<div class="dashboard"><div><div class="top-grid">'
    + '<section class="section hall-loading-shell">'+kinojoCardSpinner('PVE TOP 3 불러오는 중')+'</section>'
    + '<section class="section hall-loading-shell">'+kinojoCardSpinner('PVP TOP 3 불러오는 중')+'</section>'
    + '</div></div><div class="side-stack"><section class="section relation-combined-card hall-loading-shell">'+kinojoCardSpinner('전체 순위 링크 준비 중')+'</section></div></div>';
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

const HALL_CACHE_KEY="kinojo_hall_summary_cache_v2026062921";
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
  // Hall 응답의 visitStats는 공통 방문자바를 덮어쓰지 않는다.
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
  data=await window.KinojoApi.getAction("hofSummary",{includeSubs:includeSubs});
  if(!data || data.ok===false)throw new Error(data?.message||data?.error||"명예의 전당 요약 응답이 실패했습니다.");
  writeHallCache(data);
  return data;
}

async function load(){
  renderHallLoadingLayout();
  startLoadingText();
  const cached=readHallCache();
  try{
    // 서버 순위/RPC 응답이 도착하기 전 빈 카드가 먼저 렌더링되는 문제를 막기 위해
    // 초기 화면은 캐시 즉시 렌더링 대신 키노조 로딩 스피너를 유지한다.
    const data=await fetchHallDataFresh();
    applyHallData(data,{initial:true});
  }catch(err){
    if(cached && cached.ok!==false){
      applyHallData(cached,{fromCache:true,initial:true});
      return;
    }
    stopLoadingText();
    app.className="";
    app.innerHTML='<div class="empty">명예의 전당 데이터를 불러오지 못했습니다.<br>'+escapeHtml(err.message||err)+'</div>';
  }
}
