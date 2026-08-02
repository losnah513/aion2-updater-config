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
  app.innerHTML='<section class="hof-v2-loading" aria-live="polite" aria-busy="true">'
    + '<div class="hof-v2-loading-mark">'+kinojoCardSpinner('명예의 전당 불러오는 중')+'</div>'
    + '<div class="hof-v2-loading-lines" aria-hidden="true"><span></span><span></span><span></span></div>'
    + '<p id="loaderText">서버가 최신 순위와 주간 집계를 준비하고 있습니다.</p>'
    + '</section>';
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

const HALL_CACHE_PREFIX="kinojo_hall_summary_cache_v2026080204";
const HALL_STALE_PREFIX="kinojo_hall_summary_stale_v2026080204";
function hallCacheKey(){return HALL_CACHE_PREFIX+"::"+(includeSubs?"subs":"main")+"::"+(includeAllLegions?"all-legions":"default-legions");}
const HALL_CACHE_TTL_MS=5*60*1000;
const HALL_STALE_TTL_MS=24*60*60*1000;
let hallLoadRequestSeq=0;
let hallLoadInFlight=null;
let hallAuthReloadTimer=null;

function readStoredHallCache(storage,prefix,maxAge){
  try{
    const key=prefix+"::"+(includeSubs?"subs":"main")+"::"+(includeAllLegions?"all-legions":"default-legions");
    const raw=storage.getItem(key);
    if(!raw)return null;
    const cached=JSON.parse(raw);
    if(!cached?.savedAt||!cached?.data||Date.now()-cached.savedAt>maxAge)return null;
    return cached.data;
  }catch(_err){return null;}
}
function readHallCache(){return readStoredHallCache(sessionStorage,HALL_CACHE_PREFIX,HALL_CACHE_TTL_MS);}
function readHallStaleCache(){return readStoredHallCache(localStorage,HALL_STALE_PREFIX,HALL_STALE_TTL_MS);}
function writeHallCache(data){
  if(!data||data.ok===false)return;
  const wrapped=JSON.stringify({savedAt:Date.now(),data});
  try{sessionStorage.setItem(hallCacheKey(),wrapped);}catch(_err){}
  try{
    const staleKey=HALL_STALE_PREFIX+"::"+(includeSubs?"subs":"main")+"::"+(includeAllLegions?"all-legions":"default-legions");
    localStorage.setItem(staleKey,wrapped);
  }catch(_err){}
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
    hallData=data;
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
  if(!window.KinojoSupabase||typeof window.KinojoSupabase.rpc!=="function")throw new Error("Server Engine 연결을 확인해 주세요.");
  const data=await window.KinojoSupabase.rpc("kinojo_web_get_hof_display_v301",{p_include_subs:!!includeSubs,p_include_all_legions:!!includeAllLegions});
  if(!data||data.ok===false)throw new Error(data?.message||data?.error||"명예의 전당 공개 Cache 응답이 실패했습니다.");
  return data;
}
function hallDelay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function fetchHallDataWithRetry(){
  let lastError;
  for(const wait of [0,600,1400]){
    if(wait)await hallDelay(wait);
    try{return await fetchHallDataFresh();}catch(err){lastError=err;}
  }
  throw lastError||new Error("명예의 전당 데이터를 불러오지 못했습니다.");
}
function hallPassKey(){
  const session=window.KinojoAuth?.getSession?.()||{};
  const account=window.KinojoAuth?.getAccount?.()||{};
  return String(account.passKey||account.passCode||session.passKey||session.passCode||"").trim();
}
async function refreshHallPersonalRanking(requestSeq=hallLoadRequestSeq){
  const passKey=hallPassKey();
  if(!passKey)return false;
  try{
    const personal=await window.KinojoSupabase.rpc("kinojo_web_get_hof_display_v296",{p_include_subs:!!includeSubs,p_include_all_legions:!!includeAllLegions,p_pass_key:passKey});
    if(requestSeq!==hallLoadRequestSeq||!personal||personal.ok===false)return false;
    applyHallData({...hallData,myRanking:personal.myRanking||{}},{skipIfSame:true});
    return true;
  }catch(err){console.warn("KINOJO Hall personal ranking load failed:",err);return false;}
}
async function load({force=false}={}){
  const requestSeq=++hallLoadRequestSeq;
  const fresh=force?null:readHallCache();
  const stale=fresh?null:readHallStaleCache();
  const fallback=fresh||stale;
  if(fallback)applyHallData(fallback,{fromCache:true,initial:true});
  else{renderHallLoadingLayout();startLoadingText();}
  const key=hallCacheKey();
  if(!hallLoadInFlight||hallLoadInFlight.key!==key||force)hallLoadInFlight={key,promise:fetchHallDataWithRetry()};
  try{
    const result=await hallLoadInFlight.promise;
    if(requestSeq!==hallLoadRequestSeq)return false;
    writeHallCache(result);
    applyHallData(result,{initial:!fallback,skipIfSame:!!fallback});
    void refreshHallPersonalRanking(requestSeq);
    return true;
  }catch(err){
    if(requestSeq!==hallLoadRequestSeq)return false;
    if(fallback){console.warn("KINOJO Hall refresh failed; fallback retained:",err);return true;}
    stopLoadingText();
    app.className="";
    app.innerHTML='<div class="hof-v2-load-error"><strong>명예의 전당 데이터를 불러오지 못했습니다.</strong><span>'+escapeHtml(err.message||err)+'</span><button type="button" onclick="load({force:true})">다시 불러오기</button></div>';
    return false;
  }finally{if(hallLoadInFlight?.key===key)hallLoadInFlight=null;}
}
async function reloadHallAfterAuthChange(){
  clearTimeout(hallAuthReloadTimer);
  return new Promise(resolve=>{hallAuthReloadTimer=setTimeout(()=>resolve(refreshHallPersonalRanking(hallLoadRequestSeq)),250);});
}
window.reloadHallAfterAuthChange=reloadHallAfterAuthChange;
