const SANCTUARY_API_PARAM=new URLSearchParams(location.search).get("api")||"";
const params=new URLSearchParams(location.search);
let currentId=String(params.get("id")||"").trim().toLowerCase();
let masterInfo=null;
function classIconSrc(className){return window.KinojoCharacterProfileImage?.classIconFor?.(className)||''}
let sanctuaryData=null;
let sanctuaryWaitlistSelectionId=0;
let sanctuaryWaitlistRecommendationSeq=0;
let sanctuaryWaitlistReturnFocus=null;
let sanctuaryWaitlistView='all';
let sanctuaryWaitlistClass='';
let sanctuaryWaitlistSort='name';
let sanctuaryWaitlistSortDirection='asc';
let sanctuaryWaitlistStep=1;
let sanctuaryWaitlistRecommendationData=null;
let sanctuaryWaitlistSelectedSanctuary='';
let sanctuaryWaitlistSelectedTeamNo=0;
let sanctuaryWaitlistSlotSeq=0;
const SANCTUARY_WAITLIST_CLASSES=['수호성','검성','살성','궁성','마도성','정령성','치유성','호법성','권성'];
let operationLoadKey='';
let operationLoadedKey='';
let operationLoadPromise=null;
let operationRefreshQueued=false;
let operationRequestSeq=0;
let sanctuaryLoadPromise=null;
let sanctuaryRefreshQueued=false;
let sanctuaryHasRenderedData=false;
let sanctuaryRequestSeq=0;
const SANCTUARY_REQUEST_TIMEOUT_MS=12000;
const SANCTUARY_AUTO_RETRY_LIMIT=2;
const OPERATION_REQUEST_TIMEOUT_MS=10000;
const OPERATION_AUTO_RETRY_LIMIT=2;
function waitMs(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function withRequestTimeout(task,timeoutMs,message){return Promise.race([Promise.resolve(task),new Promise((_,reject)=>setTimeout(()=>{const error=new Error(message||'요청 시간이 초과되었습니다.');error.code='REQUEST_TIMEOUT';reject(error)},timeoutMs))])}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}
function fmt(n){return Number(n||0).toLocaleString("ko-KR")}
function currentFallback(){return {info:masterInfo||{sanctuaryId:currentId,sanctuaryNo:"",sanctuaryName:"성역",shortName:"성역",bossName:""}}}
function setActiveLinks(){}
/* KINOJO common drawer is managed by GitHub_Pages/ui/kinojo-common-ui.js */
const SANCTUARY_CACHE_TTL_MS=5*60*1000;
function sanctuaryCacheKey(){const session=window.KinojoAuth?.getSession?.()||{};const identity=String(session.mainCharacter||session.mainCharacterName||'guest').trim().replace(/[^0-9A-Za-z가-힣_-]+/g,'_');return 'kinojo_sanctuary_cache_v2026071803_'+(currentId||'default')+'_'+(identity||'guest')}
function readSanctuaryCache(){try{const raw=sessionStorage.getItem(sanctuaryCacheKey());if(!raw)return null;const cached=JSON.parse(raw);if(!cached||!cached.savedAt||!cached.data)return null;if(Date.now()-cached.savedAt>SANCTUARY_CACHE_TTL_MS)return null;return cached.data}catch(e){return null}}
function writeSanctuaryCache(data){try{if(data&&data.ok!==false)sessionStorage.setItem(sanctuaryCacheKey(),JSON.stringify({savedAt:Date.now(),data}))}catch(e){}}
function sanctuaryTopbarUpdateText(value,fromCache=false){const raw=String(value||'').trim();const matched=raw.match(/(?:T|\s)(\d{1,2}:\d{2})(?::\d{2})?/)||raw.match(/(\d{1,2}:\d{2})/);const time=matched?.[1]||'';return time?'업데이트 '+time+(fromCache?' · 캐시':''):(fromCache?'캐시 데이터':'업데이트 완료')}
function setSanctuarySyncState(value,{fromCache=false,error=false}={}){const raw=String(value||'').trim();const bodyChip=document.getElementById('sanctuarySyncChip');if(bodyChip)bodyChip.textContent=error?(raw||'성역 데이터를 불러오지 못했습니다.'):'Server Engine 업데이트 '+(raw||'완료')+(fromCache?' · 캐시':'');const topbarChip=document.getElementById('syncChip');if(topbarChip)topbarChip.textContent=error?'업데이트 확인 실패':sanctuaryTopbarUpdateText(raw,fromCache)}
function validateSanctuaryPayload(data){
  if(!data||data.ok===false)throw new Error(data?.message||'성역 데이터 로드 실패');
  const groups=normalizeSanctuaryTeamGroups(data);
  const summary=data.summary||{};
  const expectedTeamCount=Number(summary.operatingTeamCount??summary.teamGroupCount??summary.teamCount??0);
  if(expectedTeamCount>0&&!groups.length){const error=new Error('성역 팀 데이터가 완전히 도착하지 않았습니다.');error.code='SANCTUARY_TEAM_DATA_INCOMPLETE';throw error}
  return data;
}
function applySanctuaryData(data,{fromCache=false}={}){sanctuaryData=data;sanctuaryHasRenderedData=true;masterInfo=data?.info||data?.master||masterInfo;currentId=String(masterInfo?.sanctuaryId||masterInfo?.code||currentId||"").trim().toLowerCase();window.KinojoSanctuaryCurrentId=currentId;if(currentId&&!params.get("id")){const next=new URL(location.href);next.searchParams.set("id",currentId);history.replaceState(null,"",next)}render(data);ensureSanctuaryOperation();setSanctuarySyncState(data.generatedAt||"완료",{fromCache});if(data?.generatedAt)window.dispatchEvent(new CustomEvent('kinojo:page-time',{detail:{value:data.generatedAt,label:fromCache?'동기화(캐시)':'동기화'}}))}
async function fetchSanctuaryFresh(){
  if(!window.KinojoApi)throw new Error('KinojoApi 연결을 확인해 주세요.');
  const data=await withRequestTimeout(window.KinojoApi.getAction('sanctuary',{id:currentId||''}),SANCTUARY_REQUEST_TIMEOUT_MS,'성역 팀 데이터 응답 시간이 초과되었습니다.');
  validateSanctuaryPayload(data);
  writeSanctuaryCache(data);
  return data;
}
function renderSanctuaryLoadProgress(message){
  if(sanctuaryHasRenderedData)return;
  const root=document.getElementById('teamList');
  if(root)root.innerHTML='<div class="sanctuary-load-state">'+sanctuarySpinner(message||'성역 팀 데이터를 다시 확인하는 중')+'</div>';
}
function renderSanctuaryLoadError(error){
  const message=String(error?.message||'성역 데이터를 불러오지 못했습니다.');
  const team=document.getElementById('teamList');
  const summary=document.getElementById('summaryGrid');
  const waiting=document.getElementById('waitingSection');
  const tip=document.getElementById('tipBody');
  if(team)team.innerHTML='<div class="sanctuary-load-error"><strong>팀 목록을 불러오지 못했습니다.</strong><span>'+esc(message)+'</span><button type="button" class="sanctuary-retry-btn" data-sanctuary-retry>다시 불러오기</button></div>';
  if(summary)summary.innerHTML=[summaryCard('-', '등록 캐릭터'),summaryCard('-', '운영 팀'),summaryCard('-', '평균 전투력'),summaryCard('-', '대기자')].join('');
  if(waiting)waiting.innerHTML='<h2 class="waiting-title">대기자 명단</h2><div class="sanctuary-load-inline-error">팀 데이터 로드 후 표시됩니다.</div>';
  if(tip)tip.innerHTML='<div class="tip-line">성역 Server Engine 연결을 확인해 주세요.</div>';
  team?.querySelector('[data-sanctuary-retry]')?.addEventListener('click',()=>loadData({force:true,preserveRendered:true}));
}
async function fetchSanctuaryFreshWithRetry(seq){
  let lastError=null;
  for(let attempt=1;attempt<=SANCTUARY_AUTO_RETRY_LIMIT;attempt+=1){
    try{const data=await fetchSanctuaryFresh();if(seq!==sanctuaryRequestSeq)return null;return data}
    catch(error){lastError=error;if(seq!==sanctuaryRequestSeq)return null;if(attempt<SANCTUARY_AUTO_RETRY_LIMIT){renderSanctuaryLoadProgress('팀 데이터 재확인 중 · '+(attempt+1)+'/'+SANCTUARY_AUTO_RETRY_LIMIT);await waitMs(650*attempt)}}
  }
  throw lastError||new Error('성역 데이터 로드 실패');
}
async function loadData({force=false,preserveRendered=false}={}){
  setActiveLinks();
  if(sanctuaryLoadPromise){if(force)sanctuaryRefreshQueued=true;return sanctuaryLoadPromise}
  if(!sanctuaryHasRenderedData&&!preserveRendered)renderSkeleton();
  const cached=!force?readSanctuaryCache():null;
  if(cached&&!sanctuaryHasRenderedData){try{validateSanctuaryPayload(cached);applySanctuaryData(cached,{fromCache:true})}catch(_error){}}
  const seq=++sanctuaryRequestSeq;
  sanctuaryLoadPromise=(async()=>{
    try{const data=await fetchSanctuaryFreshWithRetry(seq);if(data&&seq===sanctuaryRequestSeq)applySanctuaryData(data)}
    catch(err){if(seq!==sanctuaryRequestSeq)return;if(sanctuaryHasRenderedData){setSanctuarySyncState(err?.message||'최신 성역 데이터 확인 실패',{error:true})}else{renderSanctuaryLoadError(err);setSanctuarySyncState(err?.message||'성역 데이터를 불러오지 못했습니다.',{error:true})}}
  })().finally(()=>{sanctuaryLoadPromise=null;if(sanctuaryRefreshQueued){sanctuaryRefreshQueued=false;loadData({force:true,preserveRendered:true})}});
  return sanctuaryLoadPromise;
}
function sanctuarySpinner(label){return '<div class="kinojo-card-loading"><span class="kinojo-spinner" aria-hidden="true"><span></span></span><span>'+esc(label||'불러오는 중')+'</span></div>'}
function renderSkeleton(){
  const summary=document.getElementById('summaryGrid');
  const team=document.getElementById('teamList');
  const waiting=document.getElementById('waitingSection');
  const tip=document.getElementById('tipBody');
  if(summary)summary.innerHTML=[sanctuarySpinner('등록 현황 집계 중'),sanctuarySpinner('운영 팀 확인 중'),sanctuarySpinner('평균 전투력 계산 중'),sanctuarySpinner('대기자 확인 중')].map(x=>'<div class="summary-card">'+x+'</div>').join('');
  if(team)team.innerHTML=sanctuarySpinner('성역 포스 데이터를 불러오는 중');
  if(waiting)waiting.innerHTML='<h2 class="waiting-title">대기자 명단</h2>'+sanctuarySpinner('대기자 확인 중');
  if(tip)tip.innerHTML=sanctuarySpinner('공략 팁 불러오는 중');
  renderOperationSkeleton();
}

