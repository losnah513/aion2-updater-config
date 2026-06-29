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
function awardCard(title,note,list,labelKey){return '<section class="award-card"><div class="section-head"><h2>'+title+'</h2><span class="section-note">'+note+'</span></div><div class="award-body">'+(list.length?list.map((item,i)=>'<div class="award-row"><div class="award-rank">'+(i+1)+'위</div><div class="award-name"><div class="rank-name-flex"><div class="rank-name-main">'+flowText(item.name,item)+ownerLine(item)+'</div></div></div><div class="award-score">'+escapeHtml(item[labelKey]||'')+'</div></div>').join(''):'<div class="empty">비교 가능한 주간 데이터가 부족합니다.</div>')+'</div></section>'}


function setRankPanelLoading(isLoading,message){
  const panel=document.getElementById('rankResultPanel');
  if(!panel)return;
  panel.classList.toggle('is-loading',!!isLoading);
  let overlay=panel.querySelector('.rank-result-loading');
  if(isLoading){
    if(!overlay){
      overlay=document.createElement('div');
      overlay.className='rank-result-loading';
      panel.appendChild(overlay);
    }
    overlay.innerHTML=kinojoCardSpinner(message||'서버 순위 불러오는 중');
  }else if(overlay){
    overlay.remove();
  }
}
function rankProfileHtml(item,rank){
  const url=profileImageUrlFor(item);
  const cls='rank-profile-avatar '+(rank<=3?'top-rank':'')+(url?'':' is-empty');
  if(!url)return '<div class="'+cls+'" aria-hidden="true">'+escapeHtml((item?.name||'?').slice(0,1))+'</div>';
  return '<img class="'+cls+'" src="'+escapeHtml(url)+'" alt="'+escapeHtml((item?.name||'캐릭터')+' 프로필')+'" loading="lazy" decoding="async">';
}
function reviewLineHtml(icon,text){
  const safe=String(text||'').trim();
  if(!safe)return '<div class="review-muted">'+icon+' 리뷰 대기 중</div>';
  return '<div>'+icon+' '+escapeHtml(safe)+'</div>';
}

function rankModeButtonHtml(mode,label){
  const active=activeRankMode===mode;
  return '<button class="rank-mode-choice '+(active?'active':'')+'" data-rank-mode="'+mode+'" type="button" aria-pressed="'+(active?'true':'false')+'"><span class="mode-icon" aria-hidden="true">⚔️</span><span>'+label+'</span></button>';
}
function rankTabs(){return '<div class="rank-filter-block"><div class="rank-filter-label">직업 필터</div><div class="class-tabs rank-tabs"><button class="pill all-rank '+(activeRankClass==="전체"?"active":"")+'" data-rank-class="전체">전체</button>'+CLASS_ORDER.map(cls=>'<button class="pill '+(activeRankClass===cls?"active":"")+'" data-rank-class="'+cls+'">'+classTabIcon(cls)+cls+'</button>').join("")+'</div></div>'}
function currentRankList(){
  return rankingItems();
}

function randomFrom(list){
  if(!Array.isArray(list)||!list.length)return "";
  return list[Math.floor(Math.random()*list.length)];
}

