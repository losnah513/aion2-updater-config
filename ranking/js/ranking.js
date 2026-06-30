/*
 * KINOJO Legion Ranking Page
 * 역할: Server Engine 050 결과를 받아 PVE/PVP 전체 순위를 렌더링합니다.
 * 규칙: 웹에서 순위 계산·정렬·필터링 금지. 검색/직업/부캐/페이지 조건은 RPC 파라미터로 전달합니다.
 */
(function(){
  'use strict';

  const CLASS_ORDER=['전체','수호성','검성','살성','궁성','마도성','정령성','치유성','호법성'];
  const state={ page:1, pageSize:20, className:'전체', search:'', includeSubs:false, data:null, loading:false, mobileMode:'PVE' };
  const isMobile=document.body.classList.contains('is-mobile-ranking') || window.matchMedia('(max-width: 760px)').matches;

  function $(id){ return document.getElementById(id); }
  function escapeHtml(v){ return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
  function num(v){ const n=Number(v||0); return Number.isFinite(n)&&n>0?n.toLocaleString('ko-KR'):'-'; }
  function pick(row,snake,camel,fallback){ return row && row[camel]!==undefined && row[camel]!==null ? row[camel] : (row && row[snake]!==undefined && row[snake]!==null ? row[snake] : fallback); }
  function text(v,fallback=''){ const s=String(v??'').trim(); return s || fallback; }

  function normalizeRow(row, mode){
    const rank=Number(pick(row,'rank_no','rankNo',0)||0);
    const name=text(pick(row,'character_name','characterName',''),'-').replace(/\[[^\]]+\]\s*$/,'').trim();
    const owner=text(pick(row,'main_character_name','mainCharacterName',name),name).replace(/\[[^\]]+\]\s*$/,'').trim();
    const server=text(pick(row,'server_name','serverName','지켈'),'지켈');
    const className=text(pick(row,'class_name','className','-'),'-');
    const like=Number(pick(row,'like_count','likeCount',0)||0);
    const dislike=Number(pick(row,'dislike_count','dislikeCount',0)||0);
    const pvePower=Number(pick(row,'pve_power_total','pvePowerTotal',0)||0);
    const pvpPower=Number(pick(row,'pvp_power_total','pvpPowerTotal',0)||0);
    const pveItem=Number(pick(row,'pve_item_level','pveItemLevel',0)||0);
    const pvpItem=Number(pick(row,'pvp_item_level','pvpItemLevel',0)||0);
    const review=text(pick(row,'review_text','reviewText',''), text(pick(row,'growth_label','growthLabel',''), 'AI 리뷰 대기 중'));
    const growthLabel=text(pick(row,'growth_label','growthLabel',''), '기록 확인');
    const profile=text(pick(row,'profile_image_url','profileImageUrl',''), '');
    return { rank,name,owner,server,className,like,dislike,pvePower,pvpPower,pveItem,pvpItem,review,growthLabel,profile,mode };
  }

  function topRingClass(rank){ return rank===1?' top-one':rank===2?' top-two':rank===3?' top-three':''; }
  function rankIcon(rank){ return rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':String(rank||'-'); }
  function avatarHtml(item){
    const cls='ranking-avatar'+topRingClass(item.rank)+(item.profile?'':' is-empty');
    if(item.profile) return '<img class="'+cls+'" src="'+escapeHtml(item.profile)+'" alt="'+escapeHtml(item.name+' 프로필')+'" loading="lazy" decoding="async">';
    return '<div class="'+cls+'" aria-hidden="true">'+escapeHtml(item.name.slice(0,1)||'?')+'</div>';
  }
  function ownerBadge(item){
    if(item.owner && item.owner!==item.name) return '<span class="ranking-owner-note">본캐 '+escapeHtml(item.owner)+'</span>';
    return '<span class="ranking-main-badge">본캐</span>';
  }
  function reactionBoxes(item){
    return '<div class="ranking-reaction-boxes"><span class="ranking-reaction-box like">👍 '+escapeHtml(item.like)+'</span><span class="ranking-reaction-box dislike">👎 '+escapeHtml(item.dislike)+'</span></div>';
  }
  function statBlock(label,value,kind){
    return '<div class="ranking-stat '+kind+'"><span>'+escapeHtml(label)+'</span><strong>'+escapeHtml(value)+'</strong></div>';
  }

  function cardHtml(raw, mode){
    const item=normalizeRow(raw,mode);
    const power=mode==='PVP'?item.pvpPower:item.pvePower;
    const itemLevel=mode==='PVP'?item.pvpItem:item.pveItem;
    return '<article class="ranking-card'+topRingClass(item.rank)+'" data-character="'+escapeHtml(item.name)+'">'
      + '<div class="ranking-card-main">'
      + '<div class="ranking-rank">'+rankIcon(item.rank)+'</div>'
      + '<div class="ranking-character">'+avatarHtml(item)+'<div class="ranking-character-meta"><div class="ranking-name-line"><strong>'+escapeHtml(item.name)+'</strong>'+ownerBadge(item)+'</div><div class="ranking-server-line">'+escapeHtml(item.server)+'</div>'+reactionBoxes(item)+'</div></div>'
      + '<div class="ranking-class-chip">'+escapeHtml(item.className)+'</div>'
      + statBlock('아이템',num(itemLevel),'item')
      + statBlock(mode,num(power),mode.toLowerCase())
      + '</div>'
      + '<div class="ranking-review"><span class="ranking-review-badge">'+escapeHtml(item.growthLabel)+'</span><p>🤖 '+escapeHtml(item.review)+'</p></div>'
      + '</article>';
  }

  function panelHtml(mode, rows, total){
    const items=(rows||[]);
    return '<section class="ranking-panel '+mode.toLowerCase()+'" data-panel="'+mode+'">'
      + '<div class="ranking-panel-head"><div><h2>'+mode+' 전투력 순위</h2><p>서버 계산 기준 · '+Number(total||0).toLocaleString('ko-KR')+'명</p></div><span class="ranking-panel-chip '+mode.toLowerCase()+'">'+mode+'</span></div>'
      + '<div class="ranking-card-list">'+(items.length?items.map(row=>cardHtml(row,mode)).join(''):'<div class="ranking-empty">조건에 맞는 캐릭터가 없습니다.</div>')+'</div>'
      + '</section>';
  }

  function renderClassTabs(){
    const el=$('rankingClassTabs'); if(!el) return;
    const counts=state.data?.classCounts || {};
    el.innerHTML=CLASS_ORDER.map(cls=>{
      const count=cls==='전체'?'':(counts[cls]!==undefined?' '+counts[cls]:'');
      return '<button type="button" class="ranking-class-tab '+(state.className===cls?'is-active':'')+'" data-class="'+escapeHtml(cls)+'">'+escapeHtml(cls)+escapeHtml(count)+'</button>';
    }).join('');
    el.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{ state.className=btn.dataset.class||'전체'; state.page=1; loadRanking(); }));
  }

  function totalPages(){
    const d=state.data||{};
    const maxTotal=Math.max(Number(d.pveTotalCount||0), Number(d.pvpTotalCount||0));
    return Math.max(1, Math.ceil(maxTotal/state.pageSize));
  }

  function render(){
    const board=$('rankingBoard'); if(!board) return;
    const d=state.data||{};
    const pve=panelHtml('PVE', d.pveItems||[], d.pveTotalCount||0);
    const pvp=panelHtml('PVP', d.pvpItems||[], d.pvpTotalCount||0);
    board.innerHTML=pve+pvp;
    if(isMobile){ board.dataset.mobileMode=state.mobileMode; }
    const pageInfo=$('rankingPageInfo'); if(pageInfo) pageInfo.textContent=state.page+' / '+totalPages();
    const status=$('rankingStatus');
    if(status){
      const parts=[];
      parts.push('직업 '+state.className);
      if(state.search) parts.push('검색 '+state.search);
      parts.push(state.includeSubs?'부캐 포함':'본캐 기준');
      status.textContent=parts.join(' · ');
    }
    renderClassTabs();
    const prev=$('rankingPrevBtn'), next=$('rankingNextBtn');
    if(prev) prev.disabled=state.page<=1;
    if(next) next.disabled=state.page>=totalPages();
  }

  function renderLoading(){
    const board=$('rankingBoard'); if(board) board.innerHTML='<div class="ranking-loading"><span class="kinojo-spinner"><span></span></span><span>레기온 전체 순위를 불러오는 중...</span></div>';
    const status=$('rankingStatus'); if(status) status.textContent='서버 순위 계산 결과를 요청하는 중...';
  }

  async function loadRanking(){
    if(state.loading) return;
    state.loading=true;
    renderLoading();
    try{
      if(!window.KinojoApi) throw new Error('KinojoApi 연결을 확인해 주세요.');
      const data=await window.KinojoApi.getAction('legionRanking',{ page:state.page, pageSize:state.pageSize, includeSubs:state.includeSubs, className:state.className, search:state.search });
      if(!data || data.ok===false) throw new Error(data?.message||data?.error||'레기온 순위 응답이 실패했습니다.');
      state.data=data;
      render();
    }catch(err){
      const board=$('rankingBoard'); if(board) board.innerHTML='<div class="ranking-empty error">레기온 전체 순위를 불러오지 못했습니다.<br>'+escapeHtml(err.message||err)+'</div>';
      const status=$('rankingStatus'); if(status) status.textContent='순위 로딩 실패';
    }finally{ state.loading=false; }
  }

  function bind(){
    const search=$('rankingSearch');
    const include=$('rankingIncludeSubs');
    const searchBtn=$('rankingSearchBtn');
    const resetBtn=$('rankingResetBtn');
    const prev=$('rankingPrevBtn');
    const next=$('rankingNextBtn');
    const filterToggle=$('rankingFilterToggleBtn');
    const toolbar=document.querySelector('.ranking-toolbar');
    if(filterToggle && toolbar){
      filterToggle.addEventListener('click',()=>{
        const open=!toolbar.classList.contains('is-filter-open');
        toolbar.classList.toggle('is-filter-open', open);
        filterToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        filterToggle.textContent=open ? '닫기' : '필터';
      });
    }
    if(search){ search.addEventListener('keydown',e=>{ if(e.key==='Enter'){ state.search=search.value.trim(); state.page=1; loadRanking(); } }); }
    if(include){ include.addEventListener('change',()=>{ state.includeSubs=include.checked; state.page=1; loadRanking(); }); }
    if(searchBtn){ searchBtn.addEventListener('click',()=>{ state.search=search?.value.trim()||''; state.page=1; loadRanking(); }); }
    if(resetBtn){ resetBtn.addEventListener('click',()=>{ state.page=1; state.className='전체'; state.search=''; state.includeSubs=false; if(search)search.value=''; if(include)include.checked=false; loadRanking(); }); }
    if(prev){ prev.addEventListener('click',()=>{ if(state.page>1){ state.page--; loadRanking(); } }); }
    if(next){ next.addEventListener('click',()=>{ if(state.page<totalPages()){ state.page++; loadRanking(); } }); }
    document.querySelectorAll('[data-mobile-mode]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        state.mobileMode=btn.dataset.mobileMode==='PVP'?'PVP':'PVE';
        document.querySelectorAll('[data-mobile-mode]').forEach(b=>b.classList.toggle('is-active', b===btn));
        const board=$('rankingBoard');
        if(board){
          board.dataset.mobileMode=state.mobileMode;
          if(isMobile) board.scrollIntoView({block:'start', behavior:'smooth'});
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{ bind(); renderClassTabs(); loadRanking(); });
})();
