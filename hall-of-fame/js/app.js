const WEB_APP_URL=new URLSearchParams(location.search).get("api")||"https://script.google.com/macros/s/AKfycbztXbGEbiId1yOfa3CVmErivNVi5IUi64qxIQRf8Sm_KduCPieeAKlNRMGyYkKL5iPaYg/exec";
const CLASS_ORDER=["검성","수호성","살성","궁성","정령성","마도성","치유성","호법성"];
const CLASS_ICONS={"검성":"assets/class_icon_gladiator.png","수호성":"assets/class_icon_templar.png","살성":"assets/class_icon_assassin.png","궁성":"assets/class_icon_ranger.png","정령성":"assets/class_icon_elementalist.png","마도성":"assets/class_icon_sorcerer.png","치유성":"assets/class_icon_cleric.png","호법성":"assets/class_icon_chanter.png"};
const RANK_EMBLEMS={mvp:"assets/emblem_mvp_challenger.png",diamond:"assets/emblem_rank_diamond.png",crystal:"assets/emblem_rank_crystal.png",gold:"assets/emblem_rank_gold.png",silver:"assets/emblem_rank_silver.png",bronze:"assets/emblem_rank_bronze.png"};
let hallData=null,keyword="",includeSubs=false,page=1,activeRankClass="전체",chicksExpanded=false,chicksDismissed=false,longPressTimer=null,longPressFired=false,loadingTimer=null,loadingStep=0,currentReactionItem=null,currentReactionType="like",reactionCarouselIndex=0,reactionCarouselPausedUntil=0,reactionSubmitting=false,searchComposing=false,searchDebounceTimer=null,adminAuthed=false;
const PAGE_SIZE=10,app=document.getElementById("app");
function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}
function rankIcon(i){return i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}
function currentOverall(){return includeSubs?(hallData.overallAll||[]):(hallData.overallMain||[])}
function currentDemon(){return includeSubs?(hallData.demonFamilyAll||hallData.demonFamily||[]):(hallData.demonFamily||[])}
function currentParty(){return includeSubs?(hallData.partyFriendAll||hallData.partyFriend||[]):(hallData.partyFriend||[])}
function match(item){if(!keyword)return true;return [item.name,item.owner,item.serverName,item.meta,item.className,item.pveReview,item.pvpReview].join(" ").toLowerCase().includes(keyword.toLowerCase())}

function reactionIcon(kind){
  const cls=kind==="dislike"?"dislike-icon":"like-icon";
  return '<span class="reaction-icon '+cls+'" aria-hidden="true"></span>';
}
function reactionPairHtml(like,dislike,extraClass){
  return '<span class="reaction-pair '+(extraClass||'')+'">'
    + reactionIcon("like")+'<strong>'+Number(like||0)+'</strong>'
    + reactionIcon("dislike")+'<strong>'+Number(dislike||0)+'</strong>'
    + '</span>';
}