function readStoredSanctuaryAuth(key){
  try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_error){return null}
}
function currentSanctuaryAuthState(){
  const auth=window.KinojoAuth||{};
  const session=typeof auth.getSession==='function'?auth.getSession():null;
  const account=typeof auth.getAccount==='function'?auth.getAccount():null;
  const storedSession=readStoredSanctuaryAuth('kinojo_login_session_v1');
  const storedAccount=readStoredSanctuaryAuth('kinojo_login_account_v1');
  const merged=Object.assign({},storedSession||{},storedAccount||{},session||{},account||{});
  const passKey=String(merged.passKey||merged.passCode||merged.pass_key||merged.pass_code||'').trim();
  const loggedIn=Boolean(session?.token||storedSession?.token);
  return {passKey,loggedIn};
}
function currentSanctuaryPassKey(){return currentSanctuaryAuthState().passKey}
function operationStatusClass(value){
  const state=String(value||'').toLowerCase();
  return ['today','survey','coordinating','confirmed','canceled','completed'].includes(state)?state:'survey';
}
function renderOperationSkeleton(){
  const authState=currentSanctuaryAuthState();
  if(!authState.passKey){if(authState.loggedIn)renderOperationAuthUnavailable();else renderOperationLoginRequired();return}
  const week=document.getElementById('operationWeekLabel');
  const auth=document.getElementById('operationAuthState');
  const schedules=document.getElementById('operationScheduleList');
  if(week)week.textContent='아이온 주간 · 수요일부터 화요일까지';
  if(auth)auth.textContent='Server Engine 확인 중';
  if(schedules)schedules.innerHTML=sanctuarySpinner('성역 일정을 불러오는 중');
}
function renderOperationLoginRequired(){
  const week=document.getElementById('operationWeekLabel');
  const auth=document.getElementById('operationAuthState');
  const schedules=document.getElementById('operationScheduleList');
  if(week)week.textContent='아이온 주간 · 수요일부터 화요일까지';
  if(auth){auth.textContent='로그인 필요';auth.classList.remove('is-logged-in')}
  if(schedules)schedules.innerHTML='<div class="sanctuary-operation-empty"><strong>로그인하시면 성역 일정을 확인할 수 있습니다</strong></div>';
}
function renderOperationAuthUnavailable(){
  const week=document.getElementById('operationWeekLabel');
  const auth=document.getElementById('operationAuthState');
  const schedules=document.getElementById('operationScheduleList');
  if(week)week.textContent='아이온 주간 · 수요일부터 화요일까지';
  if(auth){auth.textContent='로그인 인증 확인 필요';auth.classList.remove('is-logged-in')}
  if(schedules)schedules.innerHTML='<div class="sanctuary-operation-empty"><strong>로그인 상태를 다시 확인해 주세요.</strong><span>로그아웃 후 다시 로그인하면 일정을 불러옵니다.</span></div>';
}
function ensureSanctuaryOperation(force=false){
  if(!currentId)return Promise.resolve();
  const scheduleLink=document.getElementById('operationSchedulePageLink');
  if(scheduleLink){const mobile=/(^|\/)m(\/|$)/.test(location.pathname);scheduleLink.href=(mobile?'/m/sanctuary-schedule/':'/sanctuary-schedule/')}
  const authState=currentSanctuaryAuthState();
  const passKey=authState.passKey;
  const key=currentId+'|'+passKey;
  if(!passKey){operationRequestSeq+=1;operationLoadedKey=key;operationLoadKey=key;operationRefreshQueued=false;if(authState.loggedIn)renderOperationAuthUnavailable();else renderOperationLoginRequired();return Promise.resolve()}
  if(operationLoadPromise){if(force)operationRefreshQueued=true;return operationLoadPromise}
  if(!force&&operationLoadedKey===key)return Promise.resolve();
  operationLoadKey=key;
  operationLoadPromise=loadSanctuaryOperation(key).finally(()=>{operationLoadPromise=null;if(operationRefreshQueued){operationRefreshQueued=false;ensureSanctuaryOperation(true)}});
  return operationLoadPromise;
}
function renderOperationRetrying(attempt){
  const auth=document.getElementById('operationAuthState');
  const schedules=document.getElementById('operationScheduleList');
  if(auth)auth.textContent='일정 다시 확인 중';
  if(schedules)schedules.innerHTML=sanctuarySpinner('성역 일정 재확인 중 · '+attempt+'/'+OPERATION_AUTO_RETRY_LIMIT);
}
function renderOperationLoadError(error){
  const auth=document.getElementById('operationAuthState');
  const schedules=document.getElementById('operationScheduleList');
  if(auth)auth.textContent='운영 정보 연결 실패';
  if(schedules){schedules.innerHTML='<div class="sanctuary-operation-empty"><strong>성역 일정을 불러오지 못했습니다.</strong><span>'+esc(error?.message||'일정 조회 실패')+'</span><button class="sanctuary-retry-btn" type="button" data-operation-retry>다시 불러오기</button></div>';schedules.querySelector('[data-operation-retry]')?.addEventListener('click',()=>ensureSanctuaryOperation(true))}
}
async function loadSanctuaryOperation(key){
  const seq=++operationRequestSeq;
  renderOperationSkeleton();
  let lastError=null;
  for(let attempt=1;attempt<=OPERATION_AUTO_RETRY_LIMIT;attempt+=1){
    try{
      if(!window.KinojoApi)throw new Error('KinojoApi 연결을 확인해 주세요.');
      const data=await withRequestTimeout(window.KinojoApi.getAction('sanctuaryOperation',{id:currentId,passKey:currentSanctuaryPassKey()}),OPERATION_REQUEST_TIMEOUT_MS,'성역 일정 응답 시간이 초과되었습니다.');
      if(seq!==operationRequestSeq||key!==operationLoadKey)return;
      if(!data||data.ok===false)throw new Error(data?.message||'성역 운영 정보 로드 실패');
      if(data.authRequired===true||data.authenticated===false){renderOperationLoginRequired();operationLoadedKey=key;return}
      renderSanctuaryOperation(data);operationLoadedKey=key;return;
    }catch(err){
      lastError=err;
      if(seq!==operationRequestSeq||key!==operationLoadKey)return;
      if(attempt<OPERATION_AUTO_RETRY_LIMIT){renderOperationRetrying(attempt+1);await waitMs(700*attempt)}
    }
  }
  operationLoadedKey='';
  renderOperationLoadError(lastError);
}
function renderSanctuaryOperation(data){
  const items=Array.isArray(data.items)?data.items:[];
  const week=document.getElementById('operationWeekLabel');
  const auth=document.getElementById('operationAuthState');
  const schedules=document.getElementById('operationScheduleList');
  const isUpcoming=data.displayMode==='next_upcoming';
  if(week)week.textContent=isUpcoming?'이번 주 일정 없음 · 다음 예정 일정':'아이온 주간 '+String(data.weekLabel||'')+' · 수요일~화요일';
  if(auth){
    const user=data.user||null;
    auth.textContent=data.authenticated?(String(user?.teamName||user?.mainCharacterName||'로그인 완료')):'PASS KEY 로그인 시 내 일정 강조';
    auth.classList.toggle('is-logged-in',!!data.authenticated);
  }
  if(!schedules)return;
  if(!items.length){
    schedules.innerHTML='<div class="sanctuary-operation-empty"><strong>등록된 예정 일정이 없습니다.</strong><span>성역 스케줄에서 일정을 확인할 수 있습니다.</span></div>';
    return;
  }
  schedules.innerHTML=items.map(operationScheduleHtml).join('');
  schedules.querySelectorAll('[data-operation-schedule]').forEach(button=>button.addEventListener('click',()=>{
    const selected=items.find(item=>String(item.id)===String(button.dataset.operationSchedule));
    if(selected)openOperationScheduleModal(selected);
  }));
}
function operationScheduleHtml(item){
  const state=operationStatusClass(item.displayState||item.effectiveStatus);
  const userResponse=item.user?.response;
  const teamName=item.teams?.[0]?.teamName||item.teams?.[0]?.teamNo&&item.teams[0].teamNo+'팀'||'팀 미확인';
  const responseText=item.requiresResponse?(item.responseRequired?'응답 필요':(userResponse?.statusLabel||'투표 일정')):'일정 확정';
  const meta=[item.dateLabel||item.targetDate||'',item.startTime||'',item.location||''].filter(Boolean).join(' · ');
  return '<button class="sanctuary-operation-schedule status-'+state+(item.responseRequired?' needs-response':'')+'" type="button" data-operation-schedule="'+esc(item.id)+'">'
    +'<span class="sanctuary-operation-status status-'+state+'">'+esc(item.scheduleModeLabel||item.displayLabel||item.statusLabel||'일정')+'</span>'
    +'<strong class="sanctuary-operation-schedule-title">'+esc(teamName)+'</strong>'
    +'<span class="sanctuary-operation-schedule-time">'+esc(meta)+'</span>'
    +'<span class="sanctuary-operation-response">'+esc(responseText)+'</span>'
    +'<span class="sanctuary-operation-arrow" aria-hidden="true">›</span></button>';
}
function ensureOperationScheduleModal(){
  let modal=document.getElementById('sanctuaryScheduleDetailModal');
  if(modal)return modal;
  modal=document.createElement('section');
  modal.id='sanctuaryScheduleDetailModal';
  modal.className='sanctuary-schedule-detail-modal kinojo-safe-overlay';
  modal.setAttribute('aria-hidden','true');
  modal.innerHTML='<div class="sanctuary-schedule-detail-backdrop" data-operation-modal-close></div><article class="sanctuary-schedule-detail-card kinojo-safe-dialog" role="dialog" aria-modal="true" aria-labelledby="sanctuaryScheduleDetailTitle"><button type="button" class="sanctuary-schedule-detail-close" data-operation-modal-close aria-label="닫기">×</button><div id="sanctuaryScheduleDetailBody"></div></article>';
  document.body.appendChild(modal);
  modal.addEventListener('click',event=>{if(event.target?.hasAttribute('data-operation-modal-close'))closeOperationScheduleModal();});
  return modal;
}
function openOperationScheduleModal(item){
  const modal=ensureOperationScheduleModal();
  const body=modal.querySelector('#sanctuaryScheduleDetailBody');
  const team=item.teams?.[0]||{};
  const summary=item.summary||{};
  body.innerHTML='<div class="sanctuary-schedule-detail-kicker">'+esc(item.scheduleModeLabel||'성역 일정')+'</div><h2 id="sanctuaryScheduleDetailTitle">'+esc(item.sanctuaryName||'성역')+' · '+esc(team.teamName||team.teamNo&&team.teamNo+'팀'||'팀')+'</h2><dl><div><dt>날짜</dt><dd>'+esc(item.dateLabel||item.targetDate||'')+'</dd></div><div><dt>시작</dt><dd>'+esc(item.startTime||'시간 미정')+'</dd></div>'+(item.location?'<div><dt>장소</dt><dd>'+esc(item.location)+'</dd></div>':'')+(item.description?'<div><dt>안내</dt><dd>'+esc(item.description)+'</dd></div>':'')+'</dl>'+(item.requiresResponse?'<div class="sanctuary-schedule-detail-vote"><strong>투표 현황</strong><span>가능 '+esc(summary.participatingCount??summary.availableCount??0)+'명</span><span>불가 '+esc(summary.unavailableCount??0)+'명</span><span>미응답 '+esc(summary.pendingCount??0)+'명</span><span>응답률 '+esc(summary.responseRate??0)+'%</span></div>':'<div class="sanctuary-operation-fixed-message">확정 일정은 별도 참여 응답을 받지 않습니다.</div>')+'<a class="sanctuary-schedule-detail-link" href="'+(/(^|\/)m(\/|$)/.test(location.pathname)?'/m/sanctuary-schedule/':'/sanctuary-schedule/')+'?anchor='+encodeURIComponent(item.targetDate||'')+'&date='+encodeURIComponent(item.targetDate||'')+'&schedule='+encodeURIComponent(item.id)+'">통합 성역 스케줄에서 보기</a>';
  modal.classList.add('is-open');modal.setAttribute('aria-hidden','false');document.body.classList.add('kinojo-modal-open');
}
function closeOperationScheduleModal(){const modal=document.getElementById('sanctuaryScheduleDetailModal');if(modal){modal.classList.remove('is-open');modal.setAttribute('aria-hidden','true');}document.body.classList.remove('kinojo-modal-open');}
function applyHeroVisual(info){const bg=document.getElementById("heroBg");if(!bg)return;const image=String(info?.bannerImage||"").trim();const background=String(info?.cardBackground||"").trim();bg.style.background="";bg.style.backgroundImage="";if(image&&(image.startsWith("/")||image.startsWith("https://"))){bg.style.backgroundImage="url(\""+image.replace(/[\"()]/g,encodeURIComponent)+"\")";return}if(/^(radial-gradient|linear-gradient)\(/i.test(background)&&!/[;{}]/.test(background))bg.style.background=background}
function render(data){const info=data.info||currentFallback().info;const hero=document.getElementById("sanctuaryHero");hero.className="sanctuary-hero";applyHeroVisual(info);document.getElementById("heroKicker").textContent="성역 "+(info.sanctuaryNo||"");document.getElementById("heroTitle").textContent=info.sanctuaryName||info.shortName||"성역";document.getElementById("heroSub").textContent="Boss. "+(info.bossName||"-")+" · "+(info.shortName||"");renderSummary(data);const teamGroups=normalizeSanctuaryTeamGroups(data);renderTeamQuickNav(teamGroups);renderTeamGroups(teamGroups);renderWaiting(data.waiting||[]);refreshWaitlistModalIfOpen();document.getElementById('tipTitle').textContent=(info.shortName||'성역')+' 공략 팁';document.getElementById('tipBody').innerHTML=(data.tips||[]).map(t=>'<div class="tip-line">'+esc(t)+'</div>').join('')||'<div class="tip-line">공략 팁이 준비 중입니다.</div>';bindSanctuaryProfileImages();setupSliders();bindForceSwitchers();bindSanctuaryReactionCards();verifyTeamRender(teamGroups);window.KinojoSanctuaryEditor?.refreshRosterButtons?.();window.KinojoSanctuaryCapture?.bind?.()}
function renderSummary(data){
  const s=data.summary||{};
  const cards=[
    summaryCard(fmt(s.totalCharacters),'등록 캐릭터'),
    summaryCard(fmt(s.operatingTeamCount??s.teamGroupCount??s.teamCount),'운영 팀'),
    summaryCard(fmt(s.averagePower),'평균 전투력'),
    summaryCard(fmt(s.waitingCount),'대기자',true)
  ];
  document.getElementById('summaryGrid').innerHTML=cards.join('');
  bindWaitlistOpeners();
}
function summaryCard(num,label,action=false){const tag=action?'button':'div';const attrs=action?' type="button" data-waitlist-open aria-label="대기자 '+esc(num)+'명 추천 배치 보기"':'';return '<'+tag+' class="summary-card'+(action?' summary-card-action':'')+'"'+attrs+'><div class="summary-num">'+esc(num)+'</div><div class="summary-label">'+esc(label)+(action?'<span class="summary-action-mark" aria-hidden="true">›</span>':'')+'</div></'+tag+'>';}
function teamAnchorId(t){return 'party-force-'+String(t.forceId||t.teamId||t.forceNo||t.teamNo||t.leaderCharacter||'').replace(/[^a-zA-Z0-9가-힣_-]/g,'-')}
function teamGroupAnchorId(group){return 'sanctuary-team-'+String(group?.teamGroupNo||group?.teamId||group?.teamGroupName||'').replace(/[^a-zA-Z0-9가-힣_-]/g,'-')}
function renderTeamQuickNav(groups){
  const nav=document.getElementById('partyQuickNav');
  if(!nav)return;
  const teams=Array.isArray(groups)?groups:[];
  if(!teams.length){nav.hidden=true;nav.innerHTML='';return;}
  nav.hidden=false;
  nav.innerHTML='<div class="party-nav-title">팀 바로가기</div><div class="party-nav-buttons">'+teams.map((group,index)=>{
    const name=group.teamGroupName||group.operatingTeamName||((group.teamGroupNo||index+1)+'팀');
    const leader=String(group.leaderCharacter||'').trim();
    const memberCount=fmt(group.memberCount);
    const isUserTeam=group.isUserTeam===true;
    const meta=(memberCount+'명')+(leader?' · 대표 '+leader:' · 대표 미설정');
    return '<button class="party-nav-btn'+(isUserTeam?' is-user-team':'')+'" type="button" data-team-target="'+esc(teamGroupAnchorId(group))+'">'
      +'<span class="party-nav-name">'+esc(name)+'</span>'
      +'<span class="party-nav-meta">'+esc(meta)+'</span>'
      +(isUserTeam?'<span class="party-nav-my-badge">내 팀</span>':'')
      +'</button>';
  }).join('')+'</div>';
  nav.querySelectorAll('[data-team-target]').forEach(btn=>btn.addEventListener('click',()=>{const el=document.getElementById(btn.dataset.teamTarget);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});}));
}
function normalizeSanctuaryTeamGroups(data){
  const explicit=data&&Array.isArray(data.teamGroups)?data.teamGroups:[];
  if(explicit.length){
    return explicit.map((group,index)=>Object.assign({
      teamGroupNo:group.teamGroupNo||index+1,
      teamGroupName:group.teamGroupName||group.operatingTeamName||((group.teamGroupNo||index+1)+'팀'),
      forces:[]
    },group,{forces:(Array.isArray(group.forces)?group.forces:[]).filter(sanctuaryForceHasMembers)})).filter(group=>group.forces.length>0);
  }
  const forces=Array.isArray(data&&data.teams)?data.teams:[];
  const groups=[];
  forces.filter(sanctuaryForceHasMembers).forEach(force=>{
    const groupNo=force.teamGroupNo||force.operatingTeamNo||force.groupNo||1;
    let group=groups.find(item=>String(item.teamGroupNo)===String(groupNo));
    if(!group){
      group={
        teamGroupNo:groupNo,
        teamGroupName:force.teamGroupName||force.operatingTeamName||(groupNo+'팀'),
        leaderCharacter:force.leaderCharacter||'',
        isUserTeam:force.isUserTeam===true,
        memberCount:0,
        forceCount:0,
        forces:[]
      };
      groups.push(group);
    }
    group.forces.push(force);
  });
  return groups;
}
function sanctuaryForceHasMembers(force){
  if(Number(force?.characterCount||0)>0)return true;
  return (Array.isArray(force?.parties)?force.parties:[]).some(party=>(Array.isArray(party?.slots)?party.slots:[]).some(slot=>String(slot?.name||slot?.characterName||'').trim()));
}
function renderTeamGroups(groups){const root=document.getElementById('teamList');if(!groups.length){root.innerHTML='<div class="empty-main">아직 표시할 성역 편성 데이터가 없습니다.<br>MASTER 성역 시트 동기화 상태를 확인해 주세요.</div>';return}root.innerHTML=groups.map(teamGroupHtml).join('')}
function serverOrderedForces(forces){return Array.isArray(forces)?forces:[]}
function teamGroupHtml(g){
  const forces=serverOrderedForces(g.forces);
  const groupName=g.teamGroupName||g.operatingTeamName||((g.teamGroupNo||'')+'팀');
  const leader=String(g.leaderCharacter||'').trim();
  const mode=g.nameMode==='manual'?'사용자 지정':'자동 생성';
  const isUserTeam=g.isUserTeam===true;
  const meta=fmt(g.forceCount||forces.length)+'포스 · '+fmt(g.memberCount)+'캐릭터'+(leader?' · 대표 '+esc(leader):' · 대표 미설정');
  const forceSwitcher=forces.length>1?'<div class="san-force-switcher" role="group" aria-label="'+esc(groupName)+' 포스 선택">'+forces.map((force,index)=>'<button class="san-force-switch-btn'+(index===0?' is-active':'')+'" type="button" data-force-target="'+esc(teamAnchorId(force))+'">'+esc(force.forceName||Number(force.forceNo||index+1)+'포스')+'</button>').join('')+'</div>':'';
  return '<section class="san-team-group'+(isUserTeam?' is-user-team':'')+'" id="'+esc(teamGroupAnchorId(g))+'" data-team-group="'+esc(g.teamGroupNo||'')+'" data-team-group-name="'+esc(groupName)+'">'
    +'<header class="san-team-group-head"><div><div class="san-team-kicker">TEAM · '+esc(mode)+(isUserTeam?'<span class="san-team-my-badge">내 소속 팀</span>':'')+'</div><h2 class="san-team-title">'+esc(groupName)+'</h2><p class="san-team-meta">'+meta+'</p></div>'
    +'<div class="san-team-head-actions">'+forceSwitcher+'<button class="team-group-copy-btn kinojo-copy-icon-btn team-copy-icon" type="button" data-team-group-copy data-kinojo-tooltip="이 운영 팀의 모든 포스를 클립보드에 복사합니다" title="이 운영 팀의 모든 포스를 클립보드에 복사합니다" aria-label="'+esc(groupName)+' 전체 팀 클립보드 복사"><span class="copy-stack-icon" aria-hidden="true"><span></span><span></span></span></button><div class="san-team-scroll-hint">가로로 포스 확인</div></div></header>'
    +'<div class="san-force-rail-shell'+(forces.length>1?' has-multiple-forces':'')+'" data-force-count="'+forces.length+'"><button class="slide-btn left" type="button" aria-label="이전 포스">‹</button><div class="san-force-list">'+forces.map(f=>teamHtml(f,g)).join('')+'</div><button class="slide-btn right" type="button" aria-label="다음 포스">›</button></div></section>';
}
function normalizeForceParties(t){
  const byNo={};
  (Array.isArray(t.parties)?t.parties:[]).forEach(p=>{const no=Number(p.partyNo||1);byNo[no]=Object.assign({},p,{partyNo:no});});
  [1,2].forEach(no=>{if(!byNo[no])byNo[no]={partyNo:no,filled:0,capacity:5,slots:[]};});
  return [byNo[1],byNo[2]].map(p=>{const slots=(Array.isArray(p.slots)?p.slots.slice(0,5):[]);while(slots.length<5)slots.push({name:'',vacancyText:'공석'});return Object.assign({},p,{capacity:p.capacity||5,filled:p.filled??0,slots});});
}
function teamHtml(t,g){
  const groupNo=(g&&g.teamGroupNo)||t.teamGroupNo||t.operatingTeamNo||t.groupNo||'';
  const forceNo=Number(t.forceNo||1);
  const forceName=t.forceName||forceNo+'포스';
  const forceId=t.forceId||t.teamId;
  const teamNo=Number(t.teamNo||t.teamId||forceNo);
  const parties=normalizeForceParties(t);
  const filled=Number(t.characterCount||0);
  const avg=fmt(t.averagePower);
  return '<article class="team-card force-card" id="'+esc(teamAnchorId(t))+'" data-team="'+esc(t.teamId||groupNo)+'" data-force="'+esc(forceId||forceNo)+'" data-team-no="'+esc(teamNo)+'" data-team-group-no="'+esc(groupNo)+'" data-force-name="'+esc(forceName)+'">'
    + '<header class="team-head"><div class="team-title-wrap"><div class="team-name">'
    + '<span>'+esc(forceName)+'</span>'
    + '<button class="sanctuary-roster-edit-btn" type="button" hidden data-sanctuary-roster-edit data-sanctuary-id="'+esc(currentId||'')+'" data-team-no="'+esc(teamNo)+'" data-team-group-no="'+esc(groupNo)+'" data-force-name="'+esc(forceName)+'">파티 정보 수정</button>'
    + '<button class="team-copy-btn kinojo-copy-icon-btn team-copy-icon" type="button" data-force-copy data-kinojo-tooltip="해당 포스 전체를 클립보드에 복사합니다" title="해당 포스 전체를 클립보드에 복사합니다" aria-label="'+esc(forceName)+' 클립보드 복사"><span class="copy-stack-icon" aria-hidden="true"><span></span><span></span></span></button>'
    + '</div><div class="team-meta"><span class="force-count-badge">'+fmt(filled)+' / 10</span><span>'+fmt(t.partyCount||2)+'파티</span><span>평균 '+avg+'</span></div></div></header>'
    + '<div class="force-party-pair">'+parties.map(partyHtml).join('')+'</div></article>';
}
function partyHtml(p){return '<section class="party-card force-party-column" data-party-no="'+esc(p.partyNo)+'"><div class="party-head"><div class="party-title-row"><div class="party-title">'+esc(p.partyNo)+'파티</div></div><div class="party-count">'+fmt(p.filled)+' / '+fmt(p.capacity||5)+'</div></div><div class="slot-grid">'+(p.slots||[]).slice(0,5).map(slotHtml).join('')+'</div></section>'}
function sanctuaryProfileUrl(s){const direct=String(s.profileImageUrl||s.profileUrl||s.profile_image_url||s.imageUrl||s.characterImageUrl||'').trim();if(direct)return direct;const serverId=String(s.serverId||s.server_id||'').trim();const charKey=String(s.charKey||s.char_key||'').trim();return /^\d+$/.test(serverId)&&/^\d{10,}$/.test(charKey)?'https://profileimg.plaync.com/game_profile_images/aion2/images?gameServerKey='+encodeURIComponent(serverId)+'&charKey='+encodeURIComponent(charKey):'';}
function sanctuaryDetailUrl(s){return String(s.detailUrl||s.detail_url||s.url||'').trim();}
function sanctuaryIdentityBadge(s){
  const badge=s.identityBadge||s.identity_badge||null;
  if(!badge?.label)return '';
  const detail=String(badge.detail||badge.label||'').trim();
  return '<span class="san-identity-badge" title="'+esc(detail)+'" aria-label="'+esc(detail)+'">'+esc(badge.label)+'</span>';
}
function slotHtml(s){
  if(!s.name)return '<div class="empty-slot"><strong>+ '+esc(s.vacancyText||'파티 인원 모집중')+'</strong><span>대기자 명단에서 추가 가능</span></div>';
  const className=String(s.className||'직업 미확인');
  const iconSrc=classIconSrc(className);
  const icon=iconSrc?'<img class="class-icon" src="'+esc(iconSrc)+'" alt="" width="15" height="15" loading="lazy" decoding="async"> ':'';
  const profile=sanctuaryProfileUrl(s);
  const mainCharacterName=String(s.mainCharacterName||s.owner||'').trim();
  const isMain=s.isMain===true;
  const serverId=String(s.serverId||s.server_id||'').trim();
  const charKey=String(s.charKey||s.char_key||'').trim();
  const pvePower=s.pvePower||s.pve_power||s.latestPveCombatPower||s.latest_pve_combat_power||s.power||'';
  const pvpPower=s.pvpPower||s.pvp_power||s.latestPvpCombatPower||s.latest_pvp_combat_power||'';
  const powerFormat=window.KinojoPowerFormat||{};
  const powerShort=powerFormat.short?powerFormat.short(pvePower):fmt(pvePower);
  const powerFull=powerFormat.full?powerFormat.full(pvePower):fmt(pvePower);
  const ownerBadge=isMain?'<span class="char-main-badge">본캐</span>':(mainCharacterName?'<span class="char-owner-badge" title="소유 본캐 '+esc(mainCharacterName)+'">본캐 '+esc(mainCharacterName)+'</span>':'');
  const profileHtml='<span class="char-profile-wrap"><span class="char-profile is-empty" data-character-profile data-char-name="'+esc(s.name)+'" data-char-class="'+esc(className)+'" data-profile-image="'+esc(profile)+'" data-server-id="'+esc(serverId)+'" data-char-key="'+esc(charKey)+'">?</span>'+sanctuaryIdentityBadge(s)+'</span>';
  return '<button class="char-card san-reaction-card '+(isMain?'is-main-character':'is-sub-character')+'" type="button" draggable="false" data-char-name="'+esc(s.name)+'" data-char-class="'+esc(className)+'" data-char-power="'+esc(fmt(pvePower))+'" data-pve-power="'+esc(fmt(pvePower))+'" data-pvp-power="'+esc(fmt(pvpPower))+'" data-char-owner="'+esc(mainCharacterName)+'" data-profile-image="'+esc(profile)+'" data-class-icon="'+esc(iconSrc)+'" data-server-id="'+esc(serverId)+'" data-char-key="'+esc(charKey)+'" data-detail-url="'+esc(sanctuaryDetailUrl(s))+'" aria-label="'+esc(s.name)+' 반응 남기기">'
    +'<span class="char-text"><span class="char-name-row"><span class="char-name">'+esc(s.name)+'</span>'+ownerBadge+'</span><span class="char-meta" title="정확한 전투력 '+esc(powerFull)+'">'+icon+esc(className)+' · '+esc(powerShort)+'</span></span>'+profileHtml+'</button>';
}
function bindSanctuaryProfileImages(){
  const loader=window.KinojoCharacterProfileImage;
  document.querySelectorAll('[data-character-profile]').forEach(container=>{
    const target={name:container.dataset.charName||'',className:container.dataset.charClass||'',profileImageUrl:container.dataset.profileImage||'',serverId:container.dataset.serverId||'',charKey:container.dataset.charKey||''};
    if(loader&&typeof loader.mount==='function'){
      loader.mount(container,target,{loading:'lazy',fallbackText:'?',classIconPadding:'22%'});
    }
  });
}
function waitlistCandidates(){return Array.isArray(sanctuaryData?.waiting)?sanctuaryData.waiting:[]}
function waitlistCatalog(){return Array.isArray(sanctuaryData?.waitlist?.catalog)?sanctuaryData.waitlist.catalog:[]}
function waitlistPower(value){const power=window.KinojoPowerFormat||{};return power.short?power.short(value):fmt(value)}
function waitlistAssetUrl(value){const raw=String(value||'').trim();return /^\/assets\/images\/sanctuary\/[0-9a-z._/-]+$/i.test(raw)&&!raw.includes('..')?raw:''}
function waitlistCurrentModes(){const item=waitlistCatalog().find(entry=>String(entry?.sanctuaryCode||'').toLowerCase()===String(currentId||'').toLowerCase());return Array.isArray(item?.entryModes)?item.entryModes:[]}
function renderWaiting(waiting){
  const root=document.getElementById('waitingSection');
  const list=Array.isArray(waiting)?waiting:[];
  const modes=waitlistCurrentModes();
  const rule=modes.map(mode=>esc(mode.label||'입장 가능')+' '+fmt(mode.minItemLevel)+'+').join(' · ');
  root.innerHTML='<div class="waiting-overview"><div><div class="waiting-kicker">SERVER ENGINE WAITLIST</div><h2 class="waiting-title">대기자 추천 배치</h2><p class="waiting-description">현재 성역 미편성 캐릭터 중 입장 아이템레벨을 충족한 인원입니다.'+(rule?' · '+rule:'')+'</p></div><button class="waiting-open-btn" type="button" data-waitlist-open'+(list.length?'':' disabled')+'><strong>'+fmt(list.length)+'명</strong><span>'+(list.length?'추천 배치 보기':'대기자 없음')+'</span></button></div>';
  bindWaitlistOpeners();
}
function bindWaitlistOpeners(){document.querySelectorAll('[data-waitlist-open]').forEach(button=>{button.onclick=()=>openWaitlistModal(button)});}
function isCompactWaitlistPhone(){return location.pathname.startsWith('/m/')&&Math.min(window.innerWidth,window.innerHeight)<=600}
function waitlistSetStep(step,{focus=true}={}){
  const modal=ensureWaitlistModal();
  sanctuaryWaitlistStep=Math.max(1,Math.min(4,Number(step)||1));
  modal.dataset.waitlistStep=String(sanctuaryWaitlistStep);
  modal.querySelectorAll('[data-waitlist-step-go]').forEach(button=>{
    const target=Number(button.dataset.waitlistStepGo);
    const enabled=target===1||(target===2&&!!sanctuaryWaitlistSelectionId)||(target===3&&!!sanctuaryWaitlistRecommendationData)||(target===4&&!!sanctuaryWaitlistSelectedTeamNo);
    button.disabled=!enabled;
    button.classList.toggle('is-active',target===sanctuaryWaitlistStep);
    button.setAttribute('aria-current',target===sanctuaryWaitlistStep?'step':'false');
  });
  const back=modal.querySelector('[data-waitlist-back]');
  if(back)back.hidden=sanctuaryWaitlistStep<=1;
  if(focus&&isCompactWaitlistPhone())modal.querySelector('[data-waitlist-mobile-pane="'+sanctuaryWaitlistStep+'"] button:not([disabled]),[data-waitlist-mobile-pane="'+sanctuaryWaitlistStep+'"] input')?.focus({preventScroll:true});
}
function ensureWaitlistModal(){
  let modal=document.getElementById('sanctuaryWaitlistModal');
  if(modal)return modal;
  modal=document.createElement('section');
  modal.id='sanctuaryWaitlistModal';
  modal.className='sanctuary-waitlist-modal';
  modal.setAttribute('aria-hidden','true');
  modal.innerHTML='<div class="sanctuary-waitlist-dialog" role="dialog" aria-modal="true" aria-labelledby="sanctuaryWaitlistTitle">'
    +'<header class="sanctuary-waitlist-head"><button class="waitlist-mobile-back" type="button" data-waitlist-back hidden aria-label="이전 단계">‹</button><div><div class="sanctuary-waitlist-kicker">SANCTUARY MATCHING</div><h2 id="sanctuaryWaitlistTitle">대기자 추천 배치</h2><p>캐릭터 → 성역 → 팀(포스) → 파티 빈자리</p></div><button class="sanctuary-waitlist-close" type="button" data-waitlist-close aria-label="대기자 추천 닫기">×</button></header>'
    +'<nav class="waitlist-step-nav" aria-label="추천 배치 단계"><button type="button" data-waitlist-step-go="1"><span>1</span>캐릭터</button><button type="button" data-waitlist-step-go="2" disabled><span>2</span>성역</button><button type="button" data-waitlist-step-go="3" disabled><span>3</span>팀·포스</button><button type="button" data-waitlist-step-go="4" disabled><span>4</span>파티</button></nav>'
    +'<div class="sanctuary-waitlist-grid">'
    +'<section class="sanctuary-waitlist-pane waitlist-people-pane" data-waitlist-mobile-pane="1" aria-label="대기자 리스트"><header><span>1</span><div><strong>대기자</strong><small id="waitlistPeopleCount">0명</small></div></header>'
    +'<div class="waitlist-people-controls"><div class="waitlist-view-tabs" role="tablist"><button type="button" data-waitlist-view="all" class="is-active">전체 보기</button><button type="button" data-waitlist-view="class">클래스별</button></div><div class="waitlist-sort-row"><span>정렬</span><button type="button" data-waitlist-sort="name" data-waitlist-sort-label="이름순" class="is-active" aria-pressed="true">이름순 <span class="waitlist-sort-arrow" aria-hidden="true">↑</span></button><button type="button" data-waitlist-sort="power" data-waitlist-sort-label="전투력순" aria-pressed="false">전투력순 <span class="waitlist-sort-arrow" aria-hidden="true">↕</span></button></div><label class="waitlist-search"><span class="sr-only">대기자 검색</span><input id="waitlistSearchInput" type="search" autocomplete="off" placeholder="이름 또는 클래스 검색"></label></div>'
    +'<div class="waitlist-people-browser"><nav class="waitlist-class-tabs kinojo-scrollbar" id="waitlistClassTabs" hidden aria-label="클래스 선택"></nav><div class="waitlist-person-list kinojo-scrollbar" id="waitlistPersonList"></div></div></section>'
    +'<section class="sanctuary-waitlist-pane waitlist-sanctuary-pane" data-waitlist-mobile-pane="2" aria-label="입장 가능 성역"><header><span>2</span><div><strong>입장 가능 성역</strong><small id="waitlistSelectedPerson">대기자를 선택하세요</small></div></header><div class="waitlist-sanctuary-list kinojo-scrollbar" id="waitlistSanctuaryList"><div class="waitlist-pane-empty">캐릭터를 선택하면 입장 가능한 성역이 표시됩니다.</div></div></section>'
    +'<section class="sanctuary-waitlist-pane waitlist-recommendation-pane" aria-label="추천 포스와 파티"><header><span>3</span><div><strong>추천 포스·파티</strong><small id="waitlistSelectedSanctuary">성역 카드를 선택하세요</small></div></header><div class="waitlist-recommendation-workspace">'
    +'<section class="waitlist-force-panel" data-waitlist-mobile-pane="3"><div class="waitlist-ranking-note"><strong>추천 기준</strong><span>클래스 중복 없음 → 합류하면 완성되는 포스 → 공석 적은 순</span></div><div class="waitlist-force-list kinojo-scrollbar" id="waitlistForceList"><div class="waitlist-pane-empty">성역을 선택하면 추천 포스가 표시됩니다.</div></div></section>'
    +'<section class="waitlist-party-panel" data-waitlist-mobile-pane="4"><div class="waitlist-party-detail kinojo-scrollbar" id="waitlistPartyDetail"><div class="waitlist-pane-empty">추천 포스를 선택하면 1·2파티의 10개 자리를 확인할 수 있습니다.</div></div></section>'
    +'</div></section></div></div>';
  document.body.appendChild(modal);
  modal.querySelector('[data-waitlist-close]')?.addEventListener('click',closeWaitlistModal);
  modal.addEventListener('click',event=>{if(event.target===modal)closeWaitlistModal()});
  modal.querySelector('#waitlistSearchInput')?.addEventListener('input',renderWaitlistPersonList);
  modal.querySelector('[data-waitlist-back]')?.addEventListener('click',()=>waitlistSetStep(sanctuaryWaitlistStep-1));
  modal.querySelectorAll('[data-waitlist-step-go]').forEach(button=>button.addEventListener('click',()=>{if(!button.disabled)waitlistSetStep(Number(button.dataset.waitlistStepGo))}));
  modal.querySelectorAll('[data-waitlist-view]').forEach(button=>button.addEventListener('click',()=>{sanctuaryWaitlistView=button.dataset.waitlistView||'all';if(sanctuaryWaitlistView==='class'&&!sanctuaryWaitlistClass)sanctuaryWaitlistClass=SANCTUARY_WAITLIST_CLASSES[0];renderWaitlistPersonControls();renderWaitlistPersonList()}));
  modal.querySelectorAll('[data-waitlist-sort]').forEach(button=>button.addEventListener('click',()=>{const next=button.dataset.waitlistSort||'name';if(next===sanctuaryWaitlistSort){sanctuaryWaitlistSortDirection=sanctuaryWaitlistSortDirection==='asc'?'desc':'asc'}else{sanctuaryWaitlistSort=next;sanctuaryWaitlistSortDirection='asc'}renderWaitlistPersonControls();renderWaitlistPersonList()}));
  window.addEventListener('resize',()=>modal.classList.toggle('is-compact-phone',isCompactWaitlistPhone()),{passive:true});
  return modal;
}
function openWaitlistModal(trigger){
  const modal=ensureWaitlistModal();
  sanctuaryWaitlistReturnFocus=trigger instanceof HTMLElement?trigger:document.activeElement;
  modal.classList.toggle('is-compact-phone',isCompactWaitlistPhone());
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  document.body.classList.add('sanctuary-waitlist-open');
  sanctuaryWaitlistSelectionId=0;
  sanctuaryWaitlistSelectedSanctuary='';
  sanctuaryWaitlistSelectedTeamNo=0;
  sanctuaryWaitlistRecommendationData=null;
  sanctuaryWaitlistStep=1;
  renderWaitlistPersonControls();
  renderWaitlistPersonList();
  resetWaitlistFollowingSteps();
  waitlistSetStep(1,{focus:false});
  (isCompactWaitlistPhone()?modal.querySelector('#waitlistSearchInput'):modal.querySelector('[data-waitlist-close]'))?.focus({preventScroll:true});
}
function closeWaitlistModal(){
  const modal=document.getElementById('sanctuaryWaitlistModal');
  if(!modal?.classList.contains('open'))return;
  sanctuaryWaitlistRecommendationSeq+=1;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  document.body.classList.remove('sanctuary-waitlist-open');
  if(sanctuaryWaitlistReturnFocus?.isConnected)sanctuaryWaitlistReturnFocus.focus({preventScroll:true});
}
function renderWaitlistEmptyModal(){
  const modal=ensureWaitlistModal();
  const people=modal.querySelector('#waitlistPersonList');
  const sanctuaries=modal.querySelector('#waitlistSanctuaryList');
  const recommendations=modal.querySelector('#waitlistForceList');
  const detail=modal.querySelector('#waitlistPartyDetail');
  if(people)people.innerHTML='<div class="waitlist-pane-empty">현재 기준을 충족한 미편성 캐릭터가 없습니다.</div>';
  if(sanctuaries)sanctuaries.innerHTML='<div class="waitlist-pane-empty">입장 가능 성역이 없습니다.</div>';
  if(recommendations)recommendations.innerHTML='<div class="waitlist-pane-empty">추천할 포스가 없습니다.</div>';
  if(detail)detail.innerHTML='<div class="waitlist-pane-empty">확인할 파티 구성이 없습니다.</div>';
}
function renderWaitlistPersonControls(){
  const modal=ensureWaitlistModal();
  modal.querySelector('.waitlist-people-pane')?.classList.toggle('is-class-view',sanctuaryWaitlistView==='class');
  modal.querySelectorAll('[data-waitlist-view]').forEach(button=>button.classList.toggle('is-active',button.dataset.waitlistView===sanctuaryWaitlistView));
  modal.querySelectorAll('[data-waitlist-sort]').forEach(button=>{const active=button.dataset.waitlistSort===sanctuaryWaitlistSort;const label=button.dataset.waitlistSortLabel||button.textContent.trim();button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',active?'true':'false');button.setAttribute('aria-label',active?label+' '+(sanctuaryWaitlistSortDirection==='asc'?'오름차순':'내림차순'):label+' 정렬');const arrow=button.querySelector('.waitlist-sort-arrow');if(arrow)arrow.textContent=active?(sanctuaryWaitlistSortDirection==='asc'?'↑':'↓'):'↕'});
  const root=modal.querySelector('#waitlistClassTabs');
  if(root){root.hidden=sanctuaryWaitlistView!=='class';root.innerHTML=SANCTUARY_WAITLIST_CLASSES.map(name=>'<button type="button" class="'+(name===sanctuaryWaitlistClass?'is-active':'')+'" data-waitlist-class="'+esc(name)+'">'+esc(name)+'</button>').join('');root.querySelectorAll('[data-waitlist-class]').forEach(button=>button.addEventListener('click',()=>{sanctuaryWaitlistClass=button.dataset.waitlistClass||'';renderWaitlistPersonControls();renderWaitlistPersonList()}));}
}
function renderWaitlistPersonList(){
  const modal=ensureWaitlistModal();
  const root=modal.querySelector('#waitlistPersonList');
  const count=modal.querySelector('#waitlistPeopleCount');
  if(!root)return;
  const query=String(modal.querySelector('#waitlistSearchInput')?.value||'').trim().toLowerCase();
  const direction=sanctuaryWaitlistSortDirection==='desc'?-1:1;
  const items=waitlistCandidates().filter(item=>(sanctuaryWaitlistView!=='class'||String(item.className||'')===sanctuaryWaitlistClass)&&(!query||String(item.name||'').toLowerCase().includes(query)||String(item.className||'').toLowerCase().includes(query))).sort((a,b)=>{const byName=String(a.name||'').localeCompare(String(b.name||''),'ko');if(sanctuaryWaitlistSort==='power'){const byPower=(Number(a.combatPower||0)-Number(b.combatPower||0))*direction;return byPower||byName}return byName*direction});
  if(count)count.textContent=fmt(items.length)+'명';
  root.innerHTML=items.length?items.map(item=>{
    const selected=Number(item.characterMasterId)===sanctuaryWaitlistSelectionId;
    return '<button class="waitlist-person-card'+(selected?' is-selected':'')+'" type="button" data-waitlist-person="'+esc(item.characterMasterId)+'" aria-pressed="'+(selected?'true':'false')+'"><strong>'+esc(item.name||'이름 미확인')+'</strong><span><em>'+esc(item.className||'직업 미확인')+'</em><em>전투력 '+esc(waitlistPower(item.combatPower))+'</em></span><small>아이템레벨 '+fmt(item.itemLevel)+'</small></button>';
  }).join(''):'<div class="waitlist-pane-empty">검색 결과가 없습니다.</div>';
  root.querySelectorAll('[data-waitlist-person]').forEach(button=>button.addEventListener('click',()=>selectWaitlistCandidate(Number(button.dataset.waitlistPerson),{focus:true})));
}
function selectWaitlistCandidate(characterMasterId,{focus=false}={}){
  const candidate=waitlistCandidates().find(item=>Number(item.characterMasterId)===Number(characterMasterId));
  if(!candidate)return;
  sanctuaryWaitlistSelectionId=Number(candidate.characterMasterId);
  sanctuaryWaitlistSelectedSanctuary='';
  sanctuaryWaitlistSelectedTeamNo=0;
  sanctuaryWaitlistRecommendationData=null;
  renderWaitlistPersonList();
  const modal=ensureWaitlistModal();
  const selected=modal.querySelector('#waitlistSelectedPerson');
  if(selected)selected.textContent=(candidate.name||'대기자')+' · '+(candidate.className||'직업 미확인');
  const sanctuaries=Array.isArray(candidate.accessibleSanctuaries)?candidate.accessibleSanctuaries:[];
  const root=modal.querySelector('#waitlistSanctuaryList');
  root.innerHTML=sanctuaries.length?sanctuaries.map((item,index)=>waitlistSanctuaryCardHtml(item,index)).join(''):'<div class="waitlist-pane-empty">현재 입장 가능한 미편성 성역이 없습니다.</div>';
  root.querySelectorAll('[data-waitlist-sanctuary]').forEach(button=>button.addEventListener('click',()=>loadWaitlistRecommendations(candidate,button.dataset.waitlistSanctuary,button)));
  const rightTitle=modal.querySelector('#waitlistSelectedSanctuary');
  const right=modal.querySelector('#waitlistRecommendationList');
  if(rightTitle)rightTitle.textContent='성역 카드를 선택하세요';
  if(right)right.innerHTML='<div class="waitlist-pane-empty">가운데 성역 카드를 누르면 실시간 공석과 클래스 구성을 계산합니다.</div>';
  waitlistSetStep(2,{focus:isCompactWaitlistPhone()});
  if(focus&&!isCompactWaitlistPhone())root.querySelector('[data-waitlist-sanctuary]')?.focus({preventScroll:true});
}
function waitlistSanctuaryCardHtml(item,index){
  const background=waitlistAssetUrl(item.backgroundImage);
  const boss=waitlistAssetUrl(item.bossImage);
  const modes=Array.isArray(item.eligibleModes)?item.eligibleModes:[];
  return '<button class="waitlist-sanctuary-card" type="button" data-waitlist-sanctuary="'+esc(item.sanctuaryCode||'')+'" style="--waitlist-card-delay:'+Math.min(index*85,340)+'ms">'+(background?'<img class="waitlist-sanctuary-bg" src="'+esc(background)+'" alt="" loading="lazy" decoding="async">':'')+'<span class="waitlist-sanctuary-shade"></span>'+(boss?'<img class="waitlist-sanctuary-boss" src="'+esc(boss)+'" alt="" loading="lazy" decoding="async">':'')+'<span class="waitlist-sanctuary-copy"><small>성역 '+esc(item.sanctuaryNo||'')+'</small><strong>'+esc(item.sanctuaryName||item.shortName||'성역')+'</strong><em>Boss. '+esc(item.bossName||'-')+'</em><span class="waitlist-mode-list">'+modes.map(mode=>'<i>'+esc(mode.label||'입장 가능')+' '+fmt(mode.minItemLevel)+'+</i>').join('')+'</span></span><span class="waitlist-card-arrow" aria-hidden="true">›</span></button>';
}
async function loadWaitlistRecommendations(candidate,sanctuaryCode,button){
  const modal=ensureWaitlistModal();
  modal.querySelectorAll('[data-waitlist-sanctuary]').forEach(item=>item.classList.toggle('is-selected',item===button));
  const selectedCard=(Array.isArray(candidate.accessibleSanctuaries)?candidate.accessibleSanctuaries:[]).find(item=>String(item.sanctuaryCode)===String(sanctuaryCode));
  const title=modal.querySelector('#waitlistSelectedSanctuary');
  const root=modal.querySelector('#waitlistForceList');
  const detail=modal.querySelector('#waitlistPartyDetail');
  sanctuaryWaitlistSelectedSanctuary=String(sanctuaryCode||'');
  sanctuaryWaitlistSelectedTeamNo=0;
  sanctuaryWaitlistRecommendationData=null;
  if(title)title.textContent=selectedCard?.shortName||selectedCard?.sanctuaryName||'추천 계산 중';
  if(root)root.innerHTML=sanctuarySpinner('클래스 중복과 공석을 다시 계산하는 중');
  if(detail)detail.innerHTML='<div class="waitlist-pane-empty">추천 포스를 선택하면 1·2파티 구성원이 표시됩니다.</div>';
  waitlistSetStep(3,{focus:false});
  const seq=++sanctuaryWaitlistRecommendationSeq;
  try{
    if(!window.KinojoApi)throw new Error('KinojoApi 연결을 확인해 주세요.');
    const data=await withRequestTimeout(window.KinojoApi.getAction('sanctuaryWaitlistRecommendations',{characterMasterId:candidate.characterMasterId,sanctuaryId:sanctuaryCode}),SANCTUARY_REQUEST_TIMEOUT_MS,'추천 배치 응답 시간이 초과되었습니다.');
    if(seq!==sanctuaryWaitlistRecommendationSeq||Number(candidate.characterMasterId)!==sanctuaryWaitlistSelectionId)return;
    if(!data||data.ok===false)throw new Error(data?.message||'추천 배치를 계산하지 못했습니다.');
    renderWaitlistRecommendations(data);
  }catch(error){
    if(seq!==sanctuaryWaitlistRecommendationSeq)return;
    if(root){root.innerHTML='<div class="waitlist-recommendation-error"><strong>추천 배치를 불러오지 못했습니다.</strong><span>'+esc(error?.message||'추천 조회 실패')+'</span><button type="button" data-waitlist-retry>다시 계산</button></div>';root.querySelector('[data-waitlist-retry]')?.addEventListener('click',()=>loadWaitlistRecommendations(candidate,sanctuaryCode,button));}
  }
}
function renderWaitlistRecommendations(data){
  const modal=ensureWaitlistModal();
  const root=modal.querySelector('#waitlistForceList');
  if(!root)return;
  const items=Array.isArray(data.recommendations)?data.recommendations:[];
  sanctuaryWaitlistRecommendationData=data;
  sanctuaryWaitlistSelectedTeamNo=0;
  root.innerHTML=items.length?items.map((item,index)=>waitlistRecommendationHtml(item,index)).join(''):'<div class="waitlist-pane-empty">현재 공석이 있는 포스가 없습니다.</div>';
  root.querySelectorAll('[data-waitlist-force]').forEach(button=>button.addEventListener('click',()=>selectWaitlistForce(Number(button.dataset.waitlistForce),button)));
  waitlistSetStep(3,{focus:isCompactWaitlistPhone()});
}
function waitlistRecommendationHtml(item,index){
  const safe=item.hasClassSafeParty===true;
  const completionReady=item.completionReady===true||Number(item.totalVacancies||0)===1;
  const parties=Array.isArray(item.parties)?item.parties:[];
  const partySummary=parties.map(party=>'<span><b>'+esc(party.partyName||party.partyNo+'파티')+'</b><i>'+fmt(party.filled)+' / '+fmt(party.capacity)+'</i></span>').join('');
  return '<button class="waitlist-force-card'+(safe?' is-class-safe':'')+(completionReady?' is-completion-ready':'')+'" type="button" data-waitlist-force="'+esc(item.teamNo)+'"><span class="waitlist-force-card-head"><span class="waitlist-force-rank">추천 '+(index+1)+(completionReady?' · 합류 시 완성':'')+'</span><span class="waitlist-force-score">공석 '+fmt(item.totalVacancies)+'</span></span><span class="waitlist-force-main"><small>'+esc(item.teamGroupName||item.teamGroupNo+'팀')+'</small><strong>'+esc(item.forceName||item.forceNo+'포스')+'</strong><em class="waitlist-force-party-summary">'+partySummary+'</em></span><span class="waitlist-force-arrow" aria-hidden="true">›</span></button>';
}
async function selectWaitlistForce(teamNo,button){
  const candidate=waitlistCandidates().find(item=>Number(item.characterMasterId)===sanctuaryWaitlistSelectionId);
  if(!candidate||!sanctuaryWaitlistSelectedSanctuary)return;
  sanctuaryWaitlistSelectedTeamNo=Number(teamNo||0);
  ensureWaitlistModal().querySelectorAll('[data-waitlist-force]').forEach(item=>item.classList.toggle('is-selected',item===button));
  await loadWaitlistSlotDetail(candidate,sanctuaryWaitlistSelectedSanctuary,sanctuaryWaitlistSelectedTeamNo);
}
async function loadWaitlistSlotDetail(candidate,sanctuaryCode,teamNo){
  const modal=ensureWaitlistModal();
  const root=modal.querySelector('#waitlistPartyDetail');
  if(root)root.innerHTML=sanctuarySpinner('포스 구성원과 빈자리를 확인하는 중');
  waitlistSetStep(4,{focus:false});
  const seq=++sanctuaryWaitlistSlotSeq;
  try{
    const data=await withRequestTimeout(window.KinojoApi.getAction('sanctuaryWaitlistSlotDetail',{characterMasterId:candidate.characterMasterId,sanctuaryId:sanctuaryCode,teamNo}),SANCTUARY_REQUEST_TIMEOUT_MS,'포스 구성 응답 시간이 초과되었습니다.');
    if(seq!==sanctuaryWaitlistSlotSeq||Number(teamNo)!==sanctuaryWaitlistSelectedTeamNo)return;
    if(!data||data.ok===false)throw new Error(data?.message||'포스 구성을 불러오지 못했습니다.');
    renderWaitlistPartyDetail(data);
  }catch(error){if(seq===sanctuaryWaitlistSlotSeq&&root)root.innerHTML='<div class="waitlist-recommendation-error"><strong>포스 구성을 불러오지 못했습니다.</strong><span>'+esc(error?.message||'조회 실패')+'</span><button type="button" data-waitlist-slot-retry>다시 확인</button></div>';root?.querySelector('[data-waitlist-slot-retry]')?.addEventListener('click',()=>loadWaitlistSlotDetail(candidate,sanctuaryCode,teamNo));}
}
function renderWaitlistPartyDetail(data){
  const root=ensureWaitlistModal().querySelector('#waitlistPartyDetail');
  if(!root)return;
  const force=data.force||{};
  const slots=Array.isArray(data.slots)?data.slots:[];
  const parties=Array.isArray(data.parties)?data.parties:[];
  root.innerHTML='<header class="waitlist-party-detail-head"><div><small>'+esc(force.teamGroupName||force.teamGroupNo+'팀')+'</small><strong>'+esc(force.forceName||force.forceNo+'포스')+'</strong></div><span>빈자리를 눌러 편성·지원</span></header><div class="waitlist-party-columns">'+parties.map(party=>waitlistPartyColumnHtml(party,slots,data)).join('')+'</div>';
  root.querySelectorAll('[data-waitlist-empty-slot]').forEach(button=>button.addEventListener('click',()=>handleWaitlistEmptySlot(button,data)));
  waitlistSetStep(4,{focus:isCompactWaitlistPhone()});
}
function waitlistPartyColumnHtml(party,slots,data){
  const capacity=Math.max(1,Number(party.capacity||5));
  const rows=Array.from({length:capacity},(_,index)=>slots.find(slot=>Number(slot.partyNo)===Number(party.partyNo)&&Number(slot.slotNo)===index+1)||{partyNo:party.partyNo,slotNo:index+1,occupied:false});
  return '<section class="waitlist-party-column"><header><strong>'+esc(party.partyName||party.partyNo+'파티')+'</strong><span>'+fmt(party.filled)+' / '+fmt(capacity)+'</span></header><div>'+rows.map(slot=>waitlistSlotHtml(slot,data)).join('')+'</div></section>';
}
function waitlistSlotHtml(slot,data){
  if(slot.occupied){return '<article class="waitlist-slot is-filled"><span class="waitlist-slot-number">'+fmt(slot.slotNo)+'</span><div><strong>'+esc(slot.name||'구성원')+'</strong><small>'+esc(slot.className||'직업 미확인')+' · 전투력 '+esc(waitlistPower(slot.combatPower))+'</small></div></article>';}
  const mode=String(data.actor?.actionMode||'LOGIN');
  const pending=slot.myPending===true;
  const label=pending?'지원 요청 대기 중':mode==='MANAGE'?'+ 바로 편성':mode==='SUPPORT'?'+ 지원하기':mode==='LOGIN'?'+ 로그인 후 선택':'+ 빈자리';
  return '<button class="waitlist-slot is-empty'+(pending?' is-pending':'')+'" type="button" data-waitlist-empty-slot data-party-no="'+esc(slot.partyNo)+'" data-slot-no="'+esc(slot.slotNo)+'" '+(pending?'disabled':'')+'><span class="waitlist-slot-number">'+fmt(slot.slotNo)+'</span><strong>'+label+'</strong></button>';
}
function ensureWaitlistConfirm(){
  let modal=document.getElementById('sanctuaryWaitlistConfirm');if(modal)return modal;
  modal=document.createElement('section');modal.id='sanctuaryWaitlistConfirm';modal.className='waitlist-confirm-modal';modal.setAttribute('aria-hidden','true');
  modal.innerHTML='<div class="waitlist-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="waitlistConfirmTitle"><div class="waitlist-confirm-icon">✓</div><h3 id="waitlistConfirmTitle">포스 배치 확인</h3><p id="waitlistConfirmMessage"></p><div><button type="button" data-waitlist-confirm-cancel>취소</button><button type="button" class="primary" data-waitlist-confirm-ok>저장</button></div></div>';
  document.body.appendChild(modal);return modal;
}
function askWaitlistConfirm(message,okLabel){
  const modal=ensureWaitlistConfirm();modal.querySelector('#waitlistConfirmMessage').textContent=message;modal.querySelector('[data-waitlist-confirm-ok]').textContent=okLabel||'저장';modal.classList.add('open');modal.setAttribute('aria-hidden','false');
  return new Promise(resolve=>{const finish=value=>{modal.classList.remove('open');modal.setAttribute('aria-hidden','true');ok.onclick=null;cancel.onclick=null;resolve(value)};const ok=modal.querySelector('[data-waitlist-confirm-ok]');const cancel=modal.querySelector('[data-waitlist-confirm-cancel]');ok.onclick=()=>finish(true);cancel.onclick=()=>finish(false);cancel.focus();});
}
async function handleWaitlistEmptySlot(button,data){
  const actor=data.actor||{};const mode=String(actor.actionMode||'LOGIN');
  if(mode==='LOGIN'){window.KinojoAuth?.openLoginModal?.('빈자리를 선택하려면 로그인해 주세요.',{context:'sanctuary'});return;}
  if(mode==='VIEW'){window.KinojoToast?.show?.('본인 소유 캐릭터만 지원하거나 담당 포스 관리자가 편성할 수 있습니다.');return;}
  const candidate=data.candidate||{};const force=data.force||{};const partyNo=Number(button.dataset.partyNo);const slotNo=Number(button.dataset.slotNo);
  const location='['+String(force.teamGroupName||force.teamGroupNo+'팀')+']['+String(force.forceName||force.forceNo+'포스')+']['+partyNo+'파티]';
  const manage=mode==='MANAGE';const message=manage?'['+candidate.name+'] 캐릭터를 해당 '+location+' 구성원에 포함시키겠습니까?':'['+candidate.name+'] 캐릭터를 해당 '+location+'에 지원하시겠습니까?';
  if(!await askWaitlistConfirm(message,manage?'저장':'지원'))return;
  button.disabled=true;button.classList.add('is-busy');
  try{
    const result=manage
      ?await window.KinojoApi.postAction('sanctuaryRoster',{command:'DIRECT_ASSIGN',characterMasterId:candidate.characterMasterId,sanctuaryId:force.sanctuaryCode,teamNo:force.teamNo,partyNo,slotNo,requestKey:'waitlist-v316-'+(crypto.randomUUID?.()||Date.now())})
      :await window.KinojoApi.postAction('sanctuarySupportRequest',{characterMasterId:candidate.characterMasterId,sanctuaryId:force.sanctuaryCode,teamNo:force.teamNo,partyNo,slotNo,requestKey:'support-v316-'+(crypto.randomUUID?.()||Date.now())});
    if(!result||result.ok===false)throw new Error(result?.message||'요청을 처리하지 못했습니다.');
    window.KinojoToast?.show?.(result.message||(manage?'편성을 완료했습니다.':'지원 요청을 보냈습니다.'));
    await loadWaitlistSlotDetail(candidate,force.sanctuaryCode,force.teamNo);
    if(manage)loadData({force:true,preserveRendered:true});
  }catch(error){window.KinojoToast?.show?.(error?.message||'요청 처리에 실패했습니다.');button.disabled=false;button.classList.remove('is-busy');}
}
function resetWaitlistFollowingSteps(){
  const modal=ensureWaitlistModal();const sanctuaries=modal.querySelector('#waitlistSanctuaryList');const forces=modal.querySelector('#waitlistForceList');const detail=modal.querySelector('#waitlistPartyDetail');
  if(!sanctuaryWaitlistSelectionId&&sanctuaries)sanctuaries.innerHTML='<div class="waitlist-pane-empty">캐릭터를 선택하면 입장 가능한 성역이 표시됩니다.</div>';
  if(forces)forces.innerHTML='<div class="waitlist-pane-empty">성역을 선택하면 추천 포스가 표시됩니다.</div>';
  if(detail)detail.innerHTML='<div class="waitlist-pane-empty">추천 포스를 선택하면 1·2파티의 10개 자리를 확인할 수 있습니다.</div>';
}
function refreshWaitlistModalIfOpen(){
  const modal=document.getElementById('sanctuaryWaitlistModal');
  if(!modal?.classList.contains('open'))return;
  const candidates=waitlistCandidates();
  if(!candidates.some(item=>Number(item.characterMasterId)===sanctuaryWaitlistSelectionId))sanctuaryWaitlistSelectionId=0;
  renderWaitlistPersonList();
  if(sanctuaryWaitlistSelectionId)selectWaitlistCandidate(sanctuaryWaitlistSelectionId);
  else resetWaitlistFollowingSteps();
}

/* Shared character reaction modal: ui/kinojo-character-reaction.js */
function openSanctuaryReactionModalFromCard(card){
  if(!window.KinojoCharacterReaction){
    window.KinojoToast?.show?.('캐릭터 반응 기능을 불러오지 못했습니다.');
    return;
  }
  const target={
    name:card.dataset.charName||'',
    className:card.dataset.charClass||'',
    serverId:card.dataset.serverId||'',
    charKey:card.dataset.charKey||'',
    pvePower:card.dataset.pvePower||card.dataset.charPower||'',
    pvpPower:card.dataset.pvpPower||'',
    owner:card.dataset.charOwner||'',
    profileImageUrl:card.dataset.profileImage||'',
    classIconUrl:card.dataset.classIcon||'',
    detailUrl:card.dataset.detailUrl||''
  };
  window.KinojoCharacterReaction.open({
    source:'sanctuary',
    context:'sanctuary',
    limitPrefix:'kinojo_sanctuary_react',
    target,
    onSubmit:async payload=>window.KinojoApi.postAction('hallReaction',{
      characterName:payload.target.name,
      serverId:payload.target.serverId||'',
      reaction:payload.reaction,
      comment:payload.comment,
      clientKey:payload.clientKey,
      sessionToken:payload.sessionToken,
      source:'sanctuary'
    })
  });
}
function bindSanctuaryReactionCards(){document.querySelectorAll('.san-reaction-card').forEach(card=>{card.onclick=event=>{event.preventDefault();event.stopPropagation();openSanctuaryReactionModalFromCard(card);};});}

function verifyTeamRender(groups){
  const expected=Array.isArray(groups)?groups.length:0;
  if(!expected)return;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{const root=document.getElementById('teamList');if(root&&root.querySelectorAll('.san-team-group').length!==expected){renderTeamGroups(groups);bindSanctuaryProfileImages();setupSliders();bindForceSwitchers();bindSanctuaryReactionCards()}}));
}
function bindForceSwitchers(){
  document.querySelectorAll('.san-team-group').forEach(group=>{
    const track=group.querySelector('.san-force-list');
    const cards=Array.from(group.querySelectorAll('.force-card'));
    const buttons=Array.from(group.querySelectorAll('[data-force-target]'));
    if(!track||cards.length<2||!buttons.length)return;
    let raf=0;
    const activate=()=>{raf=0;let selected=cards[0];let distance=Infinity;cards.forEach(card=>{const current=Math.abs(card.offsetLeft-track.scrollLeft);if(current<distance){distance=current;selected=card}});buttons.forEach(button=>button.classList.toggle('is-active',button.dataset.forceTarget===selected.id))};
    buttons.forEach(button=>button.addEventListener('click',()=>{const target=document.getElementById(button.dataset.forceTarget);if(!target)return;track.scrollTo({left:Math.max(0,target.offsetLeft-track.offsetLeft),behavior:'smooth'});buttons.forEach(item=>item.classList.toggle('is-active',item===button))}));
    track.addEventListener('scroll',()=>{if(!raf)raf=requestAnimationFrame(activate)},{passive:true});
    activate();
  });
}
function setupSliders(){document.querySelectorAll('.san-force-rail-shell').forEach(shell=>{const track=shell.querySelector('.san-force-list'),left=shell.querySelector('.slide-btn.left'),right=shell.querySelector('.slide-btn.right');if(!track||!left||!right)return;function update(){const max=Math.max(0,track.scrollWidth-track.clientWidth);left.classList.toggle('show',max>8&&track.scrollLeft>8);right.classList.toggle('show',max>8&&track.scrollLeft<max-8)}left.onclick=()=>track.scrollBy({left:-Math.min(520,track.clientWidth*.9),behavior:'smooth'});right.onclick=()=>track.scrollBy({left:Math.min(520,track.clientWidth*.9),behavior:'smooth'});track.addEventListener('scroll',update,{passive:true});if(typeof ResizeObserver==='function'){const observer=new ResizeObserver(update);observer.observe(track);observer.observe(shell)}requestAnimationFrame(()=>requestAnimationFrame(update));setTimeout(update,280)})}
function openTip(){document.getElementById('tipPanel')?.classList.add('open');document.getElementById('tipPanel')?.setAttribute('aria-hidden','false')}function closeTip(){document.getElementById('tipPanel')?.classList.remove('open');document.getElementById('tipPanel')?.setAttribute('aria-hidden','true')}function openAdmin(){if(window.KinojoSanctuaryEditor&&typeof window.KinojoSanctuaryEditor.open==='function')return window.KinojoSanctuaryEditor.open();document.getElementById('adminCodeModal')?.classList.add('open');document.getElementById('adminCodeModal')?.setAttribute('aria-hidden','false')}function closeAdmin(){document.getElementById('adminCodeModal')?.classList.remove('open');document.getElementById('adminCodeModal')?.setAttribute('aria-hidden','true')}
window.addEventListener('kinojo:auth-changed',()=>{operationRequestSeq+=1;operationLoadedKey='';operationLoadKey='';operationRefreshQueued=false;renderOperationSkeleton();loadData({force:true,preserveRendered:false});if(currentId)ensureSanctuaryOperation(true)});
document.getElementById('tipOpenBtn')?.addEventListener('click',openTip);document.getElementById('tipCloseBtn')?.addEventListener('click',closeTip);document.getElementById('tipPanel')?.addEventListener('click',e=>{if(e.target.id==='tipPanel')closeTip()});document.getElementById('editModeBtn')?.addEventListener('click',openAdmin);document.getElementById('adminCodeCloseBtn')?.addEventListener('click',closeAdmin);document.getElementById('adminCodeModal')?.addEventListener('click',e=>{if(e.target.id==='adminCodeModal')closeAdmin()});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeTip();closeAdmin();closeWaitlistModal()}});loadData();
