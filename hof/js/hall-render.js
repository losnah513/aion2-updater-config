function miniRow(item,i,total){const rank=i+1;const itemLevel=itemLevelFor(item,item.category);const scoreHtml='<div class="score-stack">'+(itemLevel?'<div class="item-level">'+escapeHtml(itemLevel)+'</div>':'')+'<div class="power-score">'+escapeHtml(numberOnly(item.value)||item.label||"")+'</div></div>';return '<div class="mini-row '+itemClass(item)+'"><div class="medal rank-medal">'+rankEmblemHtml(rank,total,item)+'</div><div class="name-wrap"><div class="name">'+flowText(item.name,item)+'</div>'+ownerLine(item)+(item.meta?'<div class="meta">'+escapeHtml(item.meta)+'</div>':'')+'</div>'+reactionCountsHtml(item)+'<div class="score">'+scoreHtml+'</div></div>'}
function rankBox(title,note,list){const items=(list||[]);return '<section class="section"><div class="section-head"><h2>'+title+'</h2><span class="section-note">'+(note||'')+'</span></div><div class="list">'+(items.length?items.map((item,i)=>miniRow(item,i,items.length)).join(""):'<div class="empty">아직 데이터가 부족해요.</div>')+'</div></section>'}
function tagBox(title,note,list){const items=(list||[]).filter(match);return '<section class="section"><div class="section-head"><h2>'+title+'</h2><span class="section-note">'+(note||'')+'</span></div><div class="tag-list swipe-list">'+(items.length?items.map(item=>'<div class="name-tag '+itemClass(item)+'"><div class="tag-name-wrap"><div class="tag-name">'+flowText(item.name,item)+'</div></div>'+ownerLine(item)+(item.meta?'<div class="tag-meta">'+escapeHtml(item.meta)+'</div>':'')+'</div>').join(""):'<div class="empty">아직 데이터가 부족해요.</div>')+'</div></section>'}
function combinedRelationBox(){
  const demonItems=(currentDemon()||[]);
  const partyItems=(currentParty()||[]);

  const renderColumn=function(items,type){
    const base=(items||[]).length?items:[];
    const html=base.length
      ? base.map(item=>{
          const reaction=reactionDataFor(item);
          const serverText=item.meta||item.serverName||item.server||"";
          return '<div class="relation-row '+itemClass(item)+'" data-character="'+escapeHtml(item.name)+'">'
            + '<span class="relation-name">'+escapeHtml(item.name)+'</span>'
            + (serverText?'<span class="relation-server">'+escapeHtml(serverText)+'</span>':'<span class="relation-server"></span>')
            + reactionPairHtml(reaction.like,reaction.dislike,'relation-reactions')
            + '</div>';
        }).join("")
      : '<div class="empty relation-empty">아직 데이터가 부족해요.</div>';
    const scrollClass=base.length>6?' is-scrollable':'';
    const track=base.length>6?html+html:html;
    return '<div class="relation-column '+type+scrollClass+'"><div class="relation-track">'+track+'</div></div>';
  };

  return '<section class="section relation-combined-card">'
    + '<div class="relation-combined-head">'
    + '<div class="section-head relation-main-head"><h2>😈 같은 마족이면 가족이지</h2><span class="section-note">타서버 마족</span></div>'
    + '<div class="section-head relation-sub-head"><h2>🤝 같은 파티면 친구지</h2><span class="section-note">천족 서버</span></div>'
    + '</div>'
    + '<div class="relation-viewport">'
    + renderColumn(demonItems,"demon")
    + renderColumn(partyItems,"party")
    + '</div>'
    + '</section>';
}
function chickLabel(item){const server=item.meta?'['+item.meta.replace("천족 · ","")+']':'';const cls=item.className?' ('+item.className+')':'';const owner=item.owner&&item.owner!==item.name?' / 본캐 '+item.owner:'';return item.name+server+cls+owner}
function renderChicks(){const items=(hallData?.newChicks||[]);const card=document.getElementById("chickCard");if(!card)return;if(!items.length){card.style.display="none";return}card.classList.toggle("collapsed",chicksCollapsed);card.style.display="block";document.getElementById("chickTitle").textContent="🐣 신입 병아리 "+items.length+"명 입장!";document.getElementById("chickSub").textContent=items.length>=5?"새로운 모험가들이 우르르 둥지에 들어왔어요!":"새로운 모험가들을 따뜻하게 환영합니다!";const shown=chicksExpanded?items:items.slice(0,5);document.getElementById("chickTags").innerHTML=shown.map(item=>'<span class="chick-tag">'+escapeHtml(chickLabel(item))+'</span>').join("")+(items.length>5?'<span class="chick-tag chick-more" id="chickMore">'+(chicksExpanded?"접기":"+"+(items.length-5)+"명 더 보기")+'</span>':'');const more=document.getElementById("chickMore");if(more)more.onclick=()=>{chicksExpanded=!chicksExpanded;renderChicks()};const close=document.getElementById("chickCloseBtn");if(close&&!close.dataset.bound){close.dataset.bound="1";close.onclick=()=>{chicksCollapsed=!chicksCollapsed;card.classList.toggle("collapsed",chicksCollapsed);close.setAttribute("aria-label",chicksCollapsed?"신입 병아리 펼치기":"신입 병아리 접기")}}}
function profileImageUrlFor(item){
  return String(item?.profileImageUrl||"").trim();
}
function profileImageHtml(item,className,label){
  const url=profileImageUrlFor(item);
  const alt=escapeHtml((item?.name||"캐릭터")+" 프로필 이미지");
  if(!url)return '<div class="'+className+' is-empty" aria-hidden="true">'+escapeHtml(label||"PROFILE")+'</div>';
  return '<img class="'+className+'" src="'+escapeHtml(url)+'" alt="'+alt+'" loading="lazy" decoding="async">';
}
function mvpCandidateImageHtml(item){
  const url=profileImageUrlFor(item);
  if(!url)return '<div class="mvp-candidate-image is-empty" aria-hidden="true">?</div>';
  return '<img class="mvp-candidate-image" src="'+escapeHtml(url)+'" alt="MVP 후보 이미지" loading="lazy" decoding="async">';
}
function mvpNameLine(item,index){
  if(!item||!item.name)return '';
  return '<div class="mvp-final-rank-name"><span>'+(index+1)+'위</span><strong>'+escapeHtml(item.name)+'</strong></div>';
}
function mvpSection(){
  const mvp=hallData?.mvp||null;
  const candidates=(hallData?.mvpCandidatesTop3||[]).filter(Boolean).slice(0,3);
  const confirmed=hallData?.mvpConfirmed===true && mvp&&mvp.name;
  if(confirmed){
    const rankNames=(candidates.length?candidates:[mvp]).slice(0,3);
    const subNames=rankNames.slice(1,3).map((item,index)=>mvpNameLine(item,index+1)).join('');
    return '<section class="mvp-card has-profile-image is-confirmed"><div class="mvp-head"><h2>👑 시즌 MVP</h2><span class="section-note">확정</span></div>'
      + '<div class="mvp-body mvp-profile-body mvp-final-body"><div class="mvp-final-visual"><img class="mvp-final-emblem" src="'+RANK_EMBLEMS.mvp+'" alt="MVP 엠블럼">'
      + '<div class="mvp-profile-frame">'+profileImageHtml(mvp,'mvp-profile-image','MVP')+'</div></div>'
      + '<div class="mvp-profile-info"><div class="mvp-final-label">시즌 챌린저</div><div class="mvp-name">'+flowText(mvp.name,mvp)+'</div>'
      + (mvp.meta?'<div class="mvp-meta">'+escapeHtml(mvp.meta)+'</div>':'')
      + '<div class="mvp-score">'+escapeHtml(mvp.label||mvp.pvePowerLabel||mvp.pvpPowerLabel||'')+'</div>'
      + (subNames?'<div class="mvp-final-subnames">'+subNames+'</div>':'')+'</div></div></section>';
  }
  if(candidates.length){
    const previews=candidates.map(item=>'<div class="mvp-candidate-blur-card"><div class="mvp-candidate-frame">'+mvpCandidateImageHtml(item)+'</div></div>').join('');
    return '<section class="mvp-card is-candidate-preview"><div class="mvp-head"><h2>👑 시즌 MVP</h2><span class="section-note">후보 추적 중</span></div>'
      + '<div class="mvp-body mvp-candidate-body"><div class="mvp-candidate-title">이번 시즌 유력 후보</div><div class="mvp-candidate-list">'+previews+'</div>'
      + '<div class="mvp-wait-sub">순위와 이름은 확정 전까지 공개되지 않습니다.</div></div></section>';
  }
  return '<section class="mvp-card"><div class="mvp-head"><h2>👑 시즌 MVP</h2><span class="section-note">챌린저</span></div><div class="mvp-body mvp-challenger-waiting"><div class="mvp-emblem-wrap"><img class="mvp-emblem-blur" src="'+RANK_EMBLEMS.mvp+'" alt="챌린저 엠블럼"><div class="mvp-emblem-question">?</div></div><div class="mvp-wait-title">첫 번째 챌린저를 기다리는 중</div><div class="mvp-wait-sub">아직 이 엠블럼의 주인은 정해지지 않았습니다.</div></div></section>';
}