function nameClass(item){return item?.isAdminMain?"admin-main":(item?.isAdminAlt?"admin-alt":"")}
function itemClass(item){return ""}
function nameSpan(item,text){
  return '<span class="character-name-text '+nameClass(item)+'" data-character="'+escapeHtml(item?.name||"")+'">'
    + '<span class="character-text">'+text+'</span>'
    + '</span>';
}
function ownerLine(item){const owner=String(item?.owner||"").trim(),name=String(item?.name||"").trim();return owner&&owner!==name?'<div class="owner-line">본캐 '+escapeHtml(owner)+'</div>':''}
function flowText(text,item){return '<span class="flow-candidate">'+nameSpan(item,escapeHtml(text))+'</span>'}
function classIconHtml(cls,withText=false){const path=CLASS_ICONS[cls];if(!path)return withText?'<span class="class-icon-cell">'+escapeHtml(cls||"-")+'</span>':'-';return '<span class="class-icon-cell"><img class="class-icon" src="'+path+'" alt="'+escapeHtml(cls)+'">'+(withText?'<span>'+escapeHtml(cls)+'</span>':'')+'</span>'}
function classTabIcon(cls){const path=CLASS_ICONS[cls];return path?'<img class="tab-icon" src="'+path+'" alt="">':''}
function miniRow(item,i,total){const rank=i+1;return '<div class="mini-row '+itemClass(item)+'"><div class="medal rank-medal">'+rankEmblemHtml(rank,total)+'</div><div class="name-wrap"><div class="name">'+flowText(item.name,item)+'</div>'+ownerLine(item)+(item.meta?'<div class="meta">'+escapeHtml(item.meta)+'</div>':'')+'</div>'+reactionCountsHtml(item)+'<div class="score">'+escapeHtml(item.label||"")+'</div></div>'}
function rankBox(title,note,list){const items=(list||[]).filter(match);return '<section class="section"><div class="section-head"><h2>'+title+'</h2><span class="section-note">'+(note||'')+'</span></div><div class="list">'+(items.length?items.map((item,i)=>miniRow(item,i,items.length)).join(""):'<div class="empty">아직 데이터가 부족해요.</div>')+'</div></section>'}
function tagBox(title,note,list){const items=(list||[]).filter(match);return '<section class="section"><div class="section-head"><h2>'+title+'</h2><span class="section-note">'+(note||'')+'</span></div><div class="tag-list swipe-list">'+(items.length?items.map(item=>'<div class="name-tag '+itemClass(item)+'"><div class="tag-name-wrap"><div class="tag-name">'+flowText(item.name,item)+'</div></div>'+ownerLine(item)+(item.meta?'<div class="tag-meta">'+escapeHtml(item.meta)+'</div>':'')+'</div>').join(""):'<div class="empty">아직 데이터가 부족해요.</div>')+'</div></section>'}
function combinedRelationBox(){
  const demonItems=(currentDemon()||[]).filter(match);
  const partyItems=(currentParty()||[]).filter(match);

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
function renderChicks(){const items=(hallData?.newChicks||[]).filter(match);const card=document.getElementById("chickCard");if(!card)return;if(chicksDismissed||!items.length){card.style.display="none";return}card.style.display="block";document.getElementById("chickTitle").textContent="🐣 신입 병아리 "+items.length+"명 입장!";document.getElementById("chickSub").textContent=items.length>=5?"새로운 모험가들이 우르르 둥지에 들어왔어요!":"새로운 모험가들을 따뜻하게 환영합니다!";const shown=chicksExpanded?items:items.slice(0,5);document.getElementById("chickTags").innerHTML=shown.map(item=>'<span class="chick-tag">'+escapeHtml(chickLabel(item))+'</span>').join("")+(items.length>5?'<span class="chick-tag chick-more" id="chickMore">'+(chicksExpanded?"접기":"+"+(items.length-5)+"명 더 보기")+'</span>':'');const more=document.getElementById("chickMore");if(more)more.onclick=()=>{chicksExpanded=!chicksExpanded;renderChicks()};const close=document.getElementById("chickCloseBtn");if(close&&!close.dataset.bound){close.dataset.bound="1";close.onclick=()=>{chicksDismissed=true;card.style.display="none"}}}
function renderVisits(stats){
  const today=Number(stats?.todayVisits||0).toLocaleString("ko-KR");
  const total=Number(stats?.totalVisits||0).toLocaleString("ko-KR");
  const el=document.getElementById("visitCard");
  if(!el)return;
  el.innerHTML='<span class="visit-line visit-line-today">👀 오늘 '+today+'명의 모험가님이 다녀가셨어요.</span><span class="visit-line visit-line-total">🏛 누적 '+total+'회의 발걸음이 키노조에 남았습니다.</span>';
}
async function fetchVisitStats(mode="stats",boost=0){try{const url=WEB_APP_URL+(WEB_APP_URL.includes("?")?"&":"?")+"action=hallVisit&mode="+encodeURIComponent(mode)+"&boost="+encodeURIComponent(boost)+"&t="+Date.now();const res=await fetch(url,{cache:"no-store"});const data=await res.json();if(data?.ok&&data.stats)renderVisits(data.stats)}catch(e){}}
function recordDailyVisitOnce(){const key="kinojo_hof_visit_"+new Date().toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"});if(localStorage.getItem(key)==="1"){fetchVisitStats();return}localStorage.setItem(key,"1");fetchVisitStats("visit",1)}
function mvpSection(){return '<section class="mvp-card"><div class="mvp-head"><h2>👑 시즌 MVP</h2><span class="section-note">챌린저</span></div><div class="mvp-body mvp-challenger-waiting"><div class="mvp-emblem-wrap"><img class="mvp-emblem-blur" src="'+RANK_EMBLEMS.mvp+'" alt="챌린저 엠블럼"><div class="mvp-emblem-question">?</div></div><div class="mvp-wait-title">첫 번째 챌린저를 기다리는 중</div><div class="mvp-wait-sub">아직 이 엠블럼의 주인은 정해지지 않았습니다.</div></div></section>'}

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

function rankTabs(){return '<div class="class-tabs rank-tabs"><button class="pill all-rank '+(activeRankClass==="전체"?"active":"")+'" data-rank-class="전체">전체</button>'+CLASS_ORDER.map(cls=>'<button class="pill '+(activeRankClass===cls?"active":"")+'" data-rank-class="'+cls+'">'+classTabIcon(cls)+cls+'</button>').join("")+'</div>'}
function currentRankList(){
  if(activeRankClass!=="전체"){
    const map=includeSubs?(hallData?.classAll||{}):(hallData?.classMain||{});
    return (map[activeRankClass]||[]).filter(match);
  }
  return currentOverall().filter(match);
}

function randomFrom(list){
  if(!Array.isArray(list)||!list.length)return "";
  return list[Math.floor(Math.random()*list.length)];
}

function rankEmblemKey(rank,total=10){
  if(rank<=1)return "diamond";
  if(total<10){
    if(rank===2)return "crystal";
    if(rank===3)return "gold";
    if(rank===4)return "silver";
    return "bronze";
  }
  const crystalLimit=Math.max(2,Math.ceil(total*0.05));
  const goldRate=total<=20?0.20:0.15;
  const silverRate=total<=20?0.35:0.25;
  const goldLimit=Math.max(crystalLimit+1,Math.floor(total*goldRate));
  const silverLimit=Math.max(goldLimit+1,Math.floor(total*silverRate));
  if(rank<=crystalLimit)return "crystal";
  if(rank<=goldLimit)return "gold";
  if(rank<=silverLimit)return "silver";
  return "bronze";
}

function rankEmblemHtml(rank,total=10){
  const key=rankEmblemKey(rank,total);
  const number='<span class="rank-number">#'+rank+'</span>';
  return '<span class="rank-emblem rank-emblem-'+key+'"><img src="'+RANK_EMBLEMS[key]+'" alt="rank emblem" draggable="false">'+number+'</span>';
}

function classCountMap(){
  return includeSubs?(hallData?.classAllCount||{}):(hallData?.classMainCount||{});
}

function getClassTotalCount(className){
  const map=classCountMap();
  const fromMap=Number(map[className]||0);
  if(fromMap>0)return fromMap;
  return currentOverall().filter(item=>item.className===className).length;
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
  const resultCount=currentRankList().length;
  const info=keyword?'<div class="search-info">현재 순위 영역에서만 '+resultCount+'명 검색됨</div>':'';
  return '<section class="tools rank-tools"><input class="search" id="rankSearchInput" value="'+escapeHtml(keyword)+'" placeholder="캐릭터명 / 서버 / 직업 검색"><button class="btn" id="rankRefreshBtn" type="button">조회</button><button class="btn" id="rankClearBtn" type="button">초기화</button></section>'+info;
}

function overallTable(){
  const list=currentRankList();
  const totalPages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));
  if(page>totalPages)page=totalPages;

  const start=(page-1)*PAGE_SIZE;
  const slice=list.slice(start,start+PAGE_SIZE);
  const isClassMode=activeRankClass!=="전체";
  const title=activeRankClass==="전체"
    ? '🏅 키노조 전체 순위'
    : '<span class="rank-title-wrap"><img class="rank-title-icon" src="'+CLASS_ICONS[activeRankClass]+'" alt=""><span class="rank-title-text">'+escapeHtml(activeRankClass)+' 순위</span></span>';

  const rows=[];

  for(let i=0;i<PAGE_SIZE;i++){
    const item=slice[i];
    const rank=start+i+1;

    if(item){
      const displayRank=Number(item.rank||rank);rows.push('<tr><td class="num">'+rankEmblemHtml(displayRank,list.length)+'</td><td><div class="rank-name-flex rank-name-flex-table"><div class="rank-name-main"><span class="rank-name-cell">'+flowText(item.name,item)+'</span>'+ownerLine(item)+'</div></div></td><td class="rank-reactions">'+reactionCountsHtml(item)+'</td><td>'+classIconHtml(item.className,false)+'</td><td class="power">'+escapeHtml(item.pvePowerLabel||item.label||"")+'</td><td class="power">'+escapeHtml(item.pvpPowerLabel||"")+'</td><td class="reviews"><div>🐲 '+escapeHtml(item.pveReview||"")+'</div><div>⚔️ '+escapeHtml(item.pvpReview||"")+'</div></td></tr>');
      continue;
    }

    if(isClassMode){
      rows.push(emptyRankRowHtml(rank));
    }
  }

  if(!rows.length){
    rows.push('<tr><td colspan="7"><div class="empty">해당 조건의 순위 데이터가 없습니다.</div></td></tr>');
  }

  return '<section class="overall"><div class="overall-head"><h2>'+title+'</h2><div class="overall-title-tools"><button class="sub-toggle compact '+(includeSubs?'on':'')+'" id="subToggle" type="button"><span class="toggle-knob"></span><span class="toggle-text">'+(includeSubs?'부캐 ON':'부캐 OFF')+'</span></button></div><div class="page-tools"><span>'+page+' / '+totalPages+'</span><button class="page-btn" data-page="prev">‹</button><button class="page-btn" data-page="next">›</button></div></div>'+searchToolsHtml()+rankTabs()+classReviewBoxHtml(activeRankClass)+'<div class="table-scroll"><table class="rank-table"><colgroup><col class="num"><col class="char-col"><col class="reaction-col"><col class="class-col"><col class="power-col"><col class="power-col"><col class="review-col"></colgroup><thead><tr><th class="num">순위</th><th>캐릭터명</th><th aria-label="좋아요 싫어요"></th><th>클래스</th><th>PVE</th><th>PVP</th><th>AI 리뷰</th></tr></thead><tbody>'+rows.join("")+'</tbody></table></div></section>';
}
function render(){if(!hallData)return;renderChicks();app.className="";app.innerHTML=mvpSection()+reactionBoard()+awardsBoard()+'<div class="dashboard"><div><div class="top-grid">'+rankBox("⚔ PVE TOP 5","",hallData.pveTop)+rankBox("⚔ PVP TOP 5","",hallData.pvpTop)+'</div></div><div class="side-stack">'+combinedRelationBox()+'</div></div>'+overallTable();bindDynamic();bindCharacterButtons();requestAnimationFrame(applyOverflowMarquee)}
function bindDynamic(){document.querySelectorAll("[data-page]").forEach(btn=>btn.onclick=()=>{const total=Math.max(1,Math.ceil(currentRankList().length/PAGE_SIZE));page+=btn.dataset.page==="next"?1:-1;if(page<1)page=1;if(page>total)page=total;render()});document.querySelectorAll("[data-rank-class]").forEach(btn=>btn.onclick=()=>{activeRankClass=btn.dataset.rankClass;page=1;render()});const search=document.getElementById("rankSearchInput");if(search){search.oncompositionstart=()=>{searchComposing=true;clearTimeout(searchDebounceTimer)};search.oncompositionend=()=>{searchComposing=false};search.oninput=()=>{};search.onkeydown=e=>{if(e.key==="Enter"&&!searchComposing){keyword=search.value.trim();page=1;renderPreserveSearchFocus()}}}const refresh=document.getElementById("rankRefreshBtn");if(refresh)refresh.onclick=()=>{const input=document.getElementById("rankSearchInput");keyword=String(input?.value||"").trim();page=1;renderPreserveSearchFocus()};const clear=document.getElementById("rankClearBtn");if(clear)clear.onclick=()=>{keyword="";page=1;render()};const sub=document.getElementById("subToggle");if(sub)sub.onclick=()=>{const savedY=window.scrollY;includeSubs=!includeSubs;page=1;sub.classList.toggle("on",includeSubs);const t=sub.querySelector(".toggle-text");if(t)t.textContent=includeSubs?"부캐 ON":"부캐 OFF";setTimeout(()=>{render();requestAnimationFrame(()=>window.scrollTo(0,savedY))},260)}}
function applyOverflowMarquee(){document.querySelectorAll(".flow-candidate").forEach(el=>{el.classList.remove("marquee");el.style.removeProperty("--marquee-shift");const parent=el.parentElement;if(!parent)return;const overflow=el.scrollWidth-parent.clientWidth;if(overflow>2){el.style.setProperty("--marquee-shift","-"+(overflow+12)+"px");el.classList.add("marquee")}})}
function startLoadingText(){stopLoadingText();const messages=["명예의 전당 데이터를 불러오는 중","엠블럼을 준비하는 중","레기온 기록을 확인하는 중","순위표를 정리하는 중"];loadingStep=0;const target=()=>{const el=document.getElementById("loaderText");if(!el)return;const msg=messages[Math.floor(loadingStep/4)%messages.length];const dots=".".repeat(loadingStep%4);el.textContent=msg+dots;loadingStep++};target();loadingTimer=setInterval(target,360)}
function stopLoadingText(){if(loadingTimer){clearInterval(loadingTimer);loadingTimer=null}}
function preloadImages(paths){return Promise.all(paths.map(src=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(true);img.onerror=()=>resolve(false);img.src=src+"?v=1c101e"}))) }
async function load(){app.className="loading";app.innerHTML='<div><div class="loader-ring"></div><div class="loader-text" id="loaderText">명예의 전당 데이터를 불러오는 중</div></div>';startLoadingText();try{await preloadImages(Object.values(RANK_EMBLEMS).concat(Object.values(CLASS_ICONS)));const url=WEB_APP_URL+(WEB_APP_URL.includes("?")?"&":"?")+"action=hallOfFame&t="+Date.now();const res=await fetch(url,{cache:"no-store"});const text=await res.text();if(!res.ok)throw new Error("HTTP "+res.status+": "+text.slice(0,180));try{hallData=JSON.parse(text)}catch(parseErr){throw new Error("Apps Script 응답이 JSON이 아닙니다: "+text.slice(0,180))}if(!hallData || hallData.ok===false)throw new Error(hallData?.message||hallData?.error||"명예의 전당 응답이 실패했습니다.");if(hallData.visitStats){renderVisits(hallData.visitStats)}else{fetchVisitStats()}stopLoadingText();render()}catch(err){stopLoadingText();app.className="";app.innerHTML='<div class="empty">명예의 전당 데이터를 불러오지 못했습니다.<br>'+escapeHtml(err.message||err)+'</div>'}}
function setAdminButtonLoading_(id,text){
  const btn=document.getElementById(id);
  if(!btn)return;
  btn.dataset.oldText=btn.textContent;
  btn.disabled=true;
  btn.textContent=text||"처리 중...";
}
function clearAdminButtonLoading_(id,text){
  const btn=document.getElementById(id);
  if(!btn)return;
  btn.disabled=false;
  btn.textContent=text||btn.dataset.oldText||btn.textContent;
}
function showAdminResult_(title,html){
  let box=document.getElementById("adminResultBox");
  const panel=document.getElementById("adminControlPanel");
  if(!box&&panel){
    box=document.createElement("div");
    box.id="adminResultBox";
    box.className="admin-result-box";
    panel.appendChild(box);
  }
  if(box){
    box.innerHTML='<div class="admin-result-head"><strong>'+escapeHtml(title||"결과")+'</strong><button type="button" aria-label="닫기">×</button></div><div class="admin-result-body">'+html+'</div>';
    box.querySelector("button").onclick=()=>box.remove();
  }else{
    alert((title||"결과")+"\n"+String(html||"").replace(/<[^>]+>/g," "));
  }
}

