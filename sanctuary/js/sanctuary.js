const SANCTUARY_API_PARAM=new URLSearchParams(location.search).get("api")||"";
const params=new URLSearchParams(location.search);
let currentId=String(params.get("id")||"").trim().toLowerCase();
let masterInfo=null;
const CLASS_ASSET_BASE='/assets/images/classes/';
const CLASS_ICON={"검성":"class_icon_gladiator.png","수호성":"class_icon_templar.png","살성":"class_icon_assassin.png","궁성":"class_icon_ranger.png","정령성":"class_icon_elementalist.png","마도성":"class_icon_sorcerer.png","치유성":"class_icon_cleric.png","호법성":"class_icon_chanter.png","권성":"class_icon_fighter.png"};
function classIconSrc(className){return CLASS_ICON[className]?CLASS_ASSET_BASE+CLASS_ICON[className]:''}
let sanctuaryData=null;
let operationLoadKey='';
let operationRequestSeq=0;
let sanctuaryRequestSeq=0;
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}
function fmt(n){return Number(n||0).toLocaleString("ko-KR")}
function currentFallback(){return {info:masterInfo||{sanctuaryId:currentId,sanctuaryNo:"",sanctuaryName:"성역",shortName:"성역",bossName:""}}}
function setActiveLinks(){}
/* KINOJO common drawer is managed by GitHub_Pages/ui/kinojo-common-ui.js */
const SANCTUARY_CACHE_TTL_MS=5*60*1000;
function sanctuaryCacheKey(){const session=window.KinojoAuth?.getSession?.()||{};const identity=String(session.mainCharacter||session.mainCharacterName||'guest').trim().replace(/[^0-9A-Za-z가-힣_-]+/g,'_');return 'kinojo_sanctuary_cache_v2026071518_'+(currentId||'default')+'_'+(identity||'guest')}
function readSanctuaryCache(){try{const raw=sessionStorage.getItem(sanctuaryCacheKey());if(!raw)return null;const cached=JSON.parse(raw);if(!cached||!cached.savedAt||!cached.data)return null;if(Date.now()-cached.savedAt>SANCTUARY_CACHE_TTL_MS)return null;return cached.data}catch(e){return null}}
function writeSanctuaryCache(data){try{if(data&&data.ok!==false)sessionStorage.setItem(sanctuaryCacheKey(),JSON.stringify({savedAt:Date.now(),data}))}catch(e){}}
function sanctuaryTopbarUpdateText(value,fromCache=false){const raw=String(value||'').trim();const matched=raw.match(/(?:T|\s)(\d{1,2}:\d{2})(?::\d{2})?/)||raw.match(/(\d{1,2}:\d{2})/);const time=matched?.[1]||'';return time?'업데이트 '+time+(fromCache?' · 캐시':''):(fromCache?'캐시 데이터':'업데이트 완료')}
function setSanctuarySyncState(value,{fromCache=false,error=false}={}){const raw=String(value||'').trim();const bodyChip=document.getElementById('sanctuarySyncChip');if(bodyChip)bodyChip.textContent=error?(raw||'성역 데이터를 불러오지 못했습니다.'):'Server Engine 업데이트 '+(raw||'완료')+(fromCache?' · 캐시':'');const topbarChip=document.getElementById('syncChip');if(topbarChip)topbarChip.textContent=error?'업데이트 확인 실패':sanctuaryTopbarUpdateText(raw,fromCache)}
function applySanctuaryData(data,{fromCache=false}={}){sanctuaryData=data;masterInfo=data?.info||data?.master||masterInfo;currentId=String(masterInfo?.sanctuaryId||masterInfo?.code||currentId||"").trim().toLowerCase();window.KinojoSanctuaryCurrentId=currentId;if(currentId&&!params.get("id")){const next=new URL(location.href);next.searchParams.set("id",currentId);history.replaceState(null,"",next)}render(data);ensureSanctuaryOperation();setSanctuarySyncState(data.generatedAt||"완료",{fromCache})}
async function fetchSanctuaryFresh(){const seq=++sanctuaryRequestSeq;if(!window.KinojoApi)throw new Error('KinojoApi 연결을 확인해 주세요.');const data=await window.KinojoApi.getAction('sanctuary',{id:currentId||''});if(seq!==sanctuaryRequestSeq)return null;if(!data||data.ok===false)throw new Error(data?.message||'성역 데이터 로드 실패');writeSanctuaryCache(data);return data}
async function loadData(){setActiveLinks();renderSkeleton();const cached=readSanctuaryCache();try{if(cached){applySanctuaryData(cached,{fromCache:true});fetchSanctuaryFresh().then(data=>{if(data)applySanctuaryData(data)}).catch(()=>{});return}const data=await fetchSanctuaryFresh();if(data)applySanctuaryData(data)}catch(err){if(cached){applySanctuaryData(cached,{fromCache:true});return}const f=currentFallback();sanctuaryData={ok:true,info:f.info,summary:{totalCharacters:0,teamCount:0,partyCount:0,averagePower:0},teams:[],waiting:[],tips:['성역 Server Engine 연결을 확인해 주세요.'],generatedAt:'데이터 없음'};render(sanctuaryData);setSanctuarySyncState('성역 데이터를 불러오지 못했습니다.',{error:true})}}
function sanctuarySpinner(label){return '<div class="kinojo-card-loading"><span class="kinojo-spinner" aria-hidden="true"><span></span></span><span>'+esc(label||'불러오는 중')+'</span></div>'}
function renderSkeleton(){
  const summary=document.getElementById('summaryGrid');
  const team=document.getElementById('teamList');
  const waiting=document.getElementById('waitingSection');
  const tip=document.getElementById('tipBody');
  if(summary)summary.innerHTML=[sanctuarySpinner('등록 현황 집계 중'),sanctuarySpinner('포스 정보 확인 중'),sanctuarySpinner('파티 정보 확인 중'),sanctuarySpinner('평균 전투력 계산 중')].map(x=>'<div class="summary-card">'+x+'</div>').join('');
  if(team)team.innerHTML=sanctuarySpinner('성역 포스 데이터를 불러오는 중');
  if(waiting)waiting.innerHTML='<h2 class="waiting-title">대기자 명단</h2>'+sanctuarySpinner('대기자 확인 중');
  if(tip)tip.innerHTML=sanctuarySpinner('공략 팁 불러오는 중');
  renderOperationSkeleton();
}