function reactionDataFor(item){const by=hallData?.reactionSummary?.byName||{};return by[item?.name]||{like:0,dislike:0,comments:[]}}
function reactionCountsHtml(item){
  const r=reactionDataFor(item);
  return '<div class="reaction-counts">'+reactionPairHtml(r.like,r.dislike,'mini-reactions')+'</div>';
}
function reactionCard(type){
  const summary=hallData?.reactionSummary||{};
  const list=(type==="like"?summary.likeTop:summary.dislikeTop)||[];
  const title=type==="like"?"좋아요 TOP 3":"싫어요 TOP 3";
  const titleIcon=reactionIcon(type==="like"?"like":"dislike");
  const note=type==="like"?"모두에게 사랑받는 모험가":"이분은 어쩌다 이렇게 미움을 샀을까요?";
  if(!list.length)return '<section class="reaction-card '+type+'-top-card"><div class="reaction-card-head"><div class="reaction-card-title">'+titleIcon+'<span>'+title+'</span></div><div class="reaction-card-note">'+note+'</div></div><div class="reaction-empty">아직 반응 데이터가 부족합니다.</div></section>';
  const now=Date.now();
  const idx=(now<reactionCarouselPausedUntil)?reactionCarouselIndex:reactionCarouselIndex%list.length;
  const item=list[idx%list.length];
  const displayRank=(idx%list.length)+1;
  const comments=(item.comments||[]).filter(Boolean);
  const meta=item.serverName?'<div class="reaction-server">'+escapeHtml(item.serverName)+'</div>':'';
  const commentItems=comments.length?comments.map(c=>'<div class="comment-item">“'+escapeHtml(c)+'”</div>').join(''):'<div class="comment-item">아직 코멘트가 없습니다.</div>';
  const track=comments.length>5?commentItems+commentItems:commentItems;
  const overflowClass=comments.length>5?' is-scrollable':'';
  return '<section class="reaction-card '+type+'-top-card" data-reaction-card="'+type+'">'
    + '<div class="reaction-card-head"><div class="reaction-card-title">'+titleIcon+'<span>'+title+'</span></div><div class="reaction-card-note">'+note+'</div></div>'
    + '<div class="reaction-top-body"><div class="reaction-top-left"><div class="reaction-rank">'+displayRank+'위</div>'
    + '<span class="reaction-name" data-character="'+escapeHtml(item.name)+'">'+escapeHtml(item.name)+'</span>'+meta
    + '<div class="reaction-score-line icon-row">'+reactionPairHtml(item.like,item.dislike,'top-reaction-pair')+'</div></div>'
    + '<div class="reaction-top-divider" aria-hidden="true"></div><div class="reaction-comments comment-list'+overflowClass+'"><div class="comment-track">'+track+'</div></div></div></section>';
}
function recentCommentCard(){
  const by=hallData?.reactionSummary?.byName||{};
  const rows=[];
  Object.keys(by).forEach(name=>{
    (by[name].comments||[]).filter(Boolean).forEach(c=>rows.push({name,comment:c}));
  });
  const list=rows.slice(0,10);
  const overflowClass=list.length>5?' is-scrollable':'';
  const items=list.length?list.map(x=>'<div class="comment-item recent-comment-item"><strong>'+escapeHtml(x.name)+'</strong><span>“'+escapeHtml(x.comment)+'”</span></div>').join(''):'<div class="comment-item">아직 남겨진 한마디가 없습니다.</div>';
  const track=list.length>5?items+items:items;
  return '<section class="reaction-card recent-comment-card"><div class="reaction-card-head"><div class="reaction-card-title"><span class="comment-title-icon" aria-hidden="true"></span><span>최근 한마디</span></div><div class="reaction-card-note">따뜻한 말은 오래 남아요</div></div><div class="reaction-comments recent comment-list'+overflowClass+'"><div class="comment-track">'+track+'</div></div></section>';
}
function reactionBoard(){return '<div class="reaction-board">'+reactionCard("like")+reactionCard("dislike")+recentCommentCard()+'</div>'}
function awardsBoard(){const w=hallData?.weeklyAwards||{};return '<div class="award-grid">'+awardCard("🌱 성장왕","PVE+PVP 아이템레벨 주간 증가량",w.growthKing||[],"itemLabel")+awardCard("💪 벌크업","PVE+PVP 전투력 주간 증가량",w.bulkUp||[],"powerLabel")+'</div>'}