function openAdminDropdown(){const box=document.getElementById("adminDropdown");const btn=document.getElementById("adminMenuBtn");if(!box)return;const willOpen=!box.classList.contains("open");box.classList.toggle("open",willOpen);box.setAttribute("aria-hidden",willOpen?"false":"true");if(btn)btn.setAttribute("aria-expanded",willOpen?"true":"false")}
function closeAdminMenu(){const box=document.getElementById("adminDropdown");const btn=document.getElementById("adminMenuBtn");if(box){box.classList.remove("open");box.setAttribute("aria-hidden","true")}if(btn)btn.setAttribute("aria-expanded","false")}
function adminLogin(){const input=document.getElementById("adminPasswordInput");const status=document.getElementById("adminStatus");if(String(input?.value||"")!=="zlshwhghkdlxld"){if(status)status.textContent="암호가 올바르지 않습니다.";return}adminAuthed=true;const login=document.getElementById("adminLoginPanel");const panel=document.getElementById("adminControlPanel");if(login)login.style.display="none";if(panel)panel.style.display="grid";if(status)status.textContent=""}
async function adminVisitAdjust(){
  const target=document.querySelector('[data-visit-target].active')?.dataset.visitTarget||"daily";
  const sign=document.querySelector('[data-visit-sign].active')?.dataset.visitSign||"plus";
  const amount=Math.max(1,Math.min(9999,Number(document.getElementById("adminVisitAmount")?.value||0)));
  const status=document.getElementById("adminVisitStatus");
  const mode=target==="total"?(sign==="minus"?"totalMinus":"totalPlus"):(sign==="minus"?"dailyMinus":"dailyPlus");
  try{
    setAdminButtonLoading_("adminVisitApplyBtn","반영중...");
    if(status)status.textContent="반영 중...";
    await fetchVisitStats(mode,amount);
    if(status)status.textContent="방문자수 반영 완료";
  }catch(e){
    if(status)status.textContent="방문자수 반영 실패: "+(e.message||e);
  }finally{
    clearAdminButtonLoading_("adminVisitApplyBtn","반영");
  }
}
async function adminSnapshot(){
  try{
    setAdminButtonLoading_("adminSnapshotBtn","생성 중...");
    const code=document.getElementById("adminPasswordInput")?.value||"zlshwhghkdlxld";
    const url=WEB_APP_URL+(WEB_APP_URL.includes("?")?"&":"?")+"action=weeklySnapshot&password="+encodeURIComponent(code)+"&t="+Date.now();
    const res=await fetch(url,{cache:"no-store"});
    const data=await res.json();
    if(!data.ok)return showAdminResult_("성장왕 스냅샷 생성",escapeHtml(data.message||"스냅샷 저장 실패"));
    showAdminResult_("성장왕 스냅샷 생성","저장 완료: "+Number(data.result?.count||0)+"명");
  }catch(e){
    showAdminResult_("성장왕 스냅샷 생성","저장 오류: "+escapeHtml(e.message||e));
  }finally{
    clearAdminButtonLoading_("adminSnapshotBtn","성장왕 스냅샷 생성");
  }
}

