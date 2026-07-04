const SANCTUARY_API_PARAM=new URLSearchParams(location.search).get("api")||"";
const params=new URLSearchParams(location.search);
const currentId=params.get("id")||"rudra";
const FALLBACK={
  rudra:{info:{sanctuaryId:"rudra",sanctuaryNo:1,sanctuaryName:"심연의 재련: 루드라",shortName:"루드라팟",bossName:"루드라"}},
  bagot:{info:{sanctuaryId:"bagot",sanctuaryNo:2,sanctuaryName:"침식의 정화소",shortName:"바고트팟",bossName:"바고트"}},
  kaldrix:{info:{sanctuaryId:"kaldrix",sanctuaryNo:3,sanctuaryName:"무스펠의 성배",shortName:"칼드릭스팟",bossName:"칼드릭스"}}
};
const SANCTUARY_ASSET_BASE=(function(){
  const path=location.pathname.replace(/\\/g,'/');
  return path.includes('/m/')?'../../hof/assets/':'../hof/assets/';
})();
const CLASS_ICON={"검성":"class_icon_gladiator.png","수호성":"class_icon_templar.png","살성":"class_icon_assassin.png","궁성":"class_icon_ranger.png","정령성":"class_icon_elementalist.png","마도성":"class_icon_sorcerer.png","치유성":"class_icon_cleric.png","호법성":"class_icon_chanter.png","권성":""};
function classIconSrc(className){return CLASS_ICON[className]?SANCTUARY_ASSET_BASE+CLASS_ICON[className]:''}
let sanctuaryData=null;
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}
function fmt(n){return Number(n||0).toLocaleString("ko-KR")}
function currentFallback(){return FALLBACK[currentId]||FALLBACK.rudra}
function setActiveLinks(){}
/* KINOJO common drawer is managed by GitHub_Pages/ui/kinojo-common-ui.js */
const SANCTUARY_CACHE_TTL_MS=5*60*1000;
function sanctuaryCacheKey(){return 'kinojo_sanctuary_cache_v2026070115_'+currentId}
function readSanctuaryCache(){try{const raw=sessionStorage.getItem(sanctuaryCacheKey());if(!raw)return null;const cached=JSON.parse(raw);if(!cached||!cached.savedAt||!cached.data)return null;if(Date.now()-cached.savedAt>SANCTUARY_CACHE_TTL_MS)return null;return cached.data}catch(e){return null}}
function writeSanctuaryCache(data){try{if(data&&data.ok!==false)sessionStorage.setItem(sanctuaryCacheKey(),JSON.stringify({savedAt:Date.now(),data}))}catch(e){}}
function applySanctuaryData(data,{fromCache=false}={}){sanctuaryData=data;render(data);const chip=document.getElementById('syncChip');if(chip)chip.textContent=(data.source==='supabase_035_sanctuary'?'Server Engine ':'')+'업데이트 '+(data.generatedAt||'완료')+(fromCache?' · 캐시':'')}
async function fetchSanctuaryFresh(){if(!window.KinojoApi)throw new Error('KinojoApi 연결을 확인해 주세요.');const data=await window.KinojoApi.getAction('sanctuary',{id:currentId});if(!data||data.ok===false)throw new Error(data?.message||'성역 데이터 로드 실패');writeSanctuaryCache(data);return data}
async function loadData(){setActiveLinks();renderSkeleton();const cached=readSanctuaryCache();try{if(cached){applySanctuaryData(cached,{fromCache:true});fetchSanctuaryFresh().then(data=>applySanctuaryData(data)).catch(()=>{});return}const data=await fetchSanctuaryFresh();applySanctuaryData(data)}catch(err){if(cached){applySanctuaryData(cached,{fromCache:true});return}const f=currentFallback();sanctuaryData={ok:true,info:f.info,summary:{totalCharacters:0,teamCount:0,partyCount:0,averagePower:0},teams:[],waiting:[],tips:['성역 Server Engine 데이터가 아직 비어 있습니다. 관리자 저장 후 실제 데이터가 표시됩니다.'],generatedAt:'데이터 없음'};render(sanctuaryData);(document.getElementById('syncChip')||{}).textContent='샘플 프레임 표시 중'}}
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
}
function render(data){const info=data.info||currentFallback().info;const hero=document.getElementById('sanctuaryHero');hero.className='sanctuary-hero '+esc(info.sanctuaryId||currentId);document.getElementById('heroKicker').textContent='성역 '+(info.sanctuaryNo||'');document.getElementById('heroTitle').textContent=info.sanctuaryName||info.shortName||'성역';document.getElementById('heroSub').textContent='Boss. '+(info.bossName||'-')+' · '+(info.shortName||'');renderSummary(data);const teamGroups=normalizeSanctuaryTeamGroups(data);renderPartyQuickNav((teamGroups||[]).flatMap(g=>g.forces||[]));renderTeamGroups(teamGroups);renderWaiting(data.waiting||[]);document.getElementById('tipTitle').textContent=(info.shortName||'성역')+' 공략 팁';document.getElementById('tipBody').innerHTML=(data.tips||[]).map(t=>'<div class="tip-line">'+esc(t)+'</div>').join('')||'<div class="tip-line">공략 팁이 준비 중입니다.</div>';setupSliders();bindSanctuaryReactionCards();window.KinojoSanctuaryCapture?.bind?.()}
function renderSummary(data){const s=data.summary||{};const groups=normalizeSanctuaryTeamGroups(data);const teamCount=(s.operatingTeamCount??s.teamGroupCount??groups.length)||1;const forceCount=(s.forceCount??s.teamCount??groups.reduce((sum,g)=>sum+(g.forces||[]).length,0))||0;document.getElementById('summaryGrid').innerHTML=[
  summaryCard(fmt(s.totalCharacters),'총 등록 캐릭터'),summaryCard(fmt(teamCount),'운영 팀'),summaryCard(fmt(forceCount),'운영 포스'),summaryCard(fmt(s.partyCount),'운영 파티'),summaryCard(fmt(s.averagePower),'평균 전투력'),'<button class="summary-card summary-tip" id="tipOpenBtn" type="button"><div class="summary-num">💡</div><div class="summary-label">공략 팁 보기</div></button>'
].join('');document.getElementById('tipOpenBtn')?.addEventListener('click',openTip)}
function summaryCard(num,label){return '<div class="summary-card"><div class="summary-num">'+esc(num)+'</div><div class="summary-label">'+esc(label)+'</div></div>'}
function teamAnchorId(t){return 'party-force-'+String(t.forceId||t.teamId||t.forceNo||t.teamNo||t.leaderCharacter||'').replace(/[^a-zA-Z0-9가-힣_-]/g,'-')}
function renderPartyQuickNav(teams){const nav=document.getElementById('partyQuickNav');if(!nav)return;if(!teams||!teams.length){nav.innerHTML='<div class="party-nav-empty">표시할 포스 바로가기가 없습니다.</div>';return}nav.innerHTML='<div class="party-nav-title">포스 바로가기</div><div class="party-nav-buttons">'+teams.map(t=>'<button class="party-nav-btn" type="button" data-party-target="'+esc(teamAnchorId(t))+'">'+esc(t.leaderCharacter||t.forceName||t.teamName||((t.forceNo||t.teamNo)+'포스'))+' 포스</button>').join('')+'</div>';nav.querySelectorAll('[data-party-target]').forEach(btn=>btn.addEventListener('click',()=>{const el=document.getElementById(btn.dataset.partyTarget);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});}))}
function normalizeSanctuaryTeamGroups(data){
  const explicit=data&&Array.isArray(data.teamGroups)?data.teamGroups:null;
  if(explicit&&explicit.length){
    return explicit.map((g,idx)=>Object.assign({teamGroupNo:idx+1,teamGroupName:'운영 팀 '+(idx+1),forces:[]},g,{forces:Array.isArray(g.forces)?g.forces:[]}));
  }
  const forces=Array.isArray(data&&data.teams)?data.teams:[];
  if(!forces.length)return [];
  const buckets={};
  forces.forEach(f=>{
    const groupNo=f.teamGroupNo||f.operatingTeamNo||f.groupNo||1;
    if(!buckets[groupNo])buckets[groupNo]={teamGroupNo:groupNo,teamGroupName:f.teamGroupName||f.operatingTeamName||'성역 운영 팀',forces:[]};
    buckets[groupNo].forces.push(f);
  });
  return Object.keys(buckets).map(Number).sort((a,b)=>a-b).map(k=>buckets[k]);
}
function renderTeamGroups(groups){const root=document.getElementById('teamList');if(!groups.length){root.innerHTML='<div class="empty-main">아직 표시할 포스 데이터가 없습니다.<br>관리자 수정에서 팀 > 포스 > 파티 슬롯을 저장하면 Server Engine 기준으로 표시됩니다.</div>';return}root.innerHTML=groups.map(teamGroupHtml).join('')}
function sortedForces(forces){return (forces||[]).slice().sort((a,b)=>Number(a.forceNo||a.teamNo||0)-Number(b.forceNo||b.teamNo||0))}
function teamGroupHtml(g){const forces=sortedForces(g.forces);const total=forces.reduce((sum,f)=>sum+Number(f.characterCount||0),0);const partyCount=forces.reduce((sum,f)=>sum+Number(f.partyCount||0),0);const avg=total?Math.round(forces.reduce((sum,f)=>sum+(Number(f.averagePower||0)*Number(f.characterCount||0)),0)/total):0;const groupName=g.teamGroupName||((g.teamGroupNo||'')+'팀');return '<section class="san-team-group" data-team-group="'+esc(g.teamGroupNo||'')+'" data-team-group-name="'+esc(groupName)+'"><header class="san-team-group-head"><div><div class="san-team-kicker">TEAM</div><h2 class="san-team-title">'+esc(groupName)+'</h2><p class="san-team-meta">'+fmt(forces.length)+'포스 · '+fmt(total)+'캐릭터 · '+fmt(partyCount)+'파티 · 평균 '+fmt(avg)+'</p></div><div class="san-team-head-actions"><button class="team-group-copy-btn kinojo-copy-icon-btn team-copy-icon" type="button" data-team-group-copy data-kinojo-tooltip="이 운영 팀의 모든 포스를 클립보드에 복사합니다" title="이 운영 팀의 모든 포스를 클립보드에 복사합니다" aria-label="'+esc(groupName)+' 전체 팀 클립보드 복사"><span class="copy-stack-icon" aria-hidden="true"><span></span><span></span></span></button><div class="san-team-scroll-hint">가로로 포스 확인</div></div></header><div class="san-force-rail-shell"><button class="slide-btn left" type="button" aria-label="이전 포스">‹</button><div class="san-force-list">'+forces.map(f=>teamHtml(f,g)).join('')+'</div><button class="slide-btn right" type="button" aria-label="다음 포스">›</button></div></section>'}
function normalizeForceParties(t){
  const byNo={};
  (Array.isArray(t.parties)?t.parties:[]).forEach(p=>{const no=Number(p.partyNo||1);byNo[no]=Object.assign({},p,{partyNo:no});});
  [1,2].forEach(no=>{if(!byNo[no])byNo[no]={partyNo:no,filled:0,capacity:5,slots:[]};});
  return [byNo[1],byNo[2]].map(p=>{const slots=(Array.isArray(p.slots)?p.slots.slice(0,5):[]);while(slots.length<5)slots.push({name:'',vacancyText:'공석'});return Object.assign({},p,{capacity:p.capacity||5,filled:p.filled??slots.filter(s=>s&&s.name).length,slots});});
}
function teamHtml(t,g){
  const custom=t.nameMode==='manual';
  const style=custom&&t.customColor?' style="--custom-color:'+esc(t.customColor)+'"':'';
  const groupNo=(g&&g.teamGroupNo)||t.teamGroupNo||t.operatingTeamNo||t.groupNo||'';
  const forceNo=t.forceNo||t.teamNo;
  const forceName=t.forceName||t.teamName||((groupNo?groupNo+'팀 ':'')+forceNo+'포스');
  const forceId=t.forceId||t.teamId;
  const parties=normalizeForceParties(t);
  const filled=parties.reduce((sum,p)=>sum+Number(p.filled||0),0);
  const avg=fmt(t.averagePower);
  return '<article class="team-card force-card" id="'+esc(teamAnchorId(t))+'" data-team="'+esc(t.teamId||groupNo)+'" data-force="'+esc(forceId||forceNo)+'">'
    + '<header class="team-head"><div class="team-title-wrap"><div class="team-name '+(custom?'custom':'')+'"'+style+'>'
    + '<span>'+esc(forceName)+'</span><span class="team-badge">'+(custom?'CUSTOM':'AUTO')+'</span>'
    + '<button class="team-copy-btn kinojo-copy-icon-btn team-copy-icon" type="button" data-force-copy data-kinojo-tooltip="해당 포스 전체를 클립보드에 복사합니다" title="해당 포스 전체를 클립보드에 복사합니다" aria-label="'+esc(forceName)+' 포스 클립보드 복사"><span class="copy-stack-icon" aria-hidden="true"><span></span><span></span></span></button>'
    + '</div><div class="team-meta"><span class="force-count-badge">'+fmt(filled)+' / 10</span><span>'+fmt(t.partyCount||2)+'파티</span><span>평균 '+avg+'</span></div></div>'
    + '<div class="leader">👑 '+esc(t.leaderCharacter||'대표 미설정')+'</div></header>'
    + '<div class="force-party-pair">'+parties.map(partyHtml).join('')+'</div></article>';
}
function partyHtml(p){return '<section class="party-card force-party-column" data-party-no="'+esc(p.partyNo)+'"><div class="party-head"><div class="party-title-row"><div class="party-title">'+esc(p.partyNo)+'파티</div></div><div class="party-count">'+fmt(p.filled)+' / '+fmt(p.capacity||5)+'</div></div><div class="slot-grid">'+(p.slots||[]).slice(0,5).map(slotHtml).join('')+'</div></section>'}
function sanctuaryProfileUrl(s){return String(s.profileImageUrl||s.profileUrl||s.profile_image_url||s.imageUrl||s.characterImageUrl||'').trim()}
function slotHtml(s){if(!s.name)return '<div class="empty-slot"><strong>+ '+esc(s.vacancyText||'파티 인원 모집중')+'</strong><span>대기자 명단에서 추가 가능</span></div>';const iconSrc=classIconSrc(s.className);const icon=iconSrc?'<img class="class-icon" src="'+iconSrc+'" alt="" width="15" height="15"> ':'';const profile=sanctuaryProfileUrl(s);const profileHtml=profile?'<span class="char-profile"><img src="'+esc(profile)+'" alt="" loading="lazy" referrerpolicy="no-referrer"></span>':'<span class="char-profile char-profile-empty">?</span>';return '<button class="char-card san-reaction-card" type="button" draggable="false" data-char-name="'+esc(s.name)+'" data-char-class="'+esc(s.className||'직업 미확인')+'" data-char-power="'+esc(fmt(s.power))+'" data-char-owner="'+esc(s.owner||s.mainCharacter||s.ownerCharacter||'')+'" data-profile-image="'+esc(profile)+'" aria-label="'+esc(s.name)+' 반응 남기기"><span class="char-text"><span class="char-name">'+esc(s.name)+'</span><span class="char-meta">'+icon+esc(s.className||'직업 미확인')+' · '+fmt(s.power)+'</span></span>'+profileHtml+'</button>'}
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
    const target={name:name,className:card.dataset.charClass||'',power:card.dataset.charPower||'',owner:card.dataset.charOwner||'',profileImageUrl:card.dataset.profileImage||''};
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
  if(window.KinojoAuth&&!window.KinojoAuth.requireLogin('로그인 후 좋아요·싫어요를 남길 수 있습니다.',{context:'sanctuary'}))return;const name=card.dataset.charName||'';sanctuaryReactionTarget={name:name,className:card.dataset.charClass||'',power:card.dataset.charPower||'',owner:card.dataset.charOwner||'',profileImageUrl:card.dataset.profileImage||''};const modal=ensureSanctuaryReactionModal();const title=document.getElementById('sanctuaryReactionTitle');const sub=document.getElementById('sanctuaryReactionSub');const avatar=document.getElementById('sanctuaryReactionAvatar');const input=document.getElementById('sanctuaryReactionComment');const status=document.getElementById('sanctuaryReactionStatus');if(title)title.textContent=name;if(sub)sub.textContent=[sanctuaryReactionTarget.className,sanctuaryReactionTarget.power?('전투력 '+sanctuaryReactionTarget.power):''].filter(Boolean).join(' · ')||'좋아요·싫어요와 코멘트를 남겨보세요.';if(avatar){const image=String(sanctuaryReactionTarget.profileImageUrl||'').trim();if(image){avatar.classList.remove('is-empty');avatar.innerHTML='<img src="'+image.replace(/"/g,'%22')+'" alt="">'}else{avatar.classList.add('is-empty');avatar.textContent='PROFILE'}}if(input)input.value='';if(status)status.textContent='';sanctuaryReactionSubmitting=false;setSanctuaryReactionType('like');updateSanctuaryReactionSubmitState();modal.classList.add('open');modal.setAttribute('aria-hidden','false');setTimeout(()=>input?.focus(),50)
}
function closeSanctuaryReactionModal(){const modal=document.getElementById('sanctuaryReactionModal');if(modal){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}sanctuaryReactionTarget=null;sanctuaryReactionSubmitting=false}
async function submitSanctuaryReaction(){const status=document.getElementById('sanctuaryReactionStatus');const input=document.getElementById('sanctuaryReactionComment');if(!sanctuaryReactionTarget||sanctuaryReactionSubmitting)return;const comment=(input?.value||'').trim().slice(0,20);if(!comment){if(status)status.textContent='전하고 싶은 말을 입력해 주세요.';updateSanctuaryReactionSubmitState();return}const limit=sanctuaryReactionLimit(sanctuaryReactionTarget.name,sanctuaryReactionType);if(limit){if(status)status.textContent=limit;updateSanctuaryReactionSubmitState();return}try{if(window.KinojoAuth&&!window.KinojoAuth.requireLogin('로그인 후 좋아요·싫어요를 남길 수 있습니다.',{context:'sanctuary'}))return;sanctuaryReactionSubmitting=true;updateSanctuaryReactionSubmitState();if(status)status.textContent='전송 중...';const sessionToken=window.KinojoAuth?window.KinojoAuth.getToken():'';const data=await window.KinojoApi.postAction('hallReaction',{characterName:sanctuaryReactionTarget.name,owner:sanctuaryReactionTarget.owner||'',className:sanctuaryReactionTarget.className||'',reaction:sanctuaryReactionType,comment:comment,clientKey:sanctuaryVisitorId(),sessionToken:sessionToken,source:'sanctuary'});if(!data||!data.ok){if(data&&data.authRequired&&window.KinojoAuth)window.KinojoAuth.openLoginModal(data.message||'로그인 후 이용할 수 있습니다.',{context:'sanctuary'});if(status)status.textContent=(data&&data.message)||'저장 실패';return}sanctuaryMarkReaction(sanctuaryReactionTarget.name,sanctuaryReactionType);if(status)status.textContent='한마디가 전달되었어요.';setTimeout(closeSanctuaryReactionModal,420)}catch(e){if(status)status.textContent='반응 저장 실패: '+(e.message||e)}finally{sanctuaryReactionSubmitting=false;updateSanctuaryReactionSubmitState()}}
function bindSanctuaryReactionCards(){document.querySelectorAll('.san-reaction-card').forEach(card=>{card.onclick=e=>{e.preventDefault();e.stopPropagation();openSanctuaryReactionModalFromCard(card)}})}

function setupSliders(){document.querySelectorAll('.san-force-rail-shell').forEach(shell=>{const track=shell.querySelector('.san-force-list'),left=shell.querySelector('.slide-btn.left'),right=shell.querySelector('.slide-btn.right');if(!track||!left||!right)return;function update(){const max=track.scrollWidth-track.clientWidth;left.classList.toggle('show',track.scrollLeft>8);right.classList.toggle('show',max>8&&track.scrollLeft<max-8)}left.onclick=()=>track.scrollBy({left:-Math.min(420,track.clientWidth*.86),behavior:'smooth'});right.onclick=()=>track.scrollBy({left:Math.min(420,track.clientWidth*.86),behavior:'smooth'});track.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);setTimeout(update,80)})}
function openTip(){document.getElementById('tipPanel')?.classList.add('open');document.getElementById('tipPanel')?.setAttribute('aria-hidden','false')}function closeTip(){document.getElementById('tipPanel')?.classList.remove('open');document.getElementById('tipPanel')?.setAttribute('aria-hidden','true')}function openAdmin(){if(window.KinojoSanctuaryEditor&&typeof window.KinojoSanctuaryEditor.open==='function')return window.KinojoSanctuaryEditor.open();document.getElementById('adminCodeModal')?.classList.add('open');document.getElementById('adminCodeModal')?.setAttribute('aria-hidden','false')}function closeAdmin(){document.getElementById('adminCodeModal')?.classList.remove('open');document.getElementById('adminCodeModal')?.setAttribute('aria-hidden','true')}
document.getElementById('tipCloseBtn')?.addEventListener('click',closeTip);document.getElementById('tipPanel')?.addEventListener('click',e=>{if(e.target.id==='tipPanel')closeTip()});document.getElementById('editModeBtn')?.addEventListener('click',openAdmin);document.getElementById('adminCodeCloseBtn')?.addEventListener('click',closeAdmin);document.getElementById('adminCodeModal')?.addEventListener('click',e=>{if(e.target.id==='adminCodeModal')closeAdmin()});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeTip();closeAdmin()}});loadData();