function hofMetricValue(item,metric){
  if(!item)return '';
  if(metric==='like')return '👍 '+Number(item.like||0).toLocaleString('ko-KR');
  if(metric==='dislike')return '👎 '+Number(item.dislike||0).toLocaleString('ko-KR');
  if(metric==='pvp')return item.pvpPowerLabel||numberOnly(item.pvpPower)||'-';
  if(metric==='pve')return item.pvePowerLabel||numberOnly(item.pvePower)||'-';
  if(metric==='growth')return item.powerLabel||((item.powerDelta>0?'+':'')+numberOnly(item.powerDelta));
  if(metric==='enhance')return item.itemLabel||((item.itemLevelDelta>0?'+':'')+numberOnly(item.itemLevelDelta));
  return item.label||'';
}
function hofSummaryCard(item,index,metric){
  if(!item)return '<div class="hof-summary-empty">데이터 대기 중</div>';
  const rank=Number(item.rank||index+1||1);
  const metricText=escapeHtml(hofMetricValue(item,metric)||'-');
  const meta=[item.serverName||item.meta||'', item.className||''].filter(Boolean).join(' · ');
  const owner=String(item.owner||'').trim();
  const name=String(item.name||'').trim();
  const ownerNote=owner&&owner!==name?'<span class="hof-owner-note">본캐 '+escapeHtml(owner)+'</span>':'';
  const topClass=rank<=3?' is-top is-top-'+rank:'';
  return '<div class="hof-summary-card'+topClass+'" data-character="'+escapeHtml(name)+'">'
    + '<div class="hof-summary-rank">'+rankIcon(rank-1)+'</div>'
    + '<div class="hof-summary-profile">'+rankProfileHtml(item,rank)+'</div>'
    + '<div class="hof-summary-info"><div class="hof-summary-name"><strong>'+escapeHtml(name||'-')+'</strong>'+ownerNote+'</div>'
    + '<div class="hof-summary-meta">'+escapeHtml(meta||'지켈')+'</div>'
    + '<div class="hof-summary-reactions">'+rankReactionBoxHtml('like',item.like||0)+rankReactionBoxHtml('dislike',item.dislike||0)+'</div></div>'
    + '<div class="hof-summary-score '+escapeHtml(metric)+'">'+metricText+'</div>'
    + '</div>';
}
function hofTopList(title,note,list,metric){
  const items=(list||[]).slice(0,3);
  return '<section class="section hof-summary-section"><div class="section-head"><h2>'+title+'</h2><span class="section-note">'+escapeHtml(note||'')+'</span></div><div class="hof-summary-list">'
    + (items.length?items.map((item,i)=>hofSummaryCard(item,i,metric)).join(''):'<div class="empty">아직 데이터가 부족합니다.</div>')
    + '</div></section>';
}
function hofGodCard(title,note,item,metric){
  return '<section class="section hof-summary-section hof-god-section"><div class="section-head"><h2>'+title+'</h2><span class="section-note">'+escapeHtml(note||'')+'</span></div><div class="hof-summary-list hof-god-list">'
    + (item?hofSummaryCard(Object.assign({},item,{rank:1}),0,metric):'<div class="empty">비교 가능한 데이터가 부족합니다.</div>')
    + '</div></section>';
}
function hofReactionsSummary(){
  const s=hallData?.summarySections||{};
  return '<div class="hof-two-grid">'
    + hofTopList('👍 좋아요 TOP 3','모두에게 사랑받은 모험가',s.likesTop||hallData?.reactionSummary?.likeTop||[],'like')
    + hofTopList('👎 싫어요 TOP 3','뜨거운 관심을 받은 모험가',s.dislikesTop||hallData?.reactionSummary?.dislikeTop||[],'dislike')
    + '</div>';
}
function hofCombatSummary(){
  const s=hallData?.summarySections||{};
  return '<div class="hof-two-grid">'
    + hofTopList('⚔ PVE 전투력 TOP 3','PVE 전투력 기준',s.pveTop||hallData?.pveTop||[],'pve')
    + hofTopList('🛡 PVP 전투력 TOP 3','PVP 전투력 기준',s.pvpTop||hallData?.pvpTop||[],'pvp')
    + '</div>';
}
function hofGodsSummary(){
  const s=hallData?.summarySections||{};
  return '<div class="hof-two-grid hof-god-grid">'
    + hofGodCard('💎 강화의 신','아이템레벨 성장 1위',s.enhanceGod || hallData?.weeklyAwards?.bulkUp?.[0], 'enhance')
    + hofGodCard('🔥 성장의 신','전투력 성장 1위',s.growthGod || hallData?.weeklyAwards?.growthKing?.[0], 'growth')
    + '</div>';
}
function hofRankingLinkCard(){
  return '<section class="section hof-ranking-link-card hof-ranking-banner-slot" aria-label="레기온 전체 순위 바로가기">'
    + '<a class="hof-ranking-banner-link" href="../ranking/">'
    + '<div class="hof-ranking-banner-kicker">LEGION RANKING</div>'
    + '<div class="hof-ranking-banner-main"><strong>레기온 전체 순위</strong><span>PVE · PVP 좌우 비교 / 클래스 필터 / 캐릭터 검색</span></div>'
    + '<em>바로가기</em>'
    + '</a>'
    + '<p class="hof-ranking-banner-note">추후 제작한 배너 이미지로 교체 가능한 공통 배너 영역입니다.</p>'
    + '</section>';
}
function awardCard(title,note,list,labelKey){return '<section class="award-card"><div class="section-head"><h2>'+title+'</h2><span class="section-note">'+note+'</span></div><div class="award-body">'+(list.length?list.map((item,i)=>'<div class="award-row"><div class="award-rank">'+(i+1)+'위</div><div class="award-name"><div class="rank-name-flex"><div class="rank-name-main">'+flowText(item.name,item)+ownerLine(item)+'</div></div></div><div class="award-score">'+escapeHtml(item[labelKey]||'')+'</div></div>').join(''):'<div class="empty">비교 가능한 주간 데이터가 부족합니다.</div>')+'</div></section>'}