async function adminMvp(){
  try{
    setAdminButtonLoading_("adminMvpBtn","확인 중...");
    const code=document.getElementById("adminPasswordInput")?.value||"zlshwhghkdlxld";
    const url=WEB_APP_URL+(WEB_APP_URL.includes("?")?"&":"?")+"action=mvpAdmin&password="+encodeURIComponent(code)+"&t="+Date.now();
    const res=await fetch(url,{cache:"no-store"});
    const data=await res.json();
    if(!data.ok)return showAdminResult_("MVP 후보 확인",escapeHtml(data.message||"후보 확인 실패"));
    const season=data.season||{};
    const rows=(data.candidates||[]).slice(0,5).map((item,i)=>
      '<div class="admin-result-row"><strong>'+(i+1)+'위 '+escapeHtml(item.name||'-')+'</strong>'
      + '<span>시즌 '+Number(item.seasonScore||0)+' · 반응 '+Number(item.reactionScore||0)+' · 예상 '+Number(item.finalScorePreview||0)+'</span>'
      + '<span>좋아요 '+Number(item.like||0)+' / 싫어요 '+Number(item.dislike||0)+' · '+escapeHtml(item.excludeReason||'')+'</span></div>'
    ).join('')||'<div class="empty">아직 집계 데이터가 없습니다.</div>';
    showAdminResult_("MVP 후보 확인",'<div class="admin-result-meta">'+escapeHtml(season.seasonName||'')+' '+escapeHtml(season.startDate||'')+' ~ '+escapeHtml(season.endDate||'')+'</div><div class="admin-result-list">'+rows+'</div><div class="admin-result-meta">전투력 보정 20%는 MVP 선정 시점에만 반영됩니다.</div>');
  }catch(e){
    showAdminResult_("MVP 후보 확인","확인 오류: "+escapeHtml(e.message||e));
  }finally{
    clearAdminButtonLoading_("adminMvpBtn","MVP 후보 확인");
  }
}