function currentSanctuaryPassKey(){
  const session=window.KinojoAuth&&typeof window.KinojoAuth.getSession==='function'?window.KinojoAuth.getSession():null;
  return String(session?.passKey||session?.passCode||'').trim();
}
function operationStatusClass(value){
  const state=String(value||'').toLowerCase();
  return ['today','survey','coordinating','confirmed','canceled','completed'].includes(state)?state:'survey';
}
function renderOperationSkeleton(){
  const week=document.getElementById('operationWeekLabel');
  const auth=document.getElementById('operationAuthState');
  const schedules=document.getElementById('operationScheduleList');
  if(week)week.textContent='아이온 주간 · 수요일부터 화요일까지';
  if(auth)auth.textContent='Server Engine 확인 중';
  if(schedules)schedules.innerHTML=sanctuarySpinner('성역 일정을 불러오는 중');
}
function ensureSanctuaryOperation(force=false){
  if(!currentId)return;
  const scheduleLink=document.getElementById('operationSchedulePageLink');
  if(scheduleLink){const mobile=/(^|\/)m(\/|$)/.test(location.pathname);scheduleLink.href=(mobile?'/m/sanctuary-schedule/':'/sanctuary-schedule/')}
  const key=currentId+'|'+currentSanctuaryPassKey();
  if(!force&&operationLoadKey===key)return;
  operationLoadKey=key;
  loadSanctuaryOperation(key);
}
async function loadSanctuaryOperation(key){
  const seq=++operationRequestSeq;
  renderOperationSkeleton();
  try{
    if(!window.KinojoApi)throw new Error('KinojoApi 연결을 확인해 주세요.');
    const data=await window.KinojoApi.getAction('sanctuaryOperation',{id:currentId,passKey:currentSanctuaryPassKey()});
    if(seq!==operationRequestSeq||key!==operationLoadKey)return;
    if(!data||data.ok===false)throw new Error(data?.message||'성역 운영 정보 로드 실패');
    renderSanctuaryOperation(data);
  }catch(err){
    if(seq!==operationRequestSeq)return;
    const auth=document.getElementById('operationAuthState');
    const schedules=document.getElementById('operationScheduleList');
    if(auth)auth.textContent='운영 정보 연결 실패';
    if(schedules)schedules.innerHTML='<div class="sanctuary-operation-empty">'+esc(err?.message||'일정 조회 실패')+'</div>';
  }
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
function render(data){const info=data.info||currentFallback().info;const hero=document.getElementById("sanctuaryHero");hero.className="sanctuary-hero";applyHeroVisual(info);document.getElementById("heroKicker").textContent="성역 "+(info.sanctuaryNo||"");document.getElementById("heroTitle").textContent=info.sanctuaryName||info.shortName||"성역";document.getElementById("heroSub").textContent="Boss. "+(info.bossName||"-")+" · "+(info.shortName||"");renderSummary(data);const teamGroups=normalizeSanctuaryTeamGroups(data);renderTeamQuickNav(teamGroups);renderTeamGroups(teamGroups);renderWaiting(data.waiting||[]);document.getElementById('tipTitle').textContent=(info.shortName||'성역')+' 공략 팁';document.getElementById('tipBody').innerHTML=(data.tips||[]).map(t=>'<div class="tip-line">'+esc(t)+'</div>').join('')||'<div class="tip-line">공략 팁이 준비 중입니다.</div>';setupSliders();bindSanctuaryReactionCards();window.KinojoSanctuaryCapture?.bind?.()}
function renderSummary(data){const s=data.summary||{};const groups=normalizeSanctuaryTeamGroups(data);const teamCount=(s.operatingTeamCount??s.teamGroupCount??groups.length)||1;const forceCount=(s.forceCount??s.teamCount??groups.reduce((sum,g)=>sum+(g.forces||[]).length,0))||0;document.getElementById('summaryGrid').innerHTML=[
  summaryCard(fmt(s.totalCharacters),'총 등록 캐릭터'),summaryCard(fmt(teamCount),'운영 팀'),summaryCard(fmt(forceCount),'운영 포스'),summaryCard(fmt(s.partyCount),'운영 파티'),summaryCard(fmt(s.averagePower),'평균 전투력'),'<button class="summary-card summary-tip" id="tipOpenBtn" type="button"><div class="summary-num">💡</div><div class="summary-label">공략 팁 보기</div></button>'
].join('');document.getElementById('tipOpenBtn')?.addEventListener('click',openTip)}
function summaryCard(num,label){return '<div class="summary-card"><div class="summary-num">'+esc(num)+'</div><div class="summary-label">'+esc(label)+'</div></div>'}
function teamAnchorId(t){return 'party-force-'+String(t.forceId||t.teamId||t.forceNo||t.teamNo||t.leaderCharacter||'').replace(/[^a-zA-Z0-9가-힣_-]/g,'-')}
function teamGroupAnchorId(group){return 'sanctuary-team-'+String(group?.teamGroupNo||group?.teamId||group?.teamGroupName||'').replace(/[^a-zA-Z0-9가-힣_-]/g,'-')}
function renderTeamQuickNav(groups){const nav=document.getElementById('partyQuickNav');if(!nav)return;const teams=Array.isArray(groups)?groups:[];if(teams.length<=1){nav.hidden=true;nav.innerHTML='';return}nav.hidden=false;nav.innerHTML='<div class="party-nav-title">팀 바로가기</div><div class="party-nav-buttons">'+teams.map((group,index)=>{const name=group.teamGroupName||((group.teamGroupNo||index+1)+'팀');return '<button class="party-nav-btn" type="button" data-team-target="'+esc(teamGroupAnchorId(group))+'">'+esc(name)+'</button>'}).join('')+'</div>';nav.querySelectorAll('[data-team-target]').forEach(btn=>btn.addEventListener('click',()=>{const el=document.getElementById(btn.dataset.teamTarget);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});}))}
function normalizeSanctuaryTeamGroups(data){
  const explicit=data&&Array.isArray(data.teamGroups)?data.teamGroups:null;
  if(explicit&&explicit.length){
    return explicit.map((g,idx)=>{const no=g.teamGroupNo||idx+1;return Object.assign({teamGroupNo:no,teamGroupName:no+'팀',forces:[]},g,{forces:Array.isArray(g.forces)?g.forces:[]})});
  }
  const forces=Array.isArray(data&&data.teams)?data.teams:[];
  if(!forces.length)return [];
  const buckets={};
  forces.forEach(f=>{
    const groupNo=f.teamGroupNo||f.operatingTeamNo||f.groupNo||1;
    if(!buckets[groupNo])buckets[groupNo]={teamGroupNo:groupNo,teamGroupName:f.teamGroupName||f.operatingTeamName||(groupNo+'팀'),forces:[]};
    buckets[groupNo].forces.push(f);
  });
  return Object.keys(buckets).map(Number).sort((a,b)=>a-b).map(k=>buckets[k]);
}
function renderTeamGroups(groups){const root=document.getElementById('teamList');if(!groups.length){root.innerHTML='<div class="empty-main">아직 표시할 성역 편성 데이터가 없습니다.<br>MASTER 성역 시트 동기화 상태를 확인해 주세요.</div>';return}root.innerHTML=groups.map(teamGroupHtml).join('')}
function sortedForces(forces){return (forces||[]).slice().sort((a,b)=>Number(a.forceNo||a.teamNo||0)-Number(b.forceNo||b.teamNo||0))}
function teamGroupHtml(g){const forces=sortedForces(g.forces);const total=forces.reduce((sum,f)=>sum+Number(f.characterCount||0),0);const partyCount=forces.reduce((sum,f)=>sum+Number(f.partyCount||0),0);const avg=total?Math.round(forces.reduce((sum,f)=>sum+(Number(f.averagePower||0)*Number(f.characterCount||0)),0)/total):0;const groupName=g.teamGroupName||g.operatingTeamName||((g.teamGroupNo||'')+'팀');const leader=g.leaderCharacter||'';const mode=g.nameMode==='manual'?'사용자 지정':'자동 생성';return '<section class="san-team-group" id="'+esc(teamGroupAnchorId(g))+'" data-team-group="'+esc(g.teamGroupNo||'')+'" data-team-group-name="'+esc(groupName)+'"><header class="san-team-group-head"><div><div class="san-team-kicker">TEAM · '+esc(mode)+'</div><h2 class="san-team-title">'+esc(groupName)+'</h2><p class="san-team-meta">'+fmt(forces.length)+'포스 · '+fmt(total)+'캐릭터 · '+fmt(partyCount)+'파티 · 평균 '+fmt(avg)+(leader?' · 대표 '+esc(leader):' · 대표 미설정')+'</p></div><div class="san-team-head-actions"><button class="team-group-copy-btn kinojo-copy-icon-btn team-copy-icon" type="button" data-team-group-copy data-kinojo-tooltip="이 운영 팀의 모든 포스를 클립보드에 복사합니다" title="이 운영 팀의 모든 포스를 클립보드에 복사합니다" aria-label="'+esc(groupName)+' 전체 팀 클립보드 복사"><span class="copy-stack-icon" aria-hidden="true"><span></span><span></span></span></button><div class="san-team-scroll-hint">가로로 포스 확인</div></div></header><div class="san-force-rail-shell"><button class="slide-btn left" type="button" aria-label="이전 포스">‹</button><div class="san-force-list">'+forces.map(f=>teamHtml(f,g)).join('')+'</div><button class="slide-btn right" type="button" aria-label="다음 포스">›</button></div></section>'}
function normalizeForceParties(t){
  const byNo={};
  (Array.isArray(t.parties)?t.parties:[]).forEach(p=>{const no=Number(p.partyNo||1);byNo[no]=Object.assign({},p,{partyNo:no});});
  [1,2].forEach(no=>{if(!byNo[no])byNo[no]={partyNo:no,filled:0,capacity:5,slots:[]};});
  return [byNo[1],byNo[2]].map(p=>{const slots=(Array.isArray(p.slots)?p.slots.slice(0,5):[]);while(slots.length<5)slots.push({name:'',vacancyText:'공석'});return Object.assign({},p,{capacity:p.capacity||5,filled:p.filled??slots.filter(s=>s&&s.name).length,slots});});
}
function teamHtml(t,g){
  const groupNo=(g&&g.teamGroupNo)||t.teamGroupNo||t.operatingTeamNo||t.groupNo||'';
  const forceNo=Number(t.forceNo||(Number(t.teamNo||0)>=100?Number(t.teamNo)%100:t.teamNo)||1);
  const forceName=t.forceName||forceNo+'포스';
  const forceId=t.forceId||t.teamId;
  const parties=normalizeForceParties(t);
  const filled=parties.reduce((sum,p)=>sum+Number(p.filled||0),0);
  const avg=fmt(t.averagePower);
  return '<article class="team-card force-card" id="'+esc(teamAnchorId(t))+'" data-team="'+esc(t.teamId||groupNo)+'" data-force="'+esc(forceId||forceNo)+'">'
    + '<header class="team-head"><div class="team-title-wrap"><div class="team-name">'
    + '<span>'+esc(forceName)+'</span>'
    + '<button class="team-copy-btn kinojo-copy-icon-btn team-copy-icon" type="button" data-force-copy data-kinojo-tooltip="해당 포스 전체를 클립보드에 복사합니다" title="해당 포스 전체를 클립보드에 복사합니다" aria-label="'+esc(forceName)+' 클립보드 복사"><span class="copy-stack-icon" aria-hidden="true"><span></span><span></span></span></button>'
    + '</div><div class="team-meta"><span class="force-count-badge">'+fmt(filled)+' / 10</span><span>'+fmt(t.partyCount||2)+'파티</span><span>평균 '+avg+'</span></div></div></header>'
    + '<div class="force-party-pair">'+parties.map(partyHtml).join('')+'</div></article>';
}
function partyHtml(p){return '<section class="party-card force-party-column" data-party-no="'+esc(p.partyNo)+'"><div class="party-head"><div class="party-title-row"><div class="party-title">'+esc(p.partyNo)+'파티</div></div><div class="party-count">'+fmt(p.filled)+' / '+fmt(p.capacity||5)+'</div></div><div class="slot-grid">'+(p.slots||[]).slice(0,5).map(slotHtml).join('')+'</div></section>'}
function sanctuaryProfileUrl(s){return String(s.profileImageUrl||s.profileUrl||s.profile_image_url||s.imageUrl||s.characterImageUrl||'').trim()}
function sanctuaryDetailUrl(s){return String(s.detailUrl||s.detail_url||s.url||'').trim()}
function slotHtml(s){if(!s.name)return '<div class="empty-slot"><strong>+ '+esc(s.vacancyText||'파티 인원 모집중')+'</strong><span>대기자 명단에서 추가 가능</span></div>';const iconSrc=classIconSrc(s.className);const icon=iconSrc?'<img class="class-icon" src="'+iconSrc+'" alt="" width="15" height="15"> ':'';const profile=sanctuaryProfileUrl(s);const profileHtml=profile?'<span class="char-profile"><img src="'+esc(profile)+'" alt="" loading="lazy" referrerpolicy="no-referrer"></span>':'<span class="char-profile char-profile-empty">?</span>';return '<button class="char-card san-reaction-card" type="button" draggable="false" data-char-name="'+esc(s.name)+'" data-char-class="'+esc(s.className||'직업 미확인')+'" data-char-power="'+esc(fmt(s.power))+'" data-char-owner="'+esc(s.owner||s.mainCharacter||s.ownerCharacter||'')+'" data-profile-image="'+esc(profile)+'" data-detail-url="'+esc(sanctuaryDetailUrl(s))+'" aria-label="'+esc(s.name)+' 반응 남기기"><span class="char-text"><span class="char-name">'+esc(s.name)+'</span><span class="char-meta">'+icon+esc(s.className||'직업 미확인')+' · '+fmt(s.power)+'</span></span>'+profileHtml+'</button>'}
function renderWaiting(waiting){const root=document.getElementById('waitingSection');if(!waiting||!waiting.length){root.innerHTML='<h2 class="waiting-title">대기자 명단</h2><div class="waiting-list"><span class="waiting-chip">미배치 캐릭터 없음</span></div>';return}root.innerHTML='<h2 class="waiting-title">대기자 명단</h2><div class="waiting-list">'+waiting.slice(0,80).map(x=>'<span class="waiting-chip">'+esc(x.name)+'</span>').join('')+(waiting.length>80?'<span class="waiting-chip">+'+(waiting.length-80)+'명</span>':'')+'</div>'}

