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

function hofFirstDefined(){
  for(let i=0;i<arguments.length;i++){
    const v=arguments[i];
    if(v!==undefined && v!==null && String(v).trim()!=='')return v;
  }
  return '';
}
function hofNumberLike(value){
  const raw=hofFirstDefined(value,'');
  if(raw==='')return '';
  const n=Number(String(raw).replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?n:'';
}
function hofSignedNumber(value){
  const n=hofNumberLike(value);
  if(n==='')return '';
  return (n>0?'+':'')+n.toLocaleString('ko-KR');
}
function hofCharName(item){
  return String(hofFirstDefined(item?.name,item?.characterName,item?.character_name,item?.mainCharacterName,item?.main_character_name,'')).trim();
}
function hofServerName(item){
  const meta=String(hofFirstDefined(item?.serverName,item?.server_name,item?.server,item?.meta,'')).trim();
  return meta.replace(/^천족\s*·\s*/,'').replace(/^마족\s*·\s*/,'');
}
function hofClassName(item){
  return String(hofFirstDefined(item?.className,item?.class_name,item?.job,item?.class,'')).trim();
}
function hofOwnerName(item){
  return String(hofFirstDefined(item?.owner,item?.ownerName,item?.owner_name,item?.mainCharacterName,item?.main_character_name,'')).trim();
}
function hofMetricValue(item,metric){
  if(!item)return '';
  if(metric==='like')return Number(hofFirstDefined(item.like,item.likeCount,item.like_count,item.value,0)).toLocaleString('ko-KR');
  if(metric==='dislike')return Number(hofFirstDefined(item.dislike,item.dislikeCount,item.dislike_count,item.dislike_count_total,item.value,0)).toLocaleString('ko-KR');
  if(metric==='pvp')return hofFirstDefined(item.pvpPowerLabel,item.pvp_power_label,numberOnly(hofFirstDefined(item.pvpPower,item.pvp_power,item.latest_pvp_combat_power,item.value,'')),'-');
  if(metric==='pve')return hofFirstDefined(item.pvePowerLabel,item.pve_power_label,numberOnly(hofFirstDefined(item.pvePower,item.pve_power,item.latest_pve_combat_power,item.value,'')),'-');
  if(metric==='growth')return hofFirstDefined(item.powerLabel,item.power_label,item.label,hofSignedNumber(hofFirstDefined(item.powerDelta,item.power_delta,item.itemDelta,item.item_delta,item.valueDelta,item.value_delta,item.value,'')),'-');
  if(metric==='enhance')return hofFirstDefined(item.itemLabel,item.item_label,item.label,hofSignedNumber(hofFirstDefined(item.itemLevelDelta,item.item_level_delta,item.valueDelta,item.value_delta,item.value,'')),'-');
  return item.label||'';
}
function hofMetricRawValue(item,metric){
  if(!item)return '';
  if(metric==='like')return hofFirstDefined(item.like,item.likeCount,item.like_count,item.value,'');
  if(metric==='dislike')return hofFirstDefined(item.dislike,item.dislikeCount,item.dislike_count,item.value,'');
  if(metric==='pvp')return hofFirstDefined(item.pvpPower,item.pvp_power,item.latest_pvp_combat_power,item.value,'');
  if(metric==='pve')return hofFirstDefined(item.pvePower,item.pve_power,item.latest_pve_combat_power,item.value,'');
  if(metric==='growth')return hofFirstDefined(item.powerDelta,item.power_delta,item.itemDelta,item.item_delta,item.valueDelta,item.value_delta,item.value,'');
  if(metric==='enhance')return hofFirstDefined(item.itemLevelDelta,item.item_level_delta,item.valueDelta,item.value_delta,item.value,'');
  return hofFirstDefined(item.value,'');
}
function hofMetricLabel(metric){
  if(metric==='like')return '좋아요';
  if(metric==='dislike')return '싫어요';
  if(metric==='growth')return '성장량';
  if(metric==='enhance')return '강화 수치';
  if(metric==='pvp')return 'PVP 전투력';
  if(metric==='pve')return 'PVE 전투력';
  return '포인트';
}
function hofNormalizeName(value){
  return String(value||'').trim().replace(/\s+/g,'').toLowerCase();
}
function hofSessionName(){
  const session=window.KinojoAuth?.getSession?.()||{};
  const account=window.KinojoAuth?.getAccount?.()||{};
  const candidates=[
    session.characterName, session.mainCharacterName, session.main_character_name, session.name,
    account.characterName, account.mainCharacterName, account.main_character_name, account.name
  ];
  return candidates.map(v=>String(v||'').trim()).find(Boolean)||'';
}
function hofCollectMetricList(metric){
  const s=hallData?.summarySections||{};
  const r=hallData?.reactionSummary||{};
  if(metric==='enhance')return [s.enhanceGod, ...(hallData?.weeklyAwards?.bulkUp||[])].filter(Boolean);
  if(metric==='growth')return [s.growthGod, ...(hallData?.weeklyAwards?.growthKing||[])].filter(Boolean);
  if(metric==='pve')return (s.pveTop||s.pveTop3||hallData?.pveTop||hallData?.pveTop3||[]).filter(Boolean);
  if(metric==='pvp')return (s.pvpTop||s.pvpTop3||hallData?.pvpTop||hallData?.pvpTop3||[]).filter(Boolean);
  if(metric==='like')return (s.likesTop||s.likeTop||r.likeTop||[]).filter(Boolean);
  if(metric==='dislike')return (s.dislikesTop||s.dislikeTop||r.dislikeTop||[]).filter(Boolean);
  return [];
}
function hofFindMyMetric(metric){
  const name=hofNormalizeName(hofSessionName());
  if(!name)return null;
  const list=hofCollectMetricList(metric);
  const found=list.find(item=>{
    const charName=hofNormalizeName(hofCharName(item));
    const ownerName=hofNormalizeName(hofOwnerName(item));
    return charName===name || ownerName===name;
  });
  if(!found)return null;
  const rank=Number(hofFirstDefined(found.rank,found.rankNo,found.rank_no,found.position,0)) || (list.indexOf(found)+1);
  return { item:found, rank:rank, score:hofMetricValue(found,metric)||'-' };
}
function hofRankSummaryText(item,metric){
  if(!item)return '';
  const bits=[];
  if(metric==='growth'){
    bits.push('이번주 '+hofMetricValue(item,metric));
  }else if(metric==='enhance'){
    bits.push('최근 '+hofMetricValue(item,metric));
  }else{
    bits.push(hofMetricLabel(metric)+' '+hofMetricValue(item,metric));
  }
  const cls=hofClassName(item);
  if(cls)bits.push(cls);
  return bits.filter(Boolean).join(' · ');
}
function hofRankMedal(rank){
  return '<span class="hof-v2-medal hof-v2-medal-'+rank+'" aria-label="'+rank+'위"><span>'+rank+'</span></span>';
}
function hofRankPortrait(item,rank,size){
  const url=profileImageUrlFor(item);
  const name=hofCharName(item)||'?';
  const cls='hof-v2-portrait '+(size||'')+(url?'':' is-empty');
  if(!url)return '<div class="'+cls+'" aria-hidden="true">'+escapeHtml(name.slice(0,1))+'</div>';
  return '<img class="'+cls+'" src="'+escapeHtml(url)+'" alt="'+escapeHtml(name+' 프로필')+'" loading="lazy" decoding="async">';
}
function hofBackgroundClass(metric){
  if(metric==='enhance')return 'is-enhance';
  if(metric==='growth')return 'is-growth';
  if(metric==='pve')return 'is-pve';
  if(metric==='pvp')return 'is-pvp';
  if(metric==='like')return 'is-like';
  if(metric==='dislike')return 'is-dislike';
  return 'is-default';
}

function hofMetricIcon(metric){
  if(metric==='enhance')return '✦';
  if(metric==='growth')return '▲';
  if(metric==='pve')return 'PVE';
  if(metric==='pvp')return 'PVP';
  if(metric==='like')return '♥';
  if(metric==='dislike')return '◆';
  return 'H';
}
function hofMetricToneLabel(metric){
  if(metric==='enhance')return 'ENHANCE GOD';
  if(metric==='growth')return 'GROWTH GOD';
  if(metric==='pve')return 'PVE TOP 3';
  if(metric==='pvp')return 'PVP TOP 3';
  if(metric==='like')return 'LIKE TOP 3';
  if(metric==='dislike')return 'DISLIKE TOP 3';
  return 'KINOJO HALL';
}

function hofClassBadge(item){
  const cls=hofClassName(item);
  return cls?'<span class="hof-v2-class-badge">'+escapeHtml(cls)+'</span>':'';
}
function hofOwnerBadge(item){
  const name=hofCharName(item);
  const owner=hofOwnerName(item);
  if(owner && name && hofNormalizeName(owner)!==hofNormalizeName(name))return '<span class="hof-v2-owner-badge">부캐 · '+escapeHtml(owner)+'</span>';
  return name?'<span class="hof-v2-owner-badge is-main">본캐</span>':'';
}
function hofTop3Card(item,index,metric){
  const rank=index+1;
  if(!item)return '<div class="hof-v2-top3-item is-empty"><div class="hof-v2-empty-dot">'+rank+'</div><div class="hof-v2-empty-text">데이터 대기</div></div>';
  const name=hofCharName(item)||'-';
  const server=hofServerName(item)||'지켈';
  const summary=hofRankSummaryText(item,metric);
  const score=hofMetricValue(item,metric)||'-';
  return '<button type="button" class="hof-v2-top3-item rank-'+rank+'" data-character="'+escapeHtml(name)+'" data-hof-metric="'+escapeHtml(metric)+'" data-hof-rank="'+rank+'" data-hof-score="'+escapeHtml(score)+'" aria-label="'+escapeHtml(name)+' 상세 보기">'
    + '<span class="hof-v2-rank-stack">'+hofRankMedal(rank)+'</span>'
    + '<span class="hof-v2-portrait-wrap">'+hofRankPortrait(item,rank,'small')+'</span>'
    + '<span class="hof-v2-top3-info"><span class="hof-v2-top3-name">'+escapeHtml(name)+'</span>'
    + '<span class="hof-v2-top3-meta">'+escapeHtml(server)+'</span>'
    + '<span class="hof-v2-badge-line">'+hofClassBadge(item)+hofOwnerBadge(item)+'</span>'
    + (summary?'<span class="hof-v2-top3-summary">'+escapeHtml(summary)+'</span>':'')+'</span>'
    + '<strong class="hof-v2-top3-score"><small>'+escapeHtml(hofMetricLabel(metric))+'</small>'+escapeHtml(score)+'</strong>'
    + '</button>';
}
function hofWidePanel(title,note,list,metric){
  const items=(list||[]).slice(0,3);
  return '<section class="hof-v2-panel hof-v2-wide '+hofBackgroundClass(metric)+'" data-hof-panel="'+escapeHtml(metric)+'">'
    + '<div class="hof-v2-panel-bg" aria-hidden="true"></div>'
    + '<div class="hof-v2-panel-head"><div><span class="hof-v2-kicker">'+escapeHtml(hofMetricToneLabel(metric))+'</span><h2><span class="hof-v2-title-icon">'+escapeHtml(hofMetricIcon(metric))+'</span>'+escapeHtml(title)+'</h2></div><p>'+escapeHtml(note||'')+'</p></div>'
    + '<div class="hof-v2-top3">'+[0,1,2].map(i=>hofTop3Card(items[i],i,metric)).join('')+'</div>'
    + '</section>';
}
function hofGodHeroCard(title,note,item,metric){
  const safeItem=item||null;
  const hasItem=!!(safeItem&&hofCharName(safeItem));
  const name=hasItem?hofCharName(safeItem):'집계 대기';
  const score=hasItem?(hofMetricValue(safeItem,metric)||'-'):'-';
  const meta=[hofServerName(safeItem), hofClassName(safeItem)].filter(Boolean).join(' · ');
  const deltaLabel=metric==='enhance'?'최고 강화 수치':'이번주 성장량';
  const recent=metric==='enhance'?hofFirstDefined(safeItem?.itemLevelDelta,safeItem?.item_level_delta,safeItem?.valueDelta,safeItem?.value_delta,''):hofFirstDefined(safeItem?.powerDelta,safeItem?.power_delta,safeItem?.itemDelta,safeItem?.item_delta,safeItem?.valueDelta,safeItem?.value_delta,'');
  const recentText=recent!==''?hofSignedNumber(recent):'-';
  const compare=hofFirstDefined(safeItem?.growthRateLabel,safeItem?.growth_rate_label,safeItem?.rateLabel,safeItem?.rate_label,safeItem?.weekCompareLabel,safeItem?.week_compare_label,'');
  const bodyTag=hasItem?'button':'div';
  const bodyAttrs=hasItem?' type="button" data-character="'+escapeHtml(name)+'" data-hof-metric="'+escapeHtml(metric)+'" data-hof-rank="1" data-hof-score="'+escapeHtml(score)+'" aria-label="'+escapeHtml(name)+' 상세 보기"':'';
  return '<section class="hof-v2-panel hof-v2-god '+hofBackgroundClass(metric)+'" data-hof-panel="'+escapeHtml(metric)+'">'
    + '<div class="hof-v2-panel-bg" aria-hidden="true"></div>'
    + '<div class="hof-v2-god-head"><span class="hof-v2-kicker">'+escapeHtml(hofMetricToneLabel(metric))+'</span><h2><span class="hof-v2-title-icon">'+escapeHtml(hofMetricIcon(metric))+'</span>'+escapeHtml(title)+'</h2><p>'+escapeHtml(note||'')+'</p></div>'
    + '<'+bodyTag+' class="hof-v2-god-main'+(hasItem?'':' is-empty')+'"'+bodyAttrs+'>'
    + '<span class="hof-v2-god-portrait">'+hofRankPortrait(safeItem,1,'large')+(hasItem?hofRankMedal(1):'')+'</span>'
    + '<strong>'+escapeHtml(name)+'</strong>'
    + '<span>'+escapeHtml(meta||'지켈')+'</span>'
    + '</'+bodyTag+'>'
    + '<div class="hof-v2-god-score"><strong>'+escapeHtml(score)+'</strong><span>'+deltaLabel+'</span></div>'
    + '<div class="hof-v2-god-sub"><span>최근 변화</span><strong>'+escapeHtml(recentText)+'</strong></div>'
    + (compare?'<div class="hof-v2-god-compare"><span>전주 대비</span><strong>'+escapeHtml(compare)+'</strong></div>':'')
    + '</section>';
}
function hofMyRankingPanel(){
  const isLoggedIn=!!(window.KinojoAuth&&typeof window.KinojoAuth.getSession==='function'&&window.KinojoAuth.getSession());
  const myName=hofSessionName();
  const rows=[
    ['강화의 신','enhance'],
    ['PVE 랭킹','pve'],
    ['PVP 랭킹','pvp'],
    ['좋아요 랭킹','like'],
    ['싫어요 랭킹','dislike'],
    ['성장의 신','growth']
  ];
  const rowHtml=rows.map(row=>{
    const title=row[0];
    const metric=row[1];
    const found=isLoggedIn?hofFindMyMetric(metric):null;
    const rankText=found?'RANK '+found.rank:'RANK -';
    const label=hofMetricLabel(metric);
    const score=found?found.score:'-';
    const nameLine=found?.item?'<span class="hof-v2-my-name">'+escapeHtml(hofCharName(found.item))+'</span>':'';
    return '<div class="hof-v2-my-row '+hofBackgroundClass(metric)+(found?' is-found':'')+'" data-hof-metric="'+escapeHtml(metric)+'">'
      + '<div><strong>'+escapeHtml(title)+'</strong><span>'+escapeHtml(rankText)+'</span>'+nameLine+'</div>'
      + '<div><em>'+escapeHtml(label)+'</em><b>'+escapeHtml(score)+'</b></div>'
      + '</div>';
  }).join('');
  return '<aside class="hof-v2-panel hof-v2-my-rank">'
    + '<div class="hof-v2-my-head"><span class="hof-v2-kicker">MY KINOJO</span><h2><span class="hof-v2-title-icon">◎</span>내 랭킹 정보</h2><p>'+(isLoggedIn&&myName?escapeHtml(myName)+' 기준으로 표시됩니다.':'로그인한 캐릭터 기준으로 표시됩니다.')+'</p></div>'
    + (!isLoggedIn?'<div class="hof-v2-login-guide"><span>🔒</span><strong>로그인 후 나의 랭킹을 확인하세요.</strong><button type="button" onclick="window.KinojoAuth?.openLoginModal?.()">로그인</button></div>':'')
    + '<div class="hof-v2-my-list">'+rowHtml+'</div>'
    + '</aside>';
}
function hofV2Layout(){
  const s=hallData?.summarySections||{};
  const pveList=s.pveTop||s.pveTop3||hallData?.pveTop||hallData?.pveTop3||[];
  const pvpList=s.pvpTop||s.pvpTop3||hallData?.pvpTop||hallData?.pvpTop3||[];
  const likeList=s.likesTop||s.likeTop||hallData?.reactionSummary?.likeTop||[];
  const dislikeList=s.dislikesTop||s.dislikeTop||hallData?.reactionSummary?.dislikeTop||[];
  return '<div class="hof-v2-layout">'
    + '<div class="hof-v2-left">'+hofGodHeroCard('강화의 신','최고 강화 기록을 가진 모험가',s.enhanceGod || hallData?.weeklyAwards?.bulkUp?.[0], 'enhance')+'</div>'
    + '<div class="hof-v2-center">'
    + hofWidePanel('PVE 랭킹','PVE 랭킹 TOP 3',pveList,'pve')
    + hofWidePanel('PVP 랭킹','PVP 랭킹 TOP 3',pvpList,'pvp')
    + '<div class="hof-v2-two">'
    + hofWidePanel('좋아요 랭킹','좋아요 TOP 3',likeList,'like')
    + hofWidePanel('싫어요 랭킹','싫어요 TOP 3',dislikeList,'dislike')
    + '</div>'
    + hofGodHeroCard('성장의 신','이번 주 가장 눈부신 성장',s.growthGod || hallData?.weeklyAwards?.growthKing?.[0], 'growth')
    + '</div>'
    + '<div class="hof-v2-right">'+hofMyRankingPanel()+'</div>'
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
    {id:'hallSlotV2Layout',images:compactImageList(images),render:()=>hofV2Layout()}
  ];
}

function hallShellExists(){
  return !!document.getElementById('hallSlotV2Layout');
}

function renderHallShell(showSpinners){
  app.className='';
  const slotClass='hall-slot is-pending';
  app.innerHTML='<div class="hof-v2-shell"><div id="hallSlotV2Layout" class="'+slotClass+'">'+(showSpinners?kinojoCardSpinner('명예의 전당 v2 레이아웃 준비 중'):'')+'</div></div>';
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
  setHallSlot('hallSlotV2Layout',hofV2Layout());
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