async function showMvpAdminPrompt(){
  return adminMvp();
}
function bindLongPress(el,shortAction,longAction){let timer=null,fired=false;const start=ev=>{fired=false;clearTimeout(timer);timer=setTimeout(()=>{fired=true;longAction()},900)};const end=ev=>{clearTimeout(timer)};el.addEventListener("mousedown",start);el.addEventListener("touchstart",start,{passive:true});el.addEventListener("mouseup",end);el.addEventListener("mouseleave",end);el.addEventListener("touchend",end);el.addEventListener("click",ev=>{if(fired){ev.preventDefault();return}shortAction()})}
function setReactionLimitLoading_(){
  const comment=document.getElementById("reactionComment");
  if(comment){
    comment.value="";
    comment.placeholder="남은 좋아요/싫어요 횟수 계산 중...";
  }
  ["reactionLikeBtn","reactionDislikeBtn"].forEach(id=>{
    const btn=document.getElementById(id);
    if(btn) btn.classList.add("checking");
  });
  setTimeout(()=>{
    const likeBtn=document.getElementById("reactionLikeBtn");
    const dislikeBtn=document.getElementById("reactionDislikeBtn");
    if(likeBtn) likeBtn.classList.remove("checking");
    if(dislikeBtn) dislikeBtn.classList.remove("checking");
    const c=document.getElementById("reactionComment");
    if(c) c.placeholder="전하고 싶은 말을 남겨주세요";
  },450);
}

async function adminSnapshotTriggerInstall(){
  try{
    setAdminButtonLoading_("adminSnapshotTriggerBtn","설치 중...");
    const code=document.getElementById("adminPasswordInput")?.value||"zlshwhghkdlxld";
    const url=WEB_APP_URL+(WEB_APP_URL.includes("?")?"&":"?")+"action=weeklySnapshotTriggers&password="+encodeURIComponent(code)+"&t="+Date.now();
    const res=await fetch(url,{cache:"no-store"});
    const data=await res.json();
    if(!data.ok){
      const msg=data.needAuth
        ? "자동 트리거 설치 권한 승인이 필요합니다. Apps Script 편집기에서 installWeeklyGrowthSnapshotTriggers_ 함수를 한 번 직접 실행해 권한 승인 후 다시 시도해 주세요."
        : (data.message||"자동 트리거 설치 실패");
      return showAdminResult_("자동 스냅샷 트리거 설치",msg);
    }
    showAdminResult_("자동 스냅샷 트리거 설치","설치 완료<br>수요일 00:00 START / 화요일 00:00 END");
  }catch(e){
    showAdminResult_("자동 스냅샷 트리거 설치","설치 오류: "+(e.message||e));
  }finally{
    clearAdminButtonLoading_("adminSnapshotTriggerBtn","자동 스냅샷 트리거 설치");
  }
}