function rankProfileHtml(item,rank){
  const url=profileImageUrlFor(item);
  const rankClass=rank<=3?(' top-rank rank-avatar-top-'+rank):'';
  const cls='rank-profile-avatar'+rankClass+(url?'':' is-empty');
  if(!url)return '<div class="'+cls+'" aria-hidden="true">'+escapeHtml((item?.name||'?').slice(0,1))+'</div>';
  return '<img class="'+cls+'" src="'+escapeHtml(url)+'" alt="'+escapeHtml((item?.name||'캐릭터')+' 프로필')+'" loading="lazy" decoding="async">';
}
function rankOwnerBadgeHtml(item){
  const owner=String(item?.owner||'').trim();
  const name=String(item?.name||'').trim();
  const isSub=!!(owner&&name&&owner!==name);
  if(isSub)return '<span class="rank-owner-badge is-sub" title="본캐 '+escapeHtml(owner)+'">부캐 · '+escapeHtml(owner)+'</span>';
  return '<span class="rank-owner-badge is-main">본캐</span>';
}
function rankReactionBoxHtml(type,count){
  const icon=type==='like'?'👍':'👎';
  return '<span class="rank-reaction-box '+type+'"><span class="rank-reaction-icon">'+icon+'</span><span>'+escapeHtml(String(count||0))+'</span></span>';
}
function rankInlineReactionBoxesHtml(item){
  const r=reactionDataFor(item);
  return '<div class="rank-reaction-boxes">'+rankReactionBoxHtml('like',r.like)+rankReactionBoxHtml('dislike',r.dislike)+'</div>';
}
function setHallSlot(id,html){
  const el=document.getElementById(id);
  if(!el)return;
  el.classList.remove('is-ready','is-pending');
  el.classList.add('is-rendering');
  el.innerHTML=html;
  requestAnimationFrame(()=>{
    el.classList.remove('is-rendering');
    el.classList.add('is-ready');
  });
}