function rankEmblemKey(rank,total=10,item=null){
  const fromServer=String(item?.rankTier||item?.rank_tier||item?.emblemTier||item?.rank_emblem_tier||"").toLowerCase();
  if(["diamond","crystal","gold","silver","bronze"].includes(fromServer))return fromServer;

  // Apps Script rankTierForMvp_ 이전 규칙:
  // 1위 Diamond.
  // 총원 10명 미만: 2위 Crystal, 3위 Gold, 4위 Silver, 5위 이하 Bronze.
  // 총원 10명 이상: Crystal 상위 5%(최소 2위), Gold 20명 이하 20%/21명 이상 15%,
  // Silver 20명 이하 35%/21명 이상 25%, 이후 Bronze.
  const r=Number(rank||0);
  const t=Number(total||0);
  if(r<=1)return "diamond";
  if(t<10){
    if(r===2)return "crystal";
    if(r===3)return "gold";
    if(r===4)return "silver";
    return "bronze";
  }
  const crystalLimit=Math.max(2,Math.ceil(t*0.05));
  const goldRate=t<=20?0.20:0.15;
  const silverRate=t<=20?0.35:0.25;
  const goldLimit=Math.max(crystalLimit+1,Math.floor(t*goldRate));
  const silverLimit=Math.max(goldLimit+1,Math.floor(t*silverRate));
  if(r<=crystalLimit)return "crystal";
  if(r<=goldLimit)return "gold";
  if(r<=silverLimit)return "silver";
  return "bronze";
}

function rankEmblemHtml(rank,total=10,item=null){
  const key=rankEmblemKey(rank,total,item);
  const number='<span class="rank-number">#'+rank+'</span>';
  return '<span class="rank-emblem rank-emblem-'+key+'"><img src="'+RANK_EMBLEMS[key]+'" alt="rank emblem" draggable="false">'+number+'</span>';
}

function classCountMap(){
  return hallData?.rankingView?.classCounts || (includeSubs?(hallData?.classAllCount||{}):(hallData?.classMainCount||{}));
}

function getClassTotalCount(className){
  const map=classCountMap();
  const fromMap=Number(map[className]||0);
  if(fromMap>0)return fromMap;
  return fromMap;
}

function getClassReviewGroupKey(count){
  if(count>=10)return "full";
  if(count>=7)return "nearlyFull";
  if(count===6)return "small";
  if(count===5)return "partyReady";
  if(count===4)return "needOneMore";
  return "lonely";
}

function getClassReviewText(className,count){
  const pool=hallData?.classReviewPool||{};
  const key=getClassReviewGroupKey(count);
  return randomFrom(pool[key])||"새로운 랭커를 기다리는 중입니다.";
}

function classReviewBoxHtml(className){
  if(activeRankClass==="전체")return "";
  const count=getClassTotalCount(className);
  const text=getClassReviewText(className,count);
  return '<div class="class-review-box"><span class="review-count">총 '+count+'명</span><span class="review-text">'+escapeHtml(text)+'</span></div>';
}

function emptyRankRowHtml(rank){
  return '<tr class="rank-empty-row"><td class="num">'+rankEmblemHtml(rank)+'</td><td><span class="rank-empty-mark">—</span></td><td></td><td>'+classIconHtml(activeRankClass,false)+'</td><td></td><td></td><td></td></tr>';
}

function searchToolsHtml(){
  const resultCount=rankingTotalCount();
  const info=keyword?'<div class="search-info">서버 기준 '+resultCount+'명 검색됨</div>':'';
  return '<section class="rank-control-panel">'
    + '<div class="rank-mode-row" role="group" aria-label="전투력 기준 선택">'+rankModeButtonHtml('PVE','PVE 전투력')+rankModeButtonHtml('PVP','PVP 전투력')+'</div>'
    + '<div class="rank-search-row"><div class="rank-search-wrap"><input class="search" id="rankSearchInput" value="'+escapeHtml(keyword)+'" placeholder="캐릭터명 / 서버 / 직업 검색"><span class="rank-search-icon" aria-hidden="true">⌕</span></div><button class="btn rank-action-btn" id="rankRefreshBtn" type="button">조회</button><button class="btn rank-action-btn" id="rankClearBtn" type="button">초기화</button></div>'
    + '<div class="rank-option-row"><div class="rank-option-group"><span class="rank-option-label">부캐 표시</span><button class="sub-toggle compact '+(includeSubs?'on':'')+'" id="subToggle" type="button" aria-pressed="'+(includeSubs?'true':'false')+'"><span class="toggle-knob"></span><span class="toggle-text">'+(includeSubs?'ON':'OFF')+'</span></button></div><div class="rank-option-group"><span class="rank-option-label">전투력 기준</span><span class="rank-current-mode">'+activeRankMode+'</span></div></div>'
    + '</section>'+info;
}