function positionReactionPopover(anchor,pop){
  const rect=anchor.getBoundingClientRect();
  const w=Math.min(320,Math.max(260,window.innerWidth-24));
  let left=Math.min(window.innerWidth-w-12,Math.max(12,rect.left));
  let top=rect.bottom+8;
  const h=Math.min(270,pop.offsetHeight||250);
  if(top+h>window.innerHeight-12) top=Math.max(12,rect.top-h-8);
  pop.style.position="fixed";
  pop.style.width=w+"px";
  pop.style.left=left+"px";
  pop.style.top=top+"px";
  pop.dataset.fixedLeft=String(left);
  pop.dataset.fixedTop=String(top);
}
function closeReactionModal(){const pop=document.getElementById("reactionPopover");if(pop){pop.style.display="none";pop.setAttribute("aria-hidden","true")}currentReactionItem=null}
function getVisitorId(){let id=localStorage.getItem("kinojoVisitorId");if(!id){id="v_"+Date.now()+"_"+Math.random().toString(36).slice(2);localStorage.setItem("kinojoVisitorId",id)}return id}
function todayKey(){return new Date().toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"})}
function checkLocalReactionLimit(name,type){const day=todayKey();const sameKey="kinojo_react_"+day+"_"+name+"_"+type;const countKey="kinojo_react_count_"+day+"_"+type;if(localStorage.getItem(sameKey)==="1")return "같은 캐릭터에게 같은 반응은 하루 1번만 남길 수 있습니다.";const count=Number(localStorage.getItem(countKey)||"0");if(count>=3)return (type==="like"?"좋아요":"싫어요")+"는 하루 3번까지만 남길 수 있습니다.";return ""}
function markLocalReaction(name,type){const day=todayKey();const sameKey="kinojo_react_"+day+"_"+name+"_"+type;const countKey="kinojo_react_count_"+day+"_"+type;localStorage.setItem(sameKey,"1");localStorage.setItem(countKey,String(Number(localStorage.getItem(countKey)||"0")+1))}
async function bindCharacterButtons(){document.querySelectorAll("[data-character]").forEach(btn=>{btn.onclick=ev=>{ev.stopPropagation();const name=btn.dataset.character;const all=[...(hallData?.overallAll||[]),...(hallData?.overallMain||[])];const found=all.find(x=>x.name===name)||{name};openReactionModal(found,btn)}});document.querySelectorAll("[data-reaction-card]").forEach(card=>{card.onclick=()=>{reactionCarouselPausedUntil=Date.now()+10000}})}


window.addEventListener("resize",()=>requestAnimationFrame(applyOverflowMarquee));
document.getElementById("cancelSuggestBtn").onclick=()=>{document.getElementById("suggestionBox").style.display="none";document.getElementById("suggestTitle").value="";document.getElementById("suggestProposer").value="";document.getElementById("suggestMemo").value=""};
document.getElementById("submitSuggestBtn").onclick=async()=>{const title=document.getElementById("suggestTitle").value.trim(),proposer=document.getElementById("suggestProposer").value.trim(),memo=document.getElementById("suggestMemo").value.trim();if(!title)return alert("항목 이름을 입력해 주세요.");const res=await fetch(WEB_APP_URL,{method:"POST",body:JSON.stringify({action:"hallSuggestion",title,proposer,memo})});const data=await res.json();if(!data.ok)return alert(data.message||"전송 실패");alert("제안이 접수되었습니다.");document.getElementById("suggestionBox").style.display="none";load()};


/* KINOJO drawer side page panel */
const DRAWER_PAGE_CONTENT={
  about:{
    title:"사이트 소개",
    body:"KINOJO INFO는 아이온2 커뮤니티 기록을 보기 쉽게 정리하는 정보 페이지입니다. 명예의 전당, 성역팟, 성장 기록 등 커뮤니티 활동을 깔끔하게 확인할 수 있도록 구성하고 있습니다."
  },
  terms:{
    title:"이용약관",
    body:"본 사이트는 커뮤니티 편의 제공을 목적으로 운영됩니다. 제공되는 정보는 시트와 공개 기록을 기반으로 하며, 운영 상황에 따라 표시 방식과 기준이 변경될 수 있습니다."
  },
  privacy:{
    title:"개인정보처리방침",
    body:"KINOJO INFO는 서비스 운영에 필요한 최소한의 방문 기록과 반응 데이터를 사용할 수 있습니다. 캐릭터 반응 및 코멘트는 커뮤니티 표시 목적으로 저장될 수 있습니다."
  }
};
function openDrawerPagePanel(type){
  const data=DRAWER_PAGE_CONTENT[type]||DRAWER_PAGE_CONTENT.about;
  const panel=document.getElementById("drawerPagePanel");
  const title=document.getElementById("drawerPageTitle");
  const body=document.getElementById("drawerPageBody");
  if(title)title.textContent=data.title;
  if(body)body.textContent=data.body;
  if(panel){
    panel.classList.add("open");
    panel.setAttribute("aria-hidden","false");
  }
}
function closeDrawerPagePanel(){
  const panel=document.getElementById("drawerPagePanel");
  if(panel){
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden","true");
  }
}
function bindDrawerPagePanel_(){
  document.querySelectorAll("[data-page-panel]").forEach(btn=>{
    if(btn.dataset.boundPagePanel)return;
    btn.dataset.boundPagePanel="1";
    btn.addEventListener("click",e=>{
      e.preventDefault();
      e.stopPropagation();
      openDrawerPagePanel(btn.dataset.pagePanel||"about");
    });
  });
  const close=document.getElementById("drawerPageCloseBtn");
  if(close&&!close.dataset.boundPagePanel){
    close.dataset.boundPagePanel="1";
    close.addEventListener("click",closeDrawerPagePanel);
  }
}

/* KINOJO drawer navigation */
function openSideDrawer(){const drawer=document.getElementById("sideDrawer");const btn=document.getElementById("drawerToggleBtn");if(!drawer)return;drawer.classList.add("open");document.body.classList.add("drawer-open","kinojo-drawer-open");drawer.setAttribute("aria-hidden","false");if(btn)btn.setAttribute("aria-expanded","true")}
function closeSideDrawer(){const drawer=document.getElementById("sideDrawer");const btn=document.getElementById("drawerToggleBtn");if(!drawer)return;drawer.classList.remove("open");const pagePanel=document.getElementById("drawerPagePanel");if(pagePanel){pagePanel.classList.remove("open");pagePanel.setAttribute("aria-hidden","true")}document.body.classList.remove("drawer-open","kinojo-drawer-open");drawer.setAttribute("aria-hidden","true");if(btn)btn.setAttribute("aria-expanded","false")}
function openSuggestionPanel(){
  const panel=document.getElementById("drawerPagePanel");
  const title=document.getElementById("drawerPageTitle");
  const body=document.getElementById("drawerPageBody");
  if(title)title.textContent="아이디어 제안 및 건의";
  if(body){
    body.innerHTML='<div class="side-suggest-form">'
      + '<label>항목 이름<input class="search" id="sideSuggestTitle" placeholder="항목 이름"></label>'
      + '<label>제안자<input class="search" id="sideSuggestProposer" placeholder="제안자"></label>'
      + '<label>기준 설명<textarea class="search" id="sideSuggestMemo" rows="4" placeholder="기준 설명"></textarea></label>'
      + '<button class="btn side-suggest-submit" id="sideSubmitSuggestBtn" type="button">제안 보내기</button>'
      + '<div class="side-suggest-status" id="sideSuggestStatus"></div>'
      + '</div>';
    const submit=document.getElementById("sideSubmitSuggestBtn");
    if(submit)submit.onclick=submitSideSuggestion_;
  }
  if(panel){
    panel.classList.add("open");
    panel.setAttribute("aria-hidden","false");
  }
}

async function submitSideSuggestion_(){
  const title=document.getElementById("sideSuggestTitle")?.value.trim()||"";
  const proposer=document.getElementById("sideSuggestProposer")?.value.trim()||"";
  const memo=document.getElementById("sideSuggestMemo")?.value.trim()||"";
  const status=document.getElementById("sideSuggestStatus");
  const submit=document.getElementById("sideSubmitSuggestBtn");
  if(!title){
    if(status)status.textContent="항목 이름을 입력해 주세요.";
    return;
  }
  const old=submit?submit.textContent:"";
  try{
    if(submit){submit.disabled=true;submit.textContent="전송 중...";}
    if(status)status.textContent="";
    const res=await fetch(WEB_APP_URL,{method:"POST",body:JSON.stringify({action:"hallSuggestion",title,proposer,memo})});
    const data=await res.json();
    if(!data.ok)throw new Error(data.message||"전송 실패");
    if(status)status.textContent="제안이 접수되었습니다.";
    setTimeout(()=>{closeDrawerPagePanel();load()},520);
  }catch(e){
    if(status)status.textContent="전송 실패: "+(e.message||e);
  }finally{
    if(submit){submit.disabled=false;submit.textContent=old||"제안 보내기";}
  }
}


bindDrawerPagePanel_();bindConstructionNotice_();bindKinojoDrawer_();const footerSuggestBtn=document.getElementById("footerSuggestBtn");if(footerSuggestBtn)footerSuggestBtn.onclick=openSuggestionPanel;
const adminMenuBtn=document.getElementById("adminMenuBtn");if(adminMenuBtn)adminMenuBtn.onclick=openAdminDropdown;const adminDropdownClose=document.getElementById("adminDropdownClose");if(adminDropdownClose)adminDropdownClose.onclick=closeAdminMenu;const adminLoginBtn=document.getElementById("adminLoginBtn");if(adminLoginBtn)adminLoginBtn.onclick=adminLogin;const adminPasswordInput=document.getElementById("adminPasswordInput");if(adminPasswordInput)adminPasswordInput.onkeydown=e=>{if(e.key==="Enter")adminLogin()};document.getElementById("adminMvpBtn").onclick=adminMvp;document.querySelectorAll("[data-visit-target]").forEach(btn=>btn.onclick=()=>{document.querySelectorAll("[data-visit-target]").forEach(b=>b.classList.remove("active"));btn.classList.add("active")});document.querySelectorAll("[data-visit-sign]").forEach(btn=>btn.onclick=()=>{document.querySelectorAll("[data-visit-sign]").forEach(b=>b.classList.remove("active"));btn.classList.add("active")});const adminVisitCancelBtn=document.getElementById("adminVisitCancelBtn");if(adminVisitCancelBtn)adminVisitCancelBtn.onclick=()=>{const st=document.getElementById("adminVisitStatus");if(st)st.textContent="";document.getElementById("adminVisitAmount").value="1"};const adminVisitApplyBtn=document.getElementById("adminVisitApplyBtn");if(adminVisitApplyBtn)adminVisitApplyBtn.onclick=adminVisitAdjust;document.getElementById("adminSnapshotBtn").onclick=adminSnapshot;const adminSnapshotTrigger=document.getElementById("adminSnapshotTriggerBtn");if(adminSnapshotTrigger)adminSnapshotTrigger.onclick=adminSnapshotTriggerInstall;document.getElementById("reactionLikeBtn").onclick=()=>{currentReactionType="like";document.getElementById("reactionLikeBtn").classList.add("active","like-active");document.getElementById("reactionDislikeBtn").classList.remove("active","dislike-active")};document.getElementById("reactionDislikeBtn").onclick=()=>{currentReactionType="dislike";document.getElementById("reactionDislikeBtn").classList.add("active","dislike-active");document.getElementById("reactionLikeBtn").classList.remove("active","like-active")};document.getElementById("reactionCloseBtn").onclick=closeReactionModal;document.addEventListener("click",e=>{const pop=document.getElementById("reactionPopover");if(pop&&pop.style.display==="block"&&!pop.contains(e.target)&&!e.target.closest("[data-character]"))closeReactionModal();const menu=document.getElementById("adminDropdown");if(menu&&menu.classList.contains("open")&&!menu.contains(e.target)&&!e.target.closest("#adminMenuBtn"))closeAdminMenu();const drawer=document.getElementById("sideDrawer");if(drawer&&drawer.classList.contains("open")&&e.target===drawer)closeSideDrawer();const pagePanel=document.getElementById("drawerPagePanel");if(pagePanel&&pagePanel.classList.contains("open")&&e.target===pagePanel)closeDrawerPagePanel();const notice=document.getElementById("constructionNotice");if(notice&&notice.classList.contains("open")&&e.target===notice)closeConstructionNotice()});document.addEventListener("keydown",e=>{
  if(e.key!=="Escape")return;
  const notice=document.getElementById("constructionNotice");
  const pagePanel=document.getElementById("drawerPagePanel");
  const reaction=document.getElementById("reactionPopover");
  const admin=document.getElementById("adminDropdown");
  const drawer=document.getElementById("sideDrawer");

  if(notice&&notice.classList.contains("open"))return closeConstructionNotice();
  if(pagePanel&&pagePanel.classList.contains("open"))return closeDrawerPagePanel();
  if(reaction&&reaction.getAttribute("aria-hidden")==="false")return closeReactionModal();
  if(admin&&admin.classList.contains("open"))return closeAdminMenu();
  if(drawer&&drawer.classList.contains("open"))return closeSideDrawer();
});setInterval(()=>{if(Date.now()<reactionCarouselPausedUntil)return;if(document.activeElement&&document.activeElement.id==="rankSearchInput")return;reactionCarouselIndex++;if(hallData)render()},60000);recordDailyVisitOnce();load();

/* knj-infoweb(v_260603_01) reaction submit guard patch */
function updateReactionSubmitState_(){
  const input=document.getElementById("reactionComment");
  const submitBtn=document.getElementById("reactionSubmitBtn");
  if(!input||!submitBtn)return;
  const hasComment=input.value.trim().length>0;
  submitBtn.disabled=reactionSubmitting||!hasComment;
  submitBtn.classList.toggle("is-sending",!!reactionSubmitting);
}
function openReactionModal(item,anchor){
  reactionSubmitting=false;
  currentReactionItem=item;
  currentReactionType="like";
  const title=document.getElementById("reactionModalTitle");
  const input=document.getElementById("reactionComment");
  if(title)title.textContent=(item?.name||"캐릭터")+"님께 한마디";
  if(input){
    input.value="";
    input.oninput=updateReactionSubmitState_;
  }
  const status=document.getElementById("reactionStatus");
  if(status)status.textContent="";
  const likeBtn=document.getElementById("reactionLikeBtn");
  const dislikeBtn=document.getElementById("reactionDislikeBtn");
  if(likeBtn)likeBtn.classList.add("active","like-active");
  if(dislikeBtn)dislikeBtn.classList.remove("active","dislike-active");
  updateReactionSubmitState_();
  setReactionLimitLoading_();
  const pop=document.getElementById("reactionPopover");
  pop.style.display="block";
  pop.setAttribute("aria-hidden","false");
  positionReactionPopover(anchor||document.body,pop);
  setTimeout(updateReactionSubmitState_,0);
}
async function submitReaction(){
  if(!currentReactionItem||reactionSubmitting)return;
  const submitBtn=document.getElementById("reactionSubmitBtn");
  const status=document.getElementById("reactionStatus");
  const input=document.getElementById("reactionComment");
  const comment=(input?.value||"").trim().slice(0,20);
  if(!comment){
    if(status)status.textContent="전하고 싶은 말을 입력해 주세요.";
    updateReactionSubmitState_();
    return;
  }
  const limitMessage=checkLocalReactionLimit(currentReactionItem.name,currentReactionType);
  if(limitMessage){
    if(status)status.textContent=limitMessage;else alert(limitMessage);
    updateReactionSubmitState_();
    return;
  }
  try{
    reactionSubmitting=true;
    updateReactionSubmitState_();
    if(status)status.textContent="전송 중...";
    const res=await fetch(WEB_APP_URL,{method:"POST",body:JSON.stringify({action:"hallReaction",characterName:currentReactionItem.name,owner:currentReactionItem.owner||"",className:currentReactionItem.className||"",reaction:currentReactionType,comment:comment,clientKey:getVisitorId()})});
    const data=await res.json();
    if(!data.ok){
      if(status)status.textContent=data.message||"저장 실패";else alert(data.message||"저장 실패");
      return;
    }
    markLocalReaction(currentReactionItem.name,currentReactionType);
    if(data.summary&&hallData)hallData.reactionSummary=data.summary;
    if(status)status.textContent="한마디가 전달되었어요.";
    setTimeout(()=>{closeReactionModal();render()},380);
  }catch(e){
    if(status)status.textContent="반응 저장 실패: "+(e.message||e);else alert("반응 저장 실패: "+(e.message||e));
  }finally{
    reactionSubmitting=false;
    updateReactionSubmitState_();
  }
}
const reactionCommentInput_=document.getElementById("reactionComment");
if(reactionCommentInput_)reactionCommentInput_.addEventListener("input",updateReactionSubmitState_);
const reactionSubmitBtn_=document.getElementById("reactionSubmitBtn");
if(reactionSubmitBtn_)reactionSubmitBtn_.onclick=submitReaction;
updateReactionSubmitState_();



/* KINOJO construction notice */
function openConstructionNotice(label){
  const notice=document.getElementById("constructionNotice");
  const message=document.getElementById("constructionMessage");
  if(message)message.textContent=(label?label+" 페이지는 ":"페이지는 ")+"인테리어 공사중입니다. 조금만 기다려 주세요.";
  if(notice){
    notice.classList.add("open");
    notice.setAttribute("aria-hidden","false");
  }
  closeSideDrawer();
}
function closeConstructionNotice(){
  const notice=document.getElementById("constructionNotice");
  if(notice){
    notice.classList.remove("open");
    notice.setAttribute("aria-hidden","true");
  }
}
function bindConstructionNotice_(){
  document.querySelectorAll("[data-construction]").forEach(btn=>{
    if(btn.dataset.boundConstruction)return;
    btn.dataset.boundConstruction="1";
    btn.addEventListener("click",e=>{
      e.preventDefault();
      e.stopPropagation();
      openConstructionNotice(btn.dataset.construction||"");
    });
  });
  const close=document.getElementById("constructionCloseBtn");
  const ok=document.getElementById("constructionOkBtn");
  if(close&&!close.dataset.boundConstruction){
    close.dataset.boundConstruction="1";
    close.addEventListener("click",closeConstructionNotice);
  }
  if(ok&&!ok.dataset.boundConstruction){
    ok.dataset.boundConstruction="1";
    ok.addEventListener("click",closeConstructionNotice);
  }
}

/* KINOJO drawer robust binding */
function bindKinojoDrawer_(){
  const drawerToggleBtn=document.getElementById("drawerToggleBtn");
  const drawerCloseBtn=document.getElementById("drawerCloseBtn");
  const drawerSuggestBtn=document.getElementById("drawerSuggestBtn");
  if(drawerToggleBtn&&!drawerToggleBtn.dataset.bound){
    drawerToggleBtn.dataset.bound="1";
    drawerToggleBtn.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();openSideDrawer()});
    drawerToggleBtn.addEventListener("pointerdown",e=>drawerToggleBtn.classList.add("is-pressed"));
    drawerToggleBtn.addEventListener("pointerup",e=>drawerToggleBtn.classList.remove("is-pressed"));
    drawerToggleBtn.addEventListener("pointerleave",e=>drawerToggleBtn.classList.remove("is-pressed"));
  }
  if(drawerCloseBtn&&!drawerCloseBtn.dataset.bound){
    drawerCloseBtn.dataset.bound="1";
    drawerCloseBtn.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();closeSideDrawer()});
  }
  if(drawerSuggestBtn&&!drawerSuggestBtn.dataset.bound){
    drawerSuggestBtn.dataset.bound="1";
    drawerSuggestBtn.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();openSuggestionPanel()});
  }
}
