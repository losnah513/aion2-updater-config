function chickLabel(item){const server=item.meta?'['+item.meta.replace("천족 · ","")+']':'';const cls=item.className?' ('+item.className+')':'';const owner=item.owner&&item.owner!==item.name?' / 본캐 '+item.owner:'';return item.name+server+cls+owner}
function renderChicks(){const items=(hallData?.newChicks||[]);const card=document.getElementById("chickCard");if(!card)return;if(!items.length){card.style.display="none";return}card.classList.toggle("collapsed",chicksCollapsed);card.style.display="block";document.getElementById("chickTitle").textContent="🐣 신입 병아리 "+items.length+"명 입장!";document.getElementById("chickSub").textContent=items.length>=5?"새로운 모험가들이 우르르 둥지에 들어왔어요!":"새로운 모험가들을 따뜻하게 환영합니다!";const shown=chicksExpanded?items:items.slice(0,5);document.getElementById("chickTags").innerHTML=shown.map(item=>'<span class="chick-tag">'+escapeHtml(chickLabel(item))+'</span>').join("")+(items.length>5?'<span class="chick-tag chick-more" id="chickMore">'+(chicksExpanded?"접기":"+"+(items.length-5)+"명 더 보기")+'</span>':'');const more=document.getElementById("chickMore");if(more)more.onclick=()=>{chicksExpanded=!chicksExpanded;renderChicks()};const close=document.getElementById("chickCloseBtn");if(close&&!close.dataset.bound){close.dataset.bound="1";close.onclick=()=>{chicksCollapsed=!chicksCollapsed;card.classList.toggle("collapsed",chicksCollapsed);close.setAttribute("aria-label",chicksCollapsed?"신입 병아리 펼치기":"신입 병아리 접기")}}}
function profileImageUrlFor(item){
  return String(item?.profileImageUrl||"").trim();
}
function reactionDataFor(item){const by=hallData?.reactionSummary?.byName||{};return by[item?.name]||{like:0,dislike:0,comments:[]}}