function paginationHtml(totalPages){
  if(totalPages<=1)return '';
  const pages=[];
  const add=function(label,target,cls){pages.push('<button class="page-num '+(cls||'')+'" data-rank-page="'+target+'" type="button">'+label+'</button>')};
  add('처음으로',1,'edge');
  const start=Math.max(1,Math.min(page-2,totalPages-4));
  const end=Math.min(totalPages,start+4);
  for(let p=start;p<=end;p++)add(String(p),p,p===page?'active':'');
  add('마지막',totalPages,'edge');
  return '<div class="rank-pagination" aria-label="순위 페이지 이동">'+pages.join('')+'</div>';
}

function overallTable(){
  const list=currentRankList();
  const totalPages=Math.max(1,Math.ceil(rankingTotalCount()/PAGE_SIZE));
  if(page>totalPages)page=totalPages;

  const start=(page-1)*PAGE_SIZE;
  const slice=list;
  const isClassMode=activeRankClass!=="전체";
  const title=activeRankClass==="전체"
    ? '🏅 깡 레기온 전체 순위 · '+activeRankMode
    : '<span class="rank-title-wrap"><span class="rank-title-text">'+escapeHtml(activeRankClass)+' 순위</span></span>';
  const updateInfo='<span class="rank-standard-note">순위 기준: 서버 '+activeRankMode+' 전투력 기준'+(hallData?.updatedAt?' · 최종 업데이트 '+escapeHtml(hallData.updatedAt):'')+'</span>';

  const rows=[];

  for(let i=0;i<PAGE_SIZE;i++){
    const item=slice[i];
    const rank=start+i+1;

    if(item){
      const displayRank=Number(item.rank||item.rankNo||rank);
      const topClass=displayRank<=3?' rank-top-row rank-top-'+displayRank:'';
      rows.push('<tr class="rank-row'+topClass+'"><td class="num">'+rankEmblemHtml(displayRank,rankingTotalCount(),item)+'</td><td><div class="rank-name-flex rank-name-flex-table">'+rankProfileHtml(item,displayRank)+'<div class="rank-name-main"><span class="rank-name-cell">'+flowText(item.name,item)+'</span>'+ownerLine(item)+(item.serverName?'<div class="rank-sub-meta">'+escapeHtml(item.serverName)+'</div>':'')+'</div></div></td><td class="rank-reactions">'+reactionCountsHtml(item)+'</td><td>'+classIconHtml(item.className,false)+'</td><td class="power">'+escapeHtml(item.pvePowerLabel||item.label||"")+'</td><td class="power">'+escapeHtml(item.pvpPowerLabel||"")+'</td><td class="reviews">'+reviewLineHtml('🐲',item.pveReview||item.reviewText)+reviewLineHtml('⚔️',item.pvpReview||item.reviewText)+'</td></tr>');
      continue;
    }

    if(isClassMode){
      rows.push(emptyRankRowHtml(rank));
    }
  }

  if(!rows.length){
    rows.push('<tr><td colspan="7"><div class="empty">해당 조건의 순위 데이터가 없습니다.</div></td></tr>');
  }

  return '<section class="overall rank-redesign"><div class="overall-head"><div class="overall-title-block"><h2>'+title+'</h2>'+updateInfo+'</div><button class="btn rank-head-refresh" id="rankHeadRefreshBtn" type="button">↻ 새로고침</button></div>'+searchToolsHtml()+rankTabs()+classReviewBoxHtml(activeRankClass)+'<div id="rankResultPanel" class="rank-result-panel"><div class="table-scroll"><table class="rank-table"><colgroup><col class="num"><col class="char-col"><col class="reaction-col"><col class="class-col"><col class="power-col"><col class="power-col"><col class="review-col"></colgroup><thead><tr><th class="num">순위</th><th>캐릭터</th><th aria-label="좋아요 싫어요"></th><th>직업</th><th>전투력(PVE)</th><th>전투력(PVP)</th><th>AI 리뷰</th></tr></thead><tbody>'+rows.join("")+'</tbody></table></div>'+paginationHtml(totalPages)+'</div></section>';
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

function currentOverallPreviewList(){
  return currentRankList();
}

function hallSlotTasks(){
  const pveList=hallData?.pveTop||[];
  const pvpList=hallData?.pvpTop||[];
  const overallList=currentOverallPreviewList();
  return [
    {id:'hallSlotMvp',images:[RANK_EMBLEMS.mvp].concat(hallData?.mvp?.profileImageUrl?[hallData.mvp.profileImageUrl]:[]).concat((hallData?.mvpCandidatesTop3||[]).map(item=>item?.profileImageUrl).filter(Boolean)),render:()=>mvpSection()},
    {id:'hallSlotReactions',images:[],render:()=>reactionBoard()},
    {id:'hallSlotAwards',images:[],render:()=>awardsBoard()},
    {id:'hallSlotPve',images:rankEmblemsForList(pveList).concat(classIconsForList(pveList)),render:()=>rankBox("⚔ PVE TOP 5","",hallData.pveTop)},
    {id:'hallSlotPvp',images:rankEmblemsForList(pvpList).concat(classIconsForList(pvpList)),render:()=>rankBox("⚔ PVP TOP 5","",hallData.pvpTop)},
    {id:'hallSlotRelations',images:[],render:()=>combinedRelationBox()},
    {id:'hallSlotOverall',images:rankEmblemsForList(overallList,rankingTotalCount()).concat(Object.values(CLASS_ICONS)),render:()=>overallTable()}
  ];
}

function hallShellExists(){
  return !!document.getElementById('hallSlotOverall');
}

function renderHallShell(showSpinners){
  app.className='';
  const slotClass='hall-slot is-pending';
  app.innerHTML='<div id="hallSlotMvp" class="'+slotClass+'">'+(showSpinners?kinojoCardSpinner('시즌 MVP 준비 중'):'')+'</div>'
    + '<div id="hallSlotReactions" class="'+slotClass+'">'+(showSpinners?kinojoCardSpinner('반응 현황 불러오는 중'):'')+'</div>'
    + '<div id="hallSlotAwards" class="'+slotClass+'">'+(showSpinners?kinojoCardSpinner('성장왕/벌크업 진단 중'):'')+'</div>'
    + '<div class="dashboard"><div><div class="top-grid"><div id="hallSlotPve" class="'+slotClass+'">'+(showSpinners?kinojoCardSpinner('PVE TOP 5 불러오는 중'):'')+'</div><div id="hallSlotPvp" class="'+slotClass+'">'+(showSpinners?kinojoCardSpinner('PVP TOP 5 불러오는 중'):'')+'</div></div></div><div class="side-stack"><div id="hallSlotRelations" class="'+slotClass+'">'+(showSpinners?kinojoCardSpinner('관계 카드 불러오는 중'):'')+'</div></div></div>'
    + '<div id="hallSlotOverall" class="'+slotClass+'">'+(showSpinners?kinojoCardSpinner('전체 순위표 불러오는 중'):'')+'</div>';
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

function renderOverallOnly(){
  if(!hallData)return;
  if(!hallShellExists())return render({initial:false});
  setHallSlot('hallSlotOverall',overallTable());
  bindHallAfterSlot();
  setRankPanelLoading(false);
}

function renderReactionOnly(){
  if(!hallData)return;
  if(!hallShellExists())return render({initial:false});
  setHallSlot('hallSlotReactions',reactionBoard());
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