function bindHallAfterSlot(){
  bindHallDynamicEvents();
  bindCharacterButtons();
  requestAnimationFrame(applyOverflowMarquee);
}

function compactImageList(paths){
  return [...new Set((paths||[]).filter(Boolean))];
}

function rankEmblemsForList(list,totalFallback=10){
  const items=Array.isArray(list)?list:[];
  const total=items.length||totalFallback;
  return compactImageList(items.slice(0,Math.max(5,items.length)).map((_,idx)=>RANK_EMBLEMS[rankEmblemKey(idx+1,total)]));
}

function classIconsForList(list){
  const items=Array.isArray(list)?list:[];
  return compactImageList(items.map(item=>CLASS_ICONS[item?.className]));
}

function hallSlotTasks(){
  const s=hallData?.summarySections||{};
  const images=[];
  ['likesTop','dislikesTop','pveTop','pvpTop'].forEach(key=>{
    (s[key]||[]).forEach(item=>{ if(item?.profileImageUrl)images.push(item.profileImageUrl); });
  });
  [s.growthGod,s.enhanceGod].forEach(item=>{ if(item?.profileImageUrl)images.push(item.profileImageUrl); });
  return [
    {id:'hallSlotReactions',images:compactImageList(images),render:()=>hofReactionsSummary()},
    {id:'hallSlotCombat',images:compactImageList(images),render:()=>hofCombatSummary()},
    {id:'hallSlotGods',images:compactImageList(images),render:()=>hofGodsSummary()},
    {id:'hallSlotRankingLink',images:[],render:()=>hofRankingLinkCard()}
  ];
}