/* 20260704: Sanctuary character profile card + reaction modal */
let sanctuaryReactionSubmitting=false;
let sanctuaryReactionTarget=null;
let sanctuaryReactionType='like';
function sanctuaryVisitorId(){let id=localStorage.getItem('kinojoVisitorId');if(!id){id='v_'+Date.now()+'_'+Math.random().toString(36).slice(2);localStorage.setItem('kinojoVisitorId',id)}return id}
function sanctuaryTodayKey(){return new Date().toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}
function sanctuaryReactionLimit(name,type){const day=sanctuaryTodayKey();const sameKey='kinojo_sanctuary_react_'+day+'_'+name+'_'+type;const countKey='kinojo_sanctuary_react_count_'+day+'_'+type;if(localStorage.getItem(sameKey)==='1')return '같은 캐릭터에게 같은 반응은 하루 1번만 남길 수 있습니다.';const count=Number(localStorage.getItem(countKey)||'0');if(count>=3)return (type==='like'?'좋아요':'싫어요')+'는 하루 3번까지만 남길 수 있습니다.';return ''}
function sanctuaryMarkReaction(name,type){const day=sanctuaryTodayKey();localStorage.setItem('kinojo_sanctuary_react_'+day+'_'+name+'_'+type,'1');const countKey='kinojo_sanctuary_react_count_'+day+'_'+type;localStorage.setItem(countKey,String(Number(localStorage.getItem(countKey)||'0')+1))}
function ensureSanctuaryReactionModal(){let modal=document.getElementById('sanctuaryReactionModal');if(modal)return modal;modal=document.createElement('section');modal.id='sanctuaryReactionModal';modal.className='sanctuary-reaction-modal';modal.setAttribute('aria-hidden','true');modal.innerHTML='<div class="sanctuary-reaction-backdrop" data-sanctuary-reaction-close></div><div class="sanctuary-reaction-card" role="dialog" aria-modal="true" aria-labelledby="sanctuaryReactionTitle"><button class="sanctuary-reaction-close" type="button" aria-label="닫기" data-sanctuary-reaction-close>×</button><div class="sanctuary-reaction-profile"><div class="sanctuary-reaction-avatar is-empty" id="sanctuaryReactionAvatar">PROFILE</div><div class="sanctuary-reaction-meta"><div class="sanctuary-reaction-kicker">REACTION</div><h2 id="sanctuaryReactionTitle">캐릭터에게 한마디</h2><p id="sanctuaryReactionSub">좋아요·싫어요와 코멘트를 남겨보세요.</p></div></div><div class="sanctuary-reaction-actions"><button class="sanctuary-reaction-type active like-active" id="sanctuaryReactionLikeBtn" type="button" data-sanctuary-reaction-type="like">좋아요</button><button class="sanctuary-reaction-type" id="sanctuaryReactionDislikeBtn" type="button" data-sanctuary-reaction-type="dislike">싫어요</button></div><div class="sanctuary-reaction-input"><label for="sanctuaryReactionComment">코멘트 · 20자 이내로 한마디</label><textarea id="sanctuaryReactionComment" class="sanctuary-reaction-comment" maxlength="20" rows="3" placeholder="응원 한마디 남겨주세요!"></textarea></div><div class="sanctuary-reaction-foot"><span class="sanctuary-reaction-status" id="sanctuaryReactionStatus"></span><button class="edit-btn sanctuary-reaction-submit" id="sanctuaryReactionSubmitBtn" type="button">전송</button></div></div>';document.body.appendChild(modal);modal.addEventListener('click',e=>{if(e.target&&e.target.hasAttribute('data-sanctuary-reaction-close'))closeSanctuaryReactionModal()});modal.querySelectorAll('[data-sanctuary-reaction-type]').forEach(btn=>btn.addEventListener('click',()=>setSanctuaryReactionType(btn.dataset.sanctuaryReactionType||'like')));modal.querySelector('#sanctuaryReactionSubmitBtn')?.addEventListener('click',submitSanctuaryReaction);modal.querySelector('#sanctuaryReactionComment')?.addEventListener('input',updateSanctuaryReactionSubmitState);document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSanctuaryReactionModal()});return modal}
function setSanctuaryReactionType(type){sanctuaryReactionType=type==='dislike'?'dislike':'like';const like=document.getElementById('sanctuaryReactionLikeBtn');const dislike=document.getElementById('sanctuaryReactionDislikeBtn');if(like)like.classList.toggle('active',sanctuaryReactionType==='like');if(dislike)dislike.classList.toggle('active',sanctuaryReactionType==='dislike')}
function updateSanctuaryReactionSubmitState(){const input=document.getElementById('sanctuaryReactionComment');const btn=document.getElementById('sanctuaryReactionSubmitBtn');if(btn){btn.disabled=sanctuaryReactionSubmitting||!(input&&input.value.trim())}}
function openSanctuaryReactionModalFromCard(card){
  if(window.KinojoCharacterReaction){
    const name=card.dataset.charName||'';
    const target={name:name,className:card.dataset.charClass||'',power:card.dataset.charPower||'',owner:card.dataset.charOwner||'',profileImageUrl:card.dataset.profileImage||'',detailUrl:card.dataset.detailUrl||''};
    window.KinojoCharacterReaction.open({
      source:'sanctuary',
      context:'sanctuary',
      limitPrefix:'kinojo_sanctuary_react',
      target:target,
      onSubmit:async function(payload){
        return await window.KinojoApi.postAction('hallReaction',{
          characterName:payload.target.name,
          owner:payload.target.owner||'',
          className:payload.target.className||'',
          reaction:payload.reaction,
          comment:payload.comment,
          clientKey:payload.clientKey,
          sessionToken:payload.sessionToken,
          source:'sanctuary'
        });
      }
    });
    return;
  }
  if(window.KinojoAuth&&!window.KinojoAuth.requireLogin('로그인 후 좋아요·싫어요를 남길 수 있습니다.',{context:'sanctuary'}))return;const name=card.dataset.charName||'';sanctuaryReactionTarget={name:name,className:card.dataset.charClass||'',power:card.dataset.charPower||'',owner:card.dataset.charOwner||'',profileImageUrl:card.dataset.profileImage||'',detailUrl:card.dataset.detailUrl||''};const modal=ensureSanctuaryReactionModal();const title=document.getElementById('sanctuaryReactionTitle');const sub=document.getElementById('sanctuaryReactionSub');const avatar=document.getElementById('sanctuaryReactionAvatar');const input=document.getElementById('sanctuaryReactionComment');const status=document.getElementById('sanctuaryReactionStatus');if(title)title.textContent=name;if(sub)sub.textContent=[sanctuaryReactionTarget.className,sanctuaryReactionTarget.power?('전투력 '+sanctuaryReactionTarget.power):''].filter(Boolean).join(' · ')||'좋아요·싫어요와 코멘트를 남겨보세요.';if(avatar){const image=String(sanctuaryReactionTarget.profileImageUrl||'').trim();if(image){avatar.classList.remove('is-empty');avatar.innerHTML='<img src="'+image.replace(/"/g,'%22')+'" alt="">'}else{avatar.classList.add('is-empty');avatar.textContent='PROFILE'}}if(input)input.value='';if(status)status.textContent='';sanctuaryReactionSubmitting=false;setSanctuaryReactionType('like');updateSanctuaryReactionSubmitState();modal.classList.add('open');modal.setAttribute('aria-hidden','false');setTimeout(()=>input?.focus(),50)
}
function closeSanctuaryReactionModal(){const modal=document.getElementById('sanctuaryReactionModal');if(modal){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}sanctuaryReactionTarget=null;sanctuaryReactionSubmitting=false}
async function submitSanctuaryReaction(){const status=document.getElementById('sanctuaryReactionStatus');const input=document.getElementById('sanctuaryReactionComment');if(!sanctuaryReactionTarget||sanctuaryReactionSubmitting)return;const comment=(input?.value||'').trim().slice(0,20);if(!comment){if(status)status.textContent='전하고 싶은 말을 입력해 주세요.';updateSanctuaryReactionSubmitState();return}const limit=sanctuaryReactionLimit(sanctuaryReactionTarget.name,sanctuaryReactionType);if(limit){if(status)status.textContent=limit;updateSanctuaryReactionSubmitState();return}try{if(window.KinojoAuth&&!window.KinojoAuth.requireLogin('로그인 후 좋아요·싫어요를 남길 수 있습니다.',{context:'sanctuary'}))return;sanctuaryReactionSubmitting=true;updateSanctuaryReactionSubmitState();if(status)status.textContent='전송 중...';const sessionToken=window.KinojoAuth?window.KinojoAuth.getToken():'';const data=await window.KinojoApi.postAction('hallReaction',{characterName:sanctuaryReactionTarget.name,owner:sanctuaryReactionTarget.owner||'',className:sanctuaryReactionTarget.className||'',reaction:sanctuaryReactionType,comment:comment,clientKey:sanctuaryVisitorId(),sessionToken:sessionToken,source:'sanctuary'});if(!data||!data.ok){if(data&&data.authRequired&&window.KinojoAuth)window.KinojoAuth.openLoginModal(data.message||'로그인 후 이용할 수 있습니다.',{context:'sanctuary'});if(status)status.textContent=(data&&data.message)||'저장 실패';return}sanctuaryMarkReaction(sanctuaryReactionTarget.name,sanctuaryReactionType);if(status)status.textContent='한마디가 전달되었어요.';setTimeout(closeSanctuaryReactionModal,420)}catch(e){if(status)status.textContent='반응 저장 실패: '+(e.message||e)}finally{sanctuaryReactionSubmitting=false;updateSanctuaryReactionSubmitState()}}
function bindSanctuaryReactionCards(){document.querySelectorAll('.san-reaction-card').forEach(card=>{card.onclick=e=>{e.preventDefault();e.stopPropagation();openSanctuaryReactionModalFromCard(card)}})}

function setupSliders(){document.querySelectorAll('.san-force-rail-shell').forEach(shell=>{const track=shell.querySelector('.san-force-list'),left=shell.querySelector('.slide-btn.left'),right=shell.querySelector('.slide-btn.right');if(!track||!left||!right)return;function update(){const max=track.scrollWidth-track.clientWidth;left.classList.toggle('show',track.scrollLeft>8);right.classList.toggle('show',max>8&&track.scrollLeft<max-8)}left.onclick=()=>track.scrollBy({left:-Math.min(420,track.clientWidth*.86),behavior:'smooth'});right.onclick=()=>track.scrollBy({left:Math.min(420,track.clientWidth*.86),behavior:'smooth'});track.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);setTimeout(update,80)})}
function openTip(){document.getElementById('tipPanel')?.classList.add('open');document.getElementById('tipPanel')?.setAttribute('aria-hidden','false')}function closeTip(){document.getElementById('tipPanel')?.classList.remove('open');document.getElementById('tipPanel')?.setAttribute('aria-hidden','true')}function openAdmin(){if(window.KinojoSanctuaryEditor&&typeof window.KinojoSanctuaryEditor.open==='function')return window.KinojoSanctuaryEditor.open();document.getElementById('adminCodeModal')?.classList.add('open');document.getElementById('adminCodeModal')?.setAttribute('aria-hidden','false')}function closeAdmin(){document.getElementById('adminCodeModal')?.classList.remove('open');document.getElementById('adminCodeModal')?.setAttribute('aria-hidden','true')}
window.addEventListener('kinojo:auth-changed',()=>{operationLoadKey='';if(currentId){ensureSanctuaryOperation(true);fetchSanctuaryFresh().then(data=>{if(data)applySanctuaryData(data)}).catch(err=>setSanctuarySyncState(err?.message||'로그인 기준 성역 갱신 실패',{error:true}))}});
document.getElementById('tipCloseBtn')?.addEventListener('click',closeTip);document.getElementById('tipPanel')?.addEventListener('click',e=>{if(e.target.id==='tipPanel')closeTip()});document.getElementById('editModeBtn')?.addEventListener('click',openAdmin);document.getElementById('adminCodeCloseBtn')?.addEventListener('click',closeAdmin);document.getElementById('adminCodeModal')?.addEventListener('click',e=>{if(e.target.id==='adminCodeModal')closeAdmin()});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeTip();closeAdmin()}});loadData();