const HOF_OFFICIAL_METRIC_ICONS=Object.freeze({
  enhance:'https://assets.playnccdn.com/static-aion2/characters/img/info/profile_level_icon_pc.png',
  growth:'https://assets.playnccdn.com/static-aion2/characters/img/info/profile_power_icon_pc.png'
});
const HOF_POWER_ICON=HOF_OFFICIAL_METRIC_ICONS.growth;

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
function hofPowerShort(value){
  const formatter=window.KinojoPowerFormat;
  if(formatter&&typeof formatter.short==='function')return formatter.short(value);
  const n=hofNumberLike(value);
  return n===''?'-':(n/1000).toFixed(1)+'K';
}
function hofPowerFull(value){
  const formatter=window.KinojoPowerFormat;
  if(formatter&&typeof formatter.full==='function')return formatter.full(value);
  const n=hofNumberLike(value);
  return n===''?'-':Math.round(n).toLocaleString('ko-KR');
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
  if(metric==='pvp')return hofPowerShort(hofFirstDefined(item.pvpPower,item.pvp_power,item.latest_pvp_combat_power,item.value,item.pvpPowerLabel,item.pvp_power_label,''));
  if(metric==='pve')return hofPowerShort(hofFirstDefined(item.pvePower,item.pve_power,item.latest_pve_combat_power,item.value,item.pvePowerLabel,item.pve_power_label,''));
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
function hofFindMyMetric(metric){
  const serverResult=hallData?.myRanking?.[metric];
  if(serverResult&&Number(serverResult.rank||0)>0)return serverResult;
  return null;
}
function hofRankSummaryText(item,metric){
  if(!item)return '';
  const bits=[];
  const server=hofServerName(item);
  const cls=hofClassName(item);
  if(server)bits.push(server);
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
  const badge=item?.identityBadge||item?.identity_badge||null;
  const detail=String(badge?.detail||'').trim();
  const badgeHtml=size!=='power-card'&&badge?.label
    ?'<span class="hof-identity-badge" role="button" tabindex="0" data-identity-detail="'+escapeHtml(detail)+'" title="'+escapeHtml(detail)+'" aria-label="'+escapeHtml(detail||badge.label)+'">'+escapeHtml(badge.label)+'</span>'
    :'';
  const portrait=!url
    ?'<div class="'+cls+'" aria-hidden="true">'+escapeHtml(name.slice(0,1))+'</div>'
    :'<img class="'+cls+'" src="'+escapeHtml(url)+'" alt="'+escapeHtml(name+' 프로필')+'" loading="lazy" decoding="async">';
  return '<span class="hof-identity-portrait">'+portrait+badgeHtml+'</span>';
}

if(!window.__KINOJO_HOF_IDENTITY_BADGE_BOUND__){
  window.__KINOJO_HOF_IDENTITY_BADGE_BOUND__=true;
  document.addEventListener('click',event=>{
    const badge=event.target.closest?.('[data-identity-detail]');
    if(!badge)return;
    event.preventDefault();
    event.stopPropagation();
    const detail=String(badge.dataset.identityDetail||badge.textContent||'').trim();
    if(window.KinojoUI?.toast)window.KinojoUI.toast(detail);
    else badge.setAttribute('aria-label',detail);
  });
  document.addEventListener('keydown',event=>{
    if((event.key==='Enter'||event.key===' ')&&event.target?.matches?.('[data-identity-detail]'))event.target.click();
  });
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
  if(metric==='pve')return 'PVE';
  if(metric==='pvp')return 'PVP';
  if(metric==='like')return '♥';
  if(metric==='dislike')return '◆';
  return 'H';
}
function hofMetricIconHtml(metric){
  const icon=HOF_OFFICIAL_METRIC_ICONS[metric];
  if(icon){
    const kind=metric==='enhance'?'item-level':'power';
    return '<span class="hof-v2-title-icon is-official is-'+kind+'" aria-hidden="true">'
      +'<img src="'+icon+'" alt="" decoding="async">'
      +'</span>';
  }
  return '<span class="hof-v2-title-icon">'+escapeHtml(hofMetricIcon(metric))+'</span>';
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

function hofIsPowerMetric(metric){
  return metric==='pve'||metric==='pvp';
}
function hofClassBadge(item){
  const cls=hofClassName(item);
  return cls?'<span class="hof-v2-class-badge">'+escapeHtml(cls)+'</span>':'';
}
function hofClassIcon(item){
  const cls=hofClassName(item);
  const helper=window.KinojoCharacterProfileImage;
  const icon=cls&&helper&&typeof helper.classIconFor==='function'
    ?String(helper.classIconFor(cls)||'').trim()
    :'';
  if(!icon)return '';
  return '<span class="hof-v2-class-icon" aria-label="'+escapeHtml(cls)+'" title="'+escapeHtml(cls)+'">'
    +'<img src="'+escapeHtml(icon)+'" alt="" loading="lazy" decoding="async" onerror="this.parentElement.hidden=true">'
    +'</span>';
}
function hofOwnerBadge(item){
  if(item?.isMain===true)return '<span class="hof-v2-owner-badge is-main">본캐</span>';
  if(item?.isMain===false)return '<span class="hof-v2-owner-badge">부캐</span>';
  return '';
}
function hofPowerScore(score){
  return '<strong class="hof-v2-top3-score is-power">'
    +'<img class="hof-v2-power-icon" src="'+HOF_POWER_ICON+'" alt="" aria-hidden="true" loading="lazy" decoding="async">'
    +'<span>'+escapeHtml(score)+'</span>'
    +'</strong>';
}
function hofPowerInfo(item,name,server){
  return '<span class="hof-v2-top3-info is-power">'
    +'<span class="hof-v2-power-class-slot">'+hofClassIcon(item)+'</span>'
    +'<span class="hof-v2-top3-name-row"><span class="hof-v2-top3-name">'+escapeHtml(name)+'</span><span class="hof-v2-top3-server">['+escapeHtml(server)+']</span><span class="hof-v2-owner-slot">'+hofOwnerBadge(item)+'</span></span>'
    +'</span>';
}
function hofPowerAside(score){
  return '<span class="hof-v2-top3-aside">'+hofPowerScore(score)+'</span>';
}
function hofPowerPortrait(item){
  return '<span class="hof-v2-power-portrait">'+hofRankPortrait(item,0,'power-card')+'</span>';
}
function hofPowerRank(rank){
  return '<span class="hof-v2-power-rank rank-'+rank+'" aria-label="'+rank+'위"><strong>'+rank+'</strong></span>';
}
function hofTop3Card(item,index,metric){
  const rank=Number(hofFirstDefined(item?.rank,item?.rankNo,item?.rank_no,0))||index+1;
  const isPower=hofIsPowerMetric(metric);
  if(!item){
    if(isPower){
      return '<div class="hof-v2-top3-item rank-'+rank+' is-empty is-power-card">'
        +hofPowerRank(rank)
        +hofPowerInfo(null,'데이터 대기','-')
        +hofPowerAside('-')
        +'<span class="hof-v2-power-portrait is-empty"><span class="hof-v2-empty-dot">-</span></span>'
        +'</div>';
    }
    const emptyScore='<strong class="hof-v2-top3-score"><small>'+escapeHtml(hofMetricLabel(metric))+'</small>-</strong>';
    if(rank===1)return '<div class="hof-v2-top3-item rank-1 is-empty"><span class="hof-v2-portrait-wrap is-empty"><span class="hof-v2-empty-dot">1</span></span><span class="hof-v2-top3-info"><span class="hof-v2-top3-name">데이터 대기</span><span class="hof-v2-top3-meta">집계 준비 중</span></span>'+emptyScore+'</div>';
    return '<div class="hof-v2-top3-item rank-'+rank+' is-empty is-compact-rank"><span class="hof-v2-row-medal"><span>'+rank+'</span></span><span class="hof-v2-top3-info"><span class="hof-v2-top3-name">데이터 대기</span><span class="hof-v2-top3-meta">집계 준비 중</span></span>'+emptyScore+'</div>';
  }
  const name=hofCharName(item)||'-';
  const server=hofServerName(item)||'지켈';
  const summary=hofRankSummaryText(item,metric);
  const score=hofMetricValue(item,metric)||'-';
  const exactPower=isPower?hofPowerFull(hofMetricRawValue(item,metric)):'';
  const commonAttrs=' data-character="'+escapeHtml(name)+'" data-hof-metric="'+escapeHtml(metric)+'" data-hof-rank="'+rank+'" data-hof-score="'+escapeHtml(score)+'"'+(exactPower?' title="정확한 전투력 '+escapeHtml(exactPower)+'"':'')+' aria-label="'+escapeHtml(name)+' 상세 보기"';
  if(isPower){
    return '<button type="button" class="hof-v2-top3-item rank-'+rank+' is-power-card"'+commonAttrs+'>'
      +hofPowerRank(rank)
      +hofPowerInfo(item,name,server)
      +hofPowerAside(score)
      +hofPowerPortrait(item)
      +'</button>';
  }
  const info='<span class="hof-v2-top3-info"><span class="hof-v2-top3-name-row">'+hofClassIcon(item)+'<span class="hof-v2-top3-name">'+escapeHtml(name)+'</span></span><span class="hof-v2-top3-meta">'+escapeHtml(summary||server)+'</span>'+(rank===1?'<span class="hof-v2-badge-line">'+hofOwnerBadge(item)+'</span>':'')+'</span>';
  const scoreArea='<strong class="hof-v2-top3-score"><small>'+escapeHtml(hofMetricLabel(metric))+'</small>'+escapeHtml(score)+'</strong>';
  if(rank===1){
    return '<button type="button" class="hof-v2-top3-item rank-1"'+commonAttrs+'>'
      + '<span class="hof-v2-portrait-wrap">'+hofRankPortrait(item,rank,'small')+hofRankMedal(rank)+'</span>'
      + info+scoreArea
      + '</button>';
  }
  return '<button type="button" class="hof-v2-top3-item rank-'+rank+' is-compact-rank"'+commonAttrs+'>'
    + '<span class="hof-v2-row-medal hof-v2-row-medal-'+rank+'"><span>'+rank+'</span></span>'
    + info+scoreArea
    + '</button>';
}
function hofWidePanel(title,note,list,metric){
  const items=(list||[]).slice(0,3);
  const compactTitle=(metric==='pve')?'PVE TOP3':(metric==='pvp')?'PVP TOP3':(metric==='like')?'좋아요 TOP3':title.replace(' 랭킹',' TOP3');
  return '<section class="hof-v2-panel hof-v2-wide '+hofBackgroundClass(metric)+'" data-hof-panel="'+escapeHtml(metric)+'">'
    + '<div class="hof-v2-panel-bg" aria-hidden="true"></div>'
    + '<div class="hof-v2-panel-head is-compact"><h2>'+hofMetricIconHtml(metric)+escapeHtml(compactTitle)+'</h2></div>'
    + '<div class="hof-v2-top3">'+[0,1,2].map(i=>hofTop3Card(items[i],i,metric)).join('')+'</div>'
    + '</section>';
}
function hofGodHeroCard(title,note,item,metric){
  const safeItem=item||null;
  const hasItem=!!(safeItem&&hofCharName(safeItem));
  const name=hasItem?hofCharName(safeItem):'집계 대기';
  const score=hasItem?(hofMetricValue(safeItem,metric)||'-'):'-';
  const deltaLabel=metric==='enhance'?'주간 아이템레벨 증가':'주간 전투력 증가';
  const compare=hofFirstDefined(safeItem?.growthRateLabel,safeItem?.growth_rate_label,safeItem?.rateLabel,safeItem?.rate_label,safeItem?.weekCompareLabel,safeItem?.week_compare_label,'');
  const bodyTag=hasItem?'button':'div';
  const bodyAttrs=hasItem?' type="button" data-character="'+escapeHtml(name)+'" data-hof-metric="'+escapeHtml(metric)+'" data-hof-rank="1" data-hof-score="'+escapeHtml(score)+'" aria-label="'+escapeHtml(name)+' 상세 보기"':'';
  const criterionId='hofCriterion-'+metric;
  const period=hallData?.rankingPeriod||hallData?.weeklyPeriod||{};
  const start=hofFormatKstDate(period.startAt||period.start_at);const end=hofFormatKstDate(period.endAt||period.end_at);
  const criterion=start&&end?start+' ~ '+end+' 직전':'매주 수요일 새 집계를 시작합니다.';
  return '<section class="hof-v2-panel hof-v2-god '+hofBackgroundClass(metric)+'" data-hof-panel="'+escapeHtml(metric)+'">'
    + '<div class="hof-v2-panel-bg" aria-hidden="true"></div>'
    + '<div class="hof-v2-god-head is-compact"><h2>'+hofMetricIconHtml(metric)+escapeHtml(title)+'</h2><button type="button" class="hof-v2-card-info" data-hof-period-toggle data-hof-period-target="'+criterionId+'" aria-controls="'+criterionId+'" aria-expanded="false">i</button><div class="hof-v2-card-info-popover" id="'+criterionId+'" hidden aria-hidden="true"><strong>집계 기준</strong><span>'+escapeHtml(criterion)+'</span><small>Asia/Seoul · 시작 포함, 종료 미포함</small></div></div>'
    + '<'+bodyTag+' class="hof-v2-god-main'+(hasItem?'':' is-empty')+'"'+bodyAttrs+'>'
    + (hasItem?'<span class="hof-v2-god-class">'+hofClassIcon(safeItem)+'</span><span class="hof-v2-god-portrait">'+hofRankPortrait(safeItem,1,'large')+'</span><span class="hof-v2-god-server">'+escapeHtml(hofServerName(safeItem)||'지켈')+'</span><strong>'+escapeHtml(name)+'</strong>':'<strong class="hof-v2-waiting-copy">집계 대기</strong>')
    + '</'+bodyTag+'>'
    + (hasItem?'<div class="hof-v2-god-score"><strong>'+escapeHtml(score)+'</strong><span>'+deltaLabel+'</span></div>'+(compare?'<div class="hof-v2-god-compare"><span>전주 대비</span><strong>'+escapeHtml(compare)+'</strong></div>':''):'')
    + '</section>';
}
function hofMeterDpsPanel(){
  return '<section class="hof-v2-panel hof-v2-meter-foundation" data-hof-panel="meter-dps"><div class="hof-v2-panel-head is-compact"><h2><span class="hof-v2-title-icon">DPS</span>DPS TOP3</h2></div><div class="hof-v2-meter-wait"><strong>집계 대기</strong><span>미터기 사용 시작 후 DPS TOP3를 표시합니다.</span><small>Server Engine 집계 계약 준비 완료</small></div></section>';
}
function hofRankingLinkCard(){
  return '<section class="hof-v2-panel hof-v2-ranking-link" aria-label="레기온 랭킹 페이지 이동">'
    + '<a href="../ranking/" class="hof-v2-ranking-link-inner">'
    + '<span class="hof-v2-ranking-kicker">LEGION RANKING</span>'
    + '<strong>레기온 랭킹 바로가기</strong>'
    + '<span>전체 순위 · 클래스 필터 · PVE/PVP 랭킹을 확인하세요.</span>'
    + '<em>이동하기 ›</em>'
    + '</a>'
    + '</section>';
}
function hofFormatKstDate(value){
  if(!value)return '';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  return new Intl.DateTimeFormat('ko-KR',{
    timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'long',
    hour:'numeric',minute:'2-digit',hour12:true
  }).format(date).replace(/\s+/g,' ').trim();
}
function hofCollectionPeriodBar(){
  const period=hallData?.rankingPeriod||hallData?.weeklyPeriod||{};
  const start=hofFormatKstDate(period.startAt||period.start_at);
  const end=hofFormatKstDate(period.endAt||period.end_at);
  const label=start&&end?start+' ~ '+end+' 직전':'서버 집계 기간 확인 중';
  const detail=start&&end?'이번 주 집계: '+label:'집계 기간은 Server Engine 응답이 준비되면 표시됩니다.';
  return '<div class="hof-v2-period" data-hof-period>'
    + '<div class="hof-v2-period-label"><span>집계 기준</span><strong>'+escapeHtml(label)+'</strong></div>'
    + '<button class="hof-v2-period-info" type="button" data-hof-period-toggle aria-label="주간 집계 기준 안내" aria-expanded="false" aria-controls="hofPeriodPopover">i</button>'
    + '<div class="hof-v2-period-popover" id="hofPeriodPopover" role="dialog" aria-label="주간 집계 기준" aria-hidden="true" hidden>'
    + '<strong>아이온 주간 집계</strong><p>'+escapeHtml(detail)+'</p><span>Asia/Seoul · 시작 시각 포함, 종료 시각 미포함</span>'
    + '</div></div>';
}
function hofV2Layout(){
  const s=hallData?.summarySections||{};
  const pveList=s.pveTop||s.pveTop3||hallData?.pveTop||hallData?.pveTop3||[];
  const pvpList=s.pvpTop||s.pvpTop3||hallData?.pvpTop||hallData?.pvpTop3||[];
  return '<div class="hof-v2-layout kinojo-pc-banner-host kinojo-pc-standard-host">'
    + '<aside class="kinojo-pc-banner-slot is-left" data-kinojo-pc-banner aria-hidden="true"></aside>'
    + '<aside class="kinojo-pc-banner-slot is-right" data-kinojo-pc-banner aria-hidden="true"></aside>'
    + '<div class="hof-v2-board">'
    + '<div class="hof-v2-area hof-v2-area-meter">'+hofMeterDpsPanel()+'</div>'
    + '<div class="hof-v2-area hof-v2-area-pve">'+hofWidePanel('PVE 랭킹','PVE TOP 3',pveList,'pve')+'</div>'
    + '<div class="hof-v2-area hof-v2-area-pvp">'+hofWidePanel('PVP 랭킹','PVP TOP 3',pvpList,'pvp')+'</div>'
    + '<div class="hof-v2-area hof-v2-area-enhance">'+hofGodHeroCard('강화의 신','최고 강화 기록',s.enhanceGod || hallData?.weeklyAwards?.bulkUp?.[0], 'enhance')+'</div>'
    + '<div class="hof-v2-area hof-v2-area-growth">'+hofGodHeroCard('성장의 신','이번주 성장량',s.growthGod || hallData?.weeklyAwards?.growthKing?.[0], 'growth')+'</div>'
    + '<div class="hof-v2-area hof-v2-area-ranking-link-card">'+hofRankingLinkCard()+'</div>'
    + '</div>'
    + '<div class="hof-v2-right">'+hofMyRankingPanel()+'</div>'
    + '</div>';
}
function hofMyRankingPanel(){
  const isLoggedIn=!!(window.KinojoAuth&&typeof window.KinojoAuth.getSession==='function'&&window.KinojoAuth.getSession());
  const personalState=typeof hallPersonalState!=='undefined'?hallPersonalState:{status:'idle',message:''};
  const personalStatus=personalState?.status||'idle';
  const isLoading=isLoggedIn&&(personalStatus==='idle'||personalStatus==='loading');
  const isFailure=isLoggedIn&&personalStatus==='error';
  const isEmpty=isLoggedIn&&personalStatus==='empty';
  const isStale=isLoggedIn&&personalStatus==='stale';
  const myName=hofSessionName();
  const metrics=['pve','pvp','enhance','growth','like','dislike'];
  const foundByMetric={};
  metrics.forEach(metric=>{foundByMetric[metric]=isLoggedIn&&!isLoading&&!isFailure?hofFindMyMetric(metric):null;});
  const profileMetric=metrics.find(metric=>foundByMetric[metric]?.item);
  const item=profileMetric?foundByMetric[profileMetric].item:null;
  const displayName=hofCharName(item)||myName||'내 캐릭터';
  const primaryHtml=['pve','pvp'].map(metric=>{
    const found=foundByMetric[metric];
    const metricItem=found?.item||item||{};
    const power=metric==='pve'?hofFirstDefined(metricItem?.pvePower,metricItem?.pve_power,''):hofFirstDefined(metricItem?.pvpPower,metricItem?.pvp_power,'');
    const itemLevel=metric==='pve'?hofFirstDefined(metricItem?.pveItem,metricItem?.pve_item,''):hofFirstDefined(metricItem?.pvpItem,metricItem?.pvp_item,'');
    const powerText=power!==''?hofPowerShort(power):'-';
    const powerFull=power!==''?hofPowerFull(power):'-';
    const itemText=itemLevel!==''?Number(itemLevel).toLocaleString('ko-KR'):'-';
    return '<section class="hof-v2-my-primary is-'+metric+'" data-hof-metric="'+metric+'">'
      + '<div class="hof-v2-my-primary-head"><span class="hof-v2-my-mode-badge">'+metric.toUpperCase()+'</span><strong>'+(found?Number(found.rank).toLocaleString('ko-KR')+'위':'순위 없음')+'</strong></div>'
      + '<dl class="hof-v2-my-stats">'
      + '<div><dt><img src="'+HOF_POWER_ICON+'" alt="" aria-hidden="true">전투력</dt><dd title="정확한 전투력 '+escapeHtml(powerFull)+'">'+escapeHtml(powerText)+'</dd></div>'
      + '<div><dt><img src="'+HOF_OFFICIAL_METRIC_ICONS.enhance+'" alt="" aria-hidden="true">아이템레벨</dt><dd>'+escapeHtml(itemText)+'</dd></div>'
      + '</dl>'
      + '</section>';
  }).join('');
  const secondaryRows=[['강화의 신','enhance'],['성장의 신','growth'],['좋아요','like'],['싫어요','dislike']];
  const secondaryHtml=secondaryRows.map(([title,metric])=>{
    const found=foundByMetric[metric];
    return '<div class="hof-v2-my-row hof-v2-my-god-row '+hofBackgroundClass(metric)+(found?' is-found':'')+'" data-hof-metric="'+metric+'">'
      + '<span class="hof-v2-my-metric-icon">'+hofMetricIconHtml(metric)+'</span>'
      + '<div><strong>'+escapeHtml(title)+'</strong><span>'+(found?Number(found.rank).toLocaleString('ko-KR')+'위':'집계 없음')+'</span></div>'
      + '<b>'+escapeHtml(found?found.score:'-')+'</b>'
      + '</div>';
  }).join('');
  const stateHtml=!isLoggedIn?''
    :isLoading?'<div class="hof-v2-my-state is-loading" role="status">'+kinojoCardSpinner('내 랭킹 집계를 불러오는 중')+'</div>'
    :isFailure?'<div class="hof-v2-my-state is-error" role="alert"><strong>내 랭킹을 불러오지 못했습니다.</strong><button type="button" onclick="reloadHallAfterAuthChange()">다시 조회</button></div>'
    :isEmpty?'<div class="hof-v2-my-state is-empty" role="status"><strong>집계된 내 순위가 없습니다.</strong><span>현재 스냅샷과 선택한 랭킹 범위를 확인해 주세요.</span></div>'
    :isStale?'<div class="hof-v2-my-state is-stale" role="status"><strong>저장된 내 랭킹</strong><span>'+escapeHtml(personalState.message||'최신 조회에 실패해 마지막 정상 집계를 표시합니다.')+'</span><button type="button" onclick="reloadHallAfterAuthChange()">다시 조회</button></div>'
    :'';
  return '<aside class="hof-v2-panel hof-v2-my-rank'+(isStale?' is-stale':'')+'">'
    + '<div class="hof-v2-my-head"><h2>내 랭킹</h2></div>'
    + (!isLoggedIn?'<div class="hof-v2-login-guide"><span>🔒</span><strong>로그인 후 나의 랭킹을 확인하세요.</strong><button id="hofMyRankingLoginBtn" type="button">로그인</button></div>':'')
    + stateHtml
    + (isLoggedIn&&!isLoading&&!isFailure&&!isEmpty?'<div class="hof-v2-my-profile">'+hofRankPortrait(item,0,'my')+'<strong>'+escapeHtml(displayName)+'</strong></div><div class="hof-v2-my-list">'+primaryHtml+secondaryHtml+'</div>':'')
    + '</aside>';
}
function setHallSlot(id,html){
  const el=document.getElementById(id);
  if(!el)return;
  el.classList.remove('is-ready','is-pending');
  el.classList.add('is-rendering');
  el.innerHTML=html;
  window.KinojoStagedLoading?.ready?.(el);
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

function hallSlotTasks(){
  const s=hallData?.summarySections||{};
  const images=[];
  ['likesTop','dislikesTop','pveTop','pvpTop'].forEach(key=>{
    (s[key]||[]).forEach(item=>{ if(item?.profileImageUrl)images.push(item.profileImageUrl); });
  });
  [s.growthGod,s.enhanceGod].forEach(item=>{ if(item?.profileImageUrl)images.push(item.profileImageUrl); });
  const pveList=s.pveTop||s.pveTop3||hallData?.pveTop||hallData?.pveTop3||[];
  const pvpList=s.pvpTop||s.pvpTop3||hallData?.pvpTop||hallData?.pvpTop3||[];
  return [
    {id:'hallSlotMeter',images:[],render:()=>hofMeterDpsPanel()},
    {id:'hallSlotPve',images:compactImageList(pveList.map(item=>item?.profileImageUrl)),render:()=>hofWidePanel('PVE 랭킹','PVE TOP 3',pveList,'pve')},
    {id:'hallSlotPvp',images:compactImageList(pvpList.map(item=>item?.profileImageUrl)),render:()=>hofWidePanel('PVP 랭킹','PVP TOP 3',pvpList,'pvp')},
    {id:'hallSlotEnhance',images:compactImageList([s.enhanceGod?.profileImageUrl]),render:()=>hofGodHeroCard('강화의 신','최고 강화 기록',s.enhanceGod || hallData?.weeklyAwards?.bulkUp?.[0], 'enhance')},
    {id:'hallSlotGrowth',images:compactImageList([s.growthGod?.profileImageUrl]),render:()=>hofGodHeroCard('성장의 신','이번주 성장량',s.growthGod || hallData?.weeklyAwards?.growthKing?.[0], 'growth')},
    {id:'hallSlotRankingLink',images:[],render:()=>hofRankingLinkCard()},
    {id:'hallSlotMyRank',images:compactImageList(images),render:()=>hofMyRankingPanel()}
  ];
}

function hallShellExists(){
  return !!document.getElementById('hallSlotEnhance');
}

function renderHallShell(showSpinners){
  app.className='';
  const slotClass='hall-slot is-pending';
  const spinner=showSpinners?kinojoCardSpinner('영역 불러오는 중'):'';
  app.innerHTML='<div class="hof-v2-shell"><div class="hof-v2-layout kinojo-pc-banner-host kinojo-pc-standard-host"><aside class="kinojo-pc-banner-slot is-left" data-kinojo-pc-banner aria-hidden="true"></aside><aside class="kinojo-pc-banner-slot is-right" data-kinojo-pc-banner aria-hidden="true"></aside><div class="hof-v2-board">'
    +'<div id="hallSlotMeter" class="hof-v2-area hof-v2-area-meter '+slotClass+'">'+spinner+'</div>'
    +'<div id="hallSlotPve" class="hof-v2-area hof-v2-area-pve '+slotClass+'">'+spinner+'</div>'
    +'<div id="hallSlotPvp" class="hof-v2-area hof-v2-area-pvp '+slotClass+'">'+spinner+'</div>'
    +'<div id="hallSlotEnhance" class="hof-v2-area hof-v2-area-enhance '+slotClass+'">'+spinner+'</div>'
    +'<div id="hallSlotGrowth" class="hof-v2-area hof-v2-area-growth '+slotClass+'">'+spinner+'</div>'
    +'<div id="hallSlotRankingLink" class="hof-v2-area hof-v2-area-ranking-link-card '+slotClass+'">'+spinner+'</div>'
    +'</div><div class="hof-v2-right"><div id="hallSlotMyRank" class="'+slotClass+'">'+spinner+'</div></div></div></div>';
  hallSlotTasks().forEach(task=>window.KinojoStagedLoading?.region?.('#'+task.id,task.id));
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
  renderHallSlots({progressive:false});
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