function hallShellExists(){
  return !!document.getElementById('hallSlotReactions') && !!document.getElementById('hallSlotCombat');
}

function renderHallShell(showSpinners){
  app.className='';
  const slotClass='hall-slot is-pending';
  app.innerHTML='<div class="hof-summary-layout">'
    + '<div id="hallSlotReactions" class="'+slotClass+'">'+(showSpinners?kinojoCardSpinner('좋아요/싫어요 TOP 3 불러오는 중'):'')+'</div>'
    + '<div id="hallSlotCombat" class="'+slotClass+'">'+(showSpinners?kinojoCardSpinner('PVE/PVP TOP 3 불러오는 중'):'')+'</div>'
    + '<div id="hallSlotGods" class="'+slotClass+'">'+(showSpinners?kinojoCardSpinner('강화의 신/성장의 신 집계 중'):'')+'</div>'
    + '<div id="hallSlotRankingLink" class="'+slotClass+'">'+(showSpinners?kinojoCardSpinner('전체 순위 페이지 준비 중'):'')+'</div>'
    + '</div>';
}

function renderHallSlots(options={}){
  if(!hallData)return;
  const progressive=options.progressive===true;
  const token=(window.__KINOJO_HALL_RENDER_TOKEN__||0)+1;
  window.__KINOJO_HALL_RENDER_TOKEN__=token;

  hallSlotTasks().forEach((task,index)=>{
    const draw=()=>{
      if(token!==window.__KINOJO_HALL_RENDER_TOKEN__)return;
      setHallSlot(task.id,task.render());
      bindHallAfterSlot();
    };

    if(progressive){
      const wait=typeof preloadImages==='function'?preloadImages(task.images):Promise.resolve();
      window.setTimeout(()=>{
        wait.then(()=>window.requestAnimationFrame(draw)).catch(()=>window.requestAnimationFrame(draw));
      },index*35);
      return;
    }

    draw();
  });
}

function renderReactionOnly(){
  if(!hallData)return;
  if(!hallShellExists())return render({initial:false});
  setHallSlot('hallSlotReactions',hofReactionsSummary());
  bindHallAfterSlot();
}

function render(options={}){
  if(!hallData)return;
  const initial=options.initial===true || !hallShellExists();
  const showSpinners=options.showSpinners===true;
  renderChicks();
  if(initial){
    renderHallShell(showSpinners);
  }
  renderHallSlots({progressive:initial && showSpinners});
}
